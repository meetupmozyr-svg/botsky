// Cloudflare ES Module Entrypoint (Line 1)
export default {
  async fetch(request, env, ctx) {
    if (!env.SECRET_KEY) {
      return new Response("Server configuration error: SECRET_KEY is missing.", { status: 500 });
    }

    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (reqUrl.pathname === "/privacy") {
      return renderPrivacyPage();
    }

    if (reqUrl.pathname === "/cleaner" || reqUrl.pathname === "/converter") {
      return htmlResponse(getConverterHtmlPage());
    }

    if (reqUrl.pathname === "/stats") {
      return await handleStats(request, reqUrl, env);
    }

    const queryUrl = reqUrl.searchParams.get("url");
    if (reqUrl.pathname === "/" && !queryUrl) {
      return renderInstructionsPage(reqUrl);
    }

    return await handleRedirect(request, reqUrl, env);
  }
};

// Moscow Time Offset (UTC+3)
const MSK_OFFSET = 3 * 3600 * 1000;

// Security Headers Helper
function getSecurityHeaders() {
  return {
    "Content-Type": "text/html;charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data: https:; connect-src 'self';"
  };
}

function htmlResponse(html, status = 200, customHeaders = {}) {
  return new Response(html, {
    status,
    headers: { ...getSecurityHeaders(), ...customHeaders }
  });
}

// Utility function to prevent Cross-Site Scripting (XSS)
const escapeHTML = (str) => {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
};

// Prevent CSV Formula Injection (=, +, -, @, tab, cr)
function sanitizeCSV(str) {
  if (str === null || str === undefined) return '""';
  let stringified = String(str);
  if (/^[=+\-@\t\r]/.test(stringified)) {
    stringified = "'" + stringified;
  }
  return `"${stringified.replace(/"/g, '""')}"`;
}

// Robust Full 2D CSV Grid Tokenizer
function parseFullCSVGrid(text, separator) {
  const grid = [];
  let row = [];
  let col = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nextC = text[i + 1];

    if (c === '"') {
      if (inQuotes && nextC === '"') {
        col += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === separator && !inQuotes) {
      row.push(col);
      col = '';
    } else if ((c === '\n' || (c === '\r' && nextC === '\n')) && !inQuotes) {
      if (c === '\r') i++;
      row.push(col);
      grid.push(row);
      row = [];
      col = '';
    } else if (c === '\r' && !inQuotes) {
      row.push(col);
      grid.push(row);
      row = [];
      col = '';
    } else {
      col += c;
    }
  }

  if (col.length > 0 || row.length > 0) {
    row.push(col);
    grid.push(row);
  }

  return grid;
}

