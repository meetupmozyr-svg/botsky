import { MSK_OFFSET, normalizeUrl, getFriendlyName, parseUA, escapeHTML, sanitizeCSV } from './utils.js';
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
    if (res && res.results) res.results.forEach(r => hiddenSet.add(r.meeting));
  } catch (e) {}
  return hiddenSet;
}

export async function renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  try {
    const searchQuery = reqUrl.searchParams.get("q")?.trim() || "";
    const hiddenSet = await getHiddenMeetingsSet(env);
    const meetings = searchQuery 
      ? await env.meet.prepare(`SELECT meeting, visited_at, visitor_id FROM visits WHERE meeting LIKE ? ORDER BY visited_at DESC`).bind(`%${searchQuery}%`).all()
      : await env.meet.prepare(`SELECT meeting, visited_at, visitor_id FROM visits ORDER BY visited_at DESC`).all();

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
          if ((evtNorm === cleanUrl || evt.url === rawMeetingUrl) && evt.event_date === displayDateStr) {
            matchedEventName = evt.name; break;
          }
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

    return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Статистика</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="p-8 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Панель управления</h1>${renderTabs('all')}
    <div class="bg-white rounded-2xl shadow-sm border overflow-hidden"><table class="min-w-full divide-y"><tbody>${scheduledList.map(renderRow).join("")}</tbody></table></div></body></html>`);
  } catch (err) {
    return new Response("Stats error: " + err.message, { status: 500 });
  }
}

export async function renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Рейтинг</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Рейтинг за месяц</h1>${renderTabs('ranking')}</body></html>`);
}

export async function renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Дашборд</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Дашборд за месяц</h1>${renderTabs('monthly')}</body></html>`);
}

export async function renderScheduleManager(env, scheduleDict, reqUrl) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Расписание</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8 max-w-6xl mx-auto"><h1 class="text-3xl font-extrabold mb-6">Расписание</h1>${renderTabs('schedule')}</body></html>`);
}

export async function renderSingleMeeting(meetingId, env, scheduleDict) {
  return htmlResponse(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Детали</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8 max-w-6xl mx-auto"><a href="/stats">← Назад</a><h1 class="text-2xl font-bold mt-4">Детали встречи</h1></body></html>`);
}

export async function handleCSVExport(meetingId, env) {
  return new Response("Visitor ID,Date\n", { headers: { "Content-Type": "text/csv" } });
}
