// src/stats.js
import {
  MSK_OFFSET,
  htmlResponse,
  escapeHTML,
  sanitizeCSV,
  normalizeUrl,
  getFriendlyName,
  parseUA,
  signToken,
  verifyToken,
  timingSafeEqualString
} from './utils.js';

import { renderLoginPage } from './views.js';

import { 
  renderTabs, 
  findScheduledMeeting, 
  getScheduleMap, 
  handleCSVUpload, 
  handleScheduleActions,
  renderScheduleManager 
} from './schedule.js';

import { 
  renderMonthlyRanking, 
  handleMonthlyRankingCSVExport, 
  renderMonthlyReport, 
  handleMonthlyCSVExport 
} from './reports.js';

export { findScheduledMeeting };

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

// Render All Meetings View with "➕ В расписание" Button & Modal
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
      const parts = m.meeting.split("|");
      const rawMeetingUrl = parts[0];
      const rawMeetingDate = parts[1] || "";
      const customTitle = parts[2] || "";

      const cleanUrl = normalizeUrl(rawMeetingUrl.replace("[Вне расписания] ", ""));
      const baseUrl = cleanUrl.split('?')[0];

      const isHidden = hiddenSet.has(m.meeting);

      const visitDateMSK = new Date(m.visited_at + MSK_OFFSET);
      const visitDateStr = `${visitDateMSK.getUTCFullYear()}-${pad(visitDateMSK.getUTCMonth() + 1)}-${pad(visitDateMSK.getUTCDate())}`;
      const visitMinsMSK = visitDateMSK.getUTCHours() * 60 + visitDateMSK.getUTCMinutes();

      const displayDateStr = rawMeetingDate || visitDateStr;
      const prettyDate = displayDateStr.split("-").reverse().join(".");

      let matchedEvent = null;
      if (scheduleEventsList && scheduleEventsList.length > 0) {
        for (const evt of scheduleEventsList) {
          const evtNorm = normalizeUrl(evt.url || evt.norm_url || "");
          const evtBase = evtNorm.split('?')[0];

          const urlMatches = (evtNorm === cleanUrl || evtBase === baseUrl || evt.url === rawMeetingUrl);
          const dateMatches = (evt.event_date === displayDateStr || evt.event_date === visitDateStr);

          if (urlMatches && dateMatches) {
            const start = evt.start_mins !== null && evt.start_mins !== undefined ? evt.start_mins : 0;
            const end = evt.end_mins !== null && evt.end_mins !== undefined ? evt.end_mins : (start + 60);
            const windowStart = start - 10;
            const windowEnd = end + 60;

            if (visitMinsMSK >= windowStart && visitMinsMSK <= windowEnd) {
              matchedEvent = evt;
              break;
            }
          }
        }
      }

      const isOfficiallyMatched = Boolean(matchedEvent);

      let displayTitle = "";
      if (matchedEvent) {
        displayTitle = matchedEvent.name;
      } else {
        const friendlyName = getFriendlyName(scheduleDict, cleanUrl, displayDateStr);
        if (customTitle && customTitle !== "scheduled" && customTitle !== "unscheduled") {
          displayTitle = customTitle;
        } else if (friendlyName) {
          displayTitle = friendlyName;
        } else {
          displayTitle = prettyDate;
        }
      }

      const groupKey = `${isOfficiallyMatched ? 'official' : 'unscheduled'}|${cleanUrl}|${displayDateStr}`;

      if (!groupedMap[groupKey]) {
        groupedMap[groupKey] = {
          rawMeeting: m.meeting,
          cleanUrl,
          displayTitle,
          displayDateStr,
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
        displayDateStr: g.displayDateStr,
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

    // Scheduled Rows
    const scheduledRowsHtml = scheduledList.map(m => `
      <tr class="hover:bg-slate-50/70 transition-colors border-b border-slate-100 last:border-0 ${m.isHidden ? 'bg-slate-50/50 opacity-75' : ''}">
        <td class="px-6 py-4">
          <a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="group block">
            <div class="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors max-w-lg break-words leading-snug flex items-center gap-2">
              ${escapeHTML(m.displayTitle)}
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
    `).join("");

    // Unscheduled Rows with "➕ В расписание" Button
    const unscheduledRowsHtml = unscheduledList.map(m => `
      <tr class="hover:bg-slate-50/70 transition-colors border-b border-slate-100 last:border-0 ${m.isHidden ? 'bg-slate-50/50 opacity-75' : ''}">
        <td class="px-6 py-4">
          <a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="group block">
            <div class="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors max-w-lg break-words leading-snug flex items-center gap-2">
              ${escapeHTML(m.displayTitle)}
              <span class="px-2 py-0.5 text-[10px] uppercase font-bold bg-amber-100 text-amber-800 rounded-md">Вне расписания</span>
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
          <div class="flex items-center justify-end gap-2">
            <button 
              type="button"
              onclick="openAddToScheduleModal('${encodeURIComponent(m.cleanUrl)}', '${encodeURIComponent(m.displayTitle)}', '${escapeHTML(m.displayDateStr)}')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer"
              title="Добавить эту встречу в официальное расписание"
            >
              <span>➕</span>
              <span>В расписание</span>
            </button>

            <a href="${m.toggleActionUrl}" class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${m.isHidden ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-700'}">
              ${m.isHidden ? '🙈 Скрыто' : '👁️ Скрыть'}
            </a>
            <a href="/stats?meeting=${encodeURIComponent(m.rawMeeting)}" class="text-indigo-600 hover:text-indigo-900 font-semibold inline-flex items-center gap-1 text-xs">
              Детали →
            </a>
          </div>
        </td>
      </tr>
    `).join("");

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

          <!-- Secondary Table: Unscheduled Clicks with "➕ В расписание" Button -->
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

        <!-- Add to Schedule Popup Modal -->
        <div id="addToScheduleModal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🗓️</span> Добавить в официальное расписание
              </h3>
              <button onclick="closeScheduleModal()" class="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none">&times;</button>
            </div>

            <form method="POST" action="/stats?action=add_schedule_event" class="space-y-4">
              <input type="hidden" name="redirect" value="/stats">
              
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Название встречи</label>
                <input type="text" name="name" id="modalNameInput" required class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Дата события</label>
                  <input type="date" name="date" id="modalDateInput" required class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Время (МСК)</label>
                  <input type="text" name="time" id="modalTimeInput" placeholder="Пусто = весь день" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Ссылка на встречу (URL)</label>
                <input type="text" name="url" id="modalUrlInput" required class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none">
              </div>

              <p class="text-xs text-slate-500 leading-relaxed bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                💡 Если оставить поле <b>Время</b> пустым, встреча будет считаться активной <b>весь день</b>, и все клики за эту дату сразу перейдут в официальную статистику.
              </p>

              <div class="flex justify-end gap-3 pt-2">
                <button type="button" onclick="closeScheduleModal()" class="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">Отмена</button>
                <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer">Сохранить в расписание</button>
              </div>
            </form>
          </div>
        </div>

        <script>
          function openAddToScheduleModal(encodedUrl, encodedName, dateStr) {
            document.getElementById('modalUrlInput').value = decodeURIComponent(encodedUrl);
            document.getElementById('modalNameInput').value = decodeURIComponent(encodedName);
            
            let formattedDate = dateStr || '';
            if (formattedDate.includes('.')) {
              formattedDate = formattedDate.split('.').reverse().join('-');
            }
            document.getElementById('modalDateInput').value = formattedDate;
            document.getElementById('modalTimeInput').value = '';
            document.getElementById('addToScheduleModal').classList.remove('hidden');
          }

          function closeScheduleModal() {
            document.getElementById('addToScheduleModal').classList.add('hidden');
          }
        </script>
      </body>
      </html>
    `;

    return htmlResponse(html);
  } catch (err) {
    return new Response("D1 Database error: Make sure the visits table exists in D1.", { status: 500 });
  }
}

// Single Meeting Metrics Gathering (Fixed Unique and New User Calculation)
export async function gatherSingleMeetingMetrics(meetingId, env) {
  const parts = meetingId.split("|");
  const cleanUrl = normalizeUrl(parts[0].replace("[Вне расписания] ", ""));
  const meetingDate = parts[1] || "";

  let recentVisitsRes;
  try {
    recentVisitsRes = await env.meet.prepare(`
      SELECT visitor_id, visited_at, user_agent, ip_hash, country, source
      FROM visits 
      WHERE meeting = ? 
         OR (meeting LIKE '%' || ? || '%' AND meeting LIKE '%' || ? || '%')
      ORDER BY visited_at DESC LIMIT 10000
    `).bind(meetingId, cleanUrl, meetingDate).all();
  } catch(e) {
    recentVisitsRes = await env.meet.prepare(`
      SELECT visitor_id, visited_at, user_agent, ip_hash
      FROM visits WHERE meeting = ? ORDER BY visited_at DESC LIMIT 10000
    `).bind(meetingId).all();
  }

  const visitsData = recentVisitsRes.results || [];

  // Total count
  let total = visitsData.length;
  try {
    const totalRes = await env.meet.prepare(`
      SELECT COUNT(*) AS total FROM visits 
      WHERE meeting = ? 
         OR (meeting LIKE '%' || ? || '%' AND meeting LIKE '%' || ? || '%')
    `).bind(meetingId, cleanUrl, meetingDate).first();
    if (totalRes && totalRes.total) total = totalRes.total;
  } catch(e) {}

  // Calculate unique visitors directly from visitsData (guaranteed to match the chart!)
  const uniqueVisitorsSet = new Set(visitsData.map(v => v.visitor_id).filter(Boolean));
  const unique = uniqueVisitorsSet.size;

  // Calculate New vs Returning users
  let newUsers = 0;
  if (uniqueVisitorsSet.size > 0) {
    try {
      const visitorList = Array.from(uniqueVisitorsSet);
      const meetingEarliestTime = Math.min(...visitsData.map(v => v.visited_at));
      const meetingLatestTime = Math.max(...visitsData.map(v => v.visited_at));
      const firstMap = new Map();

      for (let i = 0; i < visitorList.length; i += 50) {
        const chunk = visitorList.slice(i, i + 50);
        const placeholders = chunk.map(() => '?').join(',');
        const minVisitsRes = await env.meet.prepare(`
          SELECT visitor_id, MIN(visited_at) as first_visited
          FROM visits
          WHERE visitor_id IN (${placeholders})
          GROUP BY visitor_id
        `).bind(...chunk).all();
        
        (minVisitsRes.results || []).forEach(r => firstMap.set(r.visitor_id, r.first_visited));
      }

      visitorList.forEach(vid => {
        const firstTime = firstMap.get(vid);
        if (firstTime && firstTime >= meetingEarliestTime && firstTime <= meetingLatestTime) {
          newUsers++;
        }
      });
    } catch(err) {
      console.error("Error calculating new users:", err);
      newUsers = unique;
    }
  }

  const returningUsers = Math.max(0, unique - newUsers);

  const osCount = {};
  const browserCount = {};
  const countryCount = {};
  const sourceCount = {};
  
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

// Render Single Meeting Detailed View
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
            <div id="statUnique" class="text-3xl font-extrabold text-indigo-600 mt-2">${data.unique}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Новых участников</div>
            <div id="statNew" class="text-3xl font-extrabold text-emerald-600 mt-2">${data.newUsers}</div>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Вернувшихся</div>
            <div id="statReturning" class="text-3xl font-extrabold text-amber-600 mt-2">${data.returningUsers}</div>
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

// Single Meeting CSV Export with UTF-8 BOM for Excel
export async function handleCSVExport(meetingId, env) {
  const parts = meetingId.split("|");
  const cleanUrl = normalizeUrl(parts[0].replace("[Вне расписания] ", ""));
  const meetingDate = parts[1] || "";

  let allVisits;
  try {
    allVisits = await env.meet.prepare(`
      SELECT visitor_id, visited_at, ip_hash, user_agent, country, source
      FROM visits 
      WHERE meeting = ? 
         OR (meeting LIKE '%' || ? || '%' AND meeting LIKE '%' || ? || '%')
      ORDER BY visited_at DESC
    `).bind(meetingId, cleanUrl, meetingDate).all();
  } catch(e) {
    allVisits = await env.meet.prepare(`
      SELECT visitor_id, visited_at, ip_hash, user_agent
      FROM visits WHERE meeting = ? ORDER BY visited_at DESC
    `).bind(meetingId).all();
  }

  // Prepend \uFEFF for proper Russian Cyrillic display in Excel
  let csvContent = "\uFEFFVisitor ID,Date (MSK),Source,IP Hash,Country,User Agent,OS,Browser\n";

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

// Main Stats Router
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

  // Handle Add/Delete Schedule Actions
  if (reqUrl.searchParams.get("action") === "add_schedule_event" || reqUrl.searchParams.get("action") === "delete_schedule_event") {
    const res = await handleScheduleActions(request, reqUrl, env);
    if (res) return res;
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
