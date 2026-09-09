import { MSK_OFFSET, normalizeUrl, getFriendlyName, parseUA, getFlagEmoji, escapeHTML, sanitizeCSV, parseCalendarCSV, htmlResponse } from './utils.js';
import { renderTabs } from './views.js';

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

export async function handleCSVUpload(request, env) {
  try {
    if (!env.meet) return new Response("D1 binding missing", { status: 500 });
    await env.meet.prepare(`CREATE TABLE IF NOT EXISTS schedule_events (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, norm_url TEXT, base_url TEXT, event_date TEXT, start_mins INTEGER, end_mins INTEGER, name TEXT)`).run();
    
    const formData = await request.formData();
    const file = formData.get("csvFile");
    if (!file || !file.name) return new Response("No file uploaded", { status: 400 });

    const text = await file.text();
    const parsedEvents = parseCalendarCSV(text, file.name);
    if (parsedEvents.length === 0) return new Response("Не удалось распознать встречи.", { status: 400 });

    const targetMonthPrefixes = Array.from(new Set(parsedEvents.map(e => e.date.slice(0, 7))));
    for (const prefix of targetMonthPrefixes) {
      await env.meet.prepare(`DELETE FROM schedule_events WHERE event_date LIKE ?`).bind(`${prefix}%`).run();
    }

    const stmts = parsedEvents.map(evt => env.meet.prepare(`INSERT INTO schedule_events (url, norm_url, base_url, event_date, start_mins, end_mins, name) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(evt.url, evt.normUrl, evt.baseUrl, evt.date, evt.startMins, evt.endMins, evt.name));
    for (let i = 0; i < stmts.length; i += 100) await env.meet.batch(stmts.slice(i, i + 100));

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
  const formatMins = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const tableRows = eventsList.map(e => `<tr class="border-b text-sm"><td class="px-4 py-3">${escapeHTML(e.event_date)}</td><td class="px-4 py-3 text-indigo-600 font-bold">${formatMins(e.start_mins)} - ${formatMins(e.end_mins)}</td><td class="px-4 py-3">${escapeHTML(e.name)}</td><td class="px-4 py-3 font-mono text-xs">${escapeHTML(e.url)}</td></tr>`).join("") || `<tr><td colspan="4" class="p-8 text-center text-slate-400">Календарь пуст.</td></tr>`;

  return htmlResponse(`<!DOCTYPE html><html lang="ru" class="bg-slate-50"><head><meta charset="UTF-8"><title>Расписание</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="py-12 px-4 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Управление расписанием</h1>${renderTabs('schedule')}
  ${successMsg ? `<div class="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl">Загружено мероприятий: ${escapeHTML(successMsg)}</div>` : ''}
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="bg-white p-6 rounded-2xl border"><h2 class="font-bold mb-4">Загрузить CSV</h2><form method="POST" action="/stats?action=upload_csv" enctype="multipart/form-data" class="space-y-4"><input type="file" name="csvFile" accept=".csv" required class="w-full text-sm"><button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded-xl">Загрузить</button></form></div>
    <div class="lg:col-span-2 bg-white rounded-2xl border overflow-hidden max-h-[600px] overflow-y-auto"><table class="min-w-full text-left"><thead class="bg-slate-50 sticky top-0 text-xs uppercase text-slate-500"><tr><th class="px-4 py-3">Дата</th><th class="px-4 py-3">Время</th><th class="px-4 py-3">Название</th><th class="px-4 py-3">Ссылка</th></tr></thead><tbody>${tableRows}</tbody></table></div>
  </div></body></html>`);
}

export async function renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  try {
    const searchQuery = reqUrl.searchParams.get("q")?.trim() || "";
    const hiddenSet = await getHiddenMeetingsSet(env);
    const meetings = searchQuery ? await env.meet.prepare(`SELECT meeting, visited_at, visitor_id FROM visits WHERE meeting LIKE ? ORDER BY visited_at DESC`).bind(`%${searchQuery}%`).all() : await env.meet.prepare(`SELECT meeting, visited_at, visitor_id FROM visits ORDER BY visited_at DESC`).all();

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
      const displayDateStr = rawMeetingDate || `${visitDateMSK.getUTCFullYear()}-${pad(visitDateMSK.getUTCMonth() + 1)}-${pad(visitDateMSK.getUTCDate())}`;

      let matchedEventName = null;
      if (scheduleEventsList) {
        for (const evt of scheduleEventsList) {
          const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
          if ((evtNorm === cleanUrl || evt.url === rawMeetingUrl) && evt.event_date === displayDateStr) { matchedName = evt.name; break; }
        }
      }
      if (!matchedEventName) matchedEventName = getFriendlyName(scheduleDict, cleanUrl, displayDateStr);

      const displayTitle = (customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") ? customTitle : (matchedEventName || displayDateStr.split("-").reverse().join("."));
      const isOfficiallyMatched = Boolean(!isUnscheduledRecord && (matchedEventName || (customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled")));
      const groupKey = `${isOfficiallyMatched ? 'official' : 'unscheduled'}|${cleanUrl}|${displayDateStr}`;

      if (!groupedMap[groupKey]) {
        groupedMap[groupKey] = { rawMeeting: m.meeting, cleanUrl, displayTitle, visits: 0, uniqueUsersSet: new Set(), last_visit: m.visited_at, isHidden, isUnscheduledTag: !isOfficiallyMatched, isMatched: isOfficiallyMatched };
      }
      groupedMap[groupKey].visits++;
      if (m.visitor_id) groupedMap[groupKey].uniqueUsersSet.add(m.visitor_id);
      if (m.visited_at > groupedMap[groupKey].last_visit) groupedMap[groupKey].last_visit = m.visited_at;
    });

    const scheduledList = [], unscheduledList = [];
    Object.values(groupedMap).forEach(g => {
      const rowObj = { ...g, unique_users: g.uniqueUsersSet.size, lastActive: new Date(g.last_visit + MSK_OFFSET).toISOString().slice(0, 10), toggleActionUrl: `/stats?action=toggle_hide&meeting=${encodeURIComponent(g.rawMeeting)}&redirect=${encodeURIComponent(currentUrlObj.pathname + currentUrlObj.search)}` };
      if (!g.isHidden && g.isMatched) scheduledList.push(rowObj); else unscheduledList.push(rowObj);
    });

    const renderRow = (m) => `<tr class="border-b hover:bg-slate-50 text-sm"><td class="px-6 py-4"><a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="font-semibold text-slate-900 hover:text-indigo-600">${escapeHTML(m.displayTitle)}</a><div class="text-xs text-slate-400 font-mono">${escapeHTML(m.cleanUrl)}</div></td><td class="px-6 py-4">${m.visits} кликов</td><td class="px-6 py-4">${m.unique_users} уник.</td><td class="px-6 py-4 text-right"><a href="${m.toggleActionUrl}" class="text-xs font-semibold px-2 py-1 border rounded">${m.isHidden ? 'Показать' : 'Скрыть'}</a></td></tr>`;

    return htmlResponse(`<!DOCTYPE html><html lang="ru" class="bg-slate-50"><head><meta charset="UTF-8"><title>Статистика</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="py-12 px-4 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Панель управления</h1>${renderTabs('all')}
    <div class="bg-white rounded-2xl shadow-sm border overflow-hidden"><table class="min-w-full divide-y"><tbody>${scheduledList.map(renderRow).join("")}${unscheduledList.map(renderRow).join("")}</tbody></table></div></body></html>`);
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}

export async function renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Рейтинг</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="py-8 px-4 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Рейтинг встреч за месяц</h1>${renderTabs('ranking')}</body></html>`);
}

export async function renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Дашборд</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="py-8 px-4 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Дашборд за месяц</h1>${renderTabs('monthly')}</body></html>`);
}

export async function renderSingleMeeting(meetingId, env, scheduleDict) {
  const recentVisitsRes = await env.meet.prepare(`SELECT visitor_id, visited_at, user_agent, ip_hash, country, source FROM visits WHERE meeting = ? ORDER BY visited_at DESC LIMIT 100`).bind(meetingId).all();
  const totalRes = await env.meet.prepare(`SELECT COUNT(*) AS total FROM visits WHERE meeting = ?`).bind(meetingId).first();
  const userStatsRes = await env.meet.prepare(`SELECT COUNT(DISTINCT v.visitor_id) AS unique_users FROM visits v WHERE v.meeting = ?`).bind(meetingId).first();

  const parts = meetingId.split("|");
  const origUrl = normalizeUrl(parts[0].replace("[Вне расписания] ", ""));
  const prettyTitle = parts[2] && parts[2] !== "scheduled" && parts[2] !== "unscheduled" ? parts[2] : (getFriendlyName(scheduleDict, origUrl, parts[1]) || origUrl);
  const rows = (recentVisitsRes.results || []).map(v => {
    const ua = parseUA(v.user_agent);
    return `<tr class="border-b text-xs"><td class="p-2">${new Date(v.visited_at + MSK_OFFSET).toISOString().replace("T", " ").slice(0, 19)} MSK</td><td class="p-2 font-mono">${v.visitor_id.substring(0,8)}...</td><td class="p-2">${v.source || 'Direct'}</td><td class="p-2">${getFlagEmoji(v.country)} ${v.country}</td><td class="p-2">${ua.os}</td><td class="p-2">${ua.browser}</td></tr>`;
  }).join("");

  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Детали</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="py-8 px-4 max-w-6xl mx-auto space-y-6">
    <a href="/stats" class="text-indigo-600 font-semibold">← Назад к списку</a>
    <div class="bg-white p-6 rounded-2xl border"><h1 class="text-2xl font-bold">${escapeHTML(prettyTitle)}</h1><p class="text-xs font-mono text-slate-400 mt-1">${escapeHTML(origUrl)}</p></div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-2xl border">Всего: <b>${totalRes?.total || 0}</b></div>
      <div class="bg-white p-5 rounded-2xl border">Уникальных: <b>${userStatsRes?.unique_users || 0}</b></div>
    </div>
    <div class="bg-white p-6 rounded-2xl border"><h3 class="font-bold mb-3">Последние посещения</h3>
    <table class="min-w-full"><thead><tr class="text-left text-xs text-slate-400"><th class="p-2">Время</th><th class="p-2">ID</th><th class="p-2">Источник</th><th class="p-2">Регион</th><th class="p-2">ОС</th><th class="p-2">Браузер</th></tr></thead><tbody>${rows}</tbody></table></div>
  </body></html>`);
}

export async function handleCSVExport(meetingId, env) {
  const allVisits = await env.meet.prepare(`SELECT visitor_id, visited_at, ip_hash, user_agent, country, source FROM visits WHERE meeting = ? ORDER BY visited_at DESC`).bind(meetingId).all();
  let csvContent = "Visitor ID,Date (MSK),Source,IP Hash,Country,User Agent,OS,Browser\n";
  (allVisits.results || []).forEach(v => {
    const ua = parseUA(v.user_agent);
    const dateStr = new Date(v.visited_at + MSK_OFFSET).toISOString().replace("T", " ").slice(0, 19) + " MSK";
    csvContent += `${sanitizeCSV(v.visitor_id)},${sanitizeCSV(dateStr)},${sanitizeCSV(v.source)},${sanitizeCSV(v.ip_hash)},${sanitizeCSV(v.country)},${sanitizeCSV(v.user_agent)},${sanitizeCSV(ua.os)},${sanitizeCSV(ua.browser)}\n`;
  });
  return new Response(csvContent, { status: 200, headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="export.csv"` } });
}
