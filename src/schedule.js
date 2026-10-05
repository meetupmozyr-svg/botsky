// src/schedule.js
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
      Календарь расписания
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
    const res = await env.meet.prepare("SELECT id, url, norm_url, base_url, event_date, start_mins, end_mins, name FROM schedule_events").all();
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

// Handle Add / Delete / Manual Schedule Actions
export async function handleScheduleActions(request, reqUrl, env) {
  const action = reqUrl.searchParams.get("action");

  // Add event manually (from modal or editor form)
  if (action === "add_schedule_event" && request.method === "POST") {
    try {
      const formData = await request.formData();
      const name = (formData.get("name") || "").trim();
      const rawDate = (formData.get("date") || "").trim();
      const rawTime = (formData.get("time") || "").trim();
      const rawUrl = (formData.get("url") || "").trim();
      const redirectBack = formData.get("redirect") || "/stats?report=schedule";

      if (!name || !rawDate || !rawUrl) {
        return new Response("Не заполнены обязательные поля (Название, Дата, Ссылка)", { status: 400 });
      }

      const pad = (n) => String(n).padStart(2, '0');
      let dateStr = rawDate;
      const dMatch = rawDate.match(/^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{4}))?$/);
      if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        const month = parseInt(dMatch[2], 10);
        const year = dMatch[3] ? parseInt(dMatch[3], 10) : new Date().getFullYear();
        dateStr = `${year}-${pad(month)}-${pad(day)}`;
      }

      // Default: If time is empty, open corridor for whole day (00:00 to 23:59) so all clicks match
      let startMins = 0;
      let endMins = 23 * 60 + 59;

      if (rawTime) {
        const timeRangeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
        const singleTimeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})/);
        if (timeRangeMatch) {
          startMins = parseInt(timeRangeMatch[1], 10) * 60 + parseInt(timeRangeMatch[2], 10);
          endMins = parseInt(timeRangeMatch[3], 10) * 60 + parseInt(timeRangeMatch[4], 10);
        } else if (singleTimeMatch) {
          startMins = parseInt(singleTimeMatch[1], 10) * 60 + parseInt(singleTimeMatch[2], 10);
          endMins = startMins + 60;
        }
      }

      const normUrl = normalizeUrl(rawUrl);
      const baseUrl = normUrl.split('?')[0];

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

      await env.meet.prepare(`
        INSERT INTO schedule_events (url, norm_url, base_url, event_date, start_mins, end_mins, name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(rawUrl, normUrl, baseUrl, dateStr, startMins, endMins, name).run();

      // Clean existing visits that were marked [Вне расписания] for this link & date
      try {
        await env.meet.prepare(`
          UPDATE visits 
          SET meeting = REPLACE(meeting, '[Вне расписания] ', '')
          WHERE meeting LIKE '%' || ? || '%' AND meeting LIKE '%' || ? || '%'
        `).bind(baseUrl, dateStr).run();
      } catch (e) {}

      return Response.redirect(new URL(redirectBack, request.url).toString(), 302);
    } catch (err) {
      return new Response("Ошибка при добавлении события: " + err.message, { status: 500 });
    }
  }

  // Delete event manually
  if (action === "delete_schedule_event") {
    const id = reqUrl.searchParams.get("id");
    const redirectBack = reqUrl.searchParams.get("redirect") || "/stats?report=schedule";
    if (id && env.meet) {
      await env.meet.prepare(`DELETE FROM schedule_events WHERE id = ?`).bind(id).run();
    }
    return Response.redirect(new URL(redirectBack, request.url).toString(), 302);
  }

  return null;
}

// Handle Calendar CSV Upload
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
      return new Response("Файл не выбран", { status: 400 });
    }

    const text = await file.text();
    const parsedEvents = parseCalendarCSV(text, file.name);

    if (parsedEvents.length === 0) {
      return new Response("Не удалось распознать встречи из CSV файла. Проверьте формат расписания.", { status: 400 });
    }

    const targetMonthPrefixes = Array.from(new Set(parsedEvents.map(e => e.date.slice(0, 7))));

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

// Interactive Editable Schedule Manager
export async function renderScheduleManager(env, scheduleDict, reqUrl) {
  let eventsList = [];
  if (env.meet) {
    try {
      const res = await env.meet.prepare(`SELECT * FROM schedule_events ORDER BY event_date ASC, start_mins ASC`).all();
      if (res && res.results) eventsList = res.results;
    } catch(e) {}
  }

  const successMsg = reqUrl.searchParams.get("success");

  const formatMins = (start, end) => {
    if (start === 0 && end >= 1439) return "Весь день";
    const shh = String(Math.floor(start / 60)).padStart(2, '0');
    const smm = String(start % 60).padStart(2, '0');
    const ehh = String(Math.floor(end / 60)).padStart(2, '0');
    const emm = String(end % 60).padStart(2, '0');
    return `${shh}:${smm} - ${ehh}:${emm}`;
  };

  const tableRows = eventsList.map(e => `
    <tr class="border-b border-slate-100 text-sm hover:bg-slate-50 transition-colors">
      <td class="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">${escapeHTML(e.event_date)}</td>
      <td class="px-4 py-3 text-indigo-600 font-bold whitespace-nowrap">${formatMins(e.start_mins, e.end_mins)}</td>
      <td class="px-4 py-3 font-medium text-slate-800">${escapeHTML(e.name)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs break-all max-w-xs truncate" title="${escapeHTML(e.url)}">${escapeHTML(e.url)}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <a 
          href="/stats?action=delete_schedule_event&id=${e.id}&redirect=/stats?report=schedule" 
          onclick="return confirm('Удалить мероприятие «${escapeHTML(e.name)}» из расписания?')"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 rounded-lg transition-all"
        >
          🗑️ Удалить
        </a>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Календарь пуст. Добавьте мероприятие вручную или загрузите CSV.</td></tr>`;

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
      <div class="max-w-6xl mx-auto space-y-6">
        <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight">Управление расписанием</h1>
        ${renderTabs('schedule')}

        ${successMsg ? `<div class="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-medium">✅ Расписание успешно обновлено! Загружено мероприятий: ${escapeHTML(successMsg)}</div>` : ''}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Left Column: Forms -->
          <div class="space-y-6 lg:col-span-1">
            
            <!-- 1. Add Event Form -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 class="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <span>➕</span> Добавить встречу вручную
              </h2>
              <p class="text-xs text-slate-500 mb-4">Добавьте единичное или внеплановое мероприятие в официальное расписание.</p>

              <form method="POST" action="/stats?action=add_schedule_event" class="space-y-3">
                <input type="hidden" name="redirect" value="/stats?report=schedule">

                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Название встречи</label>
                  <input type="text" name="name" required placeholder="Например: Праздничная Учительская" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Дата</label>
                    <input type="date" name="date" required class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Время (МСК)</label>
                    <input type="text" name="time" placeholder="15:00 - 16:30" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ссылка на встречу (URL)</label>
                  <input type="text" name="url" required placeholder="https://vk.com/call/join/..." class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>

                <button type="submit" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all active:scale-95">
                  Добавить в расписание
                </button>
              </form>
            </div>

            <!-- 2. CSV Uploader Card -->
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 class="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <span>📁</span> Импорт календаря (CSV)
              </h2>
              <p class="text-xs text-slate-500 mb-4">
                Загрузите CSV файл на месяц (колонки: <code>Дата,Время,Название,Ссылка</code>).
              </p>

              <form method="POST" action="/stats?action=upload_csv" enctype="multipart/form-data" class="space-y-3">
                <div class="border-2 border-dashed border-slate-300 rounded-xl p-3 text-center hover:bg-slate-50 transition-colors">
                  <input type="file" name="csvFile" accept=".csv" required class="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer">
                </div>
                <button type="submit" class="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors">
                  Импортировать CSV
                </button>
              </form>
            </div>

          </div>

          <!-- Right Column: Interactive Schedule Table -->
          <div class="lg:col-span-2">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
              <div class="p-4 bg-slate-50/70 border-b border-slate-100 flex justify-between items-center">
                <h3 class="font-bold text-slate-800">Официальные встречи в расписании</h3>
                <span class="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full">${eventsList.length} мероприятий</span>
              </div>
              <div class="overflow-y-auto max-h-[750px]">
                <table class="min-w-full text-left">
                  <thead class="bg-white sticky top-0 border-b border-slate-100 text-xs uppercase text-slate-400 font-bold z-10">
                    <tr>
                      <th class="px-4 py-3 bg-white">Дата</th>
                      <th class="px-4 py-3 bg-white">Время</th>
                      <th class="px-4 py-3 bg-white">Название</th>
                      <th class="px-4 py-3 bg-white">Ссылка</th>
                      <th class="px-4 py-3 bg-white text-right">Действие</th>
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
