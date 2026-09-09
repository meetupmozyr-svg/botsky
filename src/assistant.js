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

// Lightweight Russian stemmer to match words regardless of grammatical endings
function stemRussian(word) {
  if (!word || word.length < 4) return word;
  let w = word.toLowerCase();

  // Strip common verb and reflexive endings
  w = w.replace(/(илась|ылась|елась|алась|ился|ылся|елся|ался|иться|ыться|еться|аться|ите|ыте|ете|ате|ить|еть|ать|ять|уть|ил|ыл|ел|ал)$/, '');
  // Strip plural and case endings
  w = w.replace(/(иями|ыями|ями|ами|ией|ыей|ей|ов|ев|ам|ям|ах|ях|ом|ем|ую|юю|ой|ей|ое|ее|ый|ий|ая|яя|ого|его|ому|ему|ых|их|ы|и|а|я|у|ю|е|о)$/, '');

  return w.length >= 3 ? w : word;
}

// Tokenize and extract search stems
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .map(w => stemRussian(w));
}

// In-Worker Search Engine with Teacher-priority boosting
export function findRelevantArticles(query, maxResults = 4) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const lowerQuery = query.toLowerCase();

  const scored = articles.map(art => {
    let score = 0;
    const rawTitle = art.title || "";
    const rawCategory = art.category || "";
    const rawContent = art.content || "";

    const lowerTitle = rawTitle.toLowerCase();
    const lowerCategory = rawCategory.toLowerCase();
    const lowerContent = rawContent.toLowerCase();

    // Priority boost for articles created specifically for teachers
    const isTeacherSpecific = 
      lowerTitle.includes("преподават") || 
      lowerTitle.includes("учител") || 
      lowerCategory.includes("преподават") || 
      lowerCategory.includes("лк преподавател") || 
      lowerTitle.includes("рейтинг") || 
      lowerTitle.includes("вознагражден") ||
      lowerTitle.includes("перерыв") ||
      lowerTitle.includes("статус");

    if (isTeacherSpecific) {
      score += 25;
    }

    // Direct match bonuses
    if (lowerTitle.includes(lowerQuery)) score += 80;
    if (lowerCategory.includes(lowerQuery)) score += 30;

    for (const token of queryTokens) {
      if (lowerTitle.includes(token)) score += 35;
      if (lowerCategory.includes(token)) score += 15;

      let matches = 0;
      let pos = lowerContent.indexOf(token);
      while (pos !== -1 && matches < 8) {
        matches++;
        pos = lowerContent.indexOf(token, pos + token.length);
      }
      score += matches * 2;
    }

    return { article: art, score };
  });

  return scored
    .filter(item => item.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.article);
}

