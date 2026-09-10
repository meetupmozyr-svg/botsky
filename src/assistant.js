// src/assistant.js
import { SCENARIOS, HARD_POLICIES } from './rules.js';
import { synthesizeContextualQuery } from './classifier.js';

// Стоп-слова для очистки запроса
const STOP_WORDS = new Set([
  'как', 'что', 'делать', 'если', 'урок', 'урока', 'уроке', 'уроку', 'уроком', 'уроки',
  'мне', 'меня', 'мой', 'моя', 'мое', 'мои', 'ученик', 'ученика', 'ученику', 'учеником',
  'это', 'при', 'для', 'или', 'под', 'над', 'все', 'уже', 'был', 'была', 'были', 'есть',
  'можно', 'нужно', 'надо', 'подскажите', 'пожалуйста', 'скажите', 'почему', 'где', 'куда'
]);

/**
 * Смысловое обогащение поискового запроса по сценарию
 */
function enrichQueryWithScenario(query, scenario, actor) {
  const q = query.toLowerCase();
  
  if (scenario === SCENARIOS.TEACHER_EMERGENCY || scenario === SCENARIOS.TEACHER_CANCEL) {
    return `${q} перенос отмена преподавателем условия переноса teachers care`;
  }
  if (scenario === SCENARIOS.BREAK_TEACHER) {
    return `${q} перерыв преподавателя отпуск регламент 14 дней`;
  }
  if (scenario === SCENARIOS.STUDENT_ABSENCE || scenario === SCENARIOS.STUDENT_LATE) {
    return `${q} не вышел на урок 50 минут статус`;
  }
  if (scenario === SCENARIOS.ZERO_BALANCE) {
    return `${q} 0 на балансе нулевой баланс`;
  }
  if (scenario === SCENARIOS.STUDENT_CHURN) {
    return `${q} отказ от ученика критерии доступности 310`;
  }
  if (scenario === SCENARIOS.PARENT_FEEDBACK) {
    return `${q} one page обратная связь родителю`;
  }
  if (scenario === SCENARIOS.FIRST_LESSON_ALOHA) {
    return `${q} aloha 3.0 первый урок стандарт`;
  }

  return q;
}

/**
 * Извлечение значимых ключевых слов для поиска по D1
 */
function extractSearchKeywords(query) {
  const words = query
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return query
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s-]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 4);
  }

  return Array.from(new Set(words)).slice(0, 5);
}

/**
 * Классификатор сценариев (Сентябрь 2026)
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

  // 1. Универсальные ветвления
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

  // 2. Отток и сменяемость
  if (/смен.*преподават|ученик.*хочет.*сменить|ушл[ио].*ученик|отказ.*ученик/i.test(query)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.94 };
  }

  // 3. Отпуск и перерывы
  if (/отпуск|перерыв|хочу\s+уйти\s+в\s+отпуск|оформить\s+перерыв/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  // 4. Форс-мажор и экстренные ситуации учителя
  if (/пожар|эвакуац|нет\s+свет|отключил|заболел|больнич|срочн|чп|форс-мажор|авария|госпитал/i.test(query)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.96 };
  }

  // 5. Опоздания и неявки ученика
  if (/ученик.*(опазд|задержив|не\s+пришел|не\s+подключ|нет\s+на\s+урок|пропустил|пропуск)|прошло.*минут.*ученик|пропустил.*урок/i.test(query)) {
    facts.actor = 'student';
    if (/ровно\s+50\s+минут|50\s+минут.*не\s+пришел|так\s+и\s+не\s+пришел|3\s+урок.*подряд|2\s+урок.*подряд|пропустил.*3\s+урок/i.test(query)) {
      return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.96 };
    }
    return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.93 };
  }

  // 6. Отмена учителем
  if (/я\s+отменяю|отменяю\s+урок|не\s+могу\s+провести\s+урок|отмена\s+преподавател/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.92 };
  }

  // 7. Отмена учеником
  if (/ученик\s+отменил|студент\s+отменил|отмена\s+ученик/i.test(query)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.92 };
  }

  // 8. Опоздание учителя
  if (/я\s+опоздал|опоздал\s+на|звонил\s+робот|робот.*звон/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.91 };
  }

  // 9. Нулевой баланс
  if (/0\s+на\s+балансе|нулев.*баланс|баланс\s+0/i.test(query)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.95 };
  }

  // 10. Технические сбои
  if (/платформ.*завис|не\s+работает\s+видео|спасаю\s+урок|zoom|telemost|meet|сбой\s+платформ/i.test(query)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.90 };
  }

  // 11. B2B
  if (/корпорат|b2b|bayer|байер|x5|playrix|helix|геликс|metro|1с|progress\s+test/i.test(query)) {
    return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.93 };
  }

  // 12. Групповые уроки
  if (/групп.*урок|в\s+группу\s+пришел|групп.*1\s+человек/i.test(query)) {
    return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.92 };
  }

  // 13. Параллельные уроки
  if (/параллельн.*урок/i.test(query)) {
    return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.95 };
  }

  // 14. Первый урок Aloha 3.0
  if (/aloha|алоха|первый\s+урок|вводный\s+урок/i.test(query)) {
    return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.94 };
  }

  // 15. One Page родителям
  if (/one[\s-]page|обратн.*связ.*родител|отчет.*родител/i.test(query)) {
    return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  }

  return { scenario: SCENARIOS.UNKNOWN || 'unknown', facts, confidence: 0.30 };
}

/**
 * Фактологический поиск в Cloudflare D1 с фильтрацией по субъекту
 */
