import {
  MSK_OFFSET,
  htmlResponse,
  escapeHTML,
  sanitizeCSV,
  normalizeUrl,
  parseCalendarCSV,
  getFriendlyName,
  parseUA,
  signToken,
  verifyToken,
  timingSafeEqualString
} from './utils.js';
import { renderLoginPage } from './views.js';

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

// Hidden Meetings Helper
export async function getHiddenMeetingsSet(env) {
  const hiddenSet = new Set();
  if (!env.meet) return hiddenSet;
  try {
    await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
    const res = await env.meet.prepare("SELECT meeting FROM hidden_meetings").all();
    if (res && res.results) {
      res.results.forEach(r => hiddenSet.add(r.meeting));
    }
  } catch (e) {}
  return hiddenSet;
}

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

// Render All Meetings View
export async function renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  try {
    if (!env.meet) {
      return new Response("D1 database binding 'meet' missing in Worker configuration.", { status: 500 });
    }

    const searchQuery = reqUrl.searchParams.get("q")?.trim() || "";
    const hiddenSet = await getHiddenMeetingsSet(env);

    let meetings;

    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`;
      meetings = await env.meet.prepare(`
        SELECT meeting, visited_at, visitor_id
        FROM visits
        WHERE meeting LIKE ?
        ORDER BY visited_at DESC
      `).bind(searchPattern).all();
    } else {
      meetings = await env.meet.prepare(`
        SELECT meeting, visited_at, visitor_id
        FROM visits
        ORDER BY visited_at DESC
      `).all();
    }

    const currentUrlObj = new URL(reqUrl.toString());
    const pad = (n) => String(n).padStart(2, '0');

    const groupedMap = {};

    (meetings.results || []).forEach(m => {
      const isUnscheduledRecord = m.meeting.startsWith("[Вне расписания]");
      const parts = m.meeting.split("|");
      const rawMeetingUrl = parts[0];
      const rawMeetingDate = parts[1] || "";
      const customTitle = parts[2] || "";

      const cleanUrl = normalizeUrl(rawMeetingUrl.replace("[Вне расписания] ", ""));
      const baseUrl = cleanUrl.split('?')[0];

      const isHidden = hiddenSet.has(m.meeting);

      const visitDateMSK = new Date(m.visited_at + MSK_OFFSET);
      const visitDateStr = `${visitDateMSK.getUTCFullYear()}-${pad(visitDateMSK.getUTCMonth() + 1)}-${pad(visitDateMSK.getUTCDate())}`;

      const displayDateStr = rawMeetingDate || visitDateStr;
      const prettyDate = displayDateStr.split("-").reverse().join(".");

      let matchedEventName = null;
      if (scheduleEventsList && scheduleEventsList.length > 0) {
        for (const evt of scheduleEventsList) {
          const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
          const evtBase = evtNorm.split('?')[0];

          if ((evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawMeetingUrl) && evt.event_date === displayDateStr) {
            matchedEventName = evt.name;
            break;
          }
        }
      }

      if (!matchedEventName) {
        matchedEventName = getFriendlyName(scheduleDict, cleanUrl, displayDateStr);
      }

      let displayTitle = "";
      if (customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
        displayTitle = customTitle;
      } else if (matchedEventName) {
        displayTitle = matchedEventName;
      } else {
        displayTitle = prettyDate;
      }

      const isOfficiallyMatched = Boolean(!isUnscheduledRecord && (matchedEventName || (customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled")));

      const groupKey = `${isOfficiallyMatched ? 'official' : 'unscheduled'}|${cleanUrl}|${displayDateStr}`;

      if (!groupedMap[groupKey]) {
        groupedMap[groupKey] = {
          rawMeeting: m.meeting,
          cleanUrl,
          displayTitle,
          prettyDate,
          visits: 0,
          uniqueUsersSet: new Set(),
          last_visit: m.visited_at,
          isHidden,
          isUnscheduledTag: !isOfficiallyMatched,
          isMatched: isOfficiallyMatched
        };
      }

      groupedMap[groupKey].visits++;
      if (m.visitor_id) groupedMap[groupKey].uniqueUsersSet.add(m.visitor_id);
      if (m.visited_at > groupedMap[groupKey].last_visit) {
        groupedMap[groupKey].last_visit = m.visited_at;
      }
    });

    const scheduledList = [];
    const unscheduledList = [];

    Object.values(groupedMap).forEach(g => {
      const lastActive = new Date(g.last_visit + MSK_OFFSET).toISOString().slice(0, 10);
      const toggleActionUrl = `/stats?action=toggle_hide&meeting=${encodeURIComponent(g.rawMeeting)}&redirect=${encodeURIComponent(currentUrlObj.pathname + currentUrlObj.search)}`;

      const rowObj = {
        rawMeeting: g.rawMeeting,
        cleanUrl: g.cleanUrl,
        displayTitle: g.displayTitle,
        prettyDate: g.prettyDate,
        visits: g.visits,
        unique_users: g.uniqueUsersSet.size,
        lastActive,
        isHidden: g.isHidden,
        isUnscheduledTag: g.isUnscheduledTag,
        toggleActionUrl,
        isMatched: g.isMatched
      };

      if (!g.isHidden && g.isMatched) {
        scheduledList.push(rowObj);
      } else {
        unscheduledList.push(rowObj);
      }
    });

    const renderRow = (m) => `
      <tr class="hover:bg-slate-50/70 transition-colors border-b border-slate-100 last:border-0 ${m.isHidden ? 'bg-slate-50/50 opacity-75' : ''}">
        <td class="px-6 py-4">
          <a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="group block">
            <div class="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors max-w-lg break-words leading-snug flex items-center gap-2">
              ${escapeHTML(m.displayTitle)}
              ${m.isUnscheduledTag ? '<span class="px-2 py-0.5 text-[10px] uppercase font-bold bg-amber-100 text-amber-800 rounded-md">Вне расписания</span>' : ''}
              ${m.isHidden ? '<span class="px-2 py-0.5 text-[10px] uppercase font-bold bg-slate-200 text-slate-700 rounded-md">Скрыто</span>' : ''}
            </div>
            <div class="text-xs text-slate-400 mt-1 font-mono truncate max-w-md">${escapeHTML(m.cleanUrl)}</div>
          </a>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
            ${m.visits} кликов
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
          ${m.unique_users} уник.
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
          ${m.lastActive} (МСК)
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
          <div class="flex items-center justify-end gap-3">
            <a href="${m.toggleActionUrl}" title="${m.isHidden ? 'Включить обратно в отчеты' : 'Исключить из отчетов'}" class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${m.isHidden ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-700'}">
              ${m.isHidden ? '🙈 Скрыто (Показать)' : '👁️ В отчетах (Скрыть)'}
            </a>
            <a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="text-indigo-600 hover:text-indigo-900 font-semibold inline-flex items-center gap-1">
              Детали →
            </a>
          </div>
        </td>
      </tr>
    `;

    const scheduledRowsHtml = scheduledList.map(renderRow).join("");
    const unscheduledRowsHtml = unscheduledList.map(renderRow).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="ru" class="bg-slate-50 text-slate-900 h-full">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Все встречи — Аналитика</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="min-h-full py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-6xl mx-auto space-y-8">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-4">
            <div>
              <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                📊 <span>Панель управления</span>
              </h1>
              <p class="text-sm text-slate-500 mt-1">Отслеживание и мониторинг переходов по ссылкам встреч (Время МСК)</p>
            </div>
            <div class="bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-md text-sm font-medium self-start sm:self-center">
              Официальных встреч: ${scheduledList.length}
            </div>
          </div>

          ${renderTabs('all')}

          <form method="GET" action="/stats" class="mb-6 relative">
            <input type="text" name="q" value="${escapeHTML(searchQuery)}" placeholder="Поиск по названию или дате..." class="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-sm">
            <svg class="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </form>

          <!-- Primary Table: Official Scheduled Meetings -->
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-4 bg-indigo-50/50 border-b border-indigo-100/60 flex justify-between items-center">
              <h2 class="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>🗓️</span> Официальные расписанные встречи
              </h2>
              <span class="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-full">${scheduledList.length} активных</span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-slate-100">
                <thead class="bg-slate-50/70 text-slate-500">
                  <tr>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider w-2/5">Встреча / Мероприятие</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Всего посещений</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Уникальные</th>
                    <th scope="col" class="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Последняя активность</th>
                    <th scope="col" class="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">Статус / Действия</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-slate-100">
                  ${scheduledRowsHtml.length ? scheduledRowsHtml : `
                    <tr>
                      <td colspan="5" class="px-6 py-12 text-center text-slate-400">
                        📭 Официальные встречи не найдены
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Secondary Table: Unscheduled & Hidden Clicks Section -->
          ${unscheduledList.length > 0 ? `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden opacity-90">
              <div class="p-4 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h2 class="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span>🧪</span> Вне расписания и скрытые переходы
                  </h2>
                  <p class="text-xs text-slate-500 mt-0.5">Тестовые клики, переходы вне временного интервала и скрытые записи</p>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 bg-slate-200 text-slate-700 rounded-full">${unscheduledList.length} записей</span>
              </div>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-100">
                  <thead class="bg-slate-50/50 text-slate-400">
                    <tr>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider w-2/5">Ссылка / Запись</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Всего кликов</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Уникальные</th>
                      <th scope="col" class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">Последняя активность</th>
                      <th scope="col" class="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider">Действия</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100">
                    ${unscheduledRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

        </div>
      </body>
      </html>
    `;

    return htmlResponse(html);
  } catch (err) {
    return new Response("D1 Database error: Make sure the visits table exists in D1.", { status: 500 });
  }
}

// Monthly Ranking View
export async function renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  let targetMonth = reqUrl.searchParams.get("month");
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    const now = new Date(Date.now() + MSK_OFFSET);
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    targetMonth = `${now.getUTCFullYear()}-${m}`;
  }

  const [yearStr, monthStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = Date.UTC(year, month - 1, 1) - MSK_OFFSET;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endOfMonth = Date.UTC(nextMonthYear, nextMonth - 1, 1) - 1 - MSK_OFFSET;

  let rankingRes;
  let firstVisitsRes;
  try {
    await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
    rankingRes = await env.meet.prepare(`
      SELECT 
        v.meeting, 
        v.visited_at,
        v.visitor_id
      FROM visits v
      WHERE v.visited_at >= ? AND v.visited_at <= ?
        AND v.meeting NOT IN (SELECT meeting FROM hidden_meetings)
        AND v.meeting NOT LIKE '[Вне расписания]%'
    `).bind(startOfMonth, endOfMonth).all();

    firstVisitsRes = await env.meet.prepare(`
      SELECT visitor_id, MIN(visited_at) as first_visited
      FROM visits
      GROUP BY visitor_id
    `).all();
  } catch (err) {
    return new Response("Database query error generating ranking.", { status: 500 });
  }

  const firstVisitMap = new Map();
  (firstVisitsRes.results || []).forEach(r => firstVisitMap.set(r.visitor_id, r.first_visited));

  const pad = (n) => String(n).padStart(2, '0');
  const meetingStats = {};
  const globalUniquesSet = new Set();
  const globalNewSet = new Set();

  (rankingRes.results || []).forEach(v => {
    const parts = v.meeting.split("|");
    const rawUrl = parts[0];
    const rawDate = parts[1] || "";
    const customTitle = parts[2] || "";

    const cleanUrl = normalizeUrl(rawUrl.replace("[Вне расписания] ", ""));
    const baseUrl = cleanUrl.split('?')[0];

    const visitDateMSK = new Date(v.visited_at + MSK_OFFSET);
    const visitDateStr = `${visitDateMSK.getUTCFullYear()}-${pad(visitDateMSK.getUTCMonth() + 1)}-${pad(visitDateMSK.getUTCDate())}`;

    const displayDateStr = rawDate || visitDateStr;

    let matchedName = null;
    if (scheduleEventsList && scheduleEventsList.length > 0) {
      for (const evt of scheduleEventsList) {
        const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
        const evtBase = evtNorm.split('?')[0];

        if ((evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawUrl) && evt.event_date === displayDateStr) {
          matchedName = evt.name;
          break;
        }
      }
    }

    if (!matchedName && customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
      matchedName = customTitle;
    }

    const displayName = matchedName || getFriendlyName(scheduleDict, cleanUrl, displayDateStr) || cleanUrl;
    const key = `${cleanUrl}|${displayDateStr}|${displayName}`;

    if (!meetingStats[key]) {
      meetingStats[key] = {
        meeting: key,
        url: cleanUrl,
        date: displayDateStr,
        name: displayName,
        total_visits: 0,
        unique_users: new Set(),
        new_users: new Set()
      };
    }
    meetingStats[key].total_visits++;
    if (v.visitor_id) {
      meetingStats[key].unique_users.add(v.visitor_id);
      globalUniquesSet.add(v.visitor_id);

      const firstVisited = firstVisitMap.get(v.visitor_id);
      if (firstVisited && firstVisited >= startOfMonth && firstVisited <= endOfMonth) {
        meetingStats[key].new_users.add(v.visitor_id);
        globalNewSet.add(v.visitor_id);
      }
    }
  });

  const results = Object.values(meetingStats).map(m => ({
    meeting: m.meeting,
    url: m.url,
    total_visits: m.total_visits,
    unique_users: m.unique_users.size,
    new_users: m.new_users.size,
    name: m.name,
    date: m.date
  })).sort((a, b) => b.unique_users - a.unique_users || b.total_visits - a.total_visits);

  let totalVisits = 0;
  results.forEach(r => { totalVisits += r.total_visits || 0; });

  const totalUniques = globalUniquesSet.size;
  const totalNewUsers = globalNewSet.size;
  const totalReturning = Math.max(0, totalUniques - totalNewUsers);

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const prettyMonth = `${monthNames[month-1]} ${year}`;

  const tableRows = results.map((r, idx) => {
    const rank = idx + 1;
    const prettyDate = r.date ? r.date.split("-").reverse().join(".") : "—";

    const newUsers = r.new_users || 0;
    const returningUsers = Math.max(0, r.unique_users - newUsers);
    const percentNew = r.unique_users > 0 ? Math.round((newUsers / r.unique_users) * 100) : 0;

    let badgeClass = "bg-slate-100 text-slate-600 font-bold";
    let badgeText = `#${rank}`;
    if (rank === 1) { badgeClass = "bg-amber-100 text-amber-800 font-extrabold border border-amber-300"; badgeText = "🥇 1"; }
    else if (rank === 2) { badgeClass = "bg-slate-200 text-slate-800 font-extrabold border border-slate-300"; badgeText = "🥈 2"; }
    else if (rank === 3) { badgeClass = "bg-amber-700/10 text-amber-900 font-extrabold border border-amber-800/20"; badgeText = "🥉 3"; }

    return `
      <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0 text-sm">
        <td class="px-4 py-4 whitespace-nowrap text-center">
          <span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs ${badgeClass}">
            ${badgeText}
          </span>
        </td>
        <td class="px-6 py-4">
          <a href="/stats?meeting=${encodeURIComponent(r.meeting)}" class="group block">
            <div class="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors max-w-lg break-words leading-snug">${escapeHTML(r.name)}</div>
            <div class="text-xs text-slate-400 mt-1 font-mono truncate max-w-md">${escapeHTML(r.url)}</div>
          </a>
        </td>
        <td class="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-medium text-center">
          ${escapeHTML(prettyDate)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-center">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            ${r.unique_users} уник.
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-center font-medium text-slate-600">
          ${r.total_visits}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-center">
          <span class="font-bold text-emerald-600">${newUsers}</span>
          <span class="text-xs text-slate-400 font-normal">(${percentNew}%)</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-center font-medium text-amber-600">
          ${returningUsers}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-xs">
          <a href="/stats?meeting=${encodeURIComponent(r.meeting)}" class="text-indigo-600 hover:text-indigo-900 font-semibold inline-flex items-center gap-1">
            Детали →
          </a>
        </td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="bg-slate-50 text-slate-900 h-full">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Рейтинг встреч за месяц</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="min-h-full py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-4">
          <div>
            <h1 class="text-3xl font-extrabold tracking-tight text-slate-900">Рейтинг встреч за месяц</h1>
            <p class="text-sm text-slate-500 mt-1">Отсортировано по числу уникальных участников (${prettyMonth})</p>
          </div>
        </div>

        ${renderTabs('ranking')}

        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div class="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <form method="GET" class="flex items-center m-0">
              <input type="hidden" name="report" value="monthly_ranking">
              <input type="month" name="month" value="${targetMonth}" onchange="this.form.submit()" class="bg-transparent border-none text-sm font-semibold text-slate-700 focus:ring-0 cursor-pointer outline-none">
            </form>
            <div class="w-px h-6 bg-slate-200 mx-1"></div>
            <a href="/stats?report=monthly_ranking&month=${targetMonth}&export=csv" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 font-semibold text-sm hover:bg-indigo-50 rounded-lg transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Экспорт CSV
            </a>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Всего встреч</div>
            <div class="text-3xl font-extrabold text-slate-900 mt-2">${results.length}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Уникальных участников</div>
            <div class="text-3xl font-extrabold text-indigo-600 mt-2">${totalUniques}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Всего кликов</div>
            <div class="text-3xl font-extrabold text-slate-800 mt-2">${totalVisits}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">🟢 Новых (впервые)</div>
            <div class="text-3xl font-extrabold text-emerald-600 mt-2">${totalNewUsers}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">🟡 Вернувшихся</div>
            <div class="text-3xl font-extrabold text-amber-600 mt-2">${totalReturning}</div>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50/80 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th scope="col" class="px-4 py-4 text-center w-16">Ранг</th>
                  <th scope="col" class="px-6 py-4 text-left">Встреча (Мероприятие)</th>
                  <th scope="col" class="px-4 py-4 text-center">Дата</th>
                  <th scope="col" class="px-6 py-4 text-center bg-indigo-50/50 text-indigo-900">Уникальные участники</th>
                  <th scope="col" class="px-6 py-4 text-center">Всего кликов</th>
                  <th scope="col" class="px-6 py-4 text-center">Новые</th>
                  <th scope="col" class="px-6 py-4 text-center">Вернувшиеся</th>
                  <th scope="col" class="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-slate-100">
                ${tableRows.length ? tableRows : `
                  <tr>
                    <td colspan="8" class="px-6 py-16 text-center text-slate-400">
                      📭 Нет данных о встречах за выбранный месяц
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return htmlResponse(html);
}

// Monthly Ranking CSV Export Handler
export async function handleMonthlyRankingCSVExport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  let targetMonth = reqUrl.searchParams.get("month");
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return new Response("Invalid month parameter", { status: 400 });
  }

  const [yearStr, monthStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = Date.UTC(year, month - 1, 1) - MSK_OFFSET;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endOfMonth = Date.UTC(nextMonthYear, nextMonth - 1, 1) - 1 - MSK_OFFSET;

  let rankingRes;
  let firstVisitsRes;
  try {
    await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
    rankingRes = await env.meet.prepare(`
      SELECT 
        v.meeting, 
        v.visited_at,
        v.visitor_id
      FROM visits v
      WHERE v.visited_at >= ? AND v.visited_at <= ?
        AND v.meeting NOT IN (SELECT meeting FROM hidden_meetings)
        AND v.meeting NOT LIKE '[Вне расписания]%'
    `).bind(startOfMonth, endOfMonth).all();

    firstVisitsRes = await env.meet.prepare(`
      SELECT visitor_id, MIN(visited_at) as first_visited
      FROM visits
      GROUP BY visitor_id
    `).all();
  } catch (err) {
    return new Response("Database error generating CSV ranking.", { status: 500 });
  }

  const firstVisitMap = new Map();
  (firstVisitsRes.results || []).forEach(r => firstVisitMap.set(r.visitor_id, r.first_visited));

  const pad = (n) => String(n).padStart(2, '0');
  const meetingStats = {};

  (rankingRes.results || []).forEach(v => {
    const parts = v.meeting.split("|");
    const rawUrl = parts[0];
    const rawDate = parts[1] || "";
    const customTitle = parts[2] || "";

    const cleanUrl = normalizeUrl(rawUrl.replace("[Вне расписания] ", ""));
    const baseUrl = cleanUrl.split('?')[0];

    const visitDateMSK = new Date(v.visited_at + MSK_OFFSET);
    const visitDateStr = `${visitDateMSK.getUTCFullYear()}-${pad(visitDateMSK.getUTCMonth() + 1)}-${pad(visitDateMSK.getUTCDate())}`;

    const displayDateStr = rawDate || visitDateStr;

    let matchedName = null;
    if (scheduleEventsList && scheduleEventsList.length > 0) {
      for (const evt of scheduleEventsList) {
        const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
        const evtBase = evtNorm.split('?')[0];

        if ((evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawUrl) && evt.event_date === displayDateStr) {
          matchedName = evt.name;
          break;
        }
      }
    }

    if (!matchedName && customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
      matchedName = customTitle;
    }

    const displayName = matchedName || getFriendlyName(scheduleDict, cleanUrl, displayDateStr) || cleanUrl;
    const key = `${cleanUrl}|${displayDateStr}|${displayName}`;

    if (!meetingStats[key]) {
      meetingStats[key] = {
        meeting: key,
        url: cleanUrl,
        date: displayDateStr,
        name: displayName,
        total_visits: 0,
        unique_users: new Set(),
        new_users: new Set()
      };
    }
    meetingStats[key].total_visits++;
    if (v.visitor_id) {
      meetingStats[key].unique_users.add(v.visitor_id);

      const firstVisited = firstVisitMap.get(v.visitor_id);
      if (firstVisited && firstVisited >= startOfMonth && firstVisited <= endOfMonth) {
        meetingStats[key].new_users.add(v.visitor_id);
      }
    }
  });

  const results = Object.values(meetingStats).map(m => ({
    meeting: m.meeting,
    url: m.url,
    total_visits: m.total_visits,
    unique_users: m.unique_users.size,
    new_users: m.new_users.size,
    name: m.name,
    date: m.date
  })).sort((a, b) => b.unique_users - a.unique_users || b.total_visits - a.total_visits);

  let csvContent = "Rank,Meeting Name,Date,Unique Visitors,Total Clicks,New Visitors,Returning Visitors,% New,Meeting URL\n";
  
  results.forEach((r, idx) => {
    const prettyDate = r.date ? r.date.split("-").reverse().join(".") : "";
    const newUsers = r.new_users || 0;
    const returningUsers = Math.max(0, r.unique_users - newUsers);
    const percentNew = r.unique_users > 0 ? Math.round((newUsers / r.unique_users) * 100) : 0;

    csvContent += `${idx + 1},${sanitizeCSV(r.name)},${sanitizeCSV(prettyDate)},${sanitizeCSV(r.unique_users)},${sanitizeCSV(r.total_visits)},${sanitizeCSV(newUsers)},${sanitizeCSV(returningUsers)},${sanitizeCSV(percentNew + '%')},${sanitizeCSV(r.url)}\n`;
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-ranking-${targetMonth}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}

// Monthly Report View
export async function renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  let targetMonth = reqUrl.searchParams.get("month");
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    const now = new Date(Date.now() + MSK_OFFSET);
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    targetMonth = `${now.getUTCFullYear()}-${m}`;
  }
  
  const [yearStr, monthStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = Date.UTC(year, month - 1, 1) - MSK_OFFSET;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endOfMonth = Date.UTC(nextMonthYear, nextMonth - 1, 1) - 1 - MSK_OFFSET;

  await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();

  const dailyLogsRes = await env.meet.prepare(`
    SELECT visited_at, meeting, visitor_id 
    FROM visits 
    WHERE visited_at >= ? AND visited_at <= ?
      AND meeting NOT IN (SELECT meeting FROM hidden_meetings)
      AND meeting NOT LIKE '[Вне расписания]%'
  `).bind(startOfMonth, endOfMonth).all();

  const firstVisitsRes = await env.meet.prepare(`
    SELECT visitor_id, MIN(visited_at) as first_visited
    FROM visits
    GROUP BY visitor_id
  `).all();

  const firstVisitMap = new Map();
  (firstVisitsRes.results || []).forEach(r => firstVisitMap.set(r.visitor_id, r.first_visited));

  const pad = (n) => String(n).padStart(2, '0');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthPadded = pad(month);
  const chartLabels = Array.from({length: daysInMonth}, (_, i) => `${pad(i + 1)}.${monthPadded}`);

  const dailyStats = Array.from({length: daysInMonth}, () => ({}));
  const meetingAggregates = {};
  let totalVisits = 0;
  const globalUniquesSet = new Set();
  const globalNewSet = new Set();

  (dailyLogsRes.results || []).forEach(log => {
    const parts = log.meeting.split("|");
    const rawUrl = parts[0];
    const rawDate = parts[1] || "";
    const customTitle = parts[2] || "";

    const cleanUrl = normalizeUrl(rawUrl.replace("[Вне расписания] ", ""));
    const baseUrl = cleanUrl.split('?')[0];

    const d = new Date(log.visited_at + MSK_OFFSET); 
    const dayIndex = d.getUTCDate() - 1;
    const visitDateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    const displayDateStr = rawDate || visitDateStr;

    let matchedName = null;
    if (scheduleEventsList && scheduleEventsList.length > 0) {
      for (const evt of scheduleEventsList) {
        const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
        const evtBase = evtNorm.split('?')[0];

        if ((evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawUrl) && evt.event_date === displayDateStr) {
          matchedName = evt.name;
          break;
        }
      }
    }

    if (!matchedName && customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
      matchedName = customTitle;
    }

    const displayName = matchedName || getFriendlyName(scheduleDict, cleanUrl, displayDateStr) || cleanUrl;

    if (dayIndex >= 0 && dayIndex < daysInMonth) {
      const eventKey = `${cleanUrl}|${displayDateStr}|${displayName}`;

      if (!dailyStats[dayIndex][eventKey]) {
        dailyStats[dayIndex][eventKey] = new Set();
      }
      if (log.visitor_id) {
        dailyStats[dayIndex][eventKey].add(log.visitor_id);
        globalUniquesSet.add(log.visitor_id);

        const firstVisited = firstVisitMap.get(log.visitor_id);
        if (firstVisited && firstVisited >= startOfMonth && firstVisited <= endOfMonth) {
          globalNewSet.add(log.visitor_id);
        }
      }

      if (!meetingAggregates[eventKey]) {
        meetingAggregates[eventKey] = { meeting: eventKey, name: displayName, total: 0 };
      }
      meetingAggregates[eventKey].total++;
      totalVisits++;
    }
  });

  const sortedAggregates = Object.values(meetingAggregates).sort((a, b) => b.total - a.total);
  const totalMeetings = sortedAggregates.length;

  const globalUniques = globalUniquesSet.size;
  const globalNew = globalNewSet.size;
  const globalReturning = Math.max(0, globalUniques - globalNew);

  const TOP_N = 5;
  const topMeetings = sortedAggregates.slice(0, TOP_N);
  const bottomMeetings = sortedAggregates.length > TOP_N * 2 
    ? [...sortedAggregates].reverse().slice(0, TOP_N)
    : [];

  const sortedDailyStats = dailyStats.map(dayObj => {
    return Object.entries(dayObj)
      .map(([meetingKey, visitorSet]) => ({ 
        meeting: meetingKey, 
        count: visitorSet.size,
        name: meetingKey.split('|')[2] || meetingKey
      }))
      .sort((a, b) => b.count - a.count);
  });

  const maxMeetingsInADay = Math.max(...sortedDailyStats.map(d => d.length), 1);
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6'];
  const chartDatasets = [];

  for (let i = 0; i < maxMeetingsInADay; i++) {
    const dataPoints = [];
    for (let day = 0; day < daysInMonth; day++) {
      const slotData = sortedDailyStats[day][i];
      if (slotData) {
        dataPoints.push({
          x: chartLabels[day],
          y: slotData.count,
          meetingId: slotData.meeting,
          meetingName: slotData.name
        });
      } else {
        dataPoints.push({ x: chartLabels[day], y: null, meetingId: null, meetingName: null });
      }
    }
    
    chartDatasets.push({
      label: `Слот ${i+1}`,
      data: dataPoints,
      backgroundColor: colors[i % colors.length],
      borderRadius: 4,
      parsing: { xAxisKey: 'x', yAxisKey: 'y' }
    });
  }

  const topRowsHtml = topMeetings.map((m, i) => `
    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-2">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">${i+1}</div>
        <div class="truncate">
          <a href="/stats?meeting=${encodeURIComponent(m.meeting)}" class="text-sm font-semibold text-slate-800 hover:text-indigo-600 truncate block">${escapeHTML(m.name)}</a>
        </div>
      </div>
      <div class="text-sm font-bold text-slate-700 shrink-0">${m.total} <span class="text-xs text-slate-400 font-normal">клик.</span></div>
    </div>
  `).join("") || `<div class="text-sm text-slate-400 text-center py-4">Нет данных</div>`;

  const bottomRowsHtml = bottomMeetings.map((m, i) => `
    <div class="flex items-center justify-between p-3 bg-red-50/50 rounded-lg mb-2">
      <div class="flex items-center gap-3 overflow-hidden">
        <div class="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">!</div>
        <div class="truncate">
           <a href="/stats?meeting=${encodeURIComponent(m.meeting)}" class="text-sm font-semibold text-slate-800 hover:text-indigo-600 truncate block">${escapeHTML(m.name)}</a>
        </div>
      </div>
      <div class="text-sm font-bold text-slate-700 shrink-0">${m.total} <span class="text-xs text-slate-400 font-normal">клик.</span></div>
    </div>
  `).join("") || `<div class="text-sm text-slate-400 text-center py-4">Данных недостаточно</div>`;

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const prettyMonth = `${monthNames[month-1]} ${year}`;

  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="bg-slate-50 text-slate-900 h-full">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Отчет за месяц - Аналитика</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="min-h-full py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto space-y-6">
        <h1 class="text-3xl font-extrabold text-slate-900 mb-6">Дашборд за месяц</h1>
        ${renderTabs('monthly')}

        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div class="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <form method="GET" class="flex items-center m-0">
              <input type="hidden" name="report" value="monthly">
              <input type="month" name="month" value="${targetMonth}" onchange="this.form.submit()" class="bg-transparent border-none text-sm font-semibold text-slate-700 focus:ring-0 cursor-pointer outline-none">
            </form>
            <div class="w-px h-6 bg-slate-200 mx-1"></div>
            <a href="/stats?report=monthly&month=${targetMonth}&export=csv" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 font-semibold text-sm hover:bg-indigo-50 rounded-lg transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Скачать CSV
            </a>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <div class="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Сводный дашборд (Московское время)</div>
            <h2 class="text-2xl font-bold text-slate-900 break-all">${prettyMonth}</h2>
          </div>
          <div class="text-4xl">📅</div>
        </div>

        <!-- 5 Stat Cards Layout -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Всего переходов</div>
            <div class="text-3xl font-extrabold text-indigo-600 mt-2">${totalVisits}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Уникальных участников</div>
            <div class="text-3xl font-extrabold text-slate-900 mt-2">${globalUniques}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">🟢 Новых (впервые)</div>
            <div class="text-3xl font-extrabold text-emerald-600 mt-2">${globalNew}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">🟡 Вернувшихся</div>
            <div class="text-3xl font-extrabold text-amber-600 mt-2">${globalReturning}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Активных встреч</div>
            <div class="text-3xl font-extrabold text-slate-800 mt-2">${totalMeetings}</div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="text-base font-bold text-slate-900 mb-4">Уникальные посетители по дням (МСК)</h3>
          <div class="h-[400px]">
            <canvas id="monthlyTrendChart"></canvas>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 class="text-base font-bold text-slate-900 mb-1">🔥 Топ-5 встреч</h3>
            <p class="text-xs text-slate-500 mb-4">Самые посещаемые встречи месяца</p>
            <div>${topRowsHtml}</div>
          </div>

          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 class="text-base font-bold text-slate-900 mb-1">📉 Низкий трафик</h3>
            <p class="text-xs text-slate-500 mb-4">Встречи с наименьшей активностью</p>
            <div>${bottomRowsHtml}</div>
          </div>
        </div>
      </div>

      <script>
        let trendChartObj = new Chart(document.getElementById('monthlyTrendChart').getContext('2d'), {
          type: 'bar',
          data: {
            labels: ${JSON.stringify(chartLabels)},
            datasets: ${JSON.stringify(chartDatasets)}
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const raw = context.raw;
                    if (!raw || raw.y === null) return null;
                    return raw.meetingName + ': ' + raw.y + ' уник.';
                  }
                }
              }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
              x: { grid: { display: false } }
            },
            onClick: (e, elements) => {
              if (elements.length > 0) {
                const el = elements[0];
                const dataPoint = trendChartObj.data.datasets[el.datasetIndex].data[el.index];
                if (dataPoint && dataPoint.meetingId) {
                  window.location.href = '/stats?meeting=' + encodeURIComponent(dataPoint.meetingId);
                }
              }
            }
          }
        });
      </script>
    </body>
    </html>
  `;

  return htmlResponse(html);
}

// Monthly CSV Export Handler
export async function handleMonthlyCSVExport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  let targetMonth = reqUrl.searchParams.get("month");
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return new Response("Invalid month parameter", { status: 400 });
  }
  
  const [yearStr, monthStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const startOfMonth = Date.UTC(year, month - 1, 1) - MSK_OFFSET;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endOfMonth = Date.UTC(nextMonthYear, nextMonth - 1, 1) - 1 - MSK_OFFSET;

  let dailyLogsRes;
  try {
    await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
    dailyLogsRes = await env.meet.prepare(`
      SELECT visited_at, meeting, visitor_id 
      FROM visits 
      WHERE visited_at >= ? AND visited_at <= ?
        AND meeting NOT IN (SELECT meeting FROM hidden_meetings)
        AND meeting NOT LIKE '[Вне расписания]%'
    `).bind(startOfMonth, endOfMonth).all();
  } catch (err) {
    return new Response("Database error generating CSV report.", { status: 500 });
  }

  const pad = (n) => String(n).padStart(2, '0');
  const meetingAggregates = {};

  (dailyLogsRes.results || []).forEach(log => {
    const parts = log.meeting.split("|");
    const rawUrl = parts[0];
    const rawDate = parts[1] || "";
    const customTitle = parts[2] || "";

    const cleanUrl = normalizeUrl(rawUrl.replace("[Вне расписания] ", ""));
    const baseUrl = cleanUrl.split('?')[0];

    const d = new Date(log.visited_at + MSK_OFFSET); 
    const visitDateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    const displayDateStr = rawDate || visitDateStr;

    let matchedName = null;
    if (scheduleEventsList && scheduleEventsList.length > 0) {
      for (const evt of scheduleEventsList) {
        const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
        const evtBase = evtNorm.split('?')[0];

        if ((evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawUrl) && evt.event_date === displayDateStr) {
          matchedName = evt.name;
          break;
        }
      }
    }

    if (!matchedName && customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
      matchedName = customTitle;
    }

    const displayName = matchedName || getFriendlyName(scheduleDict, cleanUrl, displayDateStr) || cleanUrl;
    const eventKey = `${cleanUrl}|${displayDateStr}|${displayName}`;

    if (!meetingAggregates[eventKey]) {
      meetingAggregates[eventKey] = { name: displayName, total: 0, uniques: new Set() };
    }
    meetingAggregates[eventKey].total++;
    if (log.visitor_id) meetingAggregates[eventKey].uniques.add(log.visitor_id);
  });

  let csvContent = "Meeting Name / URL,Total Visits,Unique Visitors\n";
  Object.values(meetingAggregates).forEach(r => {
    csvContent += `${sanitizeCSV(r.name)},${sanitizeCSV(r.total)},${sanitizeCSV(r.uniques.size)}\n`;
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-report-${targetMonth}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}

// Single Meeting Metrics Gathering
export async function gatherSingleMeetingMetrics(meetingId, env) {
  let recentVisitsRes;
  try {
    recentVisitsRes = await env.meet.prepare(`
      SELECT visitor_id, visited_at, user_agent, ip_hash, country, source
      FROM visits WHERE meeting = ? ORDER BY visited_at DESC LIMIT 10000
    `).bind(meetingId).all();
  } catch(e) {
    try {
      recentVisitsRes = await env.meet.prepare(`
        SELECT visitor_id, visited_at, user_agent, ip_hash, country
        FROM visits WHERE meeting = ? ORDER BY visited_at DESC LIMIT 10000
      `).bind(meetingId).all();
    } catch(err) {
      recentVisitsRes = await env.meet.prepare(`
        SELECT visitor_id, visited_at, user_agent, ip_hash
        FROM visits WHERE meeting = ? ORDER BY visited_at DESC LIMIT 10000
      `).bind(meetingId).all();
    }
  }

  const [totalRes, userStatsRes] = await Promise.all([
    env.meet.prepare(`SELECT COUNT(*) AS total FROM visits WHERE meeting = ?`).bind(meetingId).first(),
    env.meet.prepare(`
      SELECT 
        COUNT(DISTINCT v.visitor_id) AS unique_users,
        COUNT(DISTINCT CASE WHEN v.visited_at = g.first_visited THEN v.visitor_id END) AS new_users
      FROM visits v
      INNER JOIN (
        SELECT visitor_id, MIN(visited_at) AS first_visited
        FROM visits
        GROUP BY visitor_id
      ) g ON v.visitor_id = g.visitor_id
      WHERE v.meeting = ?
    `).bind(meetingId).first()
  ]);

  const total = totalRes?.total || 0;
  const unique = userStatsRes?.unique_users || 0;
  const newUsers = userStatsRes?.new_users || 0;
  const returningUsers = Math.max(0, unique - newUsers);

  const osCount = {};
  const browserCount = {};
  const countryCount = {};
  const sourceCount = {};

  const visitsData = recentVisitsRes.results || [];
  
  let firstTs, lastTs;
  if (visitsData.length > 0) {
    lastTs = visitsData[0].visited_at;
    firstTs = visitsData[visitsData.length - 1].visited_at;
  } else {
    lastTs = Date.now();
    firstTs = lastTs - (24 * 3600 * 1000);
  }

  const spanMs = Math.max(lastTs - firstTs, 60 * 1000);
  const startTs = firstTs - spanMs; 
  const endTs = lastTs + spanMs;   
  const displaySpan = endTs - startTs;

  let stepMs, labelType, chartTitle;
  if (displaySpan <= 2 * 3600 * 1000) { 
    stepMs = 60 * 1000; 
    labelType = "1min";
    chartTitle = "Динамика подключения (Детальная поминутная, МСК)";
  } else if (displaySpan <= 6 * 3600 * 1000) {
    stepMs = 5 * 60 * 1000;
    labelType = "5min";
    chartTitle = "Динамика входа (5-минутные интервалы, МСК)";
  } else if (displaySpan <= 24 * 3600 * 1000) {
    stepMs = 15 * 60 * 1000;
    labelType = "15min";
    chartTitle = "Динамика за сутки (15-мин интервалы, МСК)";
  } else if (displaySpan <= 3 * 24 * 3600 * 1000) {
    stepMs = 3600 * 1000;
    labelType = "hour";
    chartTitle = "Почасовая активность (МСК)";
  } else {
    stepMs = 24 * 3600 * 1000;
    labelType = "day";
    chartTitle = "Активность переходов по дням (МСК)";
  }

  const timelineLabels = [];
  const timelineTotals = [];
  const timelineCumUniques = [];

  const pad = (n) => String(n).padStart(2, '0');
  const getSlotKey = (ts) => {
    const d = new Date(ts + MSK_OFFSET);
    if (labelType === "1min") return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (labelType === "5min") return `${pad(d.getUTCHours())}:${pad(Math.floor(d.getUTCMinutes() / 5) * 5)}`;
    if (labelType === "15min") return `${pad(d.getUTCHours())}:${pad(Math.floor(d.getUTCMinutes() / 15) * 15)}`;
    if (labelType === "hour") return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:00`;
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
  };

  const visitsAsc = [...visitsData].sort((a, b) => a.visited_at - b.visited_at);

  const cumulativeVisitors = new Set();
  let visitIdx = 0;

  while (visitIdx < visitsAsc.length && visitsAsc[visitIdx].visited_at < startTs) {
    if (visitsAsc[visitIdx].visitor_id) {
      cumulativeVisitors.add(visitsAsc[visitIdx].visitor_id);
    }
    visitIdx++;
  }

  for (let ts = startTs; ts <= endTs; ts += stepMs) {
    timelineLabels.push(getSlotKey(ts));
    const slotEndTs = ts + stepMs - 1;

    let slotClicks = 0;
    while (visitIdx < visitsAsc.length && visitsAsc[visitIdx].visited_at <= slotEndTs) {
      const v = visitsAsc[visitIdx];
      slotClicks++;
      if (v.visitor_id) {
        cumulativeVisitors.add(v.visitor_id);
      }
      visitIdx++;
    }

    timelineTotals.push(slotClicks);
    timelineCumUniques.push(cumulativeVisitors.size);
  }

  const parsedLogs = visitsData.map(v => {
    const { os, browser } = parseUA(v.user_agent);
    const country = v.country || "XX";
    const source = v.source || "Неизвестно";
    
    osCount[os] = (osCount[os] || 0) + 1;
    browserCount[browser] = (browserCount[browser] || 0) + 1;
    countryCount[country] = (countryCount[country] || 0) + 1;
    sourceCount[source] = (sourceCount[source] || 0) + 1;

    return {
      time: new Date(v.visited_at + MSK_OFFSET).toISOString().replace("T", " ").slice(0, 19) + " MSK",
      visitor_id: v.visitor_id,
      ip: v.ip_hash ? v.ip_hash.substring(0, 12) + "..." : "Unknown",
      os,
      browser,
      country,
      source
    };
  });

  return {
    total,
    unique,
    newUsers,
    returningUsers,
    chartTitle,
    timelineLabels,
    timelineTotals,
    timelineCumUniques,
    osLabels: Object.keys(osCount),
    osValues: Object.values(osCount),
    browserLabels: Object.keys(browserCount),
    browserValues: Object.values(browserCount),
    countryLabels: Object.keys(countryCount),
    countryValues: Object.values(countryCount),
    sourceLabels: Object.keys(sourceCount),
    sourceValues: Object.values(sourceCount),
    recentLogs: parsedLogs.slice(0, 15)
  };
}

