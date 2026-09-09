import articles from './skyeng_all_helpcenter_articles.json';

// Оптимизированный список стоп-слов для фильтрации поискового шума
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

// Семантическая карта синонимов корпоративного сленга школы
const SYNONYM_MAP = {
  "прогул": ["неявк", "пропущ", "пропуск", "не приш", "не явился", "опозда"],
  "неявка": ["прогул", "пропущ", "пропуск", "не приш", "не явился"],
  "пропуск": ["неявк", "прогул", "пропущ", "не приш"],
  "отмена": ["отмен", "перенос", "неуспешн", "списан", "форс-мажор"],
  "перенос": ["перенес", "отмен", "сдвин", "график"],
  "списание": ["баланс", "оплат", "списан", "премиум", "premium"],
  "баланс": ["оплат", "списан", "урок", "деньг"],
  "вознаграждение": ["оплат", "деньг", "финанс", "выплат", "повышающ", "бонус"],
  "зарплата": ["вознагражден", "выплат", "оплат", "финанс", "деньг"],
  "перерыв": ["отпуск", "пауз", "больничн", "регламент", "зона", "каникул"],
  "отпуск": ["перерыв", "пауз", "регламент", "зона", "каникул"],
  "болезнь": ["больничн", "форс-мажор", "перерыв", "неуспешн", "срочн"],
  "рейтинг": ["kpi", "посещаем", "критери", "attendance", "неуспешн", "набор"],
  "поддержка": ["teachers care", "tc", "support", "куратор", "саппорт", "забот"],
  "сбой": ["техническ", "платформ", "видео", "связь", "телемост", "zoom"]
};

// Быстрый стеммер русского языка
function stemRussian(word) {
  if (!word || word.length < 4) return word;
  let w = word.toLowerCase();
  w = w.replace(/(илась|ылась|елась|алась|ился|ылся|елся|ался|иться|ыться|еться|аться|ите|ыте|ете|ате|ить|еть|ать|ять|уть|ил|ыл|ел|ал)$/, '');
  w = w.replace(/(иями|ыями|ями|ами|ией|ыей|ей|ов|ев|ам|ям|ах|ях|ом|ем|ую|юю|ой|ей|ое|ее|ый|ий|ая|яя|ого|его|ому|ему|ых|их|ы|и|а|я|у|ю|е|о)$/, '');
  return w.length >= 3 ? w : word;
}

// Извлечение поисковых стеммов с синонимами
function tokenize(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const stems = new Set();
  for (const w of words) {
    const stem = stemRussian(w);
    stems.add(stem);

    for (const [key, synList] of Object.entries(SYNONYM_MAP)) {
      if (w.includes(key) || key.includes(w) || stem === stemRussian(key)) {
        synList.forEach(syn => stems.add(stemRussian(syn)));
      }
    }
  }

  return Array.from(stems);
}

// Поиск по 695 статьям с приоритетом преподавательских регламентов
export function findRelevantArticles(query, maxResults = 3) {
  if (!Array.isArray(articles) || articles.length === 0) return [];
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

    // Приоритетный буст статьям для преподавателей
    const isTeacherSpecific = 
      lowerTitle.includes("преподават") || 
      lowerTitle.includes("учител") || 
      lowerCategory.includes("преподават") || 
      lowerCategory.includes("лк преподавател") || 
      lowerTitle.includes("рейтинг") || 
      lowerTitle.includes("вознагражден") ||
      lowerTitle.includes("перерыв") ||
      lowerTitle.includes("статус") ||
      lowerTitle.includes("отмен") ||
      lowerTitle.includes("перенос");

    if (isTeacherSpecific) score += 35;

    // Прямые совпадения
    if (lowerTitle.includes(lowerQuery)) score += 100;
    if (lowerCategory.includes(lowerQuery)) score += 40;

    for (const token of queryTokens) {
      if (lowerTitle.includes(token)) score += 45;
      if (lowerCategory.includes(token)) score += 20;

      let matches = 0;
      let pos = lowerContent.indexOf(token);
      while (pos !== -1 && matches < 8) {
        matches++;
        pos = lowerContent.indexOf(token, pos + token.length);
      }
      score += matches * 3;
    }

    return { article: art, score };
  });

  return scored
    .filter(item => item.score > 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.article);
}