async function retrieveKnowledgeContext(db, query, scenario, actor) {
  if (!db) return [];

  const enrichedQuery = enrichQueryWithScenario(query, scenario, actor);
  const keywords = extractSearchKeywords(enrichedQuery);
  if (keywords.length === 0) return [];

  try {
    const titleClauses = keywords.map(() => `title LIKE ?`).join(' OR ');
    const titleParams = keywords.map(k => `%${k}%`);

    const titleSql = `
      SELECT id AS article_id, title, category, url, content AS chunk_content
      FROM articles
      WHERE (${titleClauses})
      LIMIT 4
    `;

    const chunkClauses = keywords.map(() => `(title LIKE ? OR chunk_content LIKE ?)`).join(' OR ');
    const chunkParams = [];
    keywords.forEach(k => chunkParams.push(`%${k}%`, `%${k}%`));

    const chunkSql = `
      SELECT article_id, title, category, url, chunk_content
      FROM article_chunks
      WHERE (${chunkClauses})
      LIMIT 6
    `;

    const [titleRes, chunkRes] = await Promise.all([
      db.prepare(titleSql).bind(...titleParams).all().catch(() => ({ results: [] })),
      db.prepare(chunkSql).bind(...chunkParams).all().catch(() => ({ results: [] }))
    ]);

    let combined = [...(titleRes.results || []), ...(chunkRes.results || [])];
    if (combined.length === 0) return [];

    // Фильтрация: если проблема у преподавателя — исключаем статьи про неявку ученика
    if (actor === 'teacher' || scenario === SCENARIOS.TEACHER_EMERGENCY || scenario === SCENARIOS.TEACHER_CANCEL) {
      combined = combined.filter(row => !row.title.toLowerCase().includes('ученик без предупреждения') && !row.title.toLowerCase().includes('ученик не вышел'));
    }

    const uniqueMap = new Map();
    for (const row of combined) {
      if (!uniqueMap.has(row.article_id)) {
        uniqueMap.set(row.article_id, row);
      }
    }

    return Array.from(uniqueMap.values()).slice(0, 3);
  } catch (err) {
    console.error("D1 search error:", err);
    return [];
  }
}

/**
 * Системный промпт со строгим словарем и защитой от технических утечек
 */
