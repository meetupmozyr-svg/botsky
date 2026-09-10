import { 
  BLACKLISTED_ARTICLE_IDS, 
  PLATFORM_GOLD_STANDARD, 
  SCENARIOS, 
  HARD_POLICIES 
} from './rules.js';

// ============================================================================
// 1. RUSSIAN STOP-WORDS & MORPHOLOGICAL SYNONYM DICTIONARY
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
// 2. MULTI-TURN CASE-STATE ACCUMULATOR (Point #7 & #8)
// ============================================================================
function accumulateCaseState(messages) {
  const state = {
    scenario: null,
    facts: {
      minutes: null,
      hoursBeforeLesson: null,
      actor: null,
      isEmergency: false
    },
    rawHistoryText: ''
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return state;
  }

  // Iterate chronologically through user messages to accumulate facts
  const userTexts = messages
    .filter(m => m.role === 'user')
    .map(m => String(m.content || '').trim())
    .filter(Boolean);

  state.rawHistoryText = userTexts.join(' -> ');

  for (const text of userTexts) {
    const lower = text.toLowerCase();

    // Extract minutes
    const minMatch = lower.match(/(\d+)\s*(?:мин|минут|минуты)/);
    if (minMatch) {
      state.facts.minutes = parseInt(minMatch[1], 10);
    }

    // Extract hours before lesson
    const hourMatch = lower.match(/(\d+)\s*(?:час|часа|часов)/);
    if (hourMatch) {
      state.facts.hoursBeforeLesson = parseInt(hourMatch[1], 10);
    }

    // Extract Actor & Emergency
    if (/я опоздал|я задержива|моё опоздание|у меня|со стороны преподавател/i.test(lower)) {
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
// 3. DETERMINISTIC SCENARIO & CONFIDENCE CLASSIFIER (Point #2 & #16)
// ============================================================================
function classifyScenarioWithConfidence(caseState, latestQuery) {
  const text = (caseState.rawHistoryText + ' ' + (latestQuery || '')).toLowerCase();
  const facts = { ...caseState.facts };

  // 1. Force Majeure & Emergency (Highest Priority)
  if (facts.isEmergency || /пожар|эвакуац|нет свет|вырубил|электричеств|заболел|больнич|срочн|чп|форс-мажор|госпитал/i.test(text)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.98 };
  }

  // 2. Consecutive Lessons (2 урока подряд)
  if (/2 урока подряд|спаренн|два урока подряд|подряд/i.test(text)) {
    return { scenario: SCENARIOS.CONSECUTIVE_LESSONS, facts, confidence: 0.96 };
  }

  // 3. Group Lessons (Групповые занятия)
  if (/группов|skysmart класс|групп/i.test(text)) {
    return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.95 };
  }

  // 4. Teacher's Own Delay
  if (facts.actor === 'teacher' && /опозда|задержива|не успеваю/i.test(text)) {
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.95 };
  }

  // 5. Student Late or Missed Lesson
  if (/опозда|задержив|не пришел|не подключ|нет на урок|жду ученик|не явился|пропуск/i.test(text)) {
    facts.actor = 'student';
    if (!facts.minutes && /не пришел|не явился|пропустил урок/i.test(text)) {
      facts.minutes = 50;
    }
    const targetScenario = (facts.minutes && facts.minutes >= 50) 
      ? SCENARIOS.STUDENT_ABSENCE 
      : SCENARIOS.STUDENT_LATE;
    return { scenario: targetScenario, facts, confidence: 0.94 };
  }

  // 6. Student Cancellation / Reschedule
  if (/ученик отмен|отмена ученик|перенос.*ученик|отменил урок/i.test(text)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.92 };
  }

  // 7. Schedule Break / Vacation
  if (/отпуск|перерыв|зелен.*зон|расписан|выходн|отдых|слот/i.test(text)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_SCHEDULE, facts, confidence: 0.92 };
  }

  // 8. Change Teacher
  if (/смен|друг.*преподават|отказ.*ученик|замен.*учител/i.test(text)) {
    return { scenario: SCENARIOS.CHANGE_TEACHER, facts, confidence: 0.90 };
  }

  // 9. Technical Problems
  if (/не работает платформ|сбой|микрофон|камер|завис|ошибк.*вход|техническ/i.test(text)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.90 };
  }

  // 10. Payments & Rates
  if (/оплат|вознагражд|выплат|ставк|расчет|деньг|акт/i.test(text)) {
    return { scenario: SCENARIOS.PAYMENT_DISPUTE, facts, confidence: 0.88 };
  }

  // 11. Ambiguous Query Trigger (Requires Active Clarification)
  if (/урок не состоялся|отмена|сорвался урок|что делать с уроком|проблема с уроком|как отменить/i.test(text)) {
    return { scenario: SCENARIOS.NEED_CLARIFICATION, facts, confidence: 0.50 };
  }

  return { scenario: SCENARIOS.UNKNOWN, facts, confidence: 0.30 };
}

