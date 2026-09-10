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
    if (minMatch) state.facts.minutes = parseInt(minMatch[1], 10);

    const hourMatch = lower.match(/(?:за|через)?\s*(\d+)\s*(?:час|часа|часов)/i) || lower.match(/(\d+)\s*(?:час|часа|часов)/i);
    if (hourMatch) state.facts.hoursBeforeLesson = parseInt(hourMatch[1], 10);

    const daysMatch = lower.match(/(\d+)\s*(?:дней|дня|день|календарных)/i);
    if (daysMatch) state.facts.breakDays = parseInt(daysMatch[1], 10);

    const consecMatch = lower.match(/(\d+)\s*(?:урок.*подряд|пропуск.*подряд|раза подряд)/i);
    if (consecMatch) state.facts.consecutiveAbsences = parseInt(consecMatch[1], 10);

    if (/premium|премиум/i.test(lower)) state.facts.isPremium = true;

    if (/я опоздал|я задержива|моё опоздание|у меня|со стороны преподавател|хочу отменить|я отменя|отменяю я/i.test(lower)) {
      state.facts.actor = 'teacher';
    } else if (/ученик|ребенок|родител|клиент/i.test(lower)) {
      state.facts.actor = 'student';
    }

    if (/пожар|эвакуац|свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал|аварийно/i.test(lower)) {
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

  // 1. EXTRACT MISSING FACTS (CRITICAL FOR SINGLE-TURN EVALUATION)
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

  if (!facts.isPremium && /premium|премиум/i.test(text)) facts.isPremium = true;

  if (!facts.actor) {
    if (/я опоздал|я задержива|моё опоздание|у меня|со стороны преподавател|я отменя|отменяю я/i.test(text)) {
      facts.actor = 'teacher';
    } else if (/ученик|ребенок|родител|клиент/i.test(text)) {
      facts.actor = 'student';
    }
  }

  if (!facts.isEmergency) {
    if (/пожар|эвакуац|свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал|аварийно/i.test(text)) {
      facts.isEmergency = true;
      facts.actor = 'teacher';
    }
  }

  // 2. SCENARIO ROUTING BY PRIORITY

  // Emergency
  if (facts.isEmergency) {
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.98 };
  }

  // Churn & Refusals (Уход учеников)
  if (/смен.*преподават|уш(ел|ли).*ученик|отказ.*ученик|лимит.*ученик|отказаться от студент/i.test(text)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.95 };
  }

  // Break / Vacation
  if (/отпуск|перерыв/i.test(text)) {
    if (facts.actor === 'student') return { scenario: SCENARIOS.BREAK_STUDENT, facts, confidence: 0.93 };
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  // Zero Balance
  if (/нулев.*баланс|0 на балансе|нет оплат|закончились уроки|проводить ли при нуле|в долг/i.test(text)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.96 };
  }

  // Cancellations & Reschedules
  if (/отмен|перенес/i.test(text)) {
    if (facts.actor === 'teacher') return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.94 };
    if (facts.actor === 'student') return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.94 };
    return { scenario: SCENARIOS.UNIVERSAL_CANCEL, facts, confidence: 0.90 };
  }

  // Lateness & Absences
  if (/опозд|опазд|задержив|не пришел|не подключ|нет на урок|жду ученик|не явился|пропуск|пропустил|прождал|только подключ|истекли|прошло.*минут/i.test(text)) {
    if (facts.actor === 'teacher' || /звонил робот/i.test(text)) {
      return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.95 };
    }
    
    if (facts.actor === 'student' || facts.minutes != null || /не пришел|пропустил/i.test(text)) {
      if ((facts.minutes != null && facts.minutes >= 50) || /не пришел|не явился|пропустил.*подряд|прождал.*конца|50 минут истекли/i.test(text)) {
        if (facts.minutes == null) facts.minutes = 50;
        return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.95 };
      }
      return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.94 };
    }
    
    return { scenario: SCENARIOS.UNIVERSAL_LATE, facts, confidence: 0.90 };
  }

  // Ambiguous Lesson Issue (Урок сорвался)
  if (/урок не состоялся|сорвался|что делать с уроком|проблема с уроком/i.test(text)) {
    return { scenario: SCENARIOS.AMBIGUOUS_LESSON_ISSUE, facts, confidence: 0.90 };
  }

  // Specific Formats
  if (/первый урок|aloha|алоха/i.test(text)) return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.95 };
  if (/обратн.*связ.*родител|one-page/i.test(text)) return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  if (/пробник|егэ|огэ/i.test(text)) return { scenario: SCENARIOS.EXAM_MOCK, facts, confidence: 0.95 };
  if (/корпоративн|b2b/i.test(text)) return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.94 };
  if (/групп|skysmart класс|домашний лицей|f2g/i.test(text)) return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.94 };
  if (/параллельн.*урок|поток|тет-а-тет/i.test(text)) return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.94 };
  if (/не работает платформ|сбой|микрофон|камер|завис|ошибк.*вход|техническ|спасти урок|zoom/i.test(text)) return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.92 };
  if (/оплат|вознагражд|выплат|ставк|расчет|деньг|акт|самозанят|банк 131/i.test(text)) return { scenario: SCENARIOS.PAYMENT_DISPUTE, facts, confidence: 0.90 };

  return { scenario: SCENARIOS.UNKNOWN, facts, confidence: 0.30 };
}

