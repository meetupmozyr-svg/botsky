// Резервный справочник ключевых статей, если база D1 ещё пуста
const FALLBACK_ARTICLES = [
  {
    id: 690,
    title: "Условия переноса и отмены урока",
    url: "https://helpcenter.skyeng.ru/article/690",
    category: "Расписание и уроки",
    content: "Отмена преподавателем менее чем за 24 часа — всегда статус «Неуспешный урок» (Failed by teacher), 0 руб. оплата. Ученик отменяет без списания более чем за 8 часов (Стандарт) или 4 часа (Premium)."
  },
  {
    id: 130,
    title: "Как указать статус и какие бывают статусы уроков?",
    url: "https://helpcenter.skyeng.ru/article/130",
    category: "Статусы уроков",
    content: "Основные статусы: «Урок состоялся», «Пропущен учеником» (оплачивается), «Урок пропущен преподавателем» (штрафной), «Урок перенесен», «Урок отменен». Ручная отметка доступна в течение 24 часов."
  },
  {
    id: 315,
    title: "Что делать, если ученик не пришел на урок?",
    url: "https://helpcenter.skyeng.ru/article/315",
    category: "Проведение уроков",
    content: "Если ученик не пришел и молчит — ждать 50 минут (25 минут). Если прямо написал, что не придет — ждать не нужно. Статус «Пропущен учеником» (урок списывается с ученика и оплачивается учителю 100%)."
  },
  {
    id: 166,
    title: "Службы школы — куда и по каким вопросам обращаться",
    url: "https://helpcenter.skyeng.ru/article/166",
    category: "Поддержка",
    content: "Teachers Care — вопросы расписания, форс-мажоры, финансы (чат в ЛК с 09:00 до 22:00 МСК). Support — экстренная техподдержка 24/7."
  }
];

const STOP_WORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все",
  "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по",
  "только", "ее", "мне", "было", "вот", "от", "меня", "еще", "нет", "о", "из",
  "ему", "теперь", "когда", "даже", "ну", "вдруг", "ли", "если", "уже", "или",
  "ни", "быть", "был", "него", "до", "вас", "нибудь", "опять", "уж", "вам",
  "сказал", "ведь", "там", "потом", "себя", "ничего", "ей", "может", "они", "тут"
]);

// Поиск статей в базе данных D1 с fallback
export async function findRelevantArticles(query, env, maxResults = 2) {
  if (!query) return FALLBACK_ARTICLES.slice(0, 2);

  const words = query
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  if (words.length === 0) return FALLBACK_ARTICLES.slice(0, 2);

  if (env && env.ARTICLES_DB) {
    try {
      const topWord = words[0];
      const secondWord = words[1] || topWord;

      const res = await env.ARTICLES_DB.prepare(`
        SELECT id, title, category, url, substr(content, 1, 1500) as content
        FROM articles
        WHERE title LIKE ? OR category LIKE ? OR content LIKE ?
        ORDER BY 
          CASE 
            WHEN title LIKE ? THEN 1
            WHEN category LIKE ? THEN 2
            ELSE 3
          END ASC
        LIMIT ?
      `).bind(
        `%${topWord}%`,
        `%${topWord}%`,
        `%${secondWord}%`,
        `%${topWord}%`,
        `%${topWord}%`,
        maxResults
      ).all();

      if (res && res.results && res.results.length > 0) {
        return res.results;
      }
    } catch (e) {
      console.warn("D1 search fallback:", e.message);
    }
  }

  return FALLBACK_ARTICLES.slice(0, maxResults);
}

