// src/assistant.js
import { SCENARIOS, HARD_POLICIES } from './rules.js';
import { synthesizeContextualQuery } from './classifier.js';

/**
 * Классификатор сценариев с вычислением уверенности (Confidence Score)
 * Используется в основном чате и в тестовом стенде evalSuite.js
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

  // Извлечение минут и часов
  const minuteMatch = query.match(/(\d+)\s*(?:мин|минут|минуты)/);
  if (minuteMatch) facts.minutes = parseInt(minuteMatch[1], 10);

  const hourMatch = query.match(/(\d+)\s*(?:ч|час|часа|часов)/);
  if (hourMatch) facts.hours = parseInt(hourMatch[1], 10);

  // 1. Неоднозначные запросы без деталей (Universal Branching)
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

  // 2. Отток и сменяемость учеников (Student Churn / Статья 2118)
  if (/смен.*преподават|ученик.*хочет.*сменить|ушл[ио].*ученик|отказ.*ученик/i.test(query)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.94 };
  }

  // 3. Отпуск и перерывы преподавателя (Break Teacher / ID 5, 477)
  if (/отпуск|перерыв|хочу\s+уйти\s+в\s+отпуск|оформить\s+перерыв/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  // 4. Форс-мажор и экстренные ситуации учителя (Teacher Emergency)
  if (/пожар|эвакуац|нет\s+свет|отключил|заболел|больнич|срочн|чп|форс-мажор|авария|госпитал/i.test(query)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.96 };
  }

  // 5. Опоздания и неявки ученика (Student Late / Student Absence)
  if (/ученик.*(опазд|задержив|не\s+пришел|не\s+подключ|нет\s+на\s+урок)|прошло.*минут.*ученик/i.test(query)) {
    facts.actor = 'student';
    if (/ровно\s+50\s+минут|50\s+минут.*не\s+пришел|так\s+и\s+не\s+пришел|3\s+урок.*подряд|2\s+урок.*подряд/i.test(query)) {
      return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.96 };
    }
    return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.93 };
  }

  // 6. Отмена со стороны преподавателя (Teacher Cancel)
  if (/я\s+отменяю|отменяю\s+урок|не\s+могу\s+провести\s+урок|отмена\s+преподавател/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.92 };
  }

  // 7. Отмена со стороны ученика (Student Cancel)
  if (/ученик\s+отменил|студент\s+отменил|отмена\s+ученик/i.test(query)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.92 };
  }

  // 8. Опоздание преподавателя (Teacher Late)
  if (/я\s+опоздал|опоздал\s+на|звонил\s+робот|робот.*звон/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.91 };
  }

  // 9. Нулевой баланс ученика (Zero Balance / ID 171)
  if (/0\s+на\s+балансе|нулев.*баланс|баланс\s+0/i.test(query)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.95 };
  }

  // 10. Технические сбои и спасение урока (Technical Issue / ID 132, 133)
  if (/платформ.*завис|не\s+работает\s+видео|спасаю\s+урок|zoom|telemost|meet|сбой\s+платформ/i.test(query)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.90 };
  }

  // 11. B2B / Корпоративные ученики (Corporate B2B)
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

  // 15. Обратная связь родителям One Page (Parent Feedback / ID 558, 559)
  if (/one[\s-]page|обратн.*связ.*родител|отчет.*родител/i.test(query)) {
    return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  }

  return { scenario: SCENARIOS.UNKNOWN || 'unknown', facts, confidence: 0.30 };
}

/**
 * Семантический поиск и извлечение контекста из Cloudflare D1
 */