// ============================================================================
// 4. TARGETED SCENARIO-SCOPED RETRIEVAL
// ============================================================================
async function retrieveScopedArticles(db, scenario) {
  if (!db || !scenario || scenario === SCENARIOS.UNKNOWN) {
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
    [SCENARIOS.STUDENT_CHURN]: ['отказ от ученика', 'карточка ученика', 'доступность набора', 'лимит'],
    [SCENARIOS.ZERO_BALANCE]: ['нулевой баланс', '0 на балансе', 'удаление графика'],
    [SCENARIOS.TECHNICAL_ISSUE]: ['спасти урок', 'технические неполадки', 'zoom', '508'],
    [SCENARIOS.CORPORATE_B2B]: ['корпоративным', 'b2b', 'progress test', 'сертификат'],
    [SCENARIOS.GROUP_LESSON]: ['групповые', 'f2g', 'домашний лицей'],
    [SCENARIOS.PARALLEL_LESSON]: ['параллельные', 'компьютерные курсы', 'тет-а-тет'],
    [SCENARIOS.FIRST_LESSON_ALOHA]: ['первый урок', 'aloha', 'знакомство'],
    [SCENARIOS.PARENT_FEEDBACK]: ['обратная связь родителям', 'one-page', '20 дней'],
    [SCENARIOS.EXAM_MOCK]: ['пробники', 'егэ', 'огэ', '96 часов'],
    [SCENARIOS.PAYMENT_DISPUTE]: ['вознаграждение', 'выплаты', 'банк 131', 'рокет ворк'],
    [SCENARIOS.UNIVERSAL_CANCEL]: ['отмена урока', 'перенос'],
    [SCENARIOS.UNIVERSAL_LATE]: ['опоздание', '50 минут'],
    [SCENARIOS.AMBIGUOUS_LESSON_ISSUE]: ['спасти урок', 'форс-мажор']
  };

  const keywords = SCENARIO_KEYWORD_FILTERS[scenario] || [];
  if (keywords.length === 0) return { primary: null, supporting: null };

  const chunkClauses = keywords.map(() => `title LIKE ? OR chunk_content LIKE ?`).join(' OR ');
  const artClauses = keywords.map(() => `title LIKE ? OR content LIKE ?`).join(' OR ');
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  let rows = [];

  try {
    const chunkSql = `SELECT id, article_id, title, category, url, chunk_content as content FROM article_chunks WHERE (${chunkClauses}) LIMIT 8`;
    const res = await db.prepare(chunkSql).bind(...params).all();
    rows = res.results || [];
  } catch {
    try {
      const sql = `SELECT id, title, category, url, content FROM articles WHERE (${artClauses}) LIMIT 8`;
      const res = await db.prepare(sql).bind(...params).all();
      rows = res.results || [];
    } catch (err2) {
      return { primary: null, supporting: null };
    }
  }

  const validRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.article_id || art.id)));
  if (validRows.length === 0) return { primary: null, supporting: null };

  const formatArticle = (art) => ({
    id: art.article_id || art.id,
    title: art.title || 'Статья базы знаний',
    url: art.url || '',
    content: (art.content || '').slice(0, 1500)
  });

  return { primary: formatArticle(validRows[0]), supporting: validRows[1] ? formatArticle(validRows[1]) : null };
}

