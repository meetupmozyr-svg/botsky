import { 
  BLACKLISTED_ARTICLE_IDS, 
  PLATFORM_GOLD_STANDARD, 
  getScopedScenarioRules 
} from './rules.js';

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
  'отпуск': ['перерыв', 'зелен', 'зон', 'расписан', 'отдых', 'новичок', 'замен'],
  'перерыв': ['отпуск', 'зелен', 'зон', 'расписан', 'слот', 'новичок', 'замен'],
  'оплат': ['вознагражд', 'выплат', 'ставк', 'расчет', 'банк 131', 'рокет ворк'],
  'выплат': ['вознагражд', 'оплат', 'акт', 'расчет', 'банк 131', 'рокет ворк']
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

  const isEmergency = userQuery.includes('пожар') || userQuery.includes('форс-мажор') || userQuery.includes('свет') || userQuery.includes('чп');

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

    if (isEmergency) {
      if (lowerTitle.includes('вебинар') || lowerTitle.includes('группов') || lowerTitle.includes('2 урока подряд') || lowerTitle.includes('подбираем ученику')) {
        score -= 30;
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

function buildSystemPrompt(articles, userQuery) {
  let contextBlock = '';
  if (articles.length > 0) {
    contextBlock = articles.map((a) => {
      return `### Статья: ${a.title}\nСсылка: ${a.url}\nТекст: ${a.content}\n`;
    }).join('\n---\n');
  } else {
    contextBlock = 'Точных статей не найдено. Руководствуйся Золотым стандартом платформы.';
  }

  const targetedScenario = getScopedScenarioRules(userQuery);

  return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя миссия — давать точные, логичные инструкции без противоречий.

${PLATFORM_GOLD_STANDARD}

${targetedScenario}

ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ:
==================================================
${contextBlock}
==================================================

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА:
1. 🎯 **Что происходит и порядок действий**:
   - Четкие, выполнимые шаги в CRM (без выдуманных действий).
   - При форс-мажоре учитель фиксирует факт срыва со своей стороны: выставляется статус «Урок пропущен преподавателем» (или отмена преподавателем с указанием причины), после чего пишется запрос в Teachers Care.
2. 🛡️ **Финансы, рейтинг и риски**:
   - Оплата: 0 ₽ за непроведённый урок.
   - Буфер 20%: Этот пропуск по умолчанию расходует буфер 20% допустимого брака. ТОЛЬКО Teachers Care после предоставления справок (врач, МЧС, ЖКХ) принимает решение об амнистии — исключить урок из расчета 20% и снять штраф.
3. 💬 **Готовое сообщение ученику**: Оформи текст сообщения СТРОГО в виде цитаты Markdown с кавычками:
> «Дорогой(ая) [Имя ученика]! Текст сообщения...»
4. 📚 **Ссылки на регламент**: В формате Markdown: [Название статьи](URL). БЕЗ ТЕХНИЧЕСКИХ ID!`;
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
  const systemPrompt = buildSystemPrompt(articles, queryText);

  const cleanHistory = incomingMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }))
    .slice(-6);

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...cleanHistory
  ];

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
    JSON.stringify({ error: 'Сервис временно недоступен. Попробуйте через минуту.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
