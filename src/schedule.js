import {
  escapeHTML,
  htmlResponse,
  normalizeUrl,
  parseCalendarCSV
} from './utils.js';

// Shared Stats Navigation Tabs
export const renderTabs = (active) => `
  <div class="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
    <a href="/stats" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">📊 Все встречи</a>
    <a href="/stats?report=monthly" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">📅 Дашборд за месяц</a>
    <a href="/stats?report=monthly_ranking" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${active === 'ranking' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">🏆 Рейтинг встреч за месяц</a>
    <a href="/stats?report=schedule" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${active === 'schedule' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
      Календарь расписания (CSV)
    </a>
  </div>
`;

// Find Scheduled Event matching URL, Exact Date AND Valid Time Window (-10 mins before, +60 mins after end)
export async function findScheduledMeeting(env, targetUrl, mskDateStr, currentMskMins) {
  if (!env.meet) return null;

  try {
    await env.meet.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        norm_url TEXT,
        base_url TEXT,
        event_date TEXT,
        start_mins INTEGER,
        end_mins INTEGER,
        name TEXT
      )
    `).run();

    const norm = normalizeUrl(targetUrl);
    const base = norm.split('?')[0];

    const res = await env.meet.prepare(`
      SELECT * FROM schedule_events 
      WHERE (norm_url = ? OR base_url = ? OR url = ?)
        AND event_date = ?
    `).bind(norm, base, targetUrl, mskDateStr).all();

    if (res && res.results && res.results.length > 0) {
      for (const evt of res.results) {
        const start = evt.start_mins !== null && evt.start_mins !== undefined ? evt.start_mins : 0;
        const end = evt.end_mins !== null && evt.end_mins !== undefined ? evt.end_mins : (start + 60);

        // Valid window: 10 minutes before start, up to 1 hour after scheduled end
        const windowStart = start - 10;
        const windowEnd = end + 60;

        if (currentMskMins >= windowStart && currentMskMins <= windowEnd) {
          return evt;
        }
      }
    }
  } catch (e) {
    console.error("Error looking up schedule_events:", e);
  }

  return null;
}

// Get Schedule Map and Full Events List from D1
export async function getScheduleMap(env) {
  let scheduleDict = {};
  let scheduleEventsList = [];
  if (!env.meet) return { scheduleDict, scheduleEventsList };
  
  try {
    const res = await env.meet.prepare("SELECT url, norm_url, base_url, event_date, start_mins, end_mins, name FROM schedule_events").all();
    if (res && res.results) {
      scheduleEventsList = res.results;
      res.results.forEach(r => {
        if (r.name) {
          if (r.norm_url && r.event_date) scheduleDict[`${r.norm_url}|${r.event_date}`] = r.name;
          if (r.base_url && r.event_date) scheduleDict[`${r.base_url}|${r.event_date}`] = r.name;
          if (r.url && r.event_date) scheduleDict[`${r.url}|${r.event_date}`] = r.name;

          if (r.norm_url) scheduleDict[r.norm_url] = r.name;
          if (r.base_url) scheduleDict[r.base_url] = r.name;
          if (r.url) scheduleDict[r.url] = r.name;
        }
      });
    }
  } catch (e) {}
  return { scheduleDict, scheduleEventsList };
}

// Handle Calendar CSV Upload (Clears only target month(s) without touching historical months)
export async function handleCSVUpload(request, env) {
  try {
    if (!env.meet) {
      return new Response("D1 binding 'meet' is missing in wrangler configuration.", { status: 500 });
    }

    await env.meet.prepare(`
      CREATE TABLE IF NOT EXISTS schedule_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        norm_url TEXT,
        base_url TEXT,
        event_date TEXT,
        start_mins INTEGER,
        end_mins INTEGER,
        name TEXT
      )
    `).run();
    
    const formData = await request.formData();
    const file = formData.get("csvFile");
    
    if (!file || !file.name) {
      return new Response("No file uploaded", { status: 400 });
    }

    const text = await file.text();
    const parsedEvents = parseCalendarCSV(text, file.name);

    if (parsedEvents.length === 0) {
      return new Response("Не удалось распознать встречи из CSV файла. Проверьте формат расписания.", { status: 400 });
    }

    // Extract all unique YYYY-MM prefixes present in this specific file
    const targetMonthPrefixes = Array.from(new Set(parsedEvents.map(e => e.date.slice(0, 7))));

    // Delete ONLY the month(s) that are being re-uploaded (Preserves all other past & future months)
    for (const prefix of targetMonthPrefixes) {
      await env.meet.prepare(`DELETE FROM schedule_events WHERE event_date LIKE ?`).bind(`${prefix}%`).run();
    }

    const stmts = [];
    for (const evt of parsedEvents) {
      stmts.push(
        env.meet.prepare(`
          INSERT INTO schedule_events (url, norm_url, base_url, event_date, start_mins, end_mins, name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(evt.url, evt.normUrl, evt.baseUrl, evt.date, evt.startMins, evt.endMins, evt.name)
      );
    }

    for (let i = 0; i < stmts.length; i += 100) {
      await env.meet.batch(stmts.slice(i, i + 100));
    }

    return Response.redirect(new URL(request.url).origin + "/stats?report=schedule&success=" + parsedEvents.length, 302);

  } catch (error) {
    return new Response("Error processing CSV: " + error.message, { status: 500 });
  }
}