export async function renderSingleMeeting(meetingId, env, scheduleDict) {
  const data = await gatherSingleMeetingMetrics(meetingId, env);

  const parts = meetingId.split("|");
  const origUrl = normalizeUrl(parts[0].replace("[Вне расписания] ", ""));
  const meetingDate = parts[1] || "";
  const customTitle = parts[2] || "";

  const prettyDate = meetingDate ? meetingDate.split("-").reverse().join(".") : "";
  const prettyTitle = customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled"
    ? customTitle
    : (getFriendlyName(scheduleDict, origUrl, meetingDate) || prettyDate || origUrl);

  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="bg-slate-50 text-slate-900 h-full">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Детальная статистика встреч</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="min-h-full py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <a href="/stats" class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Назад к списку
          </a>

          <a href="/stats?meeting=${encodeURIComponent(meetingId)}&export=csv" class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Экспорт CSV
          </a>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div class="text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">Детальная аналитика встречи</div>
          <h1 class="text-2xl font-bold text-slate-900 break-all">${escapeHTML(prettyTitle)}</h1>
          <p class="text-sm font-mono text-slate-400 mt-1">${escapeHTML(origUrl)}</p>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Всего переходов</div>
            <div id="statTotal" class="text-3xl font-extrabold text-slate-900 mt-2">${data.total}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Уникальных</div>
            <div id="statUnique" class="text-3xl font-extrabold text-slate-900 mt-2">${data.unique}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Новых участников</div>
            <div id="statNew" class="text-3xl font-extrabold text-indigo-600 mt-2">${data.newUsers}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Вернувшихся</div>
            <div id="statReturning" class="text-3xl font-extrabold text-emerald-600 mt-2">${data.returningUsers}</div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative">
          <h3 id="timelineTitle" class="text-base font-bold text-slate-900 mb-4">${escapeHTML(data.chartTitle)}</h3>
          <div class="h-64">
            <canvas id="timelineChart"></canvas>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <h3 class="text-base font-bold text-slate-900 mb-4">Трафик (Источники)</h3>
            <div class="h-48 flex items-center justify-center">
              <canvas id="sourceChart"></canvas>
            </div>
          </div>

          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <h3 class="text-base font-bold text-slate-900 mb-4">Операционные системы</h3>
            <div class="h-48 flex items-center justify-center">
              <canvas id="osChart"></canvas>
            </div>
          </div>

          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <h3 class="text-base font-bold text-slate-900 mb-4">Браузеры посетителей</h3>
            <div class="h-48 flex items-center justify-center">
              <canvas id="browserChart"></canvas>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="text-base font-bold text-slate-900 mb-3">Последние посещения</h3>
          <div class="overflow-x-auto w-full">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th class="pb-2 px-2">Время (МСК)</th>
                  <th class="pb-2 px-2">ID</th>
                  <th class="pb-2 px-2">Источник</th>
                  <th class="pb-2 px-2">Регион</th>
                  <th class="pb-2 px-2">ОС</th>
                  <th class="pb-2 px-2">Браузер</th>
                </tr>
              </thead>
              <tbody id="recentRowsTable" class="divide-y divide-slate-50"></tbody>
            </table>
          </div>
        </div>
      </div>

      <script>
        const initialLogs = ${JSON.stringify(data.recentLogs)};
        
        function getFlagEmoji(countryCode) {
          if (!countryCode || countryCode === "XX" || countryCode.length !== 2) return "🏳️";
          try {
            const codePoints = countryCode
              .toUpperCase()
              .split("")
              .map(char => 127397 + char.charCodeAt(0));
            return String.fromCodePoint(...codePoints);
          } catch(e) {
            return "🏳️";
          }
        }

        function updateTableRows(logs) {
          const tbody = document.getElementById('recentRowsTable');
          tbody.replaceChildren();

          if (!logs || logs.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'py-4 text-center text-slate-400 text-xs';
            td.textContent = 'Нет логов посещений';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
          }

          logs.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 last:border-0 text-xs';

            const tdTime = document.createElement('td');
            tdTime.className = 'px-2 py-2 whitespace-nowrap text-slate-500';
            tdTime.textContent = row.time;

            const tdVisitor = document.createElement('td');
            tdVisitor.className = 'px-2 py-2 whitespace-nowrap font-mono text-slate-400';
            tdVisitor.textContent = (row.visitor_id || '').substring(0, 8) + '...';

            const tdSource = document.createElement('td');
            tdSource.className = 'px-2 py-2 whitespace-nowrap text-slate-600 font-semibold';
            tdSource.textContent = row.source;

            const tdCountry = document.createElement('td');
            tdCountry.className = 'px-2 py-2 whitespace-nowrap';
            tdCountry.textContent = getFlagEmoji(row.country) + ' ' + (row.country || 'XX');

            const tdOs = document.createElement('td');
            tdOs.className = 'px-2 py-2 whitespace-nowrap';
            const osSpan = document.createElement('span');
            osSpan.className = 'inline-flex px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold';
            osSpan.textContent = row.os;
            tdOs.appendChild(osSpan);

            const tdBrowser = document.createElement('td');
            tdBrowser.className = 'px-2 py-2 whitespace-nowrap';
            const bSpan = document.createElement('span');
            bSpan.className = 'inline-flex px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold';
            bSpan.textContent = row.browser;
            tdBrowser.appendChild(bSpan);

            tr.append(tdTime, tdVisitor, tdSource, tdCountry, tdOs, tdBrowser);
            tbody.appendChild(tr);
          });
        }

        updateTableRows(initialLogs);

        new Chart(document.getElementById('timelineChart').getContext('2d'), {
          type: 'bar',
          data: {
            labels: ${JSON.stringify(data.timelineLabels)},
            datasets: [
              {
                type: 'bar',
                label: 'Клики в интервале',
                data: ${JSON.stringify(data.timelineTotals)},
                backgroundColor: 'rgba(99, 102, 241, 0.45)',
                borderColor: 'rgb(79, 70, 229)',
                borderWidth: 1.5,
                borderRadius: 4,
                barPercentage: 0.6
              },
              {
                type: 'line',
                label: 'Всего людей (накопительно)',
                data: ${JSON.stringify(data.timelineCumUniques)},
                borderColor: 'rgb(16, 185, 129)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 6,
                tension: 0.2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { 
                position: 'bottom',
                labels: { boxWidth: 12, padding: 16 }
              } 
            },
            scales: {
              y: { 
                beginAtZero: true, 
                grid: { color: '#f1f5f9' },
                ticks: { precision: 0 }
              },
              x: { grid: { display: false } }
            }
          }
        });
        
        const pieColors = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6'];
        
        new Chart(document.getElementById('sourceChart').getContext('2d'), {
          type: 'pie',
          data: {
            labels: ${JSON.stringify(data.sourceLabels)},
            datasets: [{
              data: ${JSON.stringify(data.sourceValues)},
              backgroundColor: pieColors,
              borderWidth: 1
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
        });

        new Chart(document.getElementById('osChart').getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ${JSON.stringify(data.osLabels)},
            datasets: [{
              data: ${JSON.stringify(data.osValues)},
              backgroundColor: pieColors,
              borderWidth: 1
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, cutout: '60%' }
        });

        new Chart(document.getElementById('browserChart').getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ${JSON.stringify(data.browserLabels)},
            datasets: [{
              data: ${JSON.stringify(data.browserValues)},
              backgroundColor: pieColors,
              borderWidth: 1
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }, cutout: '60%' }
        });
      </script>
    </body>
    </html>
  `;

  return htmlResponse(html);
}

// Single Meeting CSV Export
export async function handleCSVExport(meetingId, env) {
  let allVisits;
  try {
    allVisits = await env.meet.prepare(`
      SELECT visitor_id, visited_at, ip_hash, user_agent, country, source
      FROM visits WHERE meeting = ? ORDER BY visited_at DESC
    `).bind(meetingId).all();
  } catch {
    try {
      allVisits = await env.meet.prepare(`
        SELECT visitor_id, visited_at, ip_hash, user_agent, country
        FROM visits WHERE meeting = ? ORDER BY visited_at DESC
      `).bind(meetingId).all();
    } catch {
      allVisits = await env.meet.prepare(`
        SELECT visitor_id, visited_at, ip_hash, user_agent
        FROM visits WHERE meeting = ? ORDER BY visited_at DESC
      `).bind(meetingId).all();
    }
  }

  let csvContent = "Visitor ID,Date (MSK),Source,IP Hash,Country,User Agent,OS,Browser\n";

  (allVisits.results || []).forEach(v => {
    const { os, browser } = parseUA(v.user_agent);
    const dateStr = new Date(v.visited_at + MSK_OFFSET).toISOString().replace("T", " ").slice(0, 19) + " MSK";
    const country = v.country || "Unknown";
    const source = v.source || "Unknown";

    csvContent += `${sanitizeCSV(v.visitor_id)},${sanitizeCSV(dateStr)},${sanitizeCSV(source)},${sanitizeCSV(v.ip_hash || "")},${sanitizeCSV(country)},${sanitizeCSV(v.user_agent)},${sanitizeCSV(os)},${sanitizeCSV(browser)}\n`;
  });

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${encodeURIComponent(meetingId.replace(/\|/g, '-'))}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}

// Main Action/Page Router
export async function handleStats(request, reqUrl, env) {
  if (env.STATS_PASSWORD) {
    if (request.method === "POST" && !reqUrl.searchParams.get("action")) {
      const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
      const kvKey = `login_fail:${clientIp}`;
      let attempts = 0;
      
      if (env.KV) {
        attempts = parseInt(await env.KV.get(kvKey) || "0", 10);
      }

      if (attempts >= 5) {
        return new Response("Too many login attempts. Please wait 15 minutes.", { status: 429 });
      }

      const formData = await request.formData();
      const password = formData.get("password") || "";

      if (timingSafeEqualString(password, env.STATS_PASSWORD)) {
        if (env.KV) await env.KV.delete(kvKey);
        const token = await signToken(env.STATS_PASSWORD, env.SECRET_KEY);
        return new Response(null, {
          status: 302,
          headers: {
            "Location": reqUrl.toString(),
            "Set-Cookie": `stats_auth=${token}; Path=/stats; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict`
          }
        });
      } else {
        if (env.KV) await env.KV.put(kvKey, String(attempts + 1), { expirationTtl: 900 });
        return renderLoginPage("Неверный пароль. Попробуйте еще раз.");
      }
    }

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/stats_auth=([^;]+)/);
    const token = match ? match[1] : "";
    const isAuthorized = await verifyToken(token, env.STATS_PASSWORD, env.SECRET_KEY);

    if (!isAuthorized) {
      return renderLoginPage();
    }
  }

  if (reqUrl.searchParams.get("action") === "toggle_hide") {
    const meetingToToggle = reqUrl.searchParams.get("meeting");
    if (meetingToToggle && env.meet) {
      await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
      const existing = await env.meet.prepare(`SELECT meeting FROM hidden_meetings WHERE meeting = ?`).bind(meetingToToggle).first();
      if (existing) {
        await env.meet.prepare(`DELETE FROM hidden_meetings WHERE meeting = ?`).bind(meetingToToggle).run();
      } else {
        await env.meet.prepare(`INSERT OR REPLACE INTO hidden_meetings (meeting) VALUES (?)`).bind(meetingToToggle).run();
      }
    }
    const redirectBack = reqUrl.searchParams.get("redirect") || "/stats";
    return Response.redirect(new URL(redirectBack, request.url).toString(), 302);
  }

  if (reqUrl.searchParams.get("action") === "upload_csv" && request.method === "POST") {
    return await handleCSVUpload(request, env);
  }

  const reportType = reqUrl.searchParams.get("report");
  const { scheduleDict, scheduleEventsList } = await getScheduleMap(env);

  if (reportType === "schedule") {
    return await renderScheduleManager(env, scheduleDict, reqUrl);
  }

  if (reportType === "monthly_ranking") {
    if (reqUrl.searchParams.get("export") === "csv") {
      return await handleMonthlyRankingCSVExport(reqUrl, env, scheduleDict, scheduleEventsList);
    }
    return await renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList);
  }

  if (reportType === "monthly") {
    if (reqUrl.searchParams.get("export") === "csv") {
      return await handleMonthlyCSVExport(reqUrl, env, scheduleDict, scheduleEventsList);
    }
    return await renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList);
  }

  const meetingId = reqUrl.searchParams.get("meeting");

  if (!meetingId) {
    return await renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList);
  } else {
    if (reqUrl.searchParams.get("export") === "csv") {
      return await handleCSVExport(meetingId, env);
    }
    return await renderSingleMeeting(meetingId, env, scheduleDict);
  }
}
