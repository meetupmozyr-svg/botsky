// src/assistant.js
import {
  BLACKLISTED_ARTICLE_IDS,
  PLATFORM_GOLD_STANDARD,
  getScopedScenarioRules
} from './rules.js';

// Стоп-слова для точного поиска
const STOP_WORDS = new Set([
  'как', 'что', 'делать', 'если', 'урок', 'урока', 'уроке', 'уроку', 'уроком', 'уроки',
  'мне', 'меня', 'мой', 'моя', 'мое', 'мои', 'ученик', 'ученика', 'ученику', 'учеником',
  'это', 'при', 'для', 'или', 'под', 'над', 'все', 'уже', 'был', 'была', 'были', 'есть',
  'можно', 'нужно', 'надо', 'подскажите', 'пожалуйста', 'скажите', 'почему', 'где', 'куда',
  'какой', 'какая', 'какие', 'сколько'
]);

// Словарь синонимов для поиска в D1
const SYNONYM_MAP = {
  'не пришел': ['не вышел', 'пропущен учеником', 'неявка', '50 минут', 'опоздание'],
  'не явился': ['не вышел', 'пропущен учеником', 'неявка', '50 минут'],
  'опоздал': ['опоздания', 'короткие уроки', '50 минут'],
  'форс-мажор': ['перенос', 'отмена', 'teachers care', 'неуспешный'],
  'заболел': ['перенос', 'отмена', 'teachers care', 'перерыв'],
  'отпуск': ['перерыв', '14 дней', 'отпуск'],
  'отмена': ['условия переноса', 'отмена урока', '24 часа'],
  'перенос': ['условия переноса', 'перенос урока', '24 часа'],
  'чек': ['самозанятый', 'мой налог', 'банк 131', 'скаенг'],
  'самозанятый': ['мой налог', 'банк 131', 'скаенг', 'чек'],
  'aloha': ['алоха', 'первый урок', 'стандарт'],
  'алоха': ['aloha', 'первый урок', 'стандарт'],
  'one page': ['обратная связь родителю', 'one page', 'отчет']
};

/**
 * Извлечение и расширение ключевых слов
 */
function extractSearchKeywords(query) {
  const lowerQuery = query.toLowerCase();
  const rawWords = lowerQuery
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

  const expanded = new Set(rawWords);

  // Подмешиваем синонимы
  for (const [phrase, syns] of Object.entries(SYNONYM_MAP)) {
    if (lowerQuery.includes(phrase)) {
      syns.forEach(s => expanded.add(s.toLowerCase()));
    }
  }

  return Array.from(expanded).slice(0, 6);
}

/**
 * Точный фактологический поиск в таблице articles (D1)
 */
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

    // Скоринг и ранжирование
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

        // Прямое совпадение с ключевыми статьями
        if (isStudentAbsence) {
          if (row.id === 170 || lowerTitle.includes('не вышел на урок')) score += 50;
          if (row.id === 1 || lowerTitle.includes('какие бывают статусы')) score += 30;
          if (row.id === 15 || lowerTitle.includes('короткие уроки')) score += 20;
          // Штраф нерелевантным статьям
          if (row.id === 86 || lowerTitle.includes('класс ученика')) score -= 50;
          if (lowerTitle.includes('вебинар') || lowerTitle.includes('лицей')) score -= 30;
        }

        if (isTeacherEmergency) {
          if (row.id === 16 || lowerTitle.includes('условия переноса')) score += 50;
          if (row.id === 23 || lowerTitle.includes('школа звонит')) score += 30;
          if (row.id === 8 || lowerTitle.includes('обращения в техподдержку')) score += 25;
          if (lowerTitle.includes('ученик без предупреждения') || lowerTitle.includes('не вышел на урок')) score -= 40;
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

/**
 * Сборка строгого системного промпта
 */
function buildSystemPrompt(retrievedArticles, userQuery) {
  const scopedRules = getScopedScenarioRules(userQuery);

  let prompt = `Вы — официальный ИИ-ассистент преподавателя школы Skyeng и Skysmart.
Временная привязка знаний: Сентябрь 2026 года.

${PLATFORM_GOLD_STANDARD}

${scopedRules ? `ИНСТРУКЦИЯ ДЛЯ ТЕКУЩЕЙ СИТУАЦИИ:\n${scopedRules}\n` : ''}

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА:
1. 🎯 **Решение и статус в личном кабинете:**
   - Назовите ТОЛЬКО официальный статус (один из 5) либо прямо укажите, что во время ожидания статус не ставится.
   - Дайте четкий алгоритм: сколько минут ждать, когда ставить статус.

2. 🛡️ **Алгоритм действий и риски:**
   - Четкие пошаговые шаги для преподавателя.

3. 💬 **Готовое сообщение ученику / родителю:**
   - Напишите вежливое сообщение. Оформляйте строго внутри цитаты:
> «Здравствуйте! ...»

4. 📚 **Полезные статьи Help Center:**
   - Выводите ТОЛЬКО реальные статьи из предоставленного блока контекста ниже строго в формате кликабельных Markdown-ссылок:
- [Точный заголовок статьи](URL_из_контекста)

ЖЕСТКИЕ ЗАПРЕТЫ:
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать статусы (например, «в процессе ожидания», «на проверке»).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать слова «брак», «штрафы», «срыв урока».
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать несуществующие ссылки. Если ссылок в контексте нет — не выводите блок ссылок.
`;

  if (retrievedArticles && retrievedArticles.length > 0) {
    prompt += `\nВЫДЕРЖКИ ИЗ ОФИЦИАЛЬНОЙ БАЗЫ ЗНАНИЙ (D1):\n`;
    retrievedArticles.forEach(art => {
      prompt += `### [${art.title}](${art.url})\n${art.content}\n\n`;
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

    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const retrievedArticles = await retrieveRelevantArticles(env.ARTICLES_DB, lastUserMessage);
    const systemPrompt = buildSystemPrompt(retrievedArticles, lastUserMessage);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6)
    ];

    // 1. Приоритет: OpenRouter API
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

    // 2. Groq Fallback
    if (env.GROQ_API_KEY) {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: fullMessages,
          stream: true,
          temperature: 0.1
        })
      });

      if (groqRes.ok) {
        return new Response(groqRes.body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
          }
        });
      }
    }

    // 3. Workers AI Fallback
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
      error: "Не настроен LLM-провайдер: укажите OPENROUTER_API_KEY, GROQ_API_KEY или привязку env.AI" 
    }), { status: 500 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
