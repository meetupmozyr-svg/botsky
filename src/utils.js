// Moscow Time Offset (UTC+3)
export const MSK_OFFSET = 3 * 3600 * 1000;

// Security Headers Helper
export function getSecurityHeaders() {
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

export function htmlResponse(html, status = 200, customHeaders = {}) {
  return new Response(html, {
    status,
    headers: { ...getSecurityHeaders(), ...customHeaders }
  });
}

// Utility function to prevent Cross-Site Scripting (XSS)
export const escapeHTML = (str) => {
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
export function sanitizeCSV(str) {
  if (str === null || str === undefined) return '""';
  let stringified = String(str);
  if (/^[=+\-@\t\r]/.test(stringified)) {
    stringified = "'" + stringified;
  }
  return `"${stringified.replace(/"/g, '""')}"`;
}

// Robust Full 2D CSV Grid Tokenizer
export function parseFullCSVGrid(text, separator) {
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
export function normalizeUrl(url) {
  if (!url) return "";
  let str = url.trim();
  
  if (/^https?:\/\/[^\/]+\/https?:\/\//i.test(str)) {
    str = str.replace(/^https?:\/\/[^\/]+\/(https?:\/\/)/i, '$1');
  } else if (/^https?:\/\/[^\/]*(workers\.dev|skymeet\.ru)\//i.test(str)) {
    str = str.replace(/^https?:\/\/[^\/]*(workers\.dev|skymeet\.ru)\//i, 'https://');
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

// Universal Calendar CSV Parser
export function parseCalendarCSV(text, filename = "") {
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

      let startMins = 12 * 60;
      let endMins = 13 * 60;

      const timeRangeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
      const singleTimeMatch = rawTime.match(/(\d{1,2})[:.](\d{2})/);

      if (timeRangeMatch) {
        startMins = parseInt(timeRangeMatch[1], 10) * 60 + parseInt(timeRangeMatch[2], 10);
        endMins = parseInt(timeRangeMatch[3], 10) * 60 + parseInt(timeRangeMatch[4], 10);
      } else if (singleTimeMatch) {
        startMins = parseInt(singleTimeMatch[1], 10) * 60 + parseInt(singleTimeMatch[2], 10);
        endMins = startMins + 60;
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
export function getFriendlyName(scheduleDict, meetingUrl, meetingDate = "") {
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
export function parseUA(uaString) {
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
export function getFlagEmoji(countryCode) {
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

export const BOT_RE = /telegrambot|mattermost-bot|twitterbot|slackbot|discordbot|whatsapp|linkedinbot|googlebot|bingbot|yandexbot|facebookexternalhit|facebot|applebot|curl\/|wget\/|headlesschrome|lighthouse|uptimerobot|pingdom|datadog|ahrefsbot|semrushbot|mj12bot/i;

// Hash IP address with SHA-256
export async function hashIP(ipString, env) {
  if (!ipString) return "";
  const salt = env.IP_HASH_SALT || "DEFAULT_STATIC_SALT_KEY";
  const encoder = new TextEncoder();
  const data = encoder.encode(ipString + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sign token using HMAC-SHA256
export async function signToken(password, secret) {
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
export async function verifyToken(token, password, secret) {
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
export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}
