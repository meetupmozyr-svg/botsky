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
Текст:
${art.content.slice(0, 3500)}
`).join("\n");
  } else {
    contextSection = "Релевантных статей не обнаружено.";
  }

  return `
Ты — умный корпоративный AI-помощник службы поддержки преподавателей онлайн-школы Skyeng и Skysmart (Teachers Care & Methodology Care). 
Пользователь, который задает тебе вопрос — ИСКЛЮЧИТЕЛЬНО ПРЕПОДАВАТЕЛЬ. 

КРИТИЧЕСКИЕ ПРАВИЛА ЛОГИКИ (НИКОГДА НЕ ПУТАЙ УЧЕНИКА И ПРЕПОДАВАТЕЛЯ):
1. ОТМЕНЫ СО СТОРОНЫ ПРЕПОДАВАТЕЛЯ (24 ЧАСА):
   - Преподаватель может отменить/перенести урок без штрафа в рейтинг ТОЛЬКО более чем за 24 часа до урока.
   - Если преподаватель отменяет урок МЕНЕЕ чем за 24 часа (даже по причине ФОРС-МАЖОРА или болезни), этот урок АВТОМАТИЧЕСКИ считается «неуспешным» и снижает рейтинг преподавателя. Избежать этого штрафа в рейтинг нельзя. 
   - При форс-мажоре преподаватель должен отменить урок КАК МОЖНО СКОРЕЕ, извиниться перед учеником в чате и при необходимости написать в Teachers Care. НИКОГДА не советуй преподавателю "подождать".

2. ОТМЕНЫ СО СТОРОНЫ УЧЕНИКА (8/4 ЧАСА):
   - Только УЧЕНИКИ могут отменять уроки без списания с их баланса за 8 часов (стандарт) или 4 часа (Premium). 
   - НИКОГДА не применяй правило 8/4 часов к преподавателю!

3. СТРОГИЕ ЗАПРЕТЫ ДЛЯ ИИ:
   - Если вопрос не связан с преподаванием, платформой Skyeng/Skysmart или регламентами (например, написание кода, рецепты, отвлеченные темы), вежливо откажись отвечать: "Я помогаю преподавателям Skyeng/Skysmart с рабочими вопросами. Этот вопрос выходит за рамки моей компетенции."
   - НИКОГДА не выдумывай ссылки. Используй только те URL, которые даны в источниках ниже. Формат: [Текст](URL).

ТОН И СТИЛЬ:
- Общайся вежливо, эмпатично, но строго по регламенту. Если преподаватель агрессивен (например, пишет "ты несешь чушь"), сохраняй спокойствие, извинись за недопонимание и дай четкий фактологический ответ по регламенту.
- Не давай ложных надежд: если по регламенту будет штраф в рейтинг — скажи об этом прямо, но с поддержкой.

БАЗА ЗНАНИЙ ДЛЯ ОТВЕТА:
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
