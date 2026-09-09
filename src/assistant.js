// Резервный справочник на случай, если база D1 ещё не наполнена
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
    id: 166,
    title: "Службы школы — куда и по каким вопросам обращаться",
    url: "https://helpcenter.skyeng.ru/article/166",
    category: "Поддержка",
    content: "Teachers Care — вопросы расписания, форс-мажоры, финансы (чат в ЛК с 09:00 до 22:00 МСК). Support — экстренная техподдержка 24/7."
  },
  {
    id: 205,
    title: "Как преподавателю взять перерыв или отпуск",
    url: "https://helpcenter.skyeng.ru/article/205",
    category: "Расписание и перерывы",
    content: "Зеленая зона (>14 дней) — безопасно. Желтая зона (3-14 дней) — уроки становятся «Неуспешными». Красная зона (<3 дней) — только через Teachers Care. Лимит перерыва — 40 дней."
  },
  {
    id: 240,
    title: "Технические сбои на платформе: как провести и спасти урок",
    url: "https://helpcenter.skyeng.ru/article/240",
    category: "Технические вопросы",
    content: "При сбое видео/связи на платформе перейти в Телемост, Google Meet, Zoom, Telegram или Skype. В течение 24 часов поставить статус «Урок состоялся» в ЛК."
  }
];

// Стоп-слова для точного поиска
const STOP_WORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все",
  "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по",
  "только", "ее", "мне", "было", "вот", "от", "меня", "еще", "нет", "о", "из",
  "ему", "теперь", "когда", "даже", "ну", "вдруг", "ли", "если", "уже", "или",
  "ни", "быть", "был", "него", "до", "вас", "нибудь", "опять", "уж", "вам",
  "сказал", "ведь", "там", "потом", "себя", "ничего", "ей", "может", "они", "тут",
  "где", "есть", "надо", "ней", "для", "мы", "тебя", "их", "чем", "была", "сам"
]);

