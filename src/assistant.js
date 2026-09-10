// src/assistant.js
import { SCENARIOS, HARD_POLICIES } from './rules.js';
import { synthesizeContextualQuery } from './classifier.js';

// Карта гарантированных официальных ссылок Help Center по сценариям
const SCENARIO_OFFICIAL_LINKS = {
  [SCENARIOS.STUDENT_ABSENCE]: [
    { title: "Что делать, если ученик не вышел на урок?", url: "https://helpcenter.skyeng.ru/article/244" },
    { title: "Как указать статус и какие бывают статусы уроков?", url: "https://helpcenter.skyeng.ru/article/130" },
    { title: "Ученик без предупреждения не вышел на 2 урока подряд", url: "https://helpcenter.skyeng.ru/article/906" }
  ],
  [SCENARIOS.STUDENT_LATE]: [
    { title: "Короткие уроки и опоздания", url: "https://helpcenter.skyeng.ru/article/129" },
    { title: "Что делать, если ученик не вышел на урок?", url: "https://helpcenter.skyeng.ru/article/244" }
  ],
  [SCENARIOS.UNIVERSAL_CANCEL]: [
    { title: "Условия переноса и отмены урока", url: "https://helpcenter.skyeng.ru/article/690" },
    { title: "Критерии доступности набора учеников и KPI (ID 310)", url: "https://helpcenter.skyeng.ru/article/2118" }
  ],
  [SCENARIOS.UNIVERSAL_LATE]: [
    { title: "Короткие уроки и опоздания", url: "https://helpcenter.skyeng.ru/article/129" },
    { title: "В каких случаях школа звонит преподавателю", url: "https://helpcenter.skyeng.ru/article/1974" }
  ],
  [SCENARIOS.STUDENT_CANCEL]: [
    { title: "Условия переноса и отмены урока", url: "https://helpcenter.skyeng.ru/article/690" }
  ],
  [SCENARIOS.TEACHER_CANCEL]: [
    { title: "Условия переноса и отмены урока", url: "https://helpcenter.skyeng.ru/article/690" },
    { title: "Критерии доступности набора учеников (ID 310)", url: "https://helpcenter.skyeng.ru/article/2118" }
  ],
  [SCENARIOS.TEACHER_LATE]: [
    { title: "Короткие уроки и опоздания", url: "https://helpcenter.skyeng.ru/article/129" },
    { title: "В каких случаях школа звонит преподавателю", url: "https://helpcenter.skyeng.ru/article/1974" }
  ],
  [SCENARIOS.BREAK_TEACHER]: [
    { title: "Перерыв преподавателя", url: "https://helpcenter.skyeng.ru/article/708" },
    { title: "В каких случаях школа звонит преподавателю", url: "https://helpcenter.skyeng.ru/article/1974" }
  ],
  [SCENARIOS.STUDENT_CHURN]: [
    { title: "Отказ от ученика: как предотвратить и что делать", url: "https://helpcenter.skyeng.ru/article/133" },
    { title: "Критерии доступности набора учеников (ID 310)", url: "https://helpcenter.skyeng.ru/article/2118" }
  ],
  [SCENARIOS.ZERO_BALANCE]: [
    { title: "Что делать, если у ученика 0 на балансе", url: "https://helpcenter.skyeng.ru/article/530" }
  ],
  [SCENARIOS.TECHNICAL_ISSUE]: [
    { title: "Как спасти урок на случай массовых неполадок", url: "https://helpcenter.skyeng.ru/article/508" },
    { title: "Важность своевременного обращения в техподдержку", url: "https://helpcenter.skyeng.ru/article/179" }
  ],
  [SCENARIOS.FIRST_LESSON_ALOHA]: [
    { title: "Стандарт первого урока в Skyeng", url: "https://helpcenter.skyeng.ru/article/1350" },
    { title: "Aloha 3.0 для первых уроков английского", url: "https://helpcenter.skyeng.ru/article/2304" },
    { title: "Курс «Английский для жизни»: Запрет на уроки Aloha", url: "https://helpcenter.skyeng.ru/article/1486" }
  ],
  [SCENARIOS.PARENT_FEEDBACK]: [
    { title: "Формат обратной связи родителю One page", url: "https://helpcenter.skyeng.ru/article/2227" },
    { title: "Новый формат обратной связи (5 блоков)", url: "https://helpcenter.skyeng.ru/article/2229" }
  ],
  [SCENARIOS.CORPORATE_B2B]: [
    { title: "Обязательные условия проведения уроков B2B", url: "https://helpcenter.skyeng.ru/article/1083" },
    { title: "Стандартная инструкция для корпоративных учеников", url: "https://helpcenter.skyeng.ru/article/1290" }
  ]
};