// ============================================================================
// 5. STAGED SYSTEM PROMPT BUILDER
// ============================================================================
function buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle, supportingArticle }) {
  const policy = HARD_POLICIES[scenario];

  if (scenario === SCENARIOS.UNKNOWN) {
    return `Ты — персональный наставник преподавателя онлайн-школы.
Данная ситуация не описана в базе.
Твоя задача: вежливо направить преподавателя в чат Teachers Care (09:00–22:00 МСК) или в Support (при техсбоях). Отвечай естественно, без служебных тегов.`;
  }

  let decisionBlock = '';
  if (decisionObj) {
    decisionBlock = `
РЕШЕНИЕ СИТУАЦИИ (действуй по этому алгоритму):
• Сценарий: ${policy?.name || scenario}
• Статус урока: ${decisionObj.lessonStatus}
• Финансы: ${decisionObj.financialOutcome}
• Инструкция для преподавателя:
${decisionObj.mustDo.map(d => `  - ${d}`).join('\n')}
• Важные ограничения (чего делать нельзя):
${decisionObj.forbiddenActions.map(f => `  - ${f}`).join('\n')}`;
  }

  let articlesBlock = '';
  if (primaryArticle) {
    articlesBlock += `Основная статья: ${primaryArticle.title}\nСсылка: ${primaryArticle.url}\nТекст: ${primaryArticle.content}\n`;
  }

  return `Ты — персональный, умный и отзывчивый наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя задача — дать понятную, эмпатичную и подробную инструкцию. 

${PLATFORM_GOLD_STANDARD}

${decisionBlock}

ИСТОЧНИКИ HELP CENTER:
${articlesBlock || 'Опирайся на алгоритм выше.'}

ИНСТРУКЦИИ К ФОРМАТУ (КРИТИЧЕСКИ ВАЖНО):
1. Отвечай развернуто и естественно.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать Markdown-таблицы (никаких знаков | и ---). Форматируй текст только простыми списками (буллитами).
3. Используй только 5 официальных статусов уроков.
4. НИКОГДА не выводи служебные теги безопасности (например, "User Safety: safe").

СТРУКТУРА ТВОЕГО ОТВЕТА:
- 🎯 **Решение**: Развернутый пошаговый алгоритм действий (списком).
- 🛡️ **Финансы и статус**: Укажи официальный статус урока и влияние на оплату (только текст или буллиты, без таблиц).
- ${decisionObj?.studentMessageRequired 
    ? '💬 **Сообщение ученику**: Обязательно сгенерируй вежливый текст для отправки ученику. Оформи его СТРОГО как цитату Markdown (начни строку со знака `> `).' 
    : '💬 **Сообщение ученику**: В данной ситуации писать ученику не требуется (пропусти этот блок).'}
- 📚 **Ссылки на регламент**: ${primaryArticle?.url ? `Если есть ссылка, добавь ее: [${primaryArticle.title}](${primaryArticle.url})` : 'Пропусти блок ссылок.'}`;
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
// 8. MAIN CONTROLLER
// ============================================================================
export async function handleAssistantChat(request, env) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });

  const openRouterKey = env.OPENROUTER_API_KEY;
  const groqKey = env.GROQ_API_KEY;
  const cfAi = env.AI;

  if (!openRouterKey && !groqKey && !cfAi) return new Response(JSON.stringify({ error: 'No AI configured' }), { status: 500 });

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUserMsg = [...incomingMessages].reverse().find(m => m.role === 'user')?.content || '';

  const caseState = accumulateCaseState(incomingMessages);
  const { scenario, facts, confidence } = classifyScenarioWithConfidence(caseState, lastUserMsg);

  const policyHandler = HARD_POLICIES[scenario];
  const decisionObj = policyHandler ? policyHandler.evaluate(facts) : null;

  const { primary, supporting } = await retrieveScopedArticles(env.ARTICLES_DB, scenario);

  const systemPrompt = buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle: primary, supportingArticle: supporting, confidence });

  const cleanHistory = incomingMessages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4);
  const messagesPayload = [{ role: 'system', content: systemPrompt }, ...cleanHistory];

  let errors = [];

  if (openRouterKey) {
    try {
      const res = await callProviderStream('https://openrouter.ai/api/v1/chat/completions', openRouterKey, { model: env.OPENROUTER_MODEL || 'openrouter/free', messages: messagesPayload, stream: true, temperature: 0.25 });
      if (res.ok) return new Response(res.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
      errors.push(`OpenRouter: ${await res.text()}`);
    } catch (e) { errors.push(`OpenRouter: ${e.message}`); }
  }

  if (groqKey) {
    try {
      const res = await callProviderStream('https://api.groq.com/openai/v1/chat/completions', groqKey, { model: env.GROQ_MODEL || 'llama-3.1-8b-instant', messages: messagesPayload, stream: true, temperature: 0.25 });
      if (res.ok) return new Response(res.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
      errors.push(`Groq: ${await res.text()}`);
    } catch (e) { errors.push(`Groq: ${e.message}`); }
  }

  if (cfAi) {
    try {
      const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: messagesPayload, stream: true, temperature: 0.25, max_tokens: 800 });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
    } catch (e) { errors.push(`CF AI: ${e.message}`); }
  }

  return new Response(JSON.stringify({ error: `AI Error: ${errors.join(' | ')}` }), { status: 503 });
}
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
// 3. DETERMINISTIC SCENARIO & CONFIDENCE CLASSIFIER (NO INTERROGATION)
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

  // 1. Force Majeure
  if (facts.isEmergency || /пожар|эвакуац|нет свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал/i.test(text)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.98 };
  }

  // 2. Student Churn (Статья 2118)
  if (/смен.*преподават|ушел ученик|отказ.*ученик|лимит.*ученик|уходят ученики|отказаться от студент/i.test(text)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.95 };
  }

  // 3. Break/Vacation (Матрица отпуска)
  if (/отпуск|перерыв/i.test(text)) {
    if (facts.actor === 'student') return { scenario: SCENARIOS.BREAK_STUDENT, facts, confidence: 0.93 };
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  // 4. Zero Balance
  if (/нулев.*баланс|0 на балансе|нет оплат|закончились уроки|проводить ли при нуле|в долг/i.test(text)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.96 };
  }

  // 5. Cancellations (Универсальная отмена или точная)
  if (/отмен|перенес/i.test(text)) {
    if (facts.actor === 'teacher') return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.94 };
    if (facts.actor === 'student') return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.94 };
    return { scenario: SCENARIOS.UNIVERSAL_CANCEL, facts, confidence: 0.90 }; // Шпаргалка
  }

  // 6. Lateness (Универсальное опоздание или точное)
  if (/опозд|опазд|задержив|не пришел|не подключ|нет на урок|жду ученик|не явился|пропуск|прождал/i.test(text)) {
    if (facts.actor === 'teacher') return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.95 };
    
    if (facts.actor === 'student' || facts.minutes != null || /не пришел/i.test(text)) {
      if ((facts.minutes != null && facts.minutes >= 50) || /не пришел|не явился|пропустил урок|прождал.*конца|50 минут истекли/i.test(text)) {
        if (facts.minutes == null) facts.minutes = 50;
        return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.95 };
      }
      return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.94 };
    }
    
    return { scenario: SCENARIOS.UNIVERSAL_LATE, facts, confidence: 0.90 }; // Шпаргалка
  }

  // 7. Ambiguous Lesson Issue (Срыв урока)
  if (/урок не состоялся|сорвался урок|что делать с уроком|проблема с уроком/i.test(text)) {
    return { scenario: SCENARIOS.AMBIGUOUS_LESSON_ISSUE, facts, confidence: 0.90 }; // Шпаргалка
  }

  // 8. Other specifics
  if (/первый урок|aloha|алоха/i.test(text)) return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.95 };
  if (/обратн.*связ.*родител|one-page/i.test(text)) return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  if (/пробник|егэ|огэ/i.test(text)) return { scenario: SCENARIOS.EXAM_MOCK, facts, confidence: 0.95 };
  if (/корпоративн|b2b/i.test(text)) return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.94 };
  if (/группов|skysmart класс|домашний лицей|f2g/i.test(text)) return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.94 };
  if (/параллельн.*урок|поток|тет-а-тет/i.test(text)) return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.94 };
  if (/не работает платформ|сбой|микрофон|камер|завис|ошибк.*вход|техническ|спасти урок|zoom/i.test(text)) return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.92 };
  if (/оплат|вознагражд|выплат|ставк|расчет|деньг|акт|самозанят|банк 131/i.test(text)) return { scenario: SCENARIOS.PAYMENT_DISPUTE, facts, confidence: 0.90 };

  return { scenario: SCENARIOS.UNKNOWN, facts, confidence: 0.30 };
}