// ============================================================================
// 4. TARGETED SCENARIO-SCOPED RETRIEVAL (Chunks-aware & Articles fallback)
// ============================================================================
async function retrieveScopedArticles(db, scenario) {
  if (!db || !scenario || scenario === SCENARIOS.UNKNOWN || scenario === SCENARIOS.NEED_CLARIFICATION) {
    return { primary: null, supporting: null };
  }

  const SCENARIO_KEYWORD_FILTERS = {
    [SCENARIOS.STUDENT_LATE]: ['опоздал', 'не пришел', '50 минут'],
    [SCENARIOS.STUDENT_ABSENCE]: ['не пришел', 'статус', 'оплата', 'пропуск'],
    [SCENARIOS.STUDENT_CANCEL]: ['отмена урока', 'перенос', '8 часов'],
    [SCENARIOS.TEACHER_EMERGENCY]: ['форс-мажор', 'teachers care', 'болезнь', 'справка'],
    [SCENARIOS.TEACHER_LATE]: ['опоздание преподавателя', 'компенсация'],
    [SCENARIOS.BREAK_SCHEDULE]: ['перерыв', 'зеленая зона', 'отпуск', 'расписание'],
    [SCENARIOS.CHANGE_TEACHER]: ['смена преподавателя', 'перевод ученика'],
    [SCENARIOS.TECHNICAL_ISSUE]: ['технические неполадки', 'платформа', 'поддержка'],
    [SCENARIOS.PAYMENT_DISPUTE]: ['вознаграждение', 'выплаты', 'расчет'],
    [SCENARIOS.CONSECUTIVE_LESSONS]: ['2 урока подряд', 'подряд', 'спаренные'],
    [SCENARIOS.GROUP_LESSON]: ['групповые', 'skysmart класс']
  };

  const keywords = SCENARIO_KEYWORD_FILTERS[scenario] || [];
  if (keywords.length === 0) return { primary: null, supporting: null };

  const clauses = keywords.map(() => `title LIKE ?`).join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  let rows = [];

  // 1. Try querying chunked database table if available
  try {
    const chunkSql = `
      SELECT id, article_id, title, category, url, chunk_content as content
      FROM article_chunks
      WHERE (${clauses})
      LIMIT 8
    `;
    const res = await db.prepare(chunkSql).bind(...params).all();
    rows = res.results || [];
  } catch (err) {
    // 2. Fallback to standard articles table
    try {
      const sql = `
        SELECT id, title, category, url, content
        FROM articles
        WHERE (${clauses})
        LIMIT 8
      `;
      const res = await db.prepare(sql).bind(...params).all();
      rows = res.results || [];
    } catch (err2) {
      console.error('D1 retrieval error:', err2);
      return { primary: null, supporting: null };
    }
  }

  // Filter out any article in the 44-article blacklist audit
  const validRows = rows.filter(art => !BLACKLISTED_ARTICLE_IDS.has(Number(art.article_id || art.id)));
  if (validRows.length === 0) return { primary: null, supporting: null };

  const formatArticle = (art) => ({
    id: art.article_id || art.id,
    title: art.title || 'Статья регламента',
    url: art.url || '',
    content: (art.content || '').slice(0, 1200)
  });

  return {
    primary: formatArticle(validRows[0]),
    supporting: validRows[1] ? formatArticle(validRows[1]) : null
  };
}

