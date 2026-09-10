import { 
  BLACKLISTED_ARTICLE_IDS, 
  PLATFORM_GOLD_STANDARD, 
  SCENARIOS, 
  HARD_POLICIES 
} from './rules.js';

// ============================================================================
// 1. RUSSIAN STOP-WORDS
// ============================================================================
const STOP_WORDS = new Set([
  'в', 'на', 'и', 'с', 'по', 'к', 'у', 'о', 'об', 'из', 'за', 'от', 'до', 'для',
  'как', 'что', 'мне', 'если', 'бы', 'ли', 'же', 'то', 'это', 'все', 'так', 'или',
  'не', 'нет', 'да', 'но', 'а', 'он', 'она', 'они', 'мы', 'вы', 'я', 'его', 'ее',
  'их', 'мой', 'твой', 'свой', 'какой', 'какая', 'какие', 'какого', 'когда', 'где',
  'куда', 'почему', 'зачем', 'сколько', 'можно', 'нужно', 'надо', 'скажи', 'подскажи',
  'пожалуйста', 'здравствуйте', 'привет', 'добрый', 'день', 'вечер', 'утро'
]);

// ============================================================================
// 2. MULTI-TURN CASE-STATE ACCUMULATOR
// ============================================================================
export function accumulateCaseState(messages) {
  const state = {
    scenario: null,
    facts: {
      minutes: null,
      hoursBeforeLesson: null,
      breakDays: null,
      consecutiveAbsences: null,
      isPremium: false,
      actor: null,
      isEmergency: false
    },
    rawHistoryText: ''
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return state;
  }

  const userTexts = messages
    .filter(m => m.role === 'user')
    .map(m => String(m.content || '').trim())
    .filter(Boolean);

  state.rawHistoryText = userTexts.join(' -> ');

  for (const text of userTexts) {
    const lower = text.toLowerCase();

    const minMatch = lower.match(/(?:прошло|уже|на|через|за)?\s*(\d+)\s*(?:мин|минут|минуты)/i) || lower.match(/(\d+)\s*(?:мин|минут|минуты)/i);
    if (minMatch) {
      state.facts.minutes = parseInt(minMatch[1], 10);
    }

    const hourMatch = lower.match(/(?:за|через)?\s*(\d+)\s*(?:час|часа|часов)/i) || lower.match(/(\d+)\s*(?:час|часа|часов)/i);
    if (hourMatch) {
      state.facts.hoursBeforeLesson = parseInt(hourMatch[1], 10);
    }

    const daysMatch = lower.match(/(\d+)\s*(?:дней|дня|день|календарных)/i);
    if (daysMatch) {
      state.facts.breakDays = parseInt(daysMatch[1], 10);
    }

    const consecMatch = lower.match(/(\d+)\s*(?:урок.*подряд|пропуск.*подряд|раза подряд)/i);
    if (consecMatch) {
      state.facts.consecutiveAbsences = parseInt(consecMatch[1], 10);
    }

    if (/premium|премиум/i.test(lower)) {
      state.facts.isPremium = true;
    }

    if (/я опоздал|я задержива|моё опоздание|у меня|со стороны преподавател|хочу отменить|я отменяю/i.test(lower)) {
      state.facts.actor = 'teacher';
    } else if (/ученик|ребенок|родител|клиент/i.test(lower)) {
      state.facts.actor = 'student';
    }

    if (/пожар|эвакуац|нет свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал/i.test(lower)) {
      state.facts.isEmergency = true;
      state.facts.actor = 'teacher';
    }
  }

  return state;
}

