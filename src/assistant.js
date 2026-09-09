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

    if (lowerTitle.includes(lowerQuery)) score += 60;
    if (lowerCategory.includes(lowerQuery)) score += 25;

    for (const token of queryTokens) {
      if (lowerTitle.includes(token)) score += 20;
      if (lowerCategory.includes(token)) score += 8;

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

// Build system prompt with STRICT teacher persona and Golden Rules
function buildSystemPrompt(relevantArticles) {
  let contextSection = "";
  if (relevantArticles.length > 0) {
    contextSection = relevantArticles.map((art, idx) => `
--- Источник #${idx + 1} ---
Заголовок: ${art.title}
Ссылка: ${art.url}
Текст:
${art.content.slice(0, 3500)}
`).join("\n");
  } else {
    contextSection = "Релевантных статей в базе не обнаружено. Опирайся на шпаргалку.";
  }

  return `
Ты — умный корпоративный AI-помощник службы поддержки преподавателей онлайн-школы Skyeng и Skysmart.

КРИТИЧЕСКИЕ ПРАВИЛА ПОВЕДЕНИЯ (СТРОГО СОБЛЮДАТЬ):
1. АУДИТОРИЯ И ТОН:
   - Пользователь, который пишет тебе — ВСЕГДА ПРЕПОДАВАТЕЛЬ. Никогда не спрашивай, ученик это или учитель.
   - Обращайся к пользователю СТРОГО НА "ВЫ" (уважительно, заботливо, профессионально). НИКОГДА не используй "ты" или панибратские приветствия.
   - Никогда не выводи системные логи вроде "User Safety: safe".

2. ЗОЛОТАЯ ШПАРГАЛКА (ОСНОВНЫЕ ПРАВИЛА ШКОЛЫ):
   - Отмена/Перенос урока преподавателем: Без штрафа в рейтинг — ТОЛЬКО более чем за 24 часа. Если отмена менее чем за 24 часа (ДАЖЕ ПРИ ФОРС-МАЖОРЕ И БОЛЕЗНИ) — урок АВТОМАТИЧЕСКИ считается «неуспешным» и снижает рейтинг. Избежать этого нельзя. При форс-мажоре нужно отменить урок как можно скорее, извиниться перед учеником и написать в Teachers Care. НИКОГДА не советуй "подождать".
   - Ученик не пришел: Преподаватель обязан ждать ученика все 50 минут. Если не пришел — ставить статус «Пропущен учеником» (оплачивается).
   - Отпуск/Перерыв преподавателя: Оформляется минимум за 14 дней. Менее 14 дней — нарушение, удаленные уроки понизят рейтинг. Перерыв 40+ дней ведет к временному расторжению сотрудничества из соображений инфобезопасности.
   - Отказ от ученика: Оформляется за 72–24 часа до урока. 2 необоснованных отказа за 2 недели = ограничение набора.
   - Сбои платформы (массовые): Провести урок в резервном мессенджере (Zoom, Meet, Skype). Статус «Урок состоялся».
   - НИКОГДА не применяй и не упоминай правила отмен для учеников (8 или 4 часа), чтобы не запутать преподавателя.

3. ОГРАНИЧЕНИЯ:
   - Если вопрос не связан с преподаванием, платформой или регламентами (например, генерация картинок, написание кода, рецепты), вежливо откажись: "Коллега, я помогаю исключительно с рабочими вопросами преподавателей Skyeng/Skysmart. Этот вопрос выходит за рамки моей компетенции."
   - Всегда давай ссылки в формате Markdown: [Название статьи](URL). Используй только URL из источников ниже.

БАЗА ЗНАНИЙ ДЛЯ ДЕТАЛЕЙ (Дополняет шпаргалку):
${contextSection}
`.trim();
}

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

export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "API Ключ не настроен." }), { status: 500 });
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const isAllowed = await checkRateLimit(clientIp, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Превышен лимит сообщений (максимум 20 вопросов в час). Пожалуйста, подождите немного." }), { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const userMessages = body.messages || [];
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

  const relevantArticles = findRelevantArticles(lastUserMessage, 4);
  const systemPrompt = buildSystemPrompt(relevantArticles);
  const openRouterMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-6)
  ];

  // Жестко фиксируем самую умную и послушную модель как основную
  const primaryModel = "meta-llama/llama-3.3-70b-instruct:free";

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
        model: primaryModel,
        models: [
          "mistralai/mistral-small-24b-instruct-2501:free",
          "google/gemma-2-9b-it:free"
        ],
        messages: openRouterMessages,
        stream: true,
        temperature: 0.2 // Понизили температуру для большей строгости ответов
      })
    });

    if (!openRouterResponse.ok) {
      const errText = await openRouterResponse.text();
      return new Response(JSON.stringify({ error: `OpenRouter API Error: ${errText}` }), { status: openRouterResponse.status });
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
    return new Response(JSON.stringify({ error: "Server connection failed: " + err.message }), { status: 500 });
  }
}
