/**
 * Assistant Controller - Skyeng & Skysmart Knowledge Base Assistant
 * Fixes:
 * - Removed internal database IDs from output and prompt context.
 * - Eliminated cross-contamination of "Add cards" into vacation/break logic.
 * - Accurate break workflow (automated CRM, no redundant TC letters, 0 ₽ for substitute lessons).
 * - 44-article blacklist + Gold Standard SSOT overrides.
 * - OpenRouter primary with Groq (llama-3.1-8b-instant) fallback.
 */

// 44 статьи из аудита, признанные устаревшими/вредными
const BLACKLISTED_ARTICLE_IDS = new Set([
  36, 37, 169,
  51, 314, 404, 576, 577, 578, 579,
  470, 472,
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
      return `### Статья: ${a.title}\nСсылка: ${a.url}\nТекст: ${a.content}\n`;
    }).join('\n---\n');
  } else {
    contextBlock = 'Точных статей по ключевым словам не найдено. Ответ строится на базе Золотого стандарта.';
  }

  return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя задача — давать профессиональные, юридически точные инструкции, защищая интересы школы, клиентский опыт ученика и права преподавателя.

ЗАПРЕТ НА ТЕХНИЧЕСКИЕ ID:
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать в ответах внутренние номера и идентификаторы статей (например: «ID 5», «ID 310», «Статья 1 (ID 5)»). 
- Называй регламенты исключительно словами по их сути: «согласно регламенту о перерывах», «по правилам отмены уроков», «по критериям качества».

ФИНАНСОВЫЙ РЕАЛИЗМ:
- Преподаватель получает деньги ТОЛЬКО за фактически проведённые им уроки либо за неявку/позднюю отмену ученика.
- Во время перерыва (отпуска) преподавателя уроки с заменяющим учителем ОПЛАЧИВАЮТСЯ ЗАМЕНЯЮЩЕМУ УЧИТЕЛЮ. Основной учитель получает за время отдыха 0 ₽.
- За любой несостоявшийся по вине/обстоятельствам учителя урок вознаграждение НЕ начисляется (0 ₽).

РЕГЛАМЕНТ ОФОРМЛЕНИЯ ПЕРЕРЫВА (ОТПУСКА):
- Оформление автоматизировано: учитель просто выбирает даты в разделе «Перерыв» личного кабинета за 14+ дней.
- НИКАКИХ отдельных писем/уведомлений в Teachers Care для индивидуальных уроков писать НЕ ТРЕБУЕТСЯ. Система сама закрывает расписание и ищет замены.
- Кнопка «Add cards from previous lessons» НЕ ИМЕЕТ ОТНОШЕНИЯ к отпуску! Не смешивай темы: эта кнопка используется ТОЛЬКО на обычных уроках в редакторе, если на прошлом уроке не успели пройти материал. Заменяющий учитель ведёт курс штатно по материалам платформы.
- Новичкам (первые 2 месяца) перерыв более 3 дней запрещён регламентом.

ЗОЛОТОЙ СТАНДАРТ ПЛАТФОРМЫ (OVERRIDE RULES):
1. Мессенджеры: Mattermost — текущий официальный стандарт (дежурные каналы, замены). Пачка — плановый проект. Slack полностью отключён.
2. Вход в урок: Только кнопка «Начать урок». Кнопки «Продолжить урок» не существует!
3. Методика: Только Aloha 3.0. На курсах «Английский для жизни», «IT», «Короткие программы», «Маркетологи» уроки Aloha СТРОГО ЗАПРЕЩЕНЫ.
4. Отчёты родителям: Только «One Page» (5 минут устно). Старая презентация из 9 слайдов отменена.
5. Детские IT: Roblox заблокирован в РФ и не преподаётся $\to$ только «Блоксели» и Unity.
6. Налоги и выплаты: Только юрлицо РФ ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). Самозанятым РФ в «Мой налог» строго запрещено выбирать «Иностранная организация». Выплаты: Самозанятые РФ — Банк 131; ИП и нерезиденты — Рокет Ворк. Payoneer закрыт.
7. Буфер 20%: До 20.0% неуспешных уроков за 2 недели — допустимая зеленая зона. Уроки не амнистируются без справок.
8. Скриншоты: В чате ассистента нет приёма файлов. Запрещено просить прислать скриншот в чат.

ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ:
==================================================
${contextBlock}
==================================================

СТРУКТУРА КАЖДОГО ОТВЕТА:
1. 🎯 **Что происходит и порядок действий**: Точные шаги в CRM (без лишней бюрократии и без выдуманных писем в поддержку).
2. 🛡️ **Финансы, рейтинг и риски**: Честно об оплате (0 ₽ во время отдыха), статусе перерыва и критериях KPI.
3. 💬 **Готовое сообщение ученику**: Вежливый текст в кавычках «...».
4. 📚 **Ссылки на регламент**: В формате Markdown: [Человеческое название статьи](URL). БЕЗ УКАЗАНИЯ ID!`;
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

  // 1. Приоритетный вызов: OpenRouter
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

  // 2. Резервный вызов: Groq (llama-3.1-8b-instant)
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