// Поиск статей в базе данных Cloudflare D1 (ARTICLES_DB) с fallback
export async function findRelevantArticles(query, env, maxResults = 3) {
  if (!query) return FALLBACK_ARTICLES.slice(0, 2);

  const words = query
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  if (words.length === 0) return FALLBACK_ARTICLES.slice(0, 2);

  // Поиск по базе Cloudflare D1
  if (env && env.ARTICLES_DB) {
    try {
      const topWord = words[0];
      const secondWord = words[1] || topWord;

      const res = await env.ARTICLES_DB.prepare(`
        SELECT id, title, category, url, substr(content, 1, 2000) as content
        FROM articles
        WHERE title LIKE ? OR category LIKE ? OR content LIKE ? OR title LIKE ?
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

  // Если база еще не заполнена — берем из резерва
  return FALLBACK_ARTICLES.slice(0, maxResults);
}

// Формирование системного промпта
function buildSystemPrompt(relevantArticles) {
  const contextSection = relevantArticles.map((art, idx) => `
--- Источник #${idx + 1} ---
Заголовок: ${art.title}
Ссылка: ${art.url}
Категория: ${art.category || "Общее"}
Текст:
${art.content || ""}
`).join("\n");

  return `
Ты — опытный, доброжелательный методический наставник и заботливый AI-помощник преподавателей онлайн-школы Skyeng и Skysmart.

ТВОЙ СОБЕСЕДНИК: Преподаватель школы. Обращайся уважительно на «вы», дружелюбно, по делу.

ГЛАВНЫЙ ПРИНЦИП: КРАТКОСТЬ, ТОЧНОСТЬ И БЕЗОПАСНОСТЬ ПРЕПОДАВАТЕЛЯ.
Преподавателю на уроке нужна четкая шпаргалка за 30 секунд. Без воды и самоповторов.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА:

1. 📌 ДЕЙСТВИЕ ДЛЯ ВАС (ЧТО ДЕЛАТЬ СЕЙЧАС):
   Четкие шаги по порядку: куда зайти в ЛК, какую кнопку нажать, какой статус выбрать.
   Если вопрос касается неявки ученика — обязательно дай 2 понятные ветки:
   - Ветка А (ученик написал, что не придет): ждать 50 минут НЕ нужно, вы свободны. Статус «Пропущен учеником» (оплачивается 100%).
   - Ветка Б (ученик молчит): учитель обязан ожидать полные 50 минут (или 25 минут) в классе. По окончании статус «Пропущен учеником» (оплачивается 100%).

2. ⚠️ ВАША БЕЗОПАСНОСТЬ И РИСКИ (РЕЙТИНГ / KPI):
   Честно предупреди о рейтинге Teacher Attendance.
   ЖЕЛЕЗНОЕ ПРАВИЛО: отмена или перенос учителем менее чем за 24 часа — это ВСЕГДА «Неуспешный урок» (Failed by teacher), даже при форс-мажоре, болезни или сбое сети. Оплата учителю 0 руб.
   КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО советовать просить ученика отменить урок за учителя.

3. 👤 ЧТО СО СТОРОНЫ УЧЕНИКА (БАЛАНС И ОПЛАТА):
   - Спишется ли урок с баланса ученика.
   - Получит ли преподаватель оплату.

4. 💬 ГОТОВЫЙ ШАБЛОН СООБЩЕНИЯ:
   Короткая готовая фраза в кавычках для отправки ученику в нужный момент (например, сразу в начале ожидания «Жду вас в классе» или вежливое извинение при форс-мажоре).

5. 🔗 ПОЛЕЗНЫЕ ССЫЛКИ:
   1-2 точные кликабельные ссылки из блока источников ниже строго в формате: [Название статьи](URL).

ЗОЛОТЫЕ РЕГЛАМЕНТЫ ШКОЛЫ:
1. Неявка ученика: в первые 3 минуты войти в класс и написать ученику. Если подтвердил пропуск — сразу свободны, статус «Пропущен учеником» (оплачивается). Если молчит — ждать полные 50 (или 25) мин, затем «Пропущен учеником» (оплачивается). Если прогул 3-й раз подряд — написать в Teachers Care.
2. Отмена учителем: более 24 часов — безопасно. Менее 24 часов (включая форс-мажор за 15 мин) — ВСЕГДА «Неуспешный урок», падение рейтинга, оплата 0 руб., ученику не списывается. Отменять сразу в ЛК или через Teachers Care.
3. Отмена учеником: более 8 часов (для Premium — 4 часа) — бесплатно. Менее 8/4 часов — списание с ученика, учителю 100% оплата.
4. Перерывы учителя: >14 дней — зеленая зона (безопасно); 3-14 дней — желтая зона (неуспешные уроки); <3 дней — красная зона (только через Teachers Care). Лимит перерыва — 40 дней подряд.
5. Технический сбой: перейти на резервную связь (Телемост, Google Meet, Zoom, Telegram, Skype) и в течение 24 часов поставить статус «Урок состоялся» (оплачивается).

ИСТОЧНИКИ БАЗЫ ЗНАНИЙ:
${contextSection}
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

async function fetchWithTimeout(url, options, timeoutMs = 8000) {
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

// Обработчик запросов ассистента
export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const isAllowed = await checkRateLimit(clientIp, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Превышен часовой лимит сообщений. Подождите немного." }), { 
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
  const relevantArticles = await findRelevantArticles(searchQuery, env, 3);
  const systemPrompt = buildSystemPrompt(relevantArticles);

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-6)
  ];

  let errors = [];

  // 1. GROQ API (Быстрая llama-3.1-8b-instant в приоритете)
  if (env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 5) {
    const groqKey = env.GROQ_API_KEY.trim();
    const groqModels = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

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
            temperature: 0.2
          })
        }, 8000);

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
        errors.push(`Groq (${model}) exception: ${errGroq.message}`);
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
          temperature: 0.2
        })
      }, 10000);

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

  // 3. WORKERS AI (Встроенная сеть)
  if (env.AI) {
    try {
      const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: fullMessages,
        stream: true,
        temperature: 0.2
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
      error: "Не удалось подключиться к нейросети. Проверьте переменные API-ключей в Cloudflare. Ошибки: " + errors.join("; ") 
    }), 
    { status: 500, headers: { "Content-Type": "application/json;charset=utf-8" } }
  );
}
