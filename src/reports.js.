import {
  MSK_OFFSET,
  htmlResponse,
  escapeHTML,
  sanitizeCSV,
  normalizeUrl,
  getFriendlyName
} from './utils.js';

import { renderTabs } from './schedule.js';

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