export async function renderScheduleManager(env, scheduleDict, reqUrl) {
  let eventsList = [];
  if (env.meet) {
    try {
      const res = await env.meet.prepare(`SELECT * FROM schedule_events ORDER BY event_date ASC, start_mins ASC`).all();
      if (res && res.results) eventsList = res.results;
    } catch(e) {}
  }

  const successMsg = reqUrl.searchParams.get("success");

  const formatMins = (m) => {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const tableRows = eventsList.map(e => `
    <tr class="border-b border-slate-100 text-sm hover:bg-slate-50">
      <td class="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">${escapeHTML(e.event_date)}</td>
      <td class="px-4 py-3 text-indigo-600 font-bold whitespace-nowrap">${formatMins(e.start_mins)} - ${formatMins(e.end_mins)}</td>
      <td class="px-4 py-3 font-medium text-slate-800">${escapeHTML(e.name)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs break-all">${escapeHTML(e.url)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">Календарь пуст. Загрузите CSV файл с расписанием.</td></tr>`;

  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="bg-slate-50 text-slate-900 h-full">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Управление расписанием</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="min-h-full py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-3xl font-extrabold text-slate-900 mb-6 tracking-tight">Управление расписанием</h1>
        ${renderTabs('schedule')}

        ${successMsg ? `<div class="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-medium">✅ Календарь расписания успешно обновлен! Загружено мероприятий: ${escapeHTML(successMsg)}</div>` : ''}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-1">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 class="text-lg font-bold text-slate-900 mb-2">Загрузить календарь (CSV)</h2>
              <p class="text-xs text-slate-500 mb-6 leading-relaxed">
                Загрузите файл с расписанием (колонки: <code>Дата,Время,Название,Ссылка</code>). <br><br>
                Поддерживаются временные интервалы (например, <code>14:00</code> или <code>15:30 - 17:00</code>). Посещения будут засчитываться в официальную статистику только за 10 минут до начала и в течение 1 часа после окончания мероприятия.
              </p>

              <form method="POST" action="/stats?action=upload_csv" enctype="multipart/form-data" class="space-y-4">
                <div class="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
                  <input type="file" name="csvFile" accept=".csv" required class="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer">
                </div>
                <button type="submit" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition-colors">
                  Загрузить календарь
                </button>
              </form>
            </div>
          </div>

          <div class="lg:col-span-2">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
              <div class="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                <h3 class="font-bold text-slate-800">Распознанные встречи</h3>
                <span class="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full">${eventsList.length} мероприятий</span>
              </div>
              <div class="overflow-y-auto max-h-[600px]">
                <table class="min-w-full text-left">
                  <thead class="bg-white sticky top-0 border-b border-slate-100 text-xs uppercase text-slate-500 font-bold z-10">
                    <tr>
                      <th class="px-4 py-3 bg-white">Дата</th>
                      <th class="px-4 py-3 bg-white">Время (МСК)</th>
                      <th class="px-4 py-3 bg-white">Название</th>
                      <th class="px-4 py-3 bg-white">Ссылка</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  return htmlResponse(html);
}