// ============================================================================
// 4. TARGETED SCENARIO-SCOPED RETRIEVAL
// ============================================================================
async function retrieveScopedArticles(db, scenario) {
  if (!db || !scenario || scenario === SCENARIOS.UNKNOWN) {
    return { primary: null, supporting: null };
  }

  const SCENARIO_KEYWORD_FILTERS = {
    [SCENARIOS.STUDENT_LATE]: ['опоздал', 'не пришел', '50 минут'],
    [SCENARIOS.STUDENT_ABSENCE]: ['не пришел', 'статус', 'пропуск', '2 урока подряд'],
    [SCENARIOS.STUDENT_CANCEL]: ['отмена урока', 'перенос', '8 часов'],
    [SCENARIOS.TEACHER_CANCEL]: ['перенос преподавателем', '24 часа', 'неуспешные уроки'],
    [SCENARIOS.TEACHER_LATE]: ['робот-помощник', 'опоздание преподавателя'],
    [SCENARIOS.TEACHER_EMERGENCY]: ['форс-мажор', 'teachers care', 'справка'],
    [SCENARIOS.BREAK_TEACHER]: ['перерыв преподавателя', '14 дней', '40 дней', 'отпуск'],
    [SCENARIOS.BREAK_STUDENT]: ['перерыв ученика', '21 день'],
    [SCENARIOS.STUDENT_CHURN]: ['отказ от ученика', 'карточка ученика', 'доступность набора', 'лимит'],
    [SCENARIOS.ZERO_BALANCE]: ['нулевой баланс', '0 на балансе'],
    [SCENARIOS.TECHNICAL_ISSUE]: ['спасти урок', 'технические неполадки', 'zoom', '508'],
    [SCENARIOS.CORPORATE_B2B]: ['корпоративным', 'b2b', 'progress test'],
    [SCENARIOS.GROUP_LESSON]: ['групповые', 'f2g', 'домашний лицей'],
    [SCENARIOS.PARALLEL_LESSON]: ['параллельные', 'компьютерные курсы'],
    [SCENARIOS.FIRST_LESSON_ALOHA]: ['первый урок', 'aloha'],
    [SCENARIOS.PARENT_FEEDBACK]: ['обратная связь родителям', 'one-page'],
    [SCENARIOS.EXAM_MOCK]: ['пробники', 'егэ', 'огэ', '96 часов'],
    [SCENARIOS.PAYMENT_DISPUTE]: ['вознаграждение', 'выплаты'],
    [SCENARIOS.UNIVERSAL_CANCEL]: ['отмена урока', 'перенос'],
    [SCENARIOS.UNIVERSAL_LATE]: ['опоздание', '50 минут'],
    [SCENARIOS.AMBIGUOUS_LESSON_ISSUE]: ['спасти урок', 'форс-мажор']
  };

  const keywords = SCENARIO_KEYWORD_FILTERS[scenario] || [];
  if (keywords.length === 0) return { primary: null, supporting: null };

  const chunkClauses = keywords.map(() => `title LIKE ? OR chunk_content LIKE ?`).join(' OR ');
  const artClauses = keywords.map(() => `title LIKE ? OR content LIKE ?`).join(' OR ');
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);

  let rows = [];

  try {
    const chunkSql = `SELECT id, article_id, title, category, url, chunk_content as content FROM article_chunks WHERE (${chunkClauses}) LIMIT 8`;
    const res = await db.prepare(chunkSql).bind(...params).all();
    rows = res.results || [];
  } catch {
    try {
      const sql = `SELECT id, title, category, url, content FROM articles WHERE (${artClauses}) LIMIT 8`;
      const res = await db.prepare(sql).bind(...params).all();
      rows = res.results || [];
    } catch (err2) {
      return { primary: null, supporting: null };
    }
  }

  const validRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.article_id || art.id)));
  if (validRows.length === 0) return { primary: null, supporting: null };

  const formatArticle = (art) => ({
    id: art.article_id || art.id,
    title: art.title || 'Статья базы знаний',
    url: art.url || '',
    content: (art.content || '').slice(0, 1500)
  });

  return { primary: formatArticle(validRows[0]), supporting: validRows[1] ? formatArticle(validRows[1]) : null };
}