// ============================================================================
// 3. DETERMINISTIC SCENARIO & CONFIDENCE CLASSIFIER
// ============================================================================
export function classifyScenarioWithConfidence(caseState, latestQuery) {
  const text = ((caseState?.rawHistoryText || '') + ' ' + (latestQuery || '')).toLowerCase();
  const facts = { ...(caseState?.facts || {}) };

  if (facts.minutes == null) {
    const minMatch = text.match(/(?:прошло|уже|на|через|за)?\s*(\d+)\s*(?:мин|минут|минуты)/i) || text.match(/(\d+)\s*(?:мин|минут|минуты)/i);
    if (minMatch) facts.minutes = parseInt(minMatch[1], 10);
  }

  if (facts.hoursBeforeLesson == null) {
    const hourMatch = text.match(/(?:за|через)?\s*(\d+)\s*(?:час|часа|часов)/i) || text.match(/(\d+)\s*(?:час|часа|часов)/i);
    if (hourMatch) facts.hoursBeforeLesson = parseInt(hourMatch[1], 10);
  }

  if (facts.hoursBeforeLesson == null) {
    const minBeforeMatch = text.match(/за\s*(\d+)\s*(?:мин|минут|минуты)/i);
    if (minBeforeMatch) facts.hoursBeforeLesson = parseInt(minBeforeMatch[1], 10) / 60;
  }

  if (facts.breakDays == null) {
    const daysMatch = text.match(/(\d+)\s*(?:дней|дня|день|календарных)/i);
    if (daysMatch) facts.breakDays = parseInt(daysMatch[1], 10);
  }

  if (facts.consecutiveAbsences == null) {
    const consecMatch = text.match(/(\d+)\s*(?:урок.*подряд|пропуск.*подряд|раза подряд)/i);
    if (consecMatch) facts.consecutiveAbsences = parseInt(consecMatch[1], 10);
  }

  if (!facts.isPremium && /premium|премиум/i.test(text)) {
    facts.isPremium = true;
  }

  if (facts.isEmergency || /пожар|эвакуац|нет свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал/i.test(text)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.98 };
  }

  if (/нулев.*баланс|0 на балансе|нет оплат|закончились уроки|проводить ли при нуле|в долг/i.test(text)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.96 };
  }

  if (/первый урок|aloha|алоха|знакомств.*с нов.*ученик|новый ученик/i.test(text)) {
    return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.95 };
  }

  if (/обратн.*связ.*родител|one-page|отчет родител|обратная связь каждые 20 дней/i.test(text)) {
    return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  }

  if (/пробник|егэ|огэ|проверк.*пробник|96 часов|300 руб/i.test(text)) {
    return { scenario: SCENARIOS.EXAM_MOCK, facts, confidence: 0.95 };
  }

  if (/корпоративн|b2b|компани.*оплачивает|прогресс тест.*b2b|чужой человек на уроке/i.test(text)) {
    return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.94 };
  }

  if (/группов|skysmart класс|домашний лицей|f2g|групп/i.test(text)) {
    return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.94 };
  }

  if (/параллельн.*урок|поток|5-6 учеников|тет-а-тет|поднятая рука/i.test(text)) {
    return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.94 };
  }

  if ((facts.actor === 'teacher' || /я хочу отменить|преподаватель отменяет|не могу провести|перенос преподавател/i.test(text)) && /отмен|перенес/i.test(text)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.94 };
  }

  if ((facts.actor === 'teacher' || /я опоздал|я задержива|моё опоздание/i.test(text)) && /опозда|опазд|задержива|не успеваю/i.test(text)) {
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.95 };
  }

  if (/опозд|опазд|задержив|не пришел|не подключ|нет на урок|жду ученик|не явился|пропуск|прождал|только подключ|истекли|прошло.*минут/i.test(text)) {
    facts.actor = 'student';

    if ((facts.minutes != null && facts.minutes >= 50) || /не пришел|не явился|пропустил урок|прождал.*конца|50 минут истекли/i.test(text)) {
      if (facts.minutes == null) facts.minutes = 50;
      return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.95 };
    }

    return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.94 };
  }

  if (/ученик отмен|отмена ученик|перенос.*ученик|отменил урок|родитель предупредил|отменил занятие/i.test(text)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.94 };
  }

  if (/перерыв преподавател|отпуск|14 дней|336 часов|40 дней|отпуск преподавател|уйти в отпуск/i.test(text)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.93 };
  }

  if (/перерыв ученик|ученик уходит в отпуск|заморозка ученик|21 день/i.test(text)) {
    return { scenario: SCENARIOS.BREAK_STUDENT, facts, confidence: 0.93 };
  }

  if (/ученик хочет сменить|смена преподавателя учеником|ученик уходит к другому/i.test(text)) {
    return { scenario: SCENARIOS.CHANGE_TEACHER, facts, confidence: 0.92 };
  }

  if (/отказ.*от ученик|отказаться от студент|не хочу вести ученик/i.test(text)) {
    return { scenario: SCENARIOS.REFUSE_STUDENT, facts, confidence: 0.92 };
  }

  if (/не работает платформ|сбой|микрофон|камер|завис|ошибк.*вход|техническ|спасти урок|zoom|telemost/i.test(text)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.92 };
  }

  if (/оплат|вознагражд|выплат|ставк|расчет|деньг|акт|самозанят|банк 131|рокет ворк|налог|нерезидент/i.test(text)) {
    return { scenario: SCENARIOS.PAYMENT_DISPUTE, facts, confidence: 0.90 };
  }

  if (/урок не состоялся|отмена|сорвался урок|что делать с уроком|проблема с уроком|как отменить/i.test(text)) {
    return { scenario: SCENARIOS.NEED_CLARIFICATION, facts, confidence: 0.50 };
  }

  return { scenario: SCENARIOS.UNKNOWN, facts, confidence: 0.30 };
}

