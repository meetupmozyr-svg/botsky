// src/assistant.js
import {
  BLACKLISTED_ARTICLE_IDS,
  PLATFORM_GOLD_STANDARD,
  getScopedScenarioRules,
  SCENARIOS,
  HARD_POLICIES
} from './rules.js';

// Стоп-слова для точного поиска
const STOP_WORDS = new Set([
  'как', 'что', 'делать', 'если', 'урок', 'урока', 'уроке', 'уроку', 'уроком', 'уроки',
  'мне', 'меня', 'мой', 'моя', 'мое', 'мои', 'ученик', 'ученика', 'ученику', 'учеником',
  'это', 'при', 'для', 'или', 'под', 'над', 'все', 'уже', 'был', 'была', 'были', 'есть',
  'можно', 'нужно', 'надо', 'подскажите', 'пожалуйста', 'скажите', 'почему', 'где', 'куда',
  'какой', 'какая', 'какие', 'сколько'
]);

// Словарь синонимов
const SYNONYM_MAP = {
  'не пришел': ['не вышел', 'пропущен учеником', 'неявка', '50 минут'],
  'не явился': ['не вышел', 'пропущен учеником', 'неявка', '50 минут'],
  'опоздал': ['опоздания', 'короткие уроки', '50 минут'],
  'форс-мажор': ['условия переноса', 'отмена урока', 'teachers care'],
  'заболел': ['условия переноса', 'отмена урока', 'teachers care', 'перерыв'],
  'отпуск': ['перерыв преподавателя', '14 дней'],
  'перерыв': ['перерыв преподавателя', '14 дней'],
  'отмена': ['условия переноса', 'отмена урока', '24 часа'],
  'перенос': ['условия переноса', 'перенос урока', '24 часа'],
  'чек': ['самозанятый', 'мой налог', 'банк 131', 'скаенг'],
  'самозанятый': ['мой налог', 'банк 131', 'скаенг', 'чек'],
  'aloha': ['алоха', 'первый урок', 'стандарт'],
  'алоха': ['aloha', 'первый урок', 'стандарт'],
  'one page': ['обратная связь родителю', 'one page', 'отчет']
};