// Системный промпт с выверенными регламентами школы
function buildSystemPrompt(relevantArticles) {
  let contextSection = "";
  if (relevantArticles.length > 0) {
    contextSection = relevantArticles.map((art, idx) => `
--- Источник #${idx + 1} ---
Заголовок: ${art.title}
Ссылка: ${art.url}
Категория: ${art.category || "Общее"}
Текст:
${(art.content || "").slice(0, 3000)}
`).join("\n");
  } else {
    contextSection = "Статьи в базе знаний не найдены. Руководствуйся регламентом школы.";
  }

  return `
Ты — опытный методический наставник и заботливый помощник преподавателей онлайн-школы Skyeng и Skysmart.

ТВОЙ СОБЕСЕДНИК: Преподаватель школы. Обращайся на «вы», дружелюбно, по делу.

ГЛАВНЫЙ ПРИНЦИП: КРАТКОСТЬ, ТОЧНОСТЬ И БЕЗОПАСНОСТЬ ПРЕПОДАВАТЕЛЯ.
Не пиши «воду». Никаких лишних предисловий и самоповторов. Преподавателю на уроке нужна четкая шпаргалка за 30 секунд.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА:

1. 📌 ДЕЙСТВИЕ ДЛЯ ВАС (ЧТО ДЕЛАТЬ СЕЙЧАС):
   Четкие шаги по порядку: куда зайти в ЛК, какую кнопку нажать, какой статус выбрать. 
   Если есть развилка по времени (например, ученик не пришел) — четко укажи два варианта:
   - Ветка А: если ученик ответил в чате, что не придет.
   - Ветка Б: если ученик не отвечает (тишина).

2. ⚠️ ВАША БЕЗОПАСНОСТЬ И РИСКИ (РЕЙТИНГ / KPI):
   Честно и прямо укажи последствия для рейтинга Teacher Attendance и набора учеников.
   ЖЕЛЕЗНОЕ ПРАВИЛО: при отмене/переносе преподавателем менее чем за 24 часа — это ВСЕГДА «Неуспешный урок» (Failed by teacher), даже при форс-мажоре и болезни. Оплата учителю НЕ начисляется.
   КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО советовать просить ученика отменить урок за учителя.

3. 👤 ЧТО СО СТОРОНЫ УЧЕНИКА (БАЛАНС И ОПЛАТА):
   - Спишется ли урок у ученика.
   - Получит ли преподаватель оплату.

4. 💬 ГОТОВЫЙ ШАБЛОН СООБЩЕНИЯ:
   Короткая фраза в кавычках для отправки ученику в соответствующий момент (например, сразу в начале ожидания, или извинение при форс-мажоре).

5. 🔗 ПОЛЕЗНЫЕ ССЫЛКИ:
   1-2 ссылки на базу знаний строго из блока источников ниже: [Название статьи](URL).

ЗОЛОТЫЕ РЕГЛАМЕНТЫ ШКОЛЫ:
1. Неявка ученика на урок:
   - В первые 0-3 минуты зайти в класс, отправить сообщение в чат/мессенджер («Жду вас в классе, наш урок в силе?»).
   - Если ученик ответил «Не смогу / не приду» — ждать 50 минут НЕ НУЖНО. Преподаватель свободен. В ЛК ставится «Пропущен учеником» (урок оплачивается 100%).
   - Если ученик молчит — преподаватель ОБЯЗАН находиться в классе полные 50 минут (или 25 минут для коротких). По окончании ставится статус «Пропущен учеником» (урок оплачивается 100%).
   - Если ученик пропускает 3-й раз подряд — после 3-го урока обязательно написать в Teachers Care для снятия расписания.
2. Отмена/перенос преподавателем:
   - Более 24 часов: безопасно в ЛК, без потери рейтинга.
   - Менее 24 часов (включая форс-мажор, отключение света, болезнь): ВСЕГДА статус «Неуспешный урок», падение Teacher Attendance. Оплата учителю 0 руб. Ученику урок не списывается. Отменяем сразу в ЛК или через Teachers Care, предупреждаем ученика.
   - Исключение: перенос на более раннее время того же дня с согласия ученика — не считается неуспешным, если урок состоялся.
3. Отмена учеником:
   - Тариф Стандарт: более чем за 8 часов — бесплатно; менее 8 часов — списание с ученика, учителю 100% оплата.
   - Тариф Premium: более чем за 4 часа — бесплатно; менее 4 часов — списание с ученика, учителю 100% оплата.
4. Перерывы преподавателя:
   - Зеленая зона (>14 дней): безопасно.
   - Желтая зона (3-14 дней): удаленные уроки идут в «Неуспешные».
   - Красная зона (<3 дней): только через Teachers Care с подтверждением.
   - Лимит отпуска: перерыв более 40 дней подряд ведет к прекращению сотрудничества.
5. Технический сбой платформы:
   - Перейти на резервную площадку (Телемост, Google Meet, Zoom, Telegram, Skype).
   - В течение 24 часов выставить в ЛК статус «Урок состоялся» (оплачивается).

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

// Обработчик запросов ассистента со стримингом и отказоустойчивостью
export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const isAllowed = await checkRateLimit(clientIp, env);
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Превышен часовой лимит сообщений. Пожалуйста, подождите немного." }), { 
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

  // Контекст последних 2 реплик пользователя для точного поиска
  const recentUserQuestions = userMessages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content)
    .join(" ");

  const searchQuery = recentUserQuestions || lastUserMessage;
  const relevantArticles = findRelevantArticles(searchQuery, 3);
  const systemPrompt = buildSystemPrompt(relevantArticles);

  const fullMessages = [
    { role: "system", content: systemPrompt },
    ...userMessages.slice(-6)
  ];

  let errors = [];

  // ========================================================================
  // ПРОВАЙДЕР 1: GROQ API (Основной высокоскоростной движок)
  // ========================================================================
  if (env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 5) {
    const groqKey = env.GROQ_API_KEY.trim();
    const groqModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    for (const model of groqModels) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        });

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

  // ========================================================================
  // ПРОВАЙДЕР 2: OPENROUTER (Резервный шлюз)
  // ========================================================================
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim().length > 5) {
    const openrouterKey = env.OPENROUTER_API_KEY.trim();
    const primaryModel = env.OPENROUTER_MODEL || "openrouter/free";

    try {
      const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      });

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
      errors.push(`OpenRouter exception: ${errOR.message}`);
    }
  }

  // ========================================================================
  // ПРОВАЙДЕР 3: CLOUDFLARE WORKERS AI (Встроенная сеть)
  // ========================================================================
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
      errors.push(`Workers AI exception: ${errAI.message}`);
    }
  }

  return new Response(
    JSON.stringify({ 
      error: "Не удалось подключиться к сервису нейросети. Проверьте настройки API-ключей в Cloudflare. Ошибки: " + errors.join("; ") 
    }), 
    { status: 500, headers: { "Content-Type": "application/json;charset=utf-8" } }
  );
}
