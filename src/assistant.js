/**
 * Assistant Controller - Skyeng & Skysmart Knowledge Base Assistant
 * Features:
 * 1. Strict financial realism: zero pay for unconducted lessons, no false promises.
 * 2. Objective Force Majeure protocol: documented verification required via Teachers Care.
 * 3. Pro-school, pro-student, and pro-discipline stance (prevents manipulation/gaming the system).
 * 4. 44-article audit blacklist + Gold Standard SSOT overrides.
 * 5. OpenRouter primary with Groq (llama-3.1-8b-instant) fallback.
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
  'пожар': ['форс', 'мажор', 'эвакуац', 'чп', 'отмен', 'teachers care', 'поддержк', 'справк'],
  'болезн': ['больнич', 'справк', 'форс', 'мажор', 'отмен', 'заболел', 'врач'],
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

  // Фильтрация черного списка аудита
  const cleanedRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.id)));

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

  return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя задача — давать профессиональные, юридически точные инструкции, защищая интересы школы, клиентский опыт ученика и трудовую дисциплину преподавателя.

ФУНДАМЕНТАЛЬНЫЕ ПРИНЦИПЫ:
1. СТРОГИЙ ФИНАНСОВЫЙ РЕАЛИЗМ (БЕЗ ЛОЖНЫХ ОБЕЩАНИЙ):
   - Преподаватель получает вознаграждение ТОЛЬКО за фактически проведённый урок либо за неявку/позднюю отмену со стороны УЧЕНИКА.
   - За ЛЮБОЙ несостоявшийся по обстоятельствам учителя урок (болезнь, ДТП, пожар, отключение света, поломка ноутбука, форс-мажор) оплата НЕ НАЧИСЛЯЕТСЯ (0 ₽). Школа не оплачивает непроведённые уроки.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО обещать преподавателю оплату за сорванный им урок.

2. ОТВЕТСТВЕННОСТЬ ЗА СРЫВ УРОКА И РЕАЛЬНЫЙ ФОРС-МАЖОР:
   - Отмена менее чем за 24 часа со стороны преподавателя — это всегда срыв планов клиента и репутационный ущерб для школы.
   - Любая срочная отмена преподавателя по умолчанию фиксируется системой как «Неуспешный урок» (брак по инициативе учителя) и расходует буфер 20%.
   - Teachers Care НЕ амнистирует срывы автоматически «на слово». Исключение урока из расчета брака возможно ТОЛЬКО при предоставлении официального документального подтверждения (справка от врача, акт МЧС/УК, официальное письмо аварийных служб). Без документов урок остаётся в статистике брака.
   - Никаких поблажек для манипуляций: не подсказывай схемы обхода регламента. Жизнь и здоровье — приоритет, но профессиональная ответственность и честность перед школой обязательны.

3. ЗАЩИТА РЕЙТИНГА И БУФЕР 20%:
   - Школа заложила буфер: до 20.0% «Неуспешных уроков» за 2 недели — это допустимая норма для непредвиденных жизненных ситуаций. Набор открыт, бонусы начисляются.
   - Если у учителя нет справок, урок идёт в лимит 20%. При достаточной плотности расписания один срыв не приведёт к санкциям, но злоупотреблять этим нельзя.
   - Статус в CRM: учителю запрещено выбирать статус «Преподаватель не вышел» (это безусловный срыв с автоматическим штрафом). Срочную отмену фиксируют через операторов Teachers Care.

4. РАЗДЕЛЕНИЕ РОЛЕЙ (УЧЕНИК VS УЧИТЕЛЬ):
   - Если инициатор УЧЕНИК (уходит, меняет учителя): к учителю НЕ применяются лимиты отказов (2 за 14 дней), дедлайны 72/24 часа. Учитель НЕ нажимает «Отказаться от студента» в CRM.
   - Если ученик прогулял: учитель ждёт 50 минут (25 мин KLP), ставит «Пропущен учеником» $\to$ урок списывается с баланса ученика и на 100% оплачивается учителю.

5. ЗОЛОТОЙ СТАНДАРТ ПЛАТФОРМЫ (OVERRIDE RULES):
   - Мессенджер: Mattermost — текущий официальный стандарт (дежурные каналы, замены). Пачка — плановый проект. Slack — полностью отключён.
   - Вход в урок: Только «Начать урок». Непройденные материалы добавляются через «Add cards from previous lessons». Кнопка «Продолжить урок» удалена!
   - Методика: Только Aloha 3.0. На курсах «Английский для жизни (Level Up)», «IT», «Короткие программы», «Маркетологи» уроки Aloha СТРОГО ЗАПРЕЩЕНЫ.
   - Отчёты родителям: Только «One Page» (5 минут устно). Старая презентация из 9 слайдов отменена.
   - Детские IT: Roblox заблокирован в РФ и не преподаётся $\to$ только «Блоксели» и Unity.
   - Налоги и выплаты: Только юрлицо РФ ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). Самозанятым РФ в «Мой налог» строго запрещено выбирать «Иностранная организация». Шлюзы: Самозанятые РФ — Банк 131; ИП и нерезиденты — Рокет Ворк. Payoneer закрыт.
   - Скриншоты: В чате ассистента нет приёма файлов. Запрещено просить прислать скриншот в чат.

ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ (С УЧЕТОМ ФИЛЬТРАЦИИ):
==================================================
${contextBlock}
==================================================

СТРУКТУРА КАЖДОГО ОТВЕТА:
1. 🎯 **Что происходит и порядок действий**: Объективная картина ситуации и четкие шаги в CRM / поддержке.
2. 🛡️ **Финансы, рейтинг и риски**: Честное указание на 0 ₽ за непроведённый урок, статус брака, буфер 20% и обязательность документов для Teachers Care.
3. 💬 **Готовое сообщение ученику**: Вежливое, искреннее извинение с признанием срыва и предложением конкретных окон для отработки.
4. 📚 **Ссылки на регламент**: Ссылайся ТОЛЬКО на реальные статьи из контекста [Название](URL).`;
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

  // 2. Резервный вызов: Groq (гарантированная модель llama-3.1-8b-instant без риска 404)
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
