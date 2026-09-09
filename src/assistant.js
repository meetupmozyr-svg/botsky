/**
 * Assistant Controller - Skyeng & Skysmart Knowledge Base Assistant
 * Features:
 * 1. SQL Blacklist of 44 outdated/conflicting articles from the audit.
 * 2. Gold Standard SSOT overrides in System Prompt.
 * 3. 20% Unsuccessful Lesson buffer & strict actor-role disambiguation.
 * 4. OpenRouter primary with Groq (llama-3.1-8b-instant) fallback.
 */

// 44 Articles identified by the audit as expired, deprecated, or harmful
const BLACKLISTED_ARTICLE_IDS = new Set([
  // Expired promotions
  36, 37, 169,
  // Closed legacy platforms & courses (Payoneer, Beginner Old, Business Advanced, etc.)
  51, 314, 404, 576, 577, 578, 579,
  // Duplicate instructions & obsolete VPN
  470, 472,
  // Content Times 2024 archive digests
  46, 47, 48, 49, 50, 52, 87, 88,
  390, 391, 392, 407, 408, 409, 410, 411,
  427, 428, 429, 430, 431, 432, 434, 435, 436, 437, 438, 439, 440, 441,
  592, 593, 594, 595, 596, 597
]);

const STOP_WORDS = new Set([
  'в', 'на', 'и', 'с', 'по', 'к', 'у', 'о', 'об', 'из', 'за', 'от', 'до', 'для',
  'как', 'что', 'мне', 'если', 'бы', 'ли', 'же', 'то', 'это', 'все', 'так', 'или',
  'не', 'нет', 'да', 'но', 'а', 'он', 'она', 'они', 'мы', 'вы', 'я', 'его', 'ее',
  'их', 'мой', 'твой', 'свой', 'какой', 'какая', 'какие', 'какого', 'когда', 'где',
  'куда', 'почему', 'зачем', 'сколько', 'можно', 'нужно', 'надо', 'скажи', 'подскажи',
  'пожалуйста', 'здравствуйте', 'привет', 'добрый', 'день'
]);

const SYNONYM_MAP = {
  'неявк': ['ученик', 'статус', 'пропуск', 'опоздал', 'ждат', 'отмен'],
  'пропуск': ['неявк', 'статус', 'отмен', 'ученик'],
  'опозда': ['ждат', 'неявк', 'статус', 'минут', 'урок'],
  'пожар': ['форс', 'мажор', 'эвакуац', 'чп', 'отмен', 'teachers care', 'поддержк'],
  'болезн': ['больнич', 'справк', 'форс', 'мажор', 'отмен', 'заболел'],
  'отпуск': ['перерыв', 'зелен', 'зон', 'расписан', 'отдых', 'новичок'],
  'перерыв': ['отпуск', 'зелен', 'зон', 'расписан', 'слот', 'новичок'],
  'оплат': ['вознагражд', 'выплат', 'ставк', 'расчет', 'банк 131', 'рокет ворк'],
  'выплат': ['вознагражд', 'оплат', 'акт', 'расчет', 'банк 131', 'рокет ворк'],
  'вознагражд': ['выплат', 'оплат', 'критери', 'бонус', 'kpi'],
  'рейтинг': ['kpi', 'штраф', 'нарушен', 'показател', 'статус', 'буфер', '20%']
};

function extractKeywords(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  const stems = new Set();
  words.forEach(w => {
    const stem = w.slice(0, 5);
    stems.add(stem);

    for (const [key, expansions] of Object.entries(SYNONYM_MAP)) {
      if (w.includes(key) || key.includes(stem)) {
        expansions.forEach(exp => stems.add(exp));
      }
    }
  });

  return Array.from(stems).slice(0, 8);
}