// ============================================================================
// 4. TARGETED SCENARIO-SCOPED RETRIEVAL (FIXED DB SEARCH LOGIC)
// ============================================================================
async function retrieveScopedArticles(db, scenario) {
  if (!db || !scenario || scenario === SCENARIOS.UNKNOWN || scenario === SCENARIOS.NEED_CLARIFICATION) {
    return { primary: null, supporting: null };
  }

  const SCENARIO_KEYWORD_FILTERS = {
    [SCENARIOS.STUDENT_LATE]: ['опоздал', 'не пришел', '50 минут', 'короткие уроки'],
    [SCENARIOS.STUDENT_ABSENCE]: ['не пришел', 'статус', 'пропуск', '2 урока подряд'],
    [SCENARIOS.STUDENT_CANCEL]: ['отмена урока', 'перенос', '8 часов', 'premium', 'списание'],
    [SCENARIOS.TEACHER_CANCEL]: ['перенос преподавателем', '24 часа', 'неуспешные уроки'],
    [SCENARIOS.TEACHER_LATE]: ['робот-помощник', 'опоздание преподавателя', 'звонок'],
    [SCENARIOS.TEACHER_EMERGENCY]: ['форс-мажор', 'teachers care', 'болезнь', 'справка'],
    [SCENARIOS.BREAK_TEACHER]: ['перерыв преподавателя', '14 дней', '40 дней', 'отпуск'],
    [SCENARIOS.BREAK_STUDENT]: ['перерыв ученика', '21 день', 'сохранение графика'],
    [SCENARIOS.CHANGE_TEACHER]: ['смена преподавателя', 'перевод ученика'],
    [SCENARIOS.REFUSE_STUDENT]: ['отказ от ученика', 'карточка ученика', '72 часа'],
    [SCENARIOS.ZERO_BALANCE]: ['нулевой баланс', '0 на балансе', 'удаление графика'],
    [SCENARIOS.TECHNICAL_ISSUE]: ['спасти урок', 'технические неполадки', 'zoom', '508'],
    [SCENARIOS.CORPORATE_B2B]: ['корпоративным', 'b2b', 'progress test', 'сертификат'],
    [SCENARIOS.GROUP_LESSON]: ['групповые', 'f2g', 'домашний лицей'],
    [SCENARIOS.PARALLEL_LESSON]: ['параллельные', 'компьютерные курсы', 'тет-а-тет'],
    [SCENARIOS.FIRST_LESSON_ALOHA]: ['первый урок', 'aloha', 'знакомство'],
    [SCENARIOS.PARENT_FEEDBACK]: ['обратная связь родителям', 'one-page', '20 дней'],
    [SCENARIOS.EXAM_MOCK]: ['пробники', 'егэ', 'огэ', '96 часов'],
    [SCENARIOS.PAYMENT_DISPUTE]: ['вознаграждение', 'выплаты', 'банк 131', 'рокет ворк']
  };

  const keywords = SCENARIO_KEYWORD_FILTERS[scenario] || [];
  if (keywords.length === 0) return { primary: null, supporting: null };

  // FIX: Search in BOTH title and content to actually find the articles!
  const chunkClauses = keywords.map(() => `title LIKE ? OR chunk_content LIKE ?`).join(' OR ');
  const artClauses = keywords.map(() => `title LIKE ? OR content LIKE ?`).join(' OR ');
  
  // Two placeholders per keyword
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  let rows = [];

  try {
    const chunkSql = `
      SELECT id, article_id, title, category, url, chunk_content as content
      FROM article_chunks
      WHERE (${chunkClauses})
      LIMIT 8
    `;
    const res = await db.prepare(chunkSql).bind(...params).all();
    rows = res.results || [];
  } catch {
    try {
      const sql = `
        SELECT id, title, category, url, content
        FROM articles
        WHERE (${artClauses})
        LIMIT 8
      `;
      const res = await db.prepare(sql).bind(...params).all();
      rows = res.results || [];
    } catch (err2) {
      console.error('D1 retrieval error:', err2);
      return { primary: null, supporting: null };
    }
  }

  const validRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.article_id || art.id)));
  if (validRows.length === 0) return { primary: null, supporting: null };

  const formatArticle = (art) => ({
    id: art.article_id || art.id,
    title: art.title || 'Статья регламента Help Center',
    url: art.url || '',
    content: (art.content || '').slice(0, 1500)
  });

  return {
    primary: formatArticle(validRows[0]),
    supporting: validRows[1] ? formatArticle(validRows[1]) : null
  };
}

