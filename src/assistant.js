/**
 * Assistant Controller - Skyeng & Skysmart Knowledge Base Assistant
 * Performs SQLite RAG over ARTICLES_DB and streams LLM completions via OpenRouter.
 */

const STOP_WORDS = new Set([
  'в', 'на', 'и', 'с', 'по', 'к', 'у', 'о', 'об', 'из', 'за', 'от', 'до', 'для',
  'как', 'что', 'мне', 'если', 'бы', 'ли', 'же', 'то', 'это', 'все', 'так', 'или',
  'не', 'нет', 'да', 'но', 'а', 'он', 'она', 'они', 'мы', 'вы', 'я', 'его', 'ее',
  'их', 'мой', 'твой', 'свой', 'какой', 'какая', 'какие', 'какого', 'когда', 'где',
  'куда', 'почему', 'зачем', 'сколько', 'можно', 'нужно', 'надо', 'скажи', 'подскажи',
  'пожалуйста', 'здравствуйте', 'привет', 'добрый', 'день'
]);

// Expansion map for educational and operational CRM vocabulary
const SYNONYM_MAP = {
  'неявк': ['ученик', 'статус', 'пропуск', 'опоздал', 'ждат', 'отмен'],
  'пропуск': ['неявк', 'статус', 'отмен', 'ученик'],
  'опозда': ['ждат', 'неявк', 'статус', 'минут', 'урок'],
  'отмен': ['перенос', 'форс', 'мажор', 'компенсац', 'статус', 'правил'],
  'перенос': ['отмен', 'расписан', 'ученик', 'согласован'],
  'болезн': ['больнич', 'справк', 'форс', 'мажор', 'отмен', 'заболел'],
  'больнич': ['болезн', 'справк', 'форс', 'мажор', 'врач'],
  'отпуск': ['перерыв', 'зелен', 'зон', 'расписан', 'отдых'],
  'перерыв': ['отпуск', 'зелен', 'зон', 'расписан', 'слот'],
  'оплат': ['вознагражд', 'выплат', 'ставк', 'расчет', 'деньг'],
  'выплат': ['вознагражд', 'оплат', 'акт', 'расчет', 'деньг'],
  'вознагражд': ['выплат', 'оплат', 'критери', 'бонус', 'kpi'],
  'рейтинг': ['kpi', 'штраф', 'нарушен', 'показател', 'статус']
};

/**
 * Extract Russian search stems and expand with domain synonyms
 */
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

/**
 * Search ARTICLES_DB SQLite table and rank articles by relevance
 */