/**
 * Классификатор сценариев с вычислением уверенности
 */
export function classifyScenarioWithConfidence(context, userQuery = '') {
  const query = (userQuery || context?.rawHistoryText || '').toLowerCase();

  const facts = {
    minutes: null,
    hours: null,
    actor: null,
    isEmergency: false,
    platform: null
  };

  const minuteMatch = query.match(/(\d+)\s*(?:мин|минут|минуты)/);
  if (minuteMatch) facts.minutes = parseInt(minuteMatch[1], 10);

  const hourMatch = query.match(/(\d+)\s*(?:ч|час|часа|часов)/);
  if (hourMatch) facts.hours = parseInt(hourMatch[1], 10);

  // 1. Универсальные запросы (Universal Branching)
  if (/^как\s+отменить\s+урок\??$/i.test(query.trim()) || /отмен.*урок.*как/i.test(query)) {
    if (!/я\s+отменяю|ученик\s+отменил|форс-мажор|свет/i.test(query)) {
      return { scenario: SCENARIOS.UNIVERSAL_CANCEL, facts, confidence: 0.98 };
    }
  }

  if (/^что\s+делать\s+при\s+опоздании\??$/i.test(query.trim()) || /опоздани.*что\s+делать/i.test(query)) {
    if (!/я\s+опоздал|ученик\s+опазд/i.test(query)) {
      return { scenario: SCENARIOS.UNIVERSAL_LATE, facts, confidence: 0.98 };
    }
  }

  if (/урок\s+сорвался|сорвался\s+урок|проблема\s+с\s+уроком/i.test(query)) {
    return { scenario: SCENARIOS.AMBIGUOUS_LESSON_ISSUE, facts, confidence: 0.95 };
  }

  // 2. Отток и сменяемость (Student Churn)
  if (/смен.*преподават|ученик.*хочет.*сменить|ушл[ио].*ученик|отказ.*ученик/i.test(query)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.94 };
  }

  // 3. Отпуск и перерывы (Break Teacher)
  if (/отпуск|перерыв|хочу\s+уйти\s+в\s+отпуск|оформить\s+перерыв/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  // 4. Форс-мажор учителя (Teacher Emergency)
  if (/пожар|эвакуац|нет\s+свет|отключил|заболел|больнич|срочн|чп|форс-мажор|авария|госпитал/i.test(query)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.96 };
  }

  // 5. Опоздания и неявки ученика (Student Late / Student Absence)
  if (/ученик.*(опазд|задержив|не\s+пришел|не\s+подключ|нет\s+на\s+урок|пропустил|пропуск)|прошло.*минут.*ученик|пропустил.*урок/i.test(query)) {
    facts.actor = 'student';
    if (/ровно\s+50\s+минут|50\s+минут.*не\s+пришел|так\s+и\s+не\s+пришел|3\s+урок.*подряд|2\s+урок.*подряд|пропустил.*3\s+урок/i.test(query)) {
      return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.96 };
    }
    return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.93 };
  }

  // 6. Отмена со стороны учителя (Teacher Cancel)
  if (/я\s+отменяю|отменяю\s+урок|не\s+могу\s+провести\s+урок|отмена\s+преподавател/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.92 };
  }

  // 7. Отмена со стороны ученика (Student Cancel)
  if (/ученик\s+отменил|студент\s+отменил|отмена\s+ученик/i.test(query)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.92 };
  }

  // 8. Опоздание учителя (Teacher Late)
  if (/я\s+опоздал|опоздал\s+на|звонил\s+робот|робот.*звон/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.91 };
  }

  // 9. Нулевой баланс (Zero Balance)
  if (/0\s+на\s+балансе|нулев.*баланс|баланс\s+0/i.test(query)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.95 };
  }

  // 10. Техсбои (Technical Issue)
  if (/платформ.*завис|не\s+работает\s+видео|спасаю\s+урок|zoom|telemost|meet|сбой\s+платформ/i.test(query)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.90 };
  }

  // 11. B2B / Корпоративные (Corporate B2B)
  if (/корпорат|b2b|bayer|байер|x5|playrix|helix|геликс|metro|1с|progress\s+test/i.test(query)) {
    return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.93 };
  }

  // 12. Групповые уроки (Group Lesson)
  if (/групп.*урок|в\s+группу\s+пришел|групп.*1\s+человек/i.test(query)) {
    return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.92 };
  }

  // 13. Параллельные уроки (Parallel Lesson)
  if (/параллельн.*урок/i.test(query)) {
    return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.95 };
  }

  // 14. Первый урок Aloha 3.0 (First Lesson Aloha)
  if (/aloha|алоха|первый\s+урок|вводный\s+урок/i.test(query)) {
    return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.94 };
  }

  // 15. One Page родителям (Parent Feedback)
  if (/one[\s-]page|обратн.*связ.*родител|отчет.*родител/i.test(query)) {
    return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  }

  return { scenario: SCENARIOS.UNKNOWN || 'unknown', facts, confidence: 0.30 };
}