async function retrieveKnowledgeContext(db, query, scenario) {
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
      LIMIT 4
    `;

    const res = await db.prepare(sql).bind(...params).all();
    return res.results || [];
  } catch (err) {
    console.error("D1 search error:", err);
    return [];
  }
}

/**
 * Системный промпт с жесткими регламентами на Сентябрь 2026 года
 */
function buildSystemPrompt(policyDecision, retrievedDocs) {
  let prompt = `Вы — официальный ИИ-ассистент преподавателя онлайн-школы Skyeng и Skysmart.
Текущая временная привязка знаний: Сентябрь 2026 года.

ГЛАВНЫЕ ПРАВИЛА И СТАНДАРТЫ (СЕНТЯБРЬ 2026):
1. Корпоративный мессенджер: действующий стандарт — Mattermost (ММТ). Устаревший Slack исключен.
2. Интерфейс класса: кнопка «Продолжить урок» удалена. Добор непройденного материала выполняется через «Add cards from previous lessons» в редакторе урока. Запуск — кнопкой «Начать урок».
3. Стандарт вводного урока: действует Aloha 3.0. На пакетных курсах-комплектациях («Английский для жизни / +1 уровень», «Level Up») проведение Aloha СТРОГО ЗАПРЕЩЕНО.
4. Отчеты родителям: формат 9 слайдов упразднен. Действует устный регламент «One Page» (5 блоков за 5–10 минут).
5. KPI и рейтинг: оценка проводится каждые 2 недели по понедельникам по 6 метрикам (ID 310). Порог брака по неуспешным урокам — строго до 20,0%. Ежемесячный ОРП упразднен.
6. Перенос учителем менее чем за 24 часа — всегда брак (неуспешный урок), кроме переноса на более ранний час того же дня с фактическим проведением.
7. Неявка ученика: учитель обязан ждать в открытой комнате полные 50 минут для 100% оплаты и выставления статуса «Пропущен учеником».
8. Финансы: плательщик — ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). Самозанятые РФ работают через Банк 131. ИП РФ, резиденты Беларуси и Казахстана — через «Рокет Ворк». Payoneer и Agaton ликвидированы.
9. IT-курсы: Roblox выведен из витрины РФ; базовые среды — «Блоксели», Unity, Python.

ТРЕБОВАНИЯ К СТРУКТУРЕ ОТВЕТА:
- Давайте четкий, структурированный ответ без «воды».
- Указывайте точный статус урока, который нужно выставить в личном кабинете.
- Обязательно формируйте готовое вежливое сообщение для ученика/родителя внутри цитаты:
> «Текст сообщения ученику...»
- Указывайте кликабельные Markdown-ссылки на официальные статьи Help Center в формате: [Название статьи](url).`;

  if (policyDecision) {
    prompt += `\n\nПРЕДПИСАННОЕ СИСТЕМНОЕ РЕШЕНИЕ ДЛЯ ТЕКУЩЕЙ СИТУАЦИИ:\n`;
    prompt += `- Решение: ${policyDecision.decision}\n`;
    prompt += `- Статус урока: ${policyDecision.lessonStatus}\n`;
    prompt += `- Алгоритм действий: ${policyDecision.actionPlan.join(' ')}\n`;
  }

  if (retrievedDocs && retrievedDocs.length > 0) {
    prompt += `\n\nВЫДЕРЖКИ ИЗ ОФИЦИАЛЬНОЙ БАЗЫ ЗНАНИЙ (D1):\n`;
    retrievedDocs.forEach(d => {
      prompt += `--- Статья: [${d.title}](${d.url}) ---\n${d.chunk_content}\n\n`;
    });
  }

  return prompt;
}

/**
 * Главный обработчик API чата (/api/assistant)
 * Возвращает SSE-поток (Server-Sent Events)
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
    const decisionObj = policy ? policy.evaluate(classification.facts) : null;

    const retrievedDocs = await retrieveKnowledgeContext(env.ARTICLES_DB, contextualQuery, classification.scenario);
    const systemPrompt = buildSystemPrompt(decisionObj, retrievedDocs);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6)
    ];

    // Приоритет 1: OpenRouter API (если задан ключ)
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
          temperature: 0.2
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

    // Приоритет 2: Cloudflare Workers AI Binding
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