// Build humanized prompt with strict teacher-first response architecture
function buildSystemPrompt(relevantArticles) {
  let contextSection = "";
  if (relevantArticles.length > 0) {
    contextSection = relevantArticles.map((art, idx) => `
--- Источник #${idx + 1} ---
Заголовок: ${art.title}
Ссылка: ${art.url}
Категория: ${art.category || "Общее"}
Текст:
${(art.content || "").slice(0, 2200)}
`).join("\n");
  } else {
    contextSection = "Релевантных статей в базе не обнаружено. Опирайся на шпаргалку.";
  }

  return `
Ты — опытный, доброжелательный наставник и заботливый корпоративный AI-помощник для преподавателей онлайн-школы Skyeng и Skysmart.

ТВОЙ СОБЕСЕДНИК:
Твой собеседник — ВСЕГДА преподаватель школы. Общайся уважительно на «вы», дружелюбно, по-человечески, как надёжный коллега-методист, без роботизированного бюрократического тона и лишней «воды».

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА КАЖДОГО ТВОЕГО ОТВЕТА (СТРОГО СОБЛЮДАТЬ):
Всегда выстраивай ответ по этим шагам:

1. 📌 ДЕЙСТВИЕ ДЛЯ ВАС (ПРОСТЫМИ СЛОВАМИ):
   Сразу дай чёткий и конкретный ответ преподавателю: куда зайти в ЛК (Личном кабинете преподавателя), какую кнопку нажать и какой статус выбрать. Без предисловий и усложнений.

2. ⚠️ ВАША БЕЗОПАСНОСТЬ И РИСКИ (РЕЙТИНГ / KPI):
   Честно и прямо предупреди преподавателя обо всех рисках для его показателей:
   - Влияет ли действие на успешность уроков и доступность набора новых учеников.
   - Правило 24 часов (любая отмена учителем менее чем за 24 часа — всегда неуспешный урок).
   - Ограничения набора или штрафы, если применимо.

3. 👤 ЧТО СО СТОРОНЫ УЧЕНИКА (БАЛАНС И ОПЛАТА):
   Только здесь объясни, что происходит у студента:
   - Спишется ли у ученика урок с баланса (правило 8 часов для обычных, 4 часов для Premium).
   - Получит ли преподаватель оплату за этот урок.
   - Подскажи, почему лучше мягко попросить ученика отменить урок САМОСТОЯТЕЛЬНО через его приложение или ЛК (это развивает самостоятельность и защищает учителя).

4. 💬 ГОТОВЫЙ ШАБЛОН СООБЩЕНИЯ (если ситуация требует связи с учеником или поддержкой):
   Напиши короткую, вежливую и готовую фразочку в кавычках, которую преподаватель может просто скопировать и отправить ученику или куратору.

5. 🔗 ПОЛЕЗНЫЕ ССЫЛКИ:
   Дай 1-2 точные кликабельные ссылки на базу знаний в формате: [Название статьи](URL).
   ВАЖНО: Бери ссылки ТОЛЬКО из блока источников ниже. Никогда не придумывай несуществующие URL!

ЗОЛОТЫЕ ПРАВИЛА ШКОЛЫ ДЛЯ ПРЕПОДАВАТЕЛЯ:
1. Отмена/перенос урока преподавателем:
   - Без последствий для рейтинга: ТОЛЬКО более чем за 24 часа до старта.
   - Менее чем за 24 часа: ВСЕГДА статус «Неуспешный урок» и снижение рейтинга, даже при болезни и форс-мажоре. При форс-мажоре отменяем сразу в ЛК, предупреждаем ученика и пишем в Teachers Care. Ни в коем случае не ждём начала урока.
   - Если преподаватель указывает ученика инициатором отмены менее чем за 24 часа, а ученик это не подтвердил сам в своём приложении, система зафиксирует нарушение регламента преподавателем.
2. Отмена/перенос урока учеником:
   - Без списания: более чем за 8 часов (для тарифа Premium — за 4 часа).
   - Менее 8/4 часов: Урок списывается с баланса ученика, преподаватель получает за него полную оплату.
3. Ученик не явился на урок:
   - По умолчанию: учитель обязан зайти в виртуальный класс вовремя, написать ученику в чат класса и в мессенджер, и ожидать полные 50 минут (или 25 минут, если урок короткий).
   - ИСКЛЮЧЕНИЕ: Если ученик сам прямо написал в сообщении «Я сегодня не приду / не смогу», ждать до конца не нужно. Выставляется статус «Пропущен учеником» (урок оплачивается).
4. Перерывы и отпуск преподавателя:
   - Зеленая зона (>14 дней до старта): Полная безопасность, спокойно выставляется в ЛК.
   - Желтая зона (3-14 дней): Выставить в ЛК технически можно, но это нарушение регламента. Все удаленные уроки становятся «Неуспешными».
   - Красная зона (<3 дней): В ЛК заблокировано, только через куратора Teachers Care с подтверждением форс-мажора.
   - Лимит отпуска: перерыв более 40 дней подряд ведёт к закрытию доступа к платформе и завершению сотрудничества.
5. Массовый технический сбой платформы:
   - Провести урок на резервной площадке (Zoom, Google Meet, Telegram, Skype).
   - В течение 24 часов выставить в ЛК статус «Урок состоялся».

БАЗА ЗНАНИЙ (ДЛЯ ДОПОЛНИТЕЛЬНЫХ ДЕТАЛЕЙ И ССЫЛОК):
${contextSection}
`.trim();
}

async function checkRateLimit(ip, env) {
  if (!env.KV) return true;
  const key = `ratelimit_chat:${ip}`;
  const current = parseInt(await env.KV.get(key) || "0", 10);
  if (current >= 30) {
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
    return new Response(JSON.stringify({ error: "Превышен часовой лимит сообщений. Пожалуйста, подождите немного перед следующим вопросом." }), { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const userMessages = body.messages || [];
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || "";

  // Combine last two user questions so context is preserved in multi-turn dialogues
  const recentUserQuestions = userMessages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content)
    .join(" ");

  const searchQuery = recentUserQuestions || lastUserMessage;
  const relevantArticles = findRelevantArticles(searchQuery, 4);
  const systemPrompt = buildSystemPrompt(relevantArticles);

  const openRouterMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-6)
  ];

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
        models: [
          "qwen/qwen-2.5-72b-instruct:free",
          "meta-llama/llama-3.3-70b-instruct:free",
          "google/gemini-2.0-flash-exp:free",
          "nvidia/nemotron-3-ultra-550b-a55b:free",
          "qwen/qwen-2.5-7b-instruct:free",
          "openrouter/free"
        ],
        messages: openRouterMessages,
        stream: true,
        temperature: 0.3
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