async function retrieveRelevantArticles(db, userQuery) {
  if (!db) return [];

  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) {
    try {
      const fallback = await db.prepare(
        `SELECT id, title, category, url, substr(content, 1, 1500) as content FROM articles ORDER BY id ASC LIMIT 3`
      ).all();
      return fallback.results || [];
    } catch {
      return [];
    }
  }

  // Construct dynamic SQL OR conditions
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

  // Score matching candidates
  const scored = rows.map(art => {
    let score = 0;
    const lowerTitle = (art.title || '').toLowerCase();
    const lowerCategory = (art.category || '').toLowerCase();
    const lowerContent = (art.content || '').toLowerCase();

    keywords.forEach(kw => {
      if (lowerTitle.includes(kw)) score += 12;
      if (lowerCategory.includes(kw)) score += 6;
      if (lowerContent.includes(kw)) score += 2;
    });

    return { ...art, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top 4 articles with content truncated to avoid token overflow
  return scored.slice(0, 4).map(art => ({
    id: art.id,
    title: art.title || 'Статья базы знаний',
    category: art.category || 'Общее',
    url: art.url || '',
    content: (art.content || '').slice(0, 1800)
  }));
}

/**
 * Build System Prompt: Balanced Advocate for the School + Ally for the Teacher
 */
function buildSystemPrompt(articles) {
  let contextBlock = '';
  if (articles.length > 0) {
    contextBlock = articles.map((a, i) => {
      return `### Статья ${i + 1}: ${a.title}\nКатегория: ${a.category}\nСсылка: ${a.url}\nТекст:\n${a.content}\n`;
    }).join('\n---\n');
  } else {
    contextBlock = 'Точных статей по ключевым словам не найдено. Руководствуйся базовыми стандартами Skyeng / Skysmart.';
  }

  return `Ты — «Умный ассистент преподавателя» онлайн-школы (Skyeng / Skysmart).
Твоя миссия — быть высокопрофессиональным наставником, который гармонично сочетает две роли:
1. **Сторонник школы и её стандартов**: Ты искренне поддерживаешь ценности школы (заботу об ученике, непрерывность обучения, дисциплину расписания, честность и пунктуальность). Ты никогда не советуешь нарушать регламент, обманывать систему статусов или покидать урок самовольно. Ты доброжелательно объясняешь, почему правило устроено именно так.
2. **Защитник и проводник учителя**: Ты всецело на стороне преподавателя в вопросах защиты его рейтинга, KPI, честной оплаты труда и психологического комфорта. Ты даешь четкие, применимые инструкции: какую кнопку нажать, какой статус выставить, сколько минут ждать, чтобы не потерять оплату и не получить штраф.

ДАННЫЕ ИЗ ОФИЦИАЛЬНОЙ БАЗЫ ЗНАНИЙ:
==================================================
${contextBlock}
==================================================

ПРАВИЛА ПОСТРОЕНИЯ ОТВЕТА:
1. **Структура**:
   - 🎯 **Четкий вывод/Инструкция**: Сразу дай краткий ответ на вопрос (какой статус выбрать, сколько минут ждать, какую форму заполнить).
   - 🛡️ **Защита рейтинга и оплата**: Прямо поясни, как эта ситуация влияет на вознаграждение, спишется ли урок, и защищен ли KPI преподавателя при соблюдении регламента.
   - 💬 **Готовое сообщение для ученика/родителя**: Если ситуация требует коммуникации с учеником или родителем (опоздание, перенос, неявка), ВСЕГДА составь вежливый, заботливый текст сообщения и выдели его в кавычки «...», чтобы учитель мог скопировать его в один клик.
   - 📚 **Ссылки на регламент**: В конце ответа сошлись на статьи из базы знаний в формате Markdown: [Название статьи](URL). Используй только реальные URL из контекста.

2. **Тон**: Уверенный, спокойный, деловой, поддерживающий. Без лишней "воды" и канцелярщины.
3. **Безопасность**: Если точный регламент отсутствует в базе, укажи общепринятую практику и порекомендуй обратиться к супервайзеру/поддержке, не выдумывая несуществующие проценты и суммы.`;
}

/**
 * Handle Assistant Chat API endpoint (/api/assistant)
 */
export async function handleAssistantChat(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'OPENROUTER_API_KEY не задан в переменных окружения Cloudflare Worker. Добавьте его через Cloudflare Dashboard или wrangler secret.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Неверный JSON в теле запроса' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  if (incomingMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'Массив messages пуст' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Find the last user prompt
  const lastUserMsg = [...incomingMessages].reverse().find(m => m.role === 'user');
  const queryText = lastUserMsg ? String(lastUserMsg.content || '') : '';

  // Retrieve matching context from D1
  const articles = await retrieveRelevantArticles(env.ARTICLES_DB, queryText);
  const systemPrompt = buildSystemPrompt(articles);

  // Filter conversation history to valid roles and attach system context
  const cleanHistory = incomingMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }))
    .slice(-6);

  const payload = {
    model: env.OPENROUTER_MODEL || 'openrouter/free',
    messages: [
      { role: 'system', content: systemPrompt },
      ...cleanHistory
    ],
    stream: true,
    temperature: 0.25
  };

  try {
    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://skyeng.ru',
        'X-Title': 'Skyeng Teacher Assistant'
      },
      body: JSON.stringify(payload)
    });

    if (!openrouterRes.ok) {
      const errText = await openrouterRes.text();
      let parsedErr = errText;
      try {
        const j = JSON.parse(errText);
        parsedErr = j.error?.message || j.message || errText;
      } catch {}

      return new Response(
        JSON.stringify({ error: `Ошибка OpenRouter (${openrouterRes.status}): ${parsedErr}` }),
        { status: openrouterRes.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy the SSE event stream directly to the browser
    return new Response(openrouterRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Сетевой сбой при обращении к нейросети: ${err.message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