/**
 * Семантический поиск по Cloudflare D1
 */
async function retrieveKnowledgeContext(db, query) {
  if (!db) return [];

  try {
    const cleanTokens = query
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 5);

    if (cleanTokens.length === 0) return [];

    const clauses = cleanTokens.map(() => `(title LIKE ? OR chunk_content LIKE ?)`).join(' OR ');
    const params = [];
    cleanTokens.forEach(t => {
      params.push(`%${t}%`, `%${t}%`);
    });

    const sql = `
      SELECT article_id, title, category, url, chunk_content
      FROM article_chunks
      WHERE ${clauses}
      LIMIT 3
    `;

    const res = await db.prepare(sql).bind(...params).all();
    return res.results || [];
  } catch (err) {
    console.error("D1 search error:", err);
    return [];
  }
}

/**
 * Системный промпт с гарантированными ссылками и защитой от галлюцинаций
 */
function buildSystemPrompt(policyDecision, retrievedDocs, scenario) {
  let prompt = `Вы — официальный ИИ-ассистент преподавателя онлайн-школы Skyeng и Skysmart.
Временная привязка знаний: Сентябрь 2026 года.

ПРАВИЛА И СТАНДАРТЫ ШКОЛЫ (СЕНТЯБРЬ 2026):
1. Мессенджер: действующий стандарт — Mattermost (ММТ). Устаревший Slack исключен.
2. Интерфейс: кнопка «Продолжить урок» удалена. Добор карточек выполняется через «Add cards from previous lessons». Запуск — кнопкой «Начать урок».
3. Вводный урок: Aloha 3.0. На курсах-комплектациях («Английский для жизни / +1 уровень») проведение Aloha СТРОГО ЗАПРЕЩЕНО.
4. Отчет родителям: формат 9 слайдов упразднен. Действует устный «One Page» (5 блоков за 5–10 минут).
5. KPI: 2-недельный цикл проверки по понедельникам по 6 метрикам (ID 310). Порог брака по неуспешным урокам — до 20,0%.
6. Перенос учителем < 24 часов — всегда брак (неуспешный урок), кроме переноса на более раннее время того же дня с проведением.
7. Неявка ученика: учитель обязан находиться в комнате полные 50 минут для 100% оплаты и выставления «Пропущен учеником».
8. Финансы: плательщик — ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). СМЗ РФ — Банк 131; ИП РФ, РБ и РК — «Рокет Ворк». Payoneer и Agaton удалены.
9. IT-курсы: Roblox выведен из РФ; базовые среды — «Блоксели», Unity, Python.

ТРЕБОВАНИЯ К ФОРМАТУ ОТВЕТА:
- Давайте четкий алгоритм действий и точный статус урока для CRM.
- Сообщение для ученика пишите СРАЗУ, без лишних слов, без плейсхолдеров и БЕЗ вводной фразы «Текст сообщения ученику...». Оформляйте строго внутри цитаты:
> «Здравствуйте! ...»

ПРАВИЛА ПО ССЫЛКАМ (СТРОГО):
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ПРИДУМЫВАТЬ ВЫМЫШЛЕННЫЕ ССЫЛКИ И НАЗВАНИЯ.
- Используйте ТОЛЬКО реальные ссылки из блоков ниже. В конце ответа добавьте раздел:
**Полезные ссылки:**
- [Название статьи](реальный_url)`;

  if (policyDecision) {
    prompt += `\n\nСИСТЕМНОЕ РЕШЕНИЕ ДЛЯ ТЕКУЩЕЙ СИТУАЦИИ:\n`;
    prompt += `- Предписанное решение: ${policyDecision.decision}\n`;
    prompt += `- Статус урока: ${policyDecision.lessonStatus}\n`;
    prompt += `- Алгоритм действий: ${policyDecision.actionPlan.join(' ')}\n`;
  }

  // Добавляем проверенные официальные ссылки для данного сценария
  const officialLinks = SCENARIO_OFFICIAL_LINKS[scenario] || [
    { title: "Официальный Help Center для преподавателей", url: "https://helpcenter.skyeng.ru" }
  ];
  prompt += `\n\nОФИЦИАЛЬНЫЕ ПРОВЕРЕННЫЕ ССЫЛКИ ДЛЯ ЭТОГО ВОПРОСА (ИСПОЛЬЗУЙТЕ ИХ):\n`;
  officialLinks.forEach(l => {
    prompt += `- [${l.title}](${l.url})\n`;
  });

  if (retrievedDocs && retrievedDocs.length > 0) {
    prompt += `\n\nМАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ (D1):\n`;
    retrievedDocs.forEach(d => {
      prompt += `--- Статья: [${d.title}](${d.url}) ---\n${d.chunk_content}\n\n`;
    });
  }

  return prompt;
}

