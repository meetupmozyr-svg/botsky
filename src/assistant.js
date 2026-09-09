import articles from './skyeng_all_helpcenter_articles.json';

// Russian stop words to ignore during relevance scoring
const STOP_WORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все",
  "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по",
  "только", "ее", "мне", "было", "вот", "от", "меня", "еще", "нет", "о", "из",
  "ему", "теперь", "когда", "даже", "ну", "вдруг", "ли", "если", "уже", "или",
  "ни", "быть", "был", "него", "до", "вас", "нибудь", "опять", "уж", "вам",
  "сказал", "ведь", "там", "потом", "себя", "ничего", "ей", "может", "они", "тут",
  "где", "есть", "надо", "ней", "для", "мы", "тебя", "их", "чем", "была", "сам",
  "чтоб", "без", "будто", "чего", "раз", "тоже", "себе", "под", "будет", "ж",
  "тогда", "кто", "этот", "того", "потому", "этого", "какой", "совсем", "ним",
  "здесь", "этом", "один", "почти", "мой", "тем", "чтобы", "нее", "сейчас", "были",
  "куда", "зачем", "всех", "никогда", "можно", "при", "наконец", "два", "об", "другой",
  "хоть", "после", "над", "больше", "тот", "через", "эти", "нас", "про", "всего",
  "них", "какая", "много", "разве", "три", "эту", "моя", "впрочем", "хорошо", "свою",
  "этой", "перед", "иногда", "лучше", "чуть", "том", "нельзя", "такой", "им", "более"
]);

// Tokenize and extract search stems
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// Lightweight In-Worker Search Engine across all HelpCenter articles
export function findRelevantArticles(query, maxResults = 4) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const lowerQuery = query.toLowerCase();

  const scored = articles.map(art => {
    let score = 0;
    const lowerTitle = (art.title || "").toLowerCase();
    const lowerCategory = (art.category || "").toLowerCase();
    const lowerContent = (art.content || "").toLowerCase();

    // Exact query match bonus
    if (lowerTitle.includes(lowerQuery)) score += 60;
    if (lowerCategory.includes(lowerQuery)) score += 25;

    // Token matches with weighted relevance
    for (const token of queryTokens) {
      if (lowerTitle.includes(token)) score += 20;
      if (lowerCategory.includes(token)) score += 8;

      // Match count in content (capped to avoid long-article bias)
      let matches = 0;
      let pos = lowerContent.indexOf(token);
      while (pos !== -1 && matches < 8) {
        matches++;
        pos = lowerContent.indexOf(token, pos + token.length);
      }
      score += matches * 1.5;
    }

    return { article: art, score };
  });

  return scored
    .filter(item => item.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.article);
}