async function retrieveRelevantArticles(db, userQuery) {
  if (!db) return [];

  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) return [];

  const clauses = [];
  const params = [];
  keywords.forEach(kw => {
    const pattern = `%${kw}%`;
    clauses.push(`title LIKE ? OR category LIKE ? OR content LIKE ?`);
    params.push(pattern, pattern, pattern);
  });

  const sql = `
    SELECT id, title, category, url, content
    FROM articles
    WHERE (${clauses.join(' OR ')})
    LIMIT 35
  `;

  let rows = [];
  try {
    const res = await db.prepare(sql).bind(...params).all();
    rows = res.results || [];
  } catch (err) {
    console.error('D1 query error:', err);
    return [];
  }

  // 1. Фильтрация чёрного списка из аудита базы знаний
  const cleanedRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.id)));

  // 2. Ранжирование и скоринг релевантности
  const scored = cleanedRows.map(art => {
    let score = 0;
    const lowerTitle = (art.title || '').toLowerCase();
    const lowerCategory = (art.category || '').toLowerCase();
    const lowerContent = (art.content || '').toLowerCase();

    keywords.forEach(kw => {
      if (lowerTitle.includes(kw)) score += 12;
      if (lowerCategory.includes(kw)) score += 5;
      if (lowerContent.includes(kw)) score += 2;
    });

    // Штрафуем нерелевантные статьи при форс-мажорах
    if (userQuery.includes('пожар') || userQuery.includes('форс-мажор') || userQuery.includes('чп')) {
      if (lowerTitle.includes('2 урока подряд') || lowerTitle.includes('подбираем ученику')) {
        score -= 25;
      }
    }

    return { ...art, score };
  });

  const relevantOnly = scored.filter(art => art.score >= 8);
  relevantOnly.sort((a, b) => b.score - a.score);

  return relevantOnly.slice(0, 3).map(art => ({
    id: art.id,
    title: art.title || 'Статья регламента',
    category: art.category || 'Общее',
    url: art.url || '',
    content: (art.content || '').slice(0, 1500)
  }));
}

function buildSystemPrompt(articles) {
  let contextBlock = '';
  if (articles.length > 0) {
    contextBlock = articles.map((a, i) => {
      return `### Статья ${i + 1} (ID ${a.id}): ${a.title}\nСсылка: ${a.url}\nТекст: ${a.content}\n`;
    }).join('\n---\n');
  } else {
    contextBlock = 'Точных статей по ключевым словам не найдено. Ответ строится на базе Золотого стандарта.';
  }

  return `Ты — персональный наставник и защитник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя миссия — давать точные, практичные инструкции, защищать вознаграждение, рейтинг и психологический комфорт преподавателя, строго следуя стандартам школы.

==================================================
🏛️ ЗОЛОТОЙ СТАНДАРТ ИСТИНЫ (OVERRIDE RULES):
Если статья из базы знаний противоречит приведенным ниже правилам Золотого стандарта, ты ОБЯЗАН проигнорировать текст статьи и следовать Золотому стандарту:

1. МЕССЕНДЖЕРЫ И СВЯЗЬ:
   - Основной официальный рабочий мессенджер — Mattermost (дежурные каналы, замены, связь с комьюнити).
   - Slack — полностью отключён и не используется.
   - Пачка — плановая поэтапная миграция. Mattermost НЕ отключён!
2. ИНТЕРФЕЙС УРОКА:
   - Кнопки «Продолжить урок» НЕ СУЩЕСТВУЕТ (удалена). Урок всегда запускается кнопкой «Начать урок».
   - Непройденные материалы добавляются заранее кнопкой «Add cards from previous lessons» в редакторе урока.
   - Групповые уроки и клубы проходят во встроенной комнате Smartroom (браузер). Zoom устарел.
3. МЕТОДИЧЕСКИЕ СТАНДАРТЫ:
   - Первый урок проводится СТРОГО по стандарту Aloha 3.0 (7 этапов). Aloha 2.0 списана!
   - Aloha КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНА на пакетных курсах: «Английский для жизни (Level Up)», «IT», «Для маркетологов», «Короткие программы», «Базовый». Там сразу проводят Урок 1 курса.
   - Отчёты родителям в Skysmart ведутся по устному регламенту «One Page» (5 минут в конце урока). Старая презентация из 9 слайдов отменена!
   - Детские IT: Roblox Studio заблокирован в РФ и не преподаётся. Используются «Блоксели» и Unity.
4. ФИНАНСЫ И НАЛОГИ:
   - Payoneer полностью закрыт и недоступен.
   - Все выплаты идут от российского юрлица ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). Agaton списан.
   - Чеки самозанятых РФ в «Мой налог» формируются СТРОГО на юрлицо РФ: ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). Выбирать «Иностранная организация» ЗАПРЕЩЕНО!
   - Платёжные шлюзы: Самозанятые РФ — Банк 131; ИП РФ, резиденты Беларуси и Казахстана — Рокет Ворк.
5. ДВУХНЕДЕЛЬНЫЙ KPI И БУФЕР 20%:
   - Рейтинг ОРП (Great, Normal, Alarm, SOS) устарел. Действует проверка каждые 2 недели по понедельникам по 6 критериям (ID 310).
   - БУФЕР 20% «Неуспешных уроков»: До 20.0% неуспешных уроков — это допустимая «зелёная зона» (буфер для форс-мажоров и жизненных ситуаций). Набор открыт, бонусы начисляются полностью!
==================================================

ГЛАВНЫЙ ПРИНЦИП: РАЗДЕЛЕНИЕ РОЛЕЙ И СИТУАЦИЙ:
1. ИНИЦИАТИВА УЧЕНИКА (Ученик уходит, отказывается от учителя, не пришёл, отменил урок):
   - Ученик имеет право сменить учителя в любой момент через свой ЛК или поддержку.
   - К УЧИТЕЛЮ В ЭТОМ СЛУЧАЕ НЕ ПРИМЕНЯЮТСЯ: правила 72/24 часов, лимит «2 необоснованных отказа за 14 дней» и блокировки набора! Учителю НЕ НУЖНО нажимать «Отказаться от студента» в CRM.
   - Прогул ученика: учитель ждёт 50 минут (25 мин для KLP), ставит «Пропущен учеником» $\to$ урок оплачивается учителю на 100%.
   - Отмена учеником менее чем за 8 часов (или 4 ч для Premium) $\to$ урок оплачивается учителю.
2. ИНИЦИАТИВА УЧИТЕЛЯ (Учитель сам отказывается от ученика, берет перерыв):
   - Отказ от ученика: строго за 72–24 часа до урока через CRM. Лимит: максимум 1 необоснованный отказ за 14 дней.
   - Перерыв: оформляется за 14 дней. Новичкам (первые 2 месяца) перерыв более 3 дней запрещён!
3. ЭКСТРЕННЫЕ СИТУАЦИИ И ЧП (Пожар, ДТП, болезнь):
   - Жизнь и безопасность человека — приоритет №1.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ставить статус «Преподаватель не вышел» (это срыв и штраф).
   - Урок снимает поддержка Teachers Care по подтвержденному форс-мажору без штрафа.
   - ЗАПРЕЩЕНО просить пользователя прислать скриншот в чат (в интерфейсе нет приёма файлов).

ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ (С УЧЕТОМ ФИЛЬТРАЦИИ):
==================================================
${contextBlock}
==================================================

СТРУКТУРА КАЖДОГО ОТВЕТА:
1. 🎯 **Что происходит и что делать прямо сейчас**: Четкие, выполнимые шаги в кабинете учителя.
2. 🛡️ **Защита рейтинга и оплаты**: Прямое разъяснение статуса оплаты, порога 20% и критериев KPI.
3. 💬 **Готовое сообщение для ученика/родителя**: Вежливый текст в кавычках «...», готовый к копированию в 1 клик.
4. 📚 **Ссылки на регламент**: Ссылайся ТОЛЬКО на реальные статьи из предоставленного выше контекста [Название](URL). Если точных статей нет, не придумывай ссылки.`;
}

