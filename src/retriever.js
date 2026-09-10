// src/retriever.js

export async function retrieveScopedArticles(db, scenario, facts) {
  if (!db || scenario === 'unknown') return { primary: null, supporting: null };

  const SCENARIO_KEYWORD_FILTERS = {
    student_late: ['опоздал', 'не пришел', '50 минут'],
    student_absence: ['не пришел', 'статус', 'оплата'],
    teacher_emergency: ['форс-мажор', 'teachers care', 'болезнь'],
    break_schedule: ['перерыв', 'зеленая зона', 'отпуск']
  };

  const keywords = SCENARIO_KEYWORD_FILTERS[scenario] || [];
  if (keywords.length === 0) return { primary: null, supporting: null };

  const clauses = keywords.map(() => `title LIKE ?`).join(' OR ');
  const params = keywords.map(k => `%${k}%`);

  const sql = `
    SELECT id, title, category, url, content
    FROM articles
    WHERE (${clauses})
    LIMIT 10
  `;

  try {
    const res = await db.prepare(sql).bind(...params).all();
    const rows = res.results || [];

    if (rows.length === 0) return { primary: null, supporting: null };

    // Format & clean
    const formatArticle = (art) => ({
      id: art.id,
      title: art.title,
      url: art.url,
      // Chunk/slice cleanly
      content: art.content ? art.content.slice(0, 1000) : ''
    });

    return {
      primary: formatArticle(rows[0]),
      supporting: rows[1] ? formatArticle(rows[1]) : null
    };
  } catch (err) {
    console.error("Scoped retrieval error:", err);
    return { primary: null, supporting: null };
  }
}