/**
 * Классификатор сценариев для evalSuite и роутинга
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

  if (/смен.*преподават|ученик.*хочет.*сменить|ушл[ио].*ученик|отказ.*ученик/i.test(query)) {
    return { scenario: SCENARIOS.STUDENT_CHURN, facts, confidence: 0.94 };
  }

  if (/отпуск|перерыв|хочу\s+уйти\s+в\s+отпуск|оформить\s+перерыв/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_TEACHER, facts, confidence: 0.95 };
  }

  if (/пожар|эвакуац|нет\s+свет|отключил|заболел|больнич|срочн|чп|форс-мажор|авария|госпитал/i.test(query)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.96 };
  }

  if (/ученик.*(опазд|задержив|не\s+пришел|не\s+подключ|нет\s+на\s+урок|пропустил|пропуск)|прошло.*минут.*ученик|пропустил.*урок/i.test(query)) {
    facts.actor = 'student';
    if (/ровно\s+50\s+минут|50\s+минут.*не\s+пришел|так\s+и\s+не\s+пришел|3\s+урок.*подряд|2\s+урок.*подряд|пропустил.*3\s+урок/i.test(query)) {
      return { scenario: SCENARIOS.STUDENT_ABSENCE, facts, confidence: 0.96 };
    }
    return { scenario: SCENARIOS.STUDENT_LATE, facts, confidence: 0.93 };
  }

  if (/я\s+отменяю|отменяю\s+урок|не\s+могу\s+провести\s+урок|отмена\s+преподавател/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_CANCEL, facts, confidence: 0.92 };
  }

  if (/ученик\s+отменил|студент\s+отменил|отмена\s+ученик/i.test(query)) {
    facts.actor = 'student';
    return { scenario: SCENARIOS.STUDENT_CANCEL, facts, confidence: 0.92 };
  }

  if (/я\s+опоздал|опоздал\s+на|звонил\s+робот|робот.*звон/i.test(query)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.TEACHER_LATE, facts, confidence: 0.91 };
  }

  if (/0\s+на\s+балансе|нулев.*баланс|баланс\s+0/i.test(query)) {
    return { scenario: SCENARIOS.ZERO_BALANCE, facts, confidence: 0.95 };
  }

  if (/платформ.*завис|не\s+работает\s+видео|спасаю\s+урок|zoom|telemost|meet|сбой\s+платформ/i.test(query)) {
    return { scenario: SCENARIOS.TECHNICAL_ISSUE, facts, confidence: 0.90 };
  }

  if (/корпорат|b2b|bayer|байер|x5|playrix|helix|геликс|metro|1с|progress\s+test/i.test(query)) {
    return { scenario: SCENARIOS.CORPORATE_B2B, facts, confidence: 0.93 };
  }

  if (/групп.*урок|в\s+группу\s+пришел|групп.*1\s+человек/i.test(query)) {
    return { scenario: SCENARIOS.GROUP_LESSON, facts, confidence: 0.92 };
  }

  if (/параллельн.*урок/i.test(query)) {
    return { scenario: SCENARIOS.PARALLEL_LESSON, facts, confidence: 0.95 };
  }

  if (/aloha|алоха|первый\s+урок|вводный\s+урок/i.test(query)) {
    return { scenario: SCENARIOS.FIRST_LESSON_ALOHA, facts, confidence: 0.94 };
  }

  if (/one[\s-]page|обратн.*связ.*родител|отчет.*родител/i.test(query)) {
    return { scenario: SCENARIOS.PARENT_FEEDBACK, facts, confidence: 0.95 };
  }

  return { scenario: SCENARIOS.UNKNOWN || 'unknown', facts, confidence: 0.30 };
}

function extractSearchKeywords(query) {
  const lowerQuery = query.toLowerCase();
  const rawWords = lowerQuery
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  const expanded = new Set(rawWords);

  for (const [phrase, syns] of Object.entries(SYNONYM_MAP)) {
    if (lowerQuery.includes(phrase)) {
      syns.forEach(s => expanded.add(s.toLowerCase()));
    }
  }

  return Array.from(expanded).slice(0, 6);
}

async function retrieveRelevantArticles(db, userQuery) {
  if (!db) return [];

  const keywords = extractSearchKeywords(userQuery);
  if (keywords.length === 0) return [];

  try {
    const clauses = keywords.map(() => `(title LIKE ? OR content LIKE ?)`).join(' OR ');
    const params = [];
    keywords.forEach(k => {
      params.push(`%${k}%`, `%${k}%`);
    });

    const sql = `
      SELECT id, title, category, url, content
      FROM articles
      WHERE (${clauses})
      LIMIT 25
    `;

    const res = await db.prepare(sql).bind(...params).all();
    const rows = res.results || [];
    if (rows.length === 0) return [];

    const lowerQuery = userQuery.toLowerCase();
    const isStudentAbsence = /не\s+пришел|не\s+вышел|нет\s+на\s+урок|не\s+подключ/i.test(lowerQuery);
    const isTeacherEmergency = /форс-мажор|заболел|нет\s+свет|срочн.*отмен/i.test(lowerQuery);

    const scored = rows
      .filter(row => !BLACKLISTED_ARTICLE_IDS.has(row.id))
      .map(row => {
        let score = 0;
        const lowerTitle = (row.title || '').toLowerCase();
        const lowerContent = (row.content || '').toLowerCase();

        keywords.forEach(kw => {
          if (lowerTitle.includes(kw)) score += 15;
          if (lowerContent.includes(kw)) score += 3;
        });

        if (isStudentAbsence) {
          if (row.id === 170 || lowerTitle.includes('не вышел на урок')) score += 50;
          if (row.id === 1 || lowerTitle.includes('какие бывают статусы')) score += 30;
          if (row.id === 15 || lowerTitle.includes('короткие уроки')) score += 20;
          if (row.id === 86 || lowerTitle.includes('класс ученика')) score -= 60;
          if (lowerTitle.includes('вебинар') || lowerTitle.includes('лицей')) score -= 40;
        }

        if (isTeacherEmergency) {
          if (row.id === 16 || lowerTitle.includes('условия переноса')) score += 50;
          if (row.id === 23 || lowerTitle.includes('школа звонит')) score += 30;
          if (row.id === 8 || lowerTitle.includes('обращения в техподдержку')) score += 25;
          if (lowerTitle.includes('ученик без предупреждения') || lowerTitle.includes('не вышел на урок')) score -= 50;
        }

        return { ...row, score };
      })
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 3);
  } catch (err) {
    console.error("D1 search error:", err);
    return [];
  }
}

function buildSystemPrompt(retrievedArticles, userQuery) {
  const scopedRules = getScopedScenarioRules(userQuery);

  let prompt = `Вы — официальный ИИ-ассистент преподавателя школы Skyeng и Skysmart.
Временная привязка знаний: Сентябрь 2026 года.

${PLATFORM_GOLD_STANDARD}

${scopedRules ? `ИНСТРУКЦИЯ ДЛЯ ТЕКУЩЕЙ СИТУАЦИИ:\n${scopedRules}\n` : ''}

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА:
1. 🎯 **Решение и статус в личном кабинете:**
   - Назовите ТОЛЬКО один из 5 официальных статусов («Урок состоялся», «Пропущен учеником», «Урок пропущен преподавателем», «Урок перенесен», «Урок отменен») либо укажите, что во время ожидания статус не ставится.
   - Дайте четкий регламент действий: сколько ждать, когда ставить статус.

2. 🛡️ **Алгоритм действий и риски:**
   - Пошаговые действия для преподавателя.

3. 💬 **Готовое сообщение ученику / родителю:**
   - Напишите вежливое сообщение. Оформляйте строго внутри цитаты:
> «Здравствуйте! ...»

4. 📚 **Полезные статьи Help Center:**
   - Выводите ТОЛЬКО реальные статьи из предоставленного блока контекста D1 ниже СТРОГО в виде кликабельных Markdown-ссылок:
- [Точный заголовок статьи](URL_из_контекста)

ЖЕСТКИЕ ЗАПРЕТЫ:
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать статусы (например, «в процессе ожидания»).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать слова «брак», «штрафы», «срыв урока».
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать несуществующие ссылки.
`;

  if (retrievedArticles && retrievedArticles.length > 0) {
    prompt += `\nВЫДЕРЖКИ ИЗ ОФИЦИАЛЬНОЙ БАЗЫ ЗНАНИЙ (D1):\n`;
    retrievedArticles.forEach(art => {
      prompt += `### [${art.title}](${art.url})\n${art.content}\n\n`;
    });
  }

  return prompt;
}

export async function handleAssistantChat(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Массив сообщений пуст" }), { status: 400 });
    }

    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const retrievedArticles = await retrieveRelevantArticles(env.ARTICLES_DB, lastUserMessage);
    const systemPrompt = buildSystemPrompt(retrievedArticles, lastUserMessage);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6)
    ];

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