/**
 * Обработчик API чата (/api/assistant)
 */
export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Массив сообщений пуст" }), { status: 400 });
    }

    const { contextualQuery } = synthesizeContextualQuery(messages);
    const classification = classifyScenarioWithConfidence({ rawHistoryText: contextualQuery }, contextualQuery);
    
    const policy = HARD_POLICIES[classification.scenario];
    const decisionObj = policy ? policy.evaluate({ ...classification.facts, rawText: contextualQuery }) : null;

    const retrievedDocs = await retrieveKnowledgeContext(env.ARTICLES_DB, contextualQuery);
    const systemPrompt = buildSystemPrompt(decisionObj, retrievedDocs, classification.scenario);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6)
    ];

    // 1. OpenRouter API
    if (env.OPENROUTER_API_KEY) {
      const model = env.OPENROUTER_MODEL || "openrouter/free";
      
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://meetupmozyr.by",
          "X-Title": "Skyeng Teacher Assistant 2026"
        },
        body: JSON.stringify({
          model: model,
          messages: fullMessages,
          stream: true,
          temperature: 0.1
        })
      });

      if (!openRouterRes.ok) {
        const errText = await openRouterRes.text();
        throw new Error(`OpenRouter Error (${openRouterRes.status}): ${errText}`);
      }

      return new Response(openRouterRes.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    // 2. Cloudflare Workers AI
    if (env.AI) {
      const aiStream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct", {
        messages: fullMessages,
        stream: true
      });

      return new Response(aiStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    return new Response(JSON.stringify({ 
      error: "Не настроен LLM-провайдер: добавьте OPENROUTER_API_KEY или привязку env.AI в wrangler.toml" 
    }), { status: 500 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
