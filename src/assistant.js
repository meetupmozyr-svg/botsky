/**
 * Assistant Controller - Skyeng & Skysmart Knowledge Base Assistant
 * Uses OpenRouter (primary) with Groq fallback.
 */

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
  'отпуск': ['перерыв', 'зелен', 'зон', 'расписан', 'отдых'],
  'перерыв': ['отпуск', 'зелен', 'зон', 'расписан', 'слот'],
  'оплат': ['вознагражд', 'выплат', 'ставк', 'расчет', 'деньг'],
  'выплат': ['вознагражд', 'оплат', 'акт', 'расчет', 'деньг'],
  'вознагражд': ['выплат', 'оплат', 'критери', 'бонус', 'kpi'],
  'рейтинг': ['kpi', 'штраф', 'нарушен', 'показател', 'статус']
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
    WHERE ${clauses.join(' OR ')}
    LIMIT 25
  `;

  let rows = [];
  try {
    const res = await db.prepare(sql).bind(...params).all();
    rows = res.results || [];
  } catch (err) {
    console.error('D1 query error:', err);
    return [];
  }

  const scored = rows.map(art => {
    let score = 0;
    const lowerTitle = (art.title || '').toLowerCase();
    const lowerCategory = (art.category || '').toLowerCase();
    const lowerContent = (art.content || '').toLowerCase();

    keywords.forEach(kw => {
      if (lowerTitle.includes(kw)) score += 12;
      if (lowerCategory.includes(kw)) score += 5;
      if (lowerContent.includes(kw)) score += 2;
    });

    if (userQuery.includes('пожар') || userQuery.includes('форс-мажор')) {
      if (lowerTitle.includes('2 урока подряд') || lowerTitle.includes('подбираем ученику')) {
        score -= 20;
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
      return `### Статья ${i + 1}: ${a.title}\nСсылка: ${a.url}\nТекст: ${a.content}\n`;
    }).join('\n---\n');
  } else {
    contextBlock = 'Точных статей по ключевым словам не найдено. Руководствуйся стандартами школы.';
  }

  return `Ты — персональный наставник и защитник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя цель — помогать учителю защищать свой рейтинг, вознаграждение и душевное спокойствие, строго соблюдая ценности школы.

ГЛАВНЫЙ ПРИНЦИП: РАЗДЕЛЕНИЕ РОЛЕЙ И ИНИЦИАТИВ (КРАЙНЕ ВАЖНО):
1. Ситуация: ИНИЦИАТИВА УЧЕНИКА (Ученик уходит, отказывается от учителя, не пришёл, отменил урок):
   - Ученик имеет право сменить преподавателя в любой момент через свой личный кабинет.
   - К УЧИТЕЛЮ В ЭТОМ СЛУЧАЕ НЕ ПРИМЕНЯЮТСЯ: правила 72/24 часов, лимит «2 необоснованных отказа за 14 дней» и блокировки набора. Эти правила действуют ТОЛЬКО когда САМ УЧИТЕЛЬ бросает ученика!
   - Учителю НЕ НУЖНО нажимать кнопку «Отказаться от студента» в своём кабинете.
   - Никаких дисциплинарных санкций к учителю нет.

2. Ситуация: ИНИЦИАТИВА УЧИТЕЛЯ (Учитель сам не хочет вести ученика, заболел, уходит в отпуск):
   - Вот здесь действуют правила отказа со стороны учителя (дедлайн предупреждения, лимиты отказов, зеленая зона).

3. ЭКСТРЕННЫЕ СИТУАЦИИ И ФОРС-МАЖОРЫ (Пожар, авария, внезапная госпитализация):
   - Жизнь и безопасность человека — приоритет №1.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО советовать статус «Преподаватель не вышел» (это срыв урока и штраф).
   - Урок снимает служба Teachers Care (дежурная поддержка) по причине подтверждённого форс-мажора без штрафа.
   - ЗАПРЕЩЕНО просить пользователя прислать скриншот в чат (в интерфейсе нет функции загрузки картинок).

ОФИЦИАЛЬНЫЙ КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:
==================================================
${contextBlock}
==================================================

СТРУКТУРА ОТВЕТА:
1. 🎯 **Что происходит и что делать прямо сейчас**: Четкие шаги для учителя.
2. 🛡️ **Защита рейтинга и оплаты**: Четко объясни статус урока, риск штрафа и влияние на KPI.
3. 💬 **Готовое сообщение ученику**: Вежливый текст в кавычках «...», готовый к копированию.
4. 📚 **Ссылки на регламент**: Ссылайся ТОЛЬКО на реальные статьи из предоставленного выше контекста в формате [Название](URL). Если точных ссылок в контексте нет, не выдумывай их.`;
}

async function callProviderStream(url, apiKey, payload) {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://skyeng.ru',
      'X-Title': 'Skyeng Assistant'
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

  // 1. Приоритетный вызов: OpenRouter (то, что работало из wrangler.toml)
  if (openRouterKey) {
    const payload = {
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      messages: messagesPayload,
      stream: true,
      temperature: 0.25
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

  // 2. Резервный вызов: Groq (с гарантированно доступной моделью)
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
        JSON.stringify({ error: `Ошибка API нейросети: ${errText}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Провайдеры нейросети временно недоступны. Попробуйте через минуту.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