// Precise URL Normalizer
function normalizeUrl(url) {
  if (!url) return "";
  let str = url.trim();
  
  if (/^https?:\/\/[^\/]+\/https?:\/\//i.test(str)) {
    str = str.replace(/^https?:\/\/[^\/]+\/(https?:\/\/)/i, '$1');
  } else if (/^https?:\/\/[^\/]*workers\.dev\//i.test(str)) {
    str = str.replace(/^https?:\/\/[^\/]*workers\.dev\//i, 'https://');
  }

  if (str.startsWith('http:/') && !str.startsWith('http://')) {
    str = str.replace('http:/', 'http://');
  } else if (str.startsWith('https:/') && !str.startsWith('https://')) {
    str = str.replace('https:/', 'https://');
  } else if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }

  if (str.startsWith('https://call/join/')) {
    str = str.replace('https://call/join/', 'https://vk.com/call/join/');
  } else if (str.startsWith('https://go/max')) {
    str = str.replace('https://go/max', 'https://skyeng.ru/go/max');
  }

  str = str.replace(/^https?:\/\/(www\.)?vk\.(ru|me)\//i, 'https://vk.com/');
  str = str.replace(/[.,;]+$/, '').trim();

  // Strip query parameters
  str = str.split('?')[0];

  return str;
}

// Russian Month Mapping Helper
const RU_MONTHS = {
  "январ": 1, "феврал": 2, "март": 3, "апрел": 4, "маи": 5, "май": 5,
  "июн": 6, "июл": 7, "август": 8, "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12
};

// Universal Calendar CSV Parser (Supports new tabular format and legacy calendar matrices)
function parseCalendarCSV(text, filename = "") {
  const events = [];
  const currentYear = new Date().getFullYear();
  let detectedYear = currentYear;

  const searchSubject = (filename + " " + text.slice(0, 1000)).toLowerCase();
  const yearMatch = searchSubject.match(/\b(202[4-9]|203[0-5])\b/);
  if (yearMatch) {
    detectedYear = parseInt(yearMatch[1], 10);
  }

  const separator = text.includes(';') ? ';' : ',';
  const grid = parseFullCSVGrid(text, separator);
  if (!grid || grid.length === 0) return events;

  const pad = (n) => String(n).padStart(2, '0');

  // Check if this is the new standard tabular format: Дата,Время,Название,Ссылка
  let isTabular = false;
  const firstRow = grid[0].map(c => (c || '').toLowerCase().trim());
  if (firstRow.some(c => c.includes('дата') || c.includes('date')) &&
      firstRow.some(c => c.includes('ссылка') || c.includes('link') || c.includes('url') || c.includes('название'))) {
    isTabular = true;
  }

  if (isTabular) {
    let dateIdx = 0, timeIdx = 1, nameIdx = 2, linkIdx = 3;

    firstRow.forEach((col, idx) => {
      if (col.includes('дата') || col.includes('date')) dateIdx = idx;
      else if (col.includes('время') || col.includes('time')) timeIdx = idx;
      else if (col.includes('название') || col.includes('name') || col.includes('тема') || col.includes('topic')) nameIdx = idx;
      else if (col.includes('ссылка') || col.includes('link') || col.includes('url')) linkIdx = idx;
    });

    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || row.length === 0 || row.every(c => !c.trim())) continue;

      const rawDate = (row[dateIdx] || '').trim();
      const rawTime = (row[timeIdx] || '').trim();
      const rawName = (row[nameIdx] || '').trim();
      const rawUrl = (row[linkIdx] || '').trim();

      if (!rawUrl || !rawDate) continue;

      // Parse Date: supports DD.MM or DD.MM.YYYY
      let dateStr = "";
      const dMatch = rawDate.match(/^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{4}))?$/);
      if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        const month = parseInt(dMatch[2], 10);
        const year = dMatch[3] ? parseInt(dMatch[3], 10) : detectedYear;
        dateStr = `${year}-${pad(month)}-${pad(day)}`;
      } else {
        continue;
      }

      // Parse Time: supports "14:00" or "14:00 - 15:30" or "14:00-15:00"
      let startMins = 12 * 60;
      let endMins = 13 * 60;

      const timeRangeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
      const singleTimeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})/);

      if (timeRangeMatch) {
        startMins = parseInt(timeRangeMatch[1], 10) * 60 + parseInt(timeRangeMatch[2], 10);
        endMins = parseInt(timeRangeMatch[3], 10) * 60 + parseInt(timeRangeMatch[4], 10);
      } else if (singleTimeMatch) {
        startMins = parseInt(singleTimeMatch[1], 10) * 60 + parseInt(singleTimeMatch[2], 10);
        endMins = startMins + 60; // Defaults to 1 hour duration
      }

      const cleanRawUrl = rawUrl.replace(/[.,;]+$/, '').trim();
      const normUrl = normalizeUrl(cleanRawUrl);
      const baseUrl = normUrl.split('?')[0];

      let cleanName = rawName
        .replace(/[🔵🟡🟢🔴🟣⚪️🖤🏁🧹🌿]/gu, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
        .trim();

      if (!cleanName) cleanName = "Встреча без названия";

      events.push({
        url: cleanRawUrl,
        normUrl,
        baseUrl,
        date: dateStr,
        startMins,
        endMins,
        name: cleanName
      });
    }

    return events;
  }

  // Fallback: 2D Matrix Grid Parser for older calendar formats
  let fallbackMonth = new Date().getMonth() + 1;
  for (const [key, mNum] of Object.entries(RU_MONTHS)) {
    if (searchSubject.includes(key)) {
      fallbackMonth = mNum;
      break;
    }
  }

  let currentDays = [null, null, null, null, null, null, null];

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const detectedDays = [null, null, null, null, null, null, null];
    let dayCount = 0;

    for (let c = 0; c < Math.min(row.length, 7); c++) {
      const val = (row[c] || '').trim();
      if (/^\d{1,2}$/.test(val)) {
        const dNum = parseInt(val, 10);
        if (dNum >= 1 && dNum <= 31) {
          detectedDays[c] = dNum;
          dayCount++;
        }
      }
    }

    if (dayCount > 0) {
      currentDays = detectedDays;
      continue;
    }

    for (let c = 0; c < Math.min(row.length, 7); c++) {
      const dayNum = currentDays[c];
      if (!dayNum) continue;

      const cellText = (row[c] || '').trim();
      if (!cellText || cellText.length < 5) continue;

      const dateStr = `${detectedYear}-${pad(fallbackMonth)}-${pad(dayNum)}`;
      const subLines = cellText.split(/\r?\n/);

      subLines.forEach(subLine => {
        const trimmedSub = subLine.trim();
        if (!trimmedSub) return;

        const urlMatches = trimmedSub.match(/https?:\/\/[^\s,"]+/g);
        if (!urlMatches) return;

        urlMatches.forEach(rawUrl => {
          const cleanRawUrl = rawUrl.replace(/[.,;]+$/, '').trim();
          const normUrl = normalizeUrl(cleanRawUrl);
          const baseUrl = normUrl.split('?')[0];

          let startMins = 12 * 60;
          let endMins = 13 * 60;

          const timeRangeMatch = trimmedSub.match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
          const singleTimeMatch = trimmedSub.match(/(\d{1,2})[:.](\d{2})/);

          if (timeRangeMatch) {
            startMins = parseInt(timeRangeMatch[1], 10) * 60 + parseInt(timeRangeMatch[2], 10);
            endMins = parseInt(timeRangeMatch[3], 10) * 60 + parseInt(timeRangeMatch[4], 10);
          } else if (singleTimeMatch) {
            startMins = parseInt(singleTimeMatch[1], 10) * 60 + parseInt(singleTimeMatch[2], 10);
            endMins = startMins + 60;
          }

          let cleanName = trimmedSub
            .replace(/https?:\/\/[^\s,"]+/g, '')
            .replace(/[🔵🟡🟢🔴🟣⚪️🖤🏁🧹🌿]/gu, '')
            .replace(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g, '')
            .replace(/(\d{1,2})[:.](\d{2})/g, '')
            .replace(/^-+>?\s*/, '')
            .replace(/\s+/g, ' ')
            .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
            .trim();

          if (!cleanName) cleanName = "Встреча без названия";

          events.push({
            url: cleanRawUrl,
            normUrl,
            baseUrl,
            date: dateStr,
            startMins,
            endMins,
            name: cleanName
          });
        });
      });
    }
  }

  return events;
}

// Smart Title Lookup Helper
function getFriendlyName(scheduleDict, meetingUrl, meetingDate = "") {
  if (!scheduleDict || !meetingUrl) return null;

  const norm = normalizeUrl(meetingUrl);
  const baseNorm = norm.split('?')[0];

  if (meetingDate) {
    if (scheduleDict[`${norm}|${meetingDate}`]) return scheduleDict[`${norm}|${meetingDate}`];
    if (scheduleDict[`${baseNorm}|${meetingDate}`]) return scheduleDict[`${baseNorm}|${meetingDate}`];
    if (scheduleDict[`${meetingUrl}|${meetingDate}`]) return scheduleDict[`${meetingUrl}|${meetingDate}`];
  }
  
  if (scheduleDict[norm]) return scheduleDict[norm];
  if (scheduleDict[baseNorm]) return scheduleDict[baseNorm];
  if (scheduleDict[meetingUrl]) return scheduleDict[meetingUrl];

  const noProto = norm.replace(/^https?:\/\//, '');
  if (scheduleDict[noProto]) return scheduleDict[noProto];

  return null;
}

// User Agent Parser
function parseUA(uaString) {
  const lower = (uaString || "").toLowerCase();
  
  let os = "Other";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("macintosh") || lower.includes("mac os")) os = "macOS";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("linux")) os = "Linux";

  let browser = "Other";
  if (lower.includes("chrome") || lower.includes("crios")) {
    if (lower.includes("edg")) browser = "Edge";
    else browser = "Chrome";
  }
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("firefox") || lower.includes("fxios")) browser = "Firefox";
  else if (lower.includes("opr") || lower.includes("opera")) browser = "Opera";
  
  return { os, browser };
}