async function callProviderStream(url, apiKey, payload) {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://skyeng.ru',
      'X-Title': 'Skyeng Teacher Assistant'
    },
    body: JSON.stringify(payload)
  });
}

export async function handleAssistantChat(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const openRouterKey = env.OPENROUTER_API_KEY;
  const groqKey = env.GROQ_API_KEY;

  if (!openRouterKey && !groqKey) {
    return new Response(
      JSON.stringify({ error: 'Не настроен API-ключ нейросети (OPENROUTER_API_KEY или GROQ_API_KEY).' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Неверный JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUserMsg = [...incomingMessages].reverse().find(m => m.role === 'user');
  const queryText = lastUserMsg ? String(lastUserMsg.content || '') : '';

  const articles = await retrieveRelevantArticles(env.ARTICLES_DB, queryText);
  const systemPrompt = buildSystemPrompt(articles);

  const cleanHistory = incomingMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }))
    .slice(-6);

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...cleanHistory
  ];

  // 1. Приоритетный вызов: OpenRouter (основная рабочая модель)
  if (openRouterKey) {
    const payload = {
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      messages: messagesPayload,
      stream: true,
      temperature: 0.2
    };

    const res = await callProviderStream('https://openrouter.ai/api/v1/chat/completions', openRouterKey, payload);
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        }
      });
    }
  }

  // 2. Резервный вызов: Groq (гарантированная бесплатная модель без риска 404)
  if (groqKey) {
    const payload = {
      model: env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: messagesPayload,
      stream: true,
      temperature: 0.2
    };

    const res = await callProviderStream('https://api.groq.com/openai/v1/chat/completions', groqKey, payload);
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        }
      });
    } else {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: `Сбой нейросети: ${errText}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Провайдеры нейросети временно недоступны. Попробуйте через минуту.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