// ============================================================================
// 5. STAGED SYSTEM PROMPT BUILDER (FIXED INSTRUCTIONS)
// ============================================================================
function buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle, supportingArticle }) {
  const policy = HARD_POLICIES[scenario];

  if (scenario === SCENARIOS.NEED_CLARIFICATION) {
    return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Запрос преподавателя содержит недостаточно данных для однозначного применения регламента.

ТВОЯ ЗАДАЧА:
Не придумывай правила наугад. Вежливо и коротко задай уточняющие вопросы преподавателю:
1. Кто является инициатором отмены/опоздания (ученик или преподаватель)?
2. Какой тариф у ученика (Standard или Premium) и за сколько часов/минут поступила отмена?
3. В чем конкретная причина (технический сбой, болезнь, неявка, нулевой баланс)?

Оформи ответ доброжелательно, по пунктам.`;
  }

  if (scenario === SCENARIOS.UNKNOWN) {
    return `Ты — персональный наставник преподавателя онлайн-школы.
Ситуация не описана в стандартных правилах либо вопрос не относится к регламентам.

ТВОЯ ЗАДАЧА:
Кратко объясни, что по данной нестандартной ситуации нет автоматического регламента, и порекомендуй обратиться в **Teachers Care** (ежедневно 09:00–22:00 МСК в чате ЛК) или в **Support** при технических сбоях (круглосуточно).`;
  }

  let decisionBlock = '';
  if (decisionObj) {
    decisionBlock = `
==================================================
ПРЕДПИСАННОЕ РЕШЕНИЕ ПО РЕГЛАМЕНТУ ШКОЛЫ (ОБЯЗАТЕЛЬНО К ИСПОЛНЕНИЮ):
- Сценарий: ${policy?.name || scenario}
- Официальный статус урока: ${decisionObj.lessonStatus}
- Финансовый итог: ${decisionObj.financialOutcome}
- Обязательные действия преподавателя:
${decisionObj.mustDo.map(d => `  * ${d}`).join('\n')}
- Категорически запрещено:
${decisionObj.forbiddenActions.map(f => `  * ${f}`).join('\n')}
==================================================`;
  }

  let articlesBlock = '';
  if (primaryArticle) {
    articlesBlock += `### Основная статья: ${primaryArticle.title}\nСсылка: ${primaryArticle.url}\nТекст: ${primaryArticle.content}\n`;
  }
  if (supportingArticle) {
    articlesBlock += `\n---\n### Дополнительная статья: ${supportingArticle.title}\nСсылка: ${supportingArticle.url}\nТекст: ${supportingArticle.content}\n`;
  }

  return `Ты — персональный, отзывчивый и умный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя миссия — давать подробные, эмпатичные и ЖИВЫЕ инструкции на профессиональном языке школы, подробно разъясняя предписанный регламент.

${PLATFORM_GOLD_STANDARD}

${decisionBlock}

ПОДТВЕРЖДАЮЩИЕ МАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ HELP CENTER:
==================================================
${articlesBlock || 'Опирайся на жесткие правила из блока выше.'}
==================================================

СТРОГИЕ ПРАВИЛА ГЕНЕРАЦИИ (ОБЯЗАТЕЛЬНО):
1. Отвечай подробно и развернуто, не будь слишком кратким. Объясни преподавателю, почему нужно сделать именно так.
2. Не выдумывай несуществующие кнопки и статусы (используй только 5 официальных статусов уроков).
3. Используй термины: «личный кабинет», «неуспешные уроки», «Teachers Care», «Support».

СТРУКТУРА ОТВЕТА:
- 🎯 **Решение**: Развернутый, эмпатичный и понятный пошаговый алгоритм действий на основе предписанного решения.
- 🛡️ **Финансы и статус**: Укажи официальный статус урока и что будет с оплатой.
- ${decisionObj?.studentMessageRequired 
    ? '💬 **Сообщение ученику**: ОБЯЗАТЕЛЬНО сгенерируй готовый вежливый текст для отправки ученику в чат. Оформи его СТРОГО как цитату Markdown (начни строку со знака `> `).' 
    : '💬 **Сообщение ученику**: В данной ситуации писать ученику не требуется (пропусти этот блок).'}
- 📚 **Ссылки на регламент**: ${primaryArticle?.url ? `ОБЯЗАТЕЛЬНО добавь кликабельную ссылку на базу знаний: [${primaryArticle.title}](${primaryArticle.url})` : 'Пропусти этот блок, так как прямой ссылки в базе нет.'}`;
}