// ============================================================================
// 5. STAGED SYSTEM PROMPT BUILDER
// ============================================================================
function buildStagedSystemPrompt({ scenario, facts, decisionObj, primaryArticle, supportingArticle, confidence }) {
  const policy = HARD_POLICIES[scenario];

  // A. Clarification Request Mode
  if (scenario === SCENARIOS.NEED_CLARIFICATION) {
    return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Запрос преподавателя содержит недостаточно данных для однозначного применения регламента.

ТВОЯ ЗАДАЧА:
Не придумывай правила наугад. Вежливо и коротко задай уточняющие вопросы преподавателю:
1. Кто является инициатором отмены/опоздания (ученик или преподаватель)?
2. Сколько времени прошло от начала урока (или за сколько часов до урока поступила отмена)?
3. Есть ли техническая проблема или форс-мажор?

Оформи ответ доброжелательно, по пунктам.`;
  }

  // B. Unknown Scenario Mode
  if (scenario === SCENARIOS.UNKNOWN) {
    return `Ты — персональный наставник преподавателя онлайн-школы.
Ситуация не описана в стандартных правилах либо вопрос не относится к регламентам.

ТВОЯ ЗАДАЧА:
Кратко объясни, что по данной нестандартной ситуации нет автоматического регламента, и порекомендуй обратиться к дежурным в **Mattermost (MMT)** или написать в чат **Teachers Care** в личном кабинете.`;
  }

  // C. Deterministic Decision Mode
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
- Источник регламента: ${decisionObj.sourceRule}
==================================================`;
  }

  let articlesBlock = '';
  if (primaryArticle) {
    articlesBlock += `### Основная статья: ${primaryArticle.title}\nСсылка: ${primaryArticle.url}\nТекст: ${primaryArticle.content}\n`;
  }
  if (supportingArticle) {
    articlesBlock += `\n---\n### Дополнительная статья: ${supportingArticle.title}\nСсылка: ${supportingArticle.url}\nТекст: ${supportingArticle.content}\n`;
  }

  return `Ты — персональный наставник преподавателя онлайн-школы (Skyeng / Skysmart).
Твоя миссия — давать точные, логичные и ЖИВЫЕ инструкции на профессиональном языке школы, строго разъясняя предписанный регламент.

${PLATFORM_GOLD_STANDARD}

${decisionBlock}

ПОДТВЕРЖДАЮЩИЕ МАТЕРИАЛЫ ИЗ БАЗЫ ЗНАНИЙ:
==================================================
${articlesBlock || 'Действуй строго на основе предписанного регламента выше.'}
==================================================

СТРОГИЕ ПРАВИЛА ГЕНЕРАЦИИ:
1. Запрещено смешивать сценарии. Не применяй правила отмен, переносов или форс-мажоров, если ситуация касается исключительно опоздания ученика.
2. Не выдумывай регламенты. Строго следуй предписанному решению выше.
3. Используй ТОЛЬКО терминологию школы: «личный кабинет», «неуспешные уроки», «допустимый порог до 20%». Запрещены: «CRM», «брак», «буфер».
4. Общайся живо, эмпатично и по делу.
5. Структура ответа:
- 🎯 **Решение**: Четкий, живой пошаговый алгоритм действий (присутствует всегда).
- 🛡️ **Финансы и риски**: Укажи статус урока и финансовый расчет.
- 💬 **Сообщение ученику**: ${decisionObj?.studentMessageRequired ? 'ДОБАВЬ готовое вежливое сообщение ученику СТРОГО в виде цитаты Markdown: > «...»' : 'НЕ добавляй блок сообщения, так как писать ученику в этой ситуации не требуется.'}
- 📚 **Ссылки на регламент**: ${primaryArticle?.url ? `Оформи кликабельную Markdown ссылку: [${primaryArticle.title}](${primaryArticle.url})` : 'Пропусти этот блок, если точной ссылки в базе нет.'}`;
}

// ============================================================================
// 6. PROVIDER STREAM DISPATCHER
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
// 7. MAIN CONTROLLER & MULTI-PROVIDER CASCADE
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

  // 1. Accumulate multi-turn case state
  const caseState = accumulateCaseState(incomingMessages);

  // 2. Classify scenario and compute confidence
  const { scenario, facts, confidence } = classifyScenarioWithConfidence(caseState, lastUserMsg);

  // 3. Resolve policy deterministically
  const policyHandler = HARD_POLICIES[scenario];
  const decisionObj = policyHandler ? policyHandler.evaluate(facts) : null;

  // 4. Scoped RAG (1 Primary + max 1 Supporting)
  const { primary, supporting } = await retrieveScopedArticles(env.ARTICLES_DB, scenario);

  // 5. Build staged prompt
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

  // ==========================================
  // Provider 1: OpenRouter (Primary)
  // ==========================================
  if (openRouterKey) {
    const payload = {
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      messages: messagesPayload,
      stream: true,
      temperature: 0.15
    };

    try {
      const res = await callProviderStream('https://openrouter.ai/api/v1/chat/completions', openRouterKey, payload);
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
          }
        });
      } else {
        errors.push(`OpenRouter: ${await res.text()}`);
      }
    } catch (e) {
      errors.push(`OpenRouter Network: ${e.message}`);
    }
  }

  // ==========================================
  // Provider 2: Groq (Secondary)
  // ==========================================
  if (groqKey) {
    const payload = {
      model: env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: messagesPayload,
      stream: true,
      temperature: 0.15
    };

    try {
      const res = await callProviderStream('https://api.groq.com/openai/v1/chat/completions', groqKey, payload);
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive'
          }
        });
      } else {
        errors.push(`Groq: ${await res.text()}`);
      }
    } catch (e) {
      errors.push(`Groq Network: ${e.message}`);
    }
  }

  // ==========================================
  // Provider 3: Cloudflare Workers AI (Edge Fallback)
  // ==========================================
  if (cfAi) {
    try {
      const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: messagesPayload,
        stream: true,
        temperature: 0.15,
        max_tokens: 800
      });
      
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        }
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