// Build system prompt with strictly teacher-centric guidelines and topic guardrails
function buildSystemPrompt(relevantArticles) {
  let contextSection = "";
  if (relevantArticles.length > 0) {
    contextSection = relevantArticles.map((art, idx) => `
--- Источник #${idx + 1} ---
ID: ${art.id}
Заголовок: ${art.title}
Категория: ${art.category}
Ссылка: ${art.url}
Текст статьи:
${art.content.slice(0, 3500)}
`).join("\n");
  } else {
    contextSection = "Релевантных статей в базе знаний не обнаружено.";
  }

  return `
Ты — умный корпоративный AI-помощник службы поддержки преподавателей онлайн-школы Skyeng и Skysmart (Teachers Care & Methodology Care). 
Твоя целевая аудитория — ИСКЛЮЧИТЕЛЬНО ПРЕПОДАВАТЕЛИ школы. Пользователь, который задает вопрос — это преподаватель/тьютор.

СТРОГИЕ ПРАВИЛА И РЕГЛАМЕНТЫ ДЛЯ ПРЕПОДАВАТЕЛЕЙ:
1. КТО ЕСТЬ КТО:
   - Пользователь никогда не является учеником. Все вопросы рассматриваются с точки зрения преподавателя (его рейтинг, зарплата, отметки уроков, перерывы, отношения с учениками и родителями).
   - Ученики имеют право отменять/переносить уроки без штрафа за 8 часов (стандарт) или 4 часа (премиум). НО преподаватель может менять расписание или отменять урок без штрафа в рейтинг ТОЛЬКО более чем за 24 часа. Изменения менее чем за 24 часа со стороны преподавателя считаются «неуспешным уроком», снижают рейтинг и могут ограничить набор новых учеников.

2. ЗАЩИТА ОТ ЗЛОУПОТРЕБЛЕНИЙ И ТЕМЫ ВНЕ КОМПЕТЕНЦИИ:
   - Если вопрос преподавателя НЕ связан с работой преподавателя в Skyeng/Skysmart, правилами школы, методикой преподавания, техническими проблемами на платформе или финансами (например, вопросы о программировании, общей истории, кулинарии, погоде, написании стороннего кода или несвязанные темы), ты обязан вежливо отказать в следующем формате:
     "Я помогаю преподавателям Skyeng и Skysmart с рабочими вопросами, регламентами, методикой и платформой. Этот вопрос выходит за рамки моей компетенции. Если у вас есть вопросы по расписанию, статусам или поддержке, я с радостью на них отвечу!"

3. ТОН И КОММУНИКАЦИЯ:
   - Говори на грамотном, поддерживающем и профессиональном русском языке. Тон — заботливый, уважительный, в стиле лучших менеджеров Teachers Care.
   - Объясняй преподавателю не просто "как сделать", но и почему (например, чтобы защитить его рейтинг, избежать штрафов или помочь ученику).
   - Структурируй ответы: списки, жирный шрифт, четкие пошаговые инструкции.

4. ОБЯЗАТЕЛЬНЫЕ ССЫЛКИ:
   - Всегда ссылайся на официальные статьи HelpCenter из предоставленной базы знаний.
   - Формат ссылки Markdown: [Название статьи](URL). Никогда не выдумывай ссылки.

ОФИЦИАЛЬНАЯ БАЗА ЗНАНИЙ ШКОЛЫ:
${contextSection}
`.trim();
}

// KV-based Rate Limiter (max 20 questions per hour per IP)
async function checkRateLimit(ip, env) {
  if (!env.KV) return true;
  const key = `ratelimit_chat:${ip}`;
  const current = parseInt(await env.KV.get(key) || "0", 10);
  if (current >= 20) {
    return false;
  }
  await env.KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
}

// Main Chat API Handler with SSE Streaming
export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured in Worker environment." }), {
      status: 500,
      headers: { "Content-Type": "application/json;charset=utf-8" }
    });
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const isAllowed = await checkRateLimit(clientIp, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Превышен лимит сообщений (максимум 20 вопросов в час). Пожалуйста, подождите немного." }), {
      status: 429,
      headers: { "Content-Type": "application/json;charset=utf-8" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
  }

  const userMessages = body.messages || [];
  if (!Array.isArray(userMessages) || userMessages.length === 0) {
    return new Response(JSON.stringify({ error: "Messages array is required" }), { status: 400 });
  }

  const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

  // Find top relevant articles for the user's latest query
  const relevantArticles = findRelevantArticles(lastUserMessage, 4);

  // Construct message array with system instructions
  const systemPrompt = buildSystemPrompt(relevantArticles);
  const openRouterMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-6) // Keep last 6 conversation turns for context
  ];

  const targetModel = env.OPENROUTER_MODEL || "openrouter/free";

  try {
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://skymeet.ru",
        "X-Title": "Skyeng Teachers Assistant"
      },
      body: JSON.stringify({
        model: targetModel,
        messages: openRouterMessages,
        stream: true,
        temperature: 0.3
      })
    });

    if (!openRouterResponse.ok) {
      const errText = await openRouterResponse.text();
      return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errText}` }), {
        status: openRouterResponse.status,
        headers: { "Content-Type": "application/json;charset=utf-8" }
      });
    }

    return new Response(openRouterResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream;charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server connection failed: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json;charset=utf-8" }
    });
  }
}