// Построение компактного системного промпта по стандарту ai.js
function buildSystemPrompt(relevantArticles) {
  const linksContext = relevantArticles.map(art => `• [${art.title}](${art.url})`).join("\n");

  return `
[ROLE]
Ты — лаконичный корпоративный AI-наставник для преподавателей Skyeng и Skysmart. Твой собеседник — учитель школы.

[TASK]
Дай предельно короткий, четкий практический ответ на вопрос учителя в виде 3 коротких пунктов.

[CRITICAL RULES]
1. ЕСЛИ УЧЕНИК НЕ ПРИШЕЛ:
   - В первые 3 мин написать ученику.
   - Если ученик ответил «не приду» — ждать 50 мин НЕ нужно, учитель свободен.
   - Если молчит — ждать полные 50 мин (25 мин для коротких) в классе.
   - Статус: «Пропущен учеником». Урок СПИСЫВАЕТСЯ с баланса ученика и ОПЛАЧИВАЕТСЯ учителю 100%.
2. ЕСЛИ У УЧИТЕЛЯ ФОРС-МАЖОР / ОТМЕНА < 24 ЧАСОВ:
   - Срочно отменить в ЛК или через Teachers Care, предупредить ученика.
   - Статус «Неуспешный урок», рейтинг Teacher Attendance падает, оплата 0 руб. С ученика не списывается.
   - Никогда не просить ученика отменить урок за учителя.

[OUTPUT FORMAT (СТРОГО СОБЛЮДАТЬ)]
**1. Что делать:**
(2-3 строки: сколько ждать и какой статус ставить)

**2. Оплата и риски:**
(1-2 строки: спишется ли с ученика, оплатят ли учителю, что с рейтингом)

**3. Шаблон сообщения:**
«(Короткая вежливая фраза ученику)»

Полезные ссылки:
${linksContext}

[FORBIDDEN]
- FORBIDDEN: Никаких вводных слов, приветствий и воды. Сразу пункт 1.
- FORBIDDEN: Длина ответа СТРОГО до 70-90 слов.
- FORBIDDEN: Никаких английских слов (никаких "intact"). Только чистый русский язык.
- FORBIDDEN: Запрещено писать, что при неявке ученика урок не списывается. Он ВСЕГДА списывается с ученика и оплачивается учителю.
- FORBIDDEN: Запрещено выдумывать фразы «я тебя вижу в классе» или «напиши пропуск».
`.trim();
}

async function checkRateLimit(ip, env) {
  if (!env.KV) return true;
  const key = `ratelimit_chat:${ip}`;
  const current = parseInt(await env.KV.get(key) || "0", 10);
  if (current >= 60) return false;
  await env.KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
}

// Быстрый вызов с контролем таймаута (по стандарту ai.js)
async function fetchWithTimeout(url, options, timeoutMs = 4500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const isAllowed = await checkRateLimit(clientIp, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Превышен часовой лимит сообщений." }), { 
      status: 429, 
      headers: { "Content-Type": "application/json;charset=utf-8" } 
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { 
      status: 400, 
      headers: { "Content-Type": "application/json;charset=utf-8" } 
    });
  }

  const userMessages = body.messages || [];
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

  const recentUserQuestions = userMessages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content)
    .join(" ");

  const searchQuery = recentUserQuestions || lastUserMessage;
  const relevantArticles = await findRelevantArticles(searchQuery, env, 2);
  const systemPrompt = buildSystemPrompt(relevantArticles);

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-4)
  ];

  let errors = [];

  // 1. GROQ API (Приоритет 70B с быстрым таймаутом 4.5с, затем 8B)
  if (env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 5) {
    const groqKey = env.GROQ_API_KEY.trim();
    const groqModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    for (const model of groqModels) {
      try {
        const groqRes = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: fullMessages,
            stream: true,
            temperature: 0.15,
            max_tokens: 350
          })
        }, 4500);

        if (groqRes.ok && groqRes.body) {
          return new Response(groqRes.body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream;charset=utf-8",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive"
            }
          });
        } else {
          const errText = await groqRes.text().catch(() => "");
          errors.push(`Groq (${model}): ${groqRes.status} ${errText}`);
        }
      } catch (errGroq) {
        errors.push(`Groq (${model}) timeout/err: ${errGroq.message}`);
      }
    }
  }

  // 2. OPENROUTER (Резерв)
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim().length > 5) {
    const openrouterKey = env.OPENROUTER_API_KEY.trim();
    const primaryModel = env.OPENROUTER_MODEL || "openrouter/free";

    try {
      const openRouterResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://skymeet.ru",
          "X-Title": "Skyeng Teachers Assistant"
        },
        body: JSON.stringify({
          model: primaryModel,
          messages: fullMessages,
          stream: true,
          temperature: 0.2,
          max_tokens: 350
        })
      }, 7000);

      if (openRouterResponse.ok && openRouterResponse.body) {
        return new Response(openRouterResponse.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream;charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      } else {
        const errText = await openRouterResponse.text().catch(() => "");
        errors.push(`OpenRouter: ${openRouterResponse.status} ${errText}`);
      }
    } catch (errOR) {
      errors.push(`OpenRouter: ${errOR.message}`);
    }
  }

  // 3. WORKERS AI (Встроенная сеть Cloudflare)
  if (env.AI) {
    try {
      const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: fullMessages,
        stream: true,
        temperature: 0.2,
        max_tokens: 350
      });

      if (stream) {
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream;charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }
    } catch (errAI) {
      errors.push(`Workers AI: ${errAI.message}`);
    }
  }

  return new Response(
    JSON.stringify({ 
      error: "Не удалось подключиться к нейросети. Ошибки: " + errors.join("; ") 
    }), 
    { status: 500, headers: { "Content-Type": "application/json;charset=utf-8" } }
  );
}