// ============================================================================
// 5. STAGED SYSTEM PROMPT BUILDER
// ============================================================================
function buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle, supportingArticle }) {
  const policy = HARD_POLICIES[scenario];

  if (scenario === SCENARIOS.UNKNOWN) {
    return `Ты — персональный наставник преподавателя онлайн-школы.
Данная ситуация не описана в базе.
Твоя задача: вежливо направить преподавателя в чат Teachers Care (09:00–22:00 МСК) или в Support (при техсбоях). Отвечай естественно, без служебных тегов.`;
  }

  let decisionBlock = '';
  if (decisionObj) {
    decisionBlock = `
РЕШЕНИЕ СИТУАЦИИ (действуй по этому алгоритму):
• Сценарий: ${policy?.name || scenario}
• Статус урока: ${decisionObj.lessonStatus}
• Финансы: ${decisionObj.financialOutcome}
• Инструкция для преподавателя:
${decisionObj.mustDo.map(d => `  - ${d}`).join('\n')}
• Важные ограничения (чего делать нельзя):
${decisionObj.forbiddenActions.map(f => `  - ${f}`).join('\n')}`;
  }

  let articlesBlock = '';
  if (primaryArticle) {
    articlesBlock += `Основная статья: ${primaryArticle.title}\nСсылка: ${primaryArticle.url}\nТекст: ${primaryArticle.content}\n`;
  }

  return `Ты — персональный, умный и отзывчивый наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя задача — дать понятную, эмпатичную и подробную инструкцию. 

${PLATFORM_GOLD_STANDARD}

${decisionBlock}

ИСТОЧНИКИ HELP CENTER:
${articlesBlock || 'Опирайся на алгоритм выше.'}

ИНСТРУКЦИИ К ФОРМАТУ (КРИТИЧЕСКИ ВАЖНО):
1. Отвечай развернуто и естественно.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать Markdown-таблицы (никаких знаков | и ---). Форматируй текст только простыми списками (буллитами).
3. Используй только 5 официальных статусов уроков.
4. НИКОГДА не выводи служебные теги безопасности (например, "User Safety: safe").

СТРУКТУРА ТВОЕГО ОТВЕТА:
- 🎯 **Решение**: Развернутый пошаговый алгоритм действий (списком).
- 🛡️ **Финансы и статус**: Укажи официальный статус урока и влияние на оплату (только текст или буллиты, без таблиц).
- ${decisionObj?.studentMessageRequired 
    ? '💬 **Сообщение ученику**: Обязательно сгенерируй вежливый текст для отправки ученику. Оформи его СТРОГО как цитату Markdown (начни строку со знака `> `).' 
    : '💬 **Сообщение ученику**: В данной ситуации писать ученику не требуется (пропусти этот блок).'}
- 📚 **Ссылки на регламент**: ${primaryArticle?.url ? `Если есть ссылка, добавь ее: [${primaryArticle.title}](${primaryArticle.url})` : 'Пропусти блок ссылок.'}`;
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
// 8. MAIN CONTROLLER
// ============================================================================
export async function handleAssistantChat(request, env) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });

  const openRouterKey = env.OPENROUTER_API_KEY;
  const groqKey = env.GROQ_API_KEY;
  const cfAi = env.AI;

  if (!openRouterKey && !groqKey && !cfAi) return new Response(JSON.stringify({ error: 'No AI configured' }), { status: 500 });

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
  const lastUserMsg = [...incomingMessages].reverse().find(m => m.role === 'user')?.content || '';

  const caseState = accumulateCaseState(incomingMessages);
  const { scenario, facts, confidence } = classifyScenarioWithConfidence(caseState, lastUserMsg);

  const policyHandler = HARD_POLICIES[scenario];
  const decisionObj = policyHandler ? policyHandler.evaluate(facts) : null;

  const { primary, supporting } = await retrieveScopedArticles(env.ARTICLES_DB, scenario);

  const systemPrompt = buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle: primary, supportingArticle: supporting, confidence });

  const cleanHistory = incomingMessages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-4);
  const messagesPayload = [{ role: 'system', content: systemPrompt }, ...cleanHistory];

  let errors = [];

  if (openRouterKey) {
    try {
      const res = await callProviderStream('https://openrouter.ai/api/v1/chat/completions', openRouterKey, { model: env.OPENROUTER_MODEL || 'openrouter/free', messages: messagesPayload, stream: true, temperature: 0.25 });
      if (res.ok) return new Response(res.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
      errors.push(`OpenRouter: ${await res.text()}`);
    } catch (e) { errors.push(`OpenRouter: ${e.message}`); }
  }

  if (groqKey) {
    try {
      const res = await callProviderStream('https://api.groq.com/openai/v1/chat/completions', groqKey, { model: env.GROQ_MODEL || 'llama-3.1-8b-instant', messages: messagesPayload, stream: true, temperature: 0.25 });
      if (res.ok) return new Response(res.body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
      errors.push(`Groq: ${await res.text()}`);
    } catch (e) { errors.push(`Groq: ${e.message}`); }
  }

  if (cfAi) {
    try {
      const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: messagesPayload, stream: true, temperature: 0.25, max_tokens: 800 });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
    } catch (e) { errors.push(`CF AI: ${e.message}`); }
  }

  return new Response(JSON.stringify({ error: `AI Error: ${errors.join(' | ')}` }), { status: 503 });
}