// ============================================================================
// 6. OUTPUT POLICY & GUARDRAIL VALIDATOR
// ============================================================================
export function sanitizeAndValidateResponse(rawText) {
  let text = String(rawText || '');
  text = text.replace(/\bCRM\b/gi, 'личном кабинете');
  text = text.replace(/\bбрак\b/gi, 'неуспешный урок');
  text = text.replace(/\bбуфер\b/gi, 'допустимый лимит');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  return text.trim();
}

// ============================================================================
// 7. PROVIDER STREAM DISPATCHER
// ============================================================================
async function callProviderStream(url, apiKey, payload) {
  return await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://skyeng.ru',
      'X-Title': 'Skyeng Teacher Assistant'
    },
    body: JSON.stringify(payload)
  });
}

// ============================================================================
// 8. MAIN CONTROLLER & MULTI-PROVIDER CASCADE
// ============================================================================
export async function handleAssistantChat(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const openRouterKey = env.OPENROUTER_API_KEY;
  const groqKey = env.GROQ_API_KEY;
  const cfAi = env.AI;

  if (!openRouterKey && !groqKey && !cfAi) {
    return new Response(
      JSON.stringify({ error: 'Не настроен ни один провайдер нейросети (OpenRouter, Groq или Cloudflare AI).' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Неверный JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUserMsg = [...incomingMessages].reverse().find(m => m.role === 'user')?.content || '';

  const caseState = accumulateCaseState(incomingMessages);
  const { scenario, facts, confidence } = classifyScenarioWithConfidence(caseState, lastUserMsg);

  const policyHandler = HARD_POLICIES[scenario];
  const decisionObj = policyHandler ? policyHandler.evaluate(facts) : null;

  const { primary, supporting } = await retrieveScopedArticles(env.ARTICLES_DB, scenario);

  const systemPrompt = buildStagedSystemPrompt({
    scenario,
    facts,
    decisionObj,
    primaryArticle: primary,
    supportingArticle: supporting,
    confidence
  });

  const cleanHistory = incomingMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || '') }))
    .slice(-4);

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...cleanHistory
  ];

  let errors = [];

  // Provider cascade logic (OpenRouter -> Groq -> CF AI)
  if (openRouterKey) {
    const payload = {
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      messages: messagesPayload,
      stream: true,
      temperature: 0.25 // Slightly raised to encourage verbosity and template generation
    };

    try {
      const res = await callProviderStream('https://openrouter.ai/api/v1/chat/completions', openRouterKey, payload);
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
        });
      } else {
        errors.push(`OpenRouter: ${await res.text()}`);
      }
    } catch (e) {
      errors.push(`OpenRouter Network: ${e.message}`);
    }
  }

  if (groqKey) {
    const payload = {
      model: env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: messagesPayload,
      stream: true,
      temperature: 0.25
    };

    try {
      const res = await callProviderStream('https://api.groq.com/openai/v1/chat/completions', groqKey, payload);
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
        });
      } else {
        errors.push(`Groq: ${await res.text()}`);
      }
    } catch (e) {
      errors.push(`Groq Network: ${e.message}`);
    }
  }

  if (cfAi) {
    try {
      const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: messagesPayload,
        stream: true,
        temperature: 0.25,
        max_tokens: 800
      });
      
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }
      });
    } catch (e) {
      errors.push(`CF AI: ${e.message}`);
    }
  }

  return new Response(
    JSON.stringify({ error: `Все нейросети временно недоступны. Ошибки: ${errors.join(' | ')}` }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