// Country code to Flag emoji
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === "XX" || countryCode.length !== 2) return "🏳️";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return "🏳️";
  }
}

const BOT_RE = /telegrambot|mattermost-bot|twitterbot|slackbot|discordbot|whatsapp|linkedinbot|googlebot|bingbot|yandexbot|facebookexternalhit|facebot|applebot|curl\/|wget\/|headlesschrome|lighthouse|uptimerobot|pingdom|datadog|ahrefsbot|semrushbot|mj12bot/i;

// Hash IP address with SHA-256
async function hashIP(ipString, env) {
  if (!ipString) return "";
  const salt = env.IP_HASH_SALT || "DEFAULT_STATIC_SALT_KEY";
  const encoder = new TextEncoder();
  const data = encoder.encode(ipString + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sign token using HMAC-SHA256
async function signToken(password, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(password)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Timing-safe HMAC token verification
async function verifyToken(token, password, secret) {
  if (!token || !secret || !password) return false;
  try {
    const expected = await signToken(password, secret);
    const encoder = new TextEncoder();
    const bufA = encoder.encode(token);
    const bufB = encoder.encode(expected);
    if (bufA.length !== bufB.length) return false;
    return crypto.subtle.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

// Timing-safe string comparison
function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

// Find Scheduled Event matching URL, Exact Date AND Valid Time Window (-10 mins before, +60 mins after end)
async function findScheduledMeeting(env, targetUrl, mskDateStr, currentMskMins) {
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
async function getScheduleMap(env) {
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
async function getHiddenMeetingsSet(env) {
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

const renderTabs = (active) => `
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

function renderLoginPage(errorMsg = "") {
  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="h-full bg-slate-50">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Вход в панель аналитики</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="h-full flex items-center justify-center px-4">
      <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <div class="text-center">
          <div class="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-4">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h2 class="text-3xl font-extrabold text-slate-900">Защищенный вход</h2>
          <p class="mt-2 text-sm text-slate-500">Введите пароль для доступа к аналитике</p>
        </div>
        <form class="mt-8 space-y-6" method="POST">
          ${errorMsg ? `<div class="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">${escapeHTML(errorMsg)}</div>` : ''}
          <div class="rounded-md shadow-sm">
            <input name="password" type="password" required class="appearance-none rounded-lg relative block w-full px-3 py-2.5 border border-slate-300 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Ваш пароль">
          </div>
          <button type="submit" class="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95">
            Войти в систему
          </button>
        </form>
      </div>
    </body>
    </html>
  `;
  return htmlResponse(html);
}

// Handle Calendar CSV Upload (Clears only target month(s) without touching historical months)
async function handleCSVUpload(request, env) {
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

async function renderScheduleManager(env, scheduleDict, reqUrl) {
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
async function renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList = []) {
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
async function renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList = []) {
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
async function handleMonthlyRankingCSVExport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
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
async function renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
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
            <h2 class="text-2xl font-bold text-slate-900 break-all">Итоги за ${prettyMonth}</h2>
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
async function handleMonthlyCSVExport(reqUrl, env, scheduleDict, scheduleEventsList = []) {
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
async function gatherSingleMeetingMetrics(meetingId, env) {
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

async function renderSingleMeeting(meetingId, env, scheduleDict) {
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
async function handleCSVExport(meetingId, env) {
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

function renderInstructionsPage(reqUrl) {
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="h-full bg-slate-50">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Сервис перенаправления и аналитики</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="min-h-full py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl mx-auto space-y-8">
        <div class="text-center">
          <span class="text-4xl">🚀</span>
          <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 mt-4">Генератор ссылок</h1>
          <p class="mt-2 text-sm text-slate-500">Создание отслеживаемых ссылок</p>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 space-y-6">
          <h2 class="text-lg font-bold text-slate-800">Создать ссылку</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">URL встречи</label>
              <input type="text" id="targetInput" placeholder="https://zoom.us/j/987654321..." class="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
            </div>

            <div class="space-y-4 pt-2 border-t border-slate-100">
              <!-- Direct -->
              <div>
                <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">🔗 Прямая ссылка (Без отслеживания)</label>
                <div class="flex gap-2">
                  <input type="text" id="outputDirect" readonly class="grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-indigo-600 focus:outline-none" value="${baseUrl}/">
                  <button onclick="copyToClipboard('outputDirect', this)" class="px-5 py-3 bg-slate-600 text-white font-semibold text-sm rounded-xl hover:bg-slate-700 active:scale-95 transition-all shadow-md">
                    Копия
                  </button>
                </div>
              </div>

              <!-- Telegram -->
              <div>
                <label class="block text-xs font-bold text-[#229ED9] uppercase tracking-wider mb-2">✈️ Telegram</label>
                <div class="flex gap-2">
                  <input type="text" id="outputTelegram" readonly class="grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-indigo-600 focus:outline-none" value="${baseUrl}/?utm_source=telegram">
                  <button onclick="copyToClipboard('outputTelegram', this)" class="px-5 py-3 bg-[#229ED9] text-white font-semibold text-sm rounded-xl hover:bg-[#1d82b3] active:scale-95 transition-all shadow-md">
                    Копия
                  </button>
                </div>
              </div>

              <!-- Mattermost -->
              <div>
                <label class="block text-xs font-bold text-[#0072C6] uppercase tracking-wider mb-2">💬 Mattermost</label>
                <div class="flex gap-2">
                  <input type="text" id="outputMattermost" readonly class="grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-indigo-600 focus:outline-none" value="${baseUrl}/?utm_source=mattermost">
                  <button onclick="copyToClipboard('outputMattermost', this)" class="px-5 py-3 bg-[#0072C6] text-white font-semibold text-sm rounded-xl hover:bg-[#005a9e] active:scale-95 transition-all shadow-md">
                    Копия
                  </button>
                </div>
              </div>

              <!-- VK -->
              <div>
                <label class="block text-xs font-bold text-[#0077FF] uppercase tracking-wider mb-2">🌐 ВКонтакте</label>
                <div class="flex gap-2">
                  <input type="text" id="outputVk" readonly class="grow px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-indigo-600 focus:outline-none" value="${baseUrl}/?utm_source=vk">
                  <button onclick="copyToClipboard('outputVk', this)" class="px-5 py-3 bg-[#0077FF] text-white font-semibold text-sm rounded-xl hover:bg-[#005ecb] active:scale-95 transition-all shadow-md">
                    Копия
                  </button>
                </div>
              </div>
            </div>
            
            <p class="text-xs text-slate-500">Подсказка: Ссылки уже содержат встроенные UTM-метки. Просто скопируйте нужную!</p>
          </div>
        </div>
      </div>

      <script>
        const targetInput = document.getElementById('targetInput');
        const outputs = {
          direct: document.getElementById('outputDirect'),
          telegram: document.getElementById('outputTelegram'),
          mattermost: document.getElementById('outputMattermost'),
          vk: document.getElementById('outputVk')
        };
        const base = "${baseUrl}/";

        targetInput.addEventListener('input', function() {
          let cleanVal = this.value.trim();
          if (!cleanVal) {
            outputs.direct.value = base;
            outputs.telegram.value = base + "?utm_source=telegram";
            outputs.mattermost.value = base + "?utm_source=mattermost";
            outputs.vk.value = base + "?utm_source=vk";
            return;
          }
          cleanVal = cleanVal.replace(/^https?:\\/\\//i, '');
          
          let separator = cleanVal.includes('?') ? '&' : '?';
          
          outputs.direct.value = base + cleanVal;
          outputs.telegram.value = base + cleanVal + separator + 'utm_source=telegram';
          outputs.mattermost.value = base + cleanVal + separator + 'utm_source=mattermost';
          outputs.vk.value = base + cleanVal + separator + 'utm_source=vk';
        });

        async function copyToClipboard(elementId, btnElement) {
          const text = document.getElementById(elementId).value;
          const originalText = btnElement.textContent.trim();
          try {
            await navigator.clipboard.writeText(text);
            btnElement.textContent = '✓';
            setTimeout(() => { btnElement.textContent = originalText; }, 2000);
          } catch (err) {
            document.getElementById(elementId).select();
            document.execCommand('copy');
            btnElement.textContent = '✓';
            setTimeout(() => { btnElement.textContent = originalText; }, 2000);
          }
        }
      </script>
    </body>
    </html>
  `;
  return htmlResponse(html);
}

// Main Action/Page Router
async function handleStats(request, reqUrl, env) {
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

// Redirect Handler
async function handleRedirect(request, reqUrl, env) {
  let destination = reqUrl.searchParams.get("url");

  if (!destination && reqUrl.pathname.length > 1) {
    destination = reqUrl.pathname.substring(1) + reqUrl.search;
  }

  if (!destination) {
    return new Response("Parameter 'url' is required", { status: 400 });
  }

  const cleanDestination = normalizeUrl(destination);

  const ALLOWED = (env.ALLOWED_HOSTS || "")
    .split(",")
    .map(h => h.trim())
    .filter(Boolean);

  function isSafe(url) {
    try {
      const { protocol, hostname } = new URL(url);
      if (!["https:", "http:"].includes(protocol)) return false;
      if (ALLOWED.length > 0 && !ALLOWED.includes(hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  if (!isSafe(cleanDestination)) {
    return new Response("Forbidden redirect target", { status: 403 });
  }

  const userAgentHeader = request.headers.get("User-Agent") || "";
  if (BOT_RE.test(userAgentHeader)) {
    return Response.redirect(cleanDestination, 302);
  }

  const utmSource = reqUrl.searchParams.get("utm_source") || reqUrl.searchParams.get("source") || reqUrl.searchParams.get("ref") || "";
  let refererHostname = "";
  try {
    const ref = request.headers.get("Referer");
    if (ref) refererHostname = new URL(ref).hostname;
  } catch(e) {}
  const determinedSource = utmSource || refererHostname || "Прямой переход (Direct)";

  if (request.method === "POST") {
    const formData = await request.formData();
    const isConsentGiven = formData.get("consent") === "true";
    const rawDestination = formData.get("destination") || cleanDestination;
    const targetUrl = normalizeUrl(rawDestination);
    const clientFingerprint = formData.get("client_fp") || "";
    const deviceSig = formData.get("device_sig") || "";
    const clickSource = formData.get("click_source") || determinedSource;

    if (!isConsentGiven) {
      return new Response("Consent required", { status: 400 });
    }

    const nowMSK = new Date(Date.now() + MSK_OFFSET);
    const pad = (n) => String(n).padStart(2, '0');
    const mskDateStr = `${nowMSK.getUTCFullYear()}-${pad(nowMSK.getUTCMonth() + 1)}-${pad(nowMSK.getUTCDate())}`;
    const currentMskMins = nowMSK.getUTCHours() * 60 + nowMSK.getUTCMinutes();

    // Check if there is an official event on this exact date AND within valid time window
    const scheduledEvent = await findScheduledMeeting(env, targetUrl, mskDateStr, currentMskMins);

    let meetingId = "";
    if (scheduledEvent) {
      meetingId = `${targetUrl}|${mskDateStr}|${scheduledEvent.name}`;
    } else {
      meetingId = `[Вне расписания] ${targetUrl}|${mskDateStr}|unscheduled`;
    }

    let visitor = null;

    const cookie = request.headers.get("Cookie");
    if (cookie) {
      const match = cookie.match(/visitor_id=([^;]+)/);
      if (match && match[1] && match[1] !== 'null' && match[1] !== 'undefined') {
        visitor = match[1];
      }
    }

    if (!visitor && clientFingerprint && !clientFingerprint.startsWith('fallback_')) {
      visitor = clientFingerprint;
    }

    const rawIp = request.headers.get("CF-Connecting-IP") || "";
    const userAgent = request.headers.get("User-Agent") || "";
    const country = request.headers.get("CF-IPCountry") || "XX";

    if (!visitor || clientFingerprint.startsWith('fallback_')) {
      const compositeFingerprint = `${rawIp}:${userAgent}:${deviceSig}`;
      visitor = "fp_" + (await hashIP(compositeFingerprint, env)).substring(0, 18);
    }

    const ipHash = rawIp ? await hashIP(rawIp, env) : "";

    if (env.meet) {
      try {
        await env.meet.prepare(`
          INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent, country, source)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(meetingId, visitor, Date.now(), ipHash, userAgent, country, clickSource).run();
      } catch (err) {
        try {
          await env.meet.prepare(`
            INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent, country)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(meetingId, visitor, Date.now(), ipHash, userAgent).run();
        } catch (err2) {
          try {
            await env.meet.prepare(`
              INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent)
              VALUES (?, ?, ?, ?, ?)
            `).bind(meetingId, visitor, Date.now(), ipHash, userAgent).run();
          } catch (err3) {
            console.error("D1 visit insertion error:", err3);
          }
        }
      }
    }

    return new Response(null, {
      status: 302,
      headers: {
        "Location": targetUrl,
        "Set-Cookie": `visitor_id=${visitor}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`
      }
    });
  }

  let cleanHost = cleanDestination;
  try {
    cleanHost = new URL(cleanDestination).hostname;
  } catch {}

  const bgImageUrl = "https://sun9-74.vkuserphoto.ru/s/v1/ig2/npu_pP_hhE9Z9msyt8O0ZqkNSu0jeY1pI6bozg9pXYKRoW5M93GbxLLq87viFCSQ7NBrRE7cgmjZsBWnO6sAHzmz.jpg?quality=95&as=32x18,48x27,72x41,108x61,160x90,240x135,360x203,480x270,540x304,640x360,720x405,1080x608,1280x720,1440x810,1672x941&from=bu&u=0rcrS36OUVo-vJGCHcjMyHXPDxAiMcc3qoRaevN8YYY&cs=1672x0";

  const consentHtml = `
    <!DOCTYPE html>
    <html lang="ru" class="h-full">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Переход к встрече</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="min-h-full flex items-center justify-center p-4 font-sans relative overflow-x-hidden">
      
      <!-- Background Image -->
      <div class="fixed inset-0 bg-cover bg-center bg-no-repeat -z-20 transition-all duration-500 scale-105" 
           style="background-image: url('${bgImageUrl}');">
      </div>

      <!-- Soft Darkening Overlay -->
      <div class="fixed inset-0 bg-slate-900/10 backdrop-blur-none"></div>

      <!-- Consent Box Container -->
      <div class="max-w-md w-full bg-white/95 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/20 space-y-6">
        <div class="text-center">
          <div class="mx-auto h-14 w-14 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-4">
            <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-extrabold text-slate-900">Переход к встрече</h2>
          <p class="mt-2 text-sm text-slate-500">Подключение к платформе <span class="font-semibold text-slate-800 font-mono">${escapeHTML(cleanHost)}</span></p>
        </div>

        <form method="POST" class="space-y-6" id="consentForm">
          <input type="hidden" name="destination" value="${escapeHTML(cleanDestination)}">
          <input type="hidden" name="consent" value="true">
          <input type="hidden" name="client_fp" id="clientFpInput" value="">
          <input type="hidden" name="device_sig" id="deviceSigInput" value="">
          <input type="hidden" name="click_source" value="${escapeHTML(determinedSource)}">

          <div class="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 text-xs text-slate-600 leading-relaxed space-y-3">
            <h3 class="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Информированное согласие
            </h3>
            <p>В целях деперсонализированной аналитики посещаемости встреч мы временно фиксируем:</p>
            <ul class="list-disc pl-4 space-y-1 text-slate-500 font-medium">
              <li>Зашифрованный IP-адрес (необратимый хэш)</li>
              <li>Данные о браузере и ОС</li>
            </ul>
            <p class="text-[11.5px] text-slate-400 pt-3 border-t border-slate-200 mt-2">
              Продолжая, вы принимаете условия <a href="/privacy" target="_blank" class="text-indigo-600 hover:text-indigo-800 underline underline-offset-2">Политики конфиденциальности</a> и разрешаете использование файлов Cookie.
            </p>
          </div>

          <label class="flex items-start gap-3 cursor-pointer select-none group p-2 hover:bg-slate-50 rounded-xl transition-colors">
            <div class="relative flex items-start mt-0.5">
              <input type="checkbox" id="consentCheckbox" required class="peer appearance-none h-5 w-5 border-2 border-slate-300 rounded-[6px] checked:bg-sky-600 checked:border-sky-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all cursor-pointer bg-white">
              <svg class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span class="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
              Я согласен с условиями обработки данных
            </span>
          </label>

          <button type="submit" id="submitBtn" disabled class="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-slate-400 bg-sky-600 cursor-not-allowed transition-all duration-200">
            <span>Подключиться</span>
          </button>
        </form>
      </div>

      <script>
        function buildVisitorId() {
          try {
            let deviceId = localStorage.getItem('_meet_did');
            if (!deviceId) {
              deviceId = 'd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
              localStorage.setItem('_meet_did', deviceId);
            }
            return deviceId;
          } catch(e) {
            return 'fallback_' + Math.random().toString(36).substring(2, 11);
          }
        }

        function buildDeviceSignature() {
          try {
            return (window.screen.width || 0) + 'x' + (window.screen.height || 0) + '|' +
                   (navigator.language || '') + '|' +
                   (new Date().getTimezoneOffset()) + '|' +
                   (navigator.hardwareConcurrency || 1);
          } catch(e) {
            return 'default_sig';
          }
        }

        document.getElementById('consentForm').addEventListener('submit', function(e) {
          if (!document.getElementById('consentCheckbox').checked) {
            e.preventDefault();
            return;
          }
          document.getElementById('clientFpInput').value = buildVisitorId();
          document.getElementById('deviceSigInput').value = buildDeviceSignature();
        });

        const checkbox = document.getElementById('consentCheckbox');
        const button = document.getElementById('submitBtn');

        checkbox.addEventListener('change', function() {
          if (this.checked) {
            button.disabled = false;
            button.className = "w-full py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-sky-600 hover:bg-green-600 active:scale-[0.98] transition-all cursor-pointer shadow-md";
          } else {
            button.disabled = true;
            button.className = "w-full py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-slate-300 cursor-not-allowed transition-all";
          }
        });
      </script>
    </body>
    </html>
  `;

  return htmlResponse(consentHtml);
}

function renderPrivacyPage() {
  const html = `
    <!DOCTYPE html>
    <html lang="ru" class="h-full bg-slate-50">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Политика конфиденциальности</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="min-h-full py-12 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div class="max-w-3xl mx-auto bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-slate-100">
        <h1 class="text-3xl font-extrabold text-slate-900 mb-6">Политика конфиденциальности</h1>
        <p class="text-sm text-slate-500 mb-8">Последнее обновление: ${new Date().toLocaleDateString('ru-RU')}</p>
        
        <div class="space-y-6 text-sm leading-relaxed text-slate-700">
          <p>Настоящая политика описывает, какие данные мы собираем при вашем использовании нашего сервиса перенаправления, как эти данные защищаются и для каких целей используются.</p>
          
          <h2 class="text-xl font-bold text-slate-900 mt-8 border-b border-slate-100 pb-2">1. Собираемые данные</h2>
          <p>Для обеспечения корректной работы сервиса и защиты соединений мы собираем следующую информацию:</p>
          <ul class="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Технические данные:</strong> IP-адрес (сохраняется исключительно в виде необратимого криптографического хэша), параметры браузера и операционной системы (User-Agent).</li>
            <li><strong>Аналитические данные:</strong> Дата и время перехода по ссылке, источник перехода (при наличии UTM-меток или Referer), а также примерное географическое положение на уровне страны.</li>
            <li><strong>Идентификаторы:</strong> Уникальный идентификатор посетителя (через Cookie или LocalStorage) для разграничения новых и вернувшихся пользователей.</li>
          </ul>

          <h2 class="text-xl font-bold text-slate-900 mt-8 border-b border-slate-100 pb-2">2. Цели обработки</h2>
          <p>Собранные данные используются исключительно для внутренних нужд, а именно:</p>
          <ul class="list-disc pl-5 space-y-2 mt-2">
            <li>Сбор деперсонализированной аналитики посещаемости встреч и мероприятий.</li>
            <li>Защита платформы от автоматизированных ботов, спама и вредоносной активности.</li>
            <li>Улучшение пользовательского опыта и оптимизация платформы под используемые устройства.</li>
          </ul>

          <h2 class="text-xl font-bold text-slate-900 mt-8 border-b border-slate-100 pb-2">3. Защита и передача данных</h2>
          <p>Мы принимаем все необходимые технические меры для защиты вашей информации. Данные не продаются, не передаются третьим лицам и не используются для настройки таргетированной рекламы. Хэширование IP-адресов делает невозможным установление личности конкретного пользователя.</p>

          <h2 class="text-xl font-bold text-slate-900 mt-8 border-b border-slate-100 pb-2">4. Файлы Cookie</h2>
          <p>Сервис использует функциональные файлы Cookie для сохранения сессии. Нажимая кнопку согласия перед переходом, вы разрешаете их использование в соответствии с данной политикой.</p>

          <div class="mt-12 pt-6 border-t border-slate-100 text-center">
            <button onclick="window.history.back()" class="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              Вернуться назад
            </button>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  return htmlResponse(html);
}

function getConverterHtmlPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Schedule Converter</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 min-h-screen text-slate-800 p-4 md:p-8 font-sans">

  <div class="max-w-4xl mx-auto space-y-6">
    <div class="text-center space-y-2">
      <h1 class="text-3xl font-bold tracking-tight text-slate-900">Smart Schedule Converter</h1>
      <p class="text-slate-500">Upload your calendar CSV. Get a clean, worker-ready list of events.</p>
    </div>

    <div 
      id="dropZone"
      class="mt-8 border-2 border-dashed border-slate-300 hover:border-slate-400 bg-white rounded-xl p-10 text-center cursor-pointer transition-all"
    >
      <svg class="mx-auto h-12 w-12 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
      </svg>
      <h3 class="text-lg font-medium text-slate-900 mb-1">Drag & drop your CSV or TXT file here</h3>
      <p class="text-sm text-slate-500 mb-4">or click to browse from your computer</p>
      <input type="file" id="fileInput" class="hidden" accept=".csv,.txt">
      <button onclick="document.getElementById('fileInput').click()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors text-sm">
        Select File
      </button>
    </div>

    <div id="errorBox" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"></div>

    <div id="resultsCard" class="hidden bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div class="p-4 md:p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
        <div>
          <h3 class="font-semibold text-slate-900 text-lg">Extraction Complete</h3>
          <p id="summaryText" class="text-sm text-slate-500"></p>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <button onclick="resetApp()" class="flex-1 sm:flex-none px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
            Reset
          </button>
          <button onclick="downloadCSV()" class="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
            Download Clean CSV
          </button>
        </div>
      </div>

      <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-slate-50 sticky top-0 border-b border-slate-200">
            <tr>
              <th class="py-3 px-6 font-semibold text-slate-700 text-sm">Date</th>
              <th class="py-3 px-6 font-semibold text-slate-700 text-sm">Time</th>
              <th class="py-3 px-6 font-semibold text-slate-700 text-sm">Event Name</th>
              <th class="py-3 px-6 font-semibold text-slate-700 text-sm">URL</th>
            </tr>
          </thead>
          <tbody id="tableBody" class="divide-y divide-slate-100 text-sm"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let parsedEvents = [];
    let currentFileName = '';

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-blue-500', 'bg-blue-50'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500', 'bg-blue-50'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-blue-500', 'bg-blue-50');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });

    function parseCSV(str) {
      const arr = [];
      let quote = false, row = [], col = '';
      for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c + 1];
        if (cc === '"' && quote && nc === '"') { col += '"'; c++; }
        else if (cc === '"') { quote = !quote; }
        else if (cc === ',' && !quote) { row.push(col); col = ''; }
        else if (cc === '\\n' && !quote) { row.push(col); arr.push(row); col = ''; row = []; }
        else if (cc === '\\r' && !quote) {}
        else { col += cc; }
      }
      if (col || row.length) { row.push(col); arr.push(row); }
      return arr;
    }

    function extractEvents(data) {
      const events = [];
      if (!data || data.length === 0) return events;

      // Check header
      const header = data[0].map(c => (c || '').toLowerCase().trim());
      let dateIdx = 0, timeIdx = 1, nameIdx = 2, linkIdx = 3;

      if (header.some(c => c.includes('дата') || c.includes('date'))) {
        header.forEach((c, i) => {
          if (c.includes('дата') || c.includes('date')) dateIdx = i;
          else if (c.includes('время') || c.includes('time')) timeIdx = i;
          else if (c.includes('название') || c.includes('name')) nameIdx = i;
          else if (c.includes('ссылка') || c.includes('link') || c.includes('url')) linkIdx = i;
        });

        for (let r = 1; r < data.length; r++) {
          const row = data[r];
          if (!row || !row[linkIdx]) continue;
          events.push({
            date: (row[dateIdx] || '').trim(),
            time: (row[timeIdx] || '').trim(),
            name: (row[nameIdx] || '').trim(),
            link: (row[linkIdx] || '').trim()
          });
        }
      }
      return events;
    }

    function handleFile(file) {
      currentFileName = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rawData = parseCSV(e.target.result);
          parsedEvents = extractEvents(rawData);
          
          if (parsedEvents.length === 0) {
            showError('No valid events with links were found in this file.');
            return;
          }
          displayResults();
        } catch (err) {
          showError('Failed to parse file. Make sure it is a valid CSV.');
        }
      };
      reader.readAsText(file);
    }

    function displayResults() {
      document.getElementById('errorBox').classList.add('hidden');
      document.getElementById('dropZone').classList.add('hidden');
      document.getElementById('resultsCard').classList.remove('hidden');
      
      document.getElementById('summaryText').textContent = \`Found \${parsedEvents.length} events in \${currentFileName}\`;
      
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = parsedEvents.map(e => \`
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-6 font-semibold text-slate-700">\${e.date}</td>
          <td class="py-3 px-6 text-indigo-600 font-bold">\${e.time}</td>
          <td class="py-3 px-6 text-slate-800">\${e.name}</td>
          <td class="py-3 px-6 text-blue-600 break-all font-mono text-xs">\${e.link}</td>
        </tr>
      \`).join('');
    }

    function showError(msg) {
      const box = document.getElementById('errorBox');
      box.textContent = msg;
      box.classList.remove('hidden');
    }

    function resetApp() {
      parsedEvents = [];
      document.getElementById('resultsCard').classList.add('hidden');
      document.getElementById('errorBox').classList.add('hidden');
      document.getElementById('dropZone').classList.remove('hidden');
      fileInput.value = '';
    }

    function downloadCSV() {
      if (!parsedEvents.length) return;
      let csvContent = "Дата,Время,Название,Ссылка\\n";
      csvContent += parsedEvents.map(e => \`"\${e.date}","\${e.time}","\${e.name.replace(/"/g, '""')}","\${e.link}"\`).join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', \`Cleaned_\${currentFileName || 'export.csv'}\`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  </script>
</body>
</html>`;
}