function buildSystemPrompt(policyDecision, retrievedDocs) {
  let prompt = `Вы — профессиональный ИИ-ассистент преподавателя школы Skyeng и Skysmart.
Временная привязка знаний: Сентябрь 2026 года.

ПРАВИЛА И СТАНДАРТЫ ШКОЛЫ (СЕНТЯБРЬ 2026):
1. Корпоративный мессенджер: действующий стандарт — Mattermost (ММТ). Устаревший Slack исключен.
2. Форс-мажор преподавателя за < 24 часов: преподаватель НЕ отменяет урок самостоятельно в кабинете. Необходимо немедленно написать в чат поддержки Teachers Care / Mattermost, чтобы операторы сняли расписание по уважительной причине без влияния на двухнедельный KPI (ID 310).
3. Интерфейс: кнопка «Продолжить урок» удалена. Добор карточек — через «Add cards from previous lessons».
4. Вводный урок: стандарт Aloha 3.0. На пакетных курсах-комплектациях («Английский для жизни / +1 уровень») проведение Aloha СТРОГО ЗАПРЕЩЕНО.
5. Отчет родителям: формат 9 слайдов упразднен. Действует устный регламент «One Page» (5 блоков за 5–10 минут).
6. Неявка ученика: учитель обязан находиться в комнате полные 50 минут для 100% оплаты и выставления «Пропущен учеником».
7. Финансы: плательщик — ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). СМЗ РФ — Банк 131; ИП РФ, РБ и РК — «Рокет Ворк».

ПРАВИЛА ТОНАЛЬНОСТИ И СЛОВАРНЫЙ ФИЛЬТР (СТРОГО):
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать внутренние технические термины: «брак», «штрафы», «срыв урока», «списан в брак». Заменяйте их на: «влияние на показатели KPI», «неуспешный урок», «снятие без нарушений».
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить в текст технические названия констант (REPORT_TO_..., SHOW_..., WARN_...).
- Сообщение ученику пишите доброжелательно, вежливо и мягко. В сообщении ученику ЗАПРЕЩЕНО писать сухие слова «форс-мажор», «брак», «техпроблема». Пишите по-человечески: «по непредвиденным личным обстоятельствам».
- Текст сообщения оформляйте строго внутри цитаты:
> «Здравствуйте! К сожалению, по непредвиденным обстоятельствам я не смогу провести наш сегодняшний урок...»

СТРОГИЕ ПРАВИЛА ПО ССЫЛКАМ:
- Запрещено придумывать несуществующие ссылки.
- Используйте ТОЛЬКО реальные статьи из блока контекста D1 ниже.
- В конце ответа выводите блок:
**Полезные статьи Help Center:**
- [Точное название статьи из контекста](URL_из_контекста)`;

  if (policyDecision) {
    prompt += `\n\nРЕГЛАМЕНТНОЕ РЕШЕНИЕ:\n`;
    prompt += `- Статус в расписании: ${policyDecision.lessonStatus}\n`;
    prompt += `- Алгоритм действий: ${policyDecision.actionPlan.join(' ')}\n`;
  }

  if (retrievedDocs && retrievedDocs.length > 0) {
    prompt += `\n\nМАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ (D1):\n`;
    retrievedDocs.forEach(d => {
      prompt += `### [${d.title}](${d.url})\nКатегория: ${d.category}\n${d.chunk_content}\n\n`;
    });
  } else {
    prompt += `\n\nМАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ (D1):\n`;
    prompt += `- [Условия переноса и отмены урока](https://helpcenter.skyeng.ru/article/690)\n`;
    prompt += `- [Критерии доступности набора учеников и KPI](https://helpcenter.skyeng.ru/article/2118)\n`;
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

    // Извлечение контекста с фильтрацией по субъекту
    const retrievedDocs = await retrieveKnowledgeContext(
      env.ARTICLES_DB, 
      contextualQuery, 
      classification.scenario, 
      classification.facts?.actor
    );
    
    const systemPrompt = buildSystemPrompt(decisionObj, retrievedDocs);

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
      error: "Не настроен LLM-провайдер: укажите OPENROUTER_API_KEY или env.AI" 
    }), { status: 500 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
