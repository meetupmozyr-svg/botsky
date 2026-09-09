import { 
  MSK_OFFSET, 
  BOT_RE, 
  normalizeUrl, 
  hashIP, 
  htmlResponse, 
  escapeHTML 
} from './utils.js';

import { 
  renderPrivacyPage, 
  getConverterHtmlPage, 
  renderInstructionsPage 
} from './views.js';

import { 
  handleStats, 
  findScheduledMeeting 
} from './stats.js';

import { handleAssistantChat } from './assistant.js';
import { renderAssistantPage } from './assistantView.js';

// Cloudflare ES Module Entrypoint
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

    // Smart Assistant Routes
    if (reqUrl.pathname === "/assistant" || reqUrl.pathname === "/chat") {
      return renderAssistantPage();
    }

    if (reqUrl.pathname === "/api/assistant" || reqUrl.pathname === "/api/chat") {
      return await handleAssistantChat(request, env);
    }

    const queryUrl = reqUrl.searchParams.get("url");
    if (reqUrl.pathname === "/" && !queryUrl) {
      return renderInstructionsPage(reqUrl);
    }

    return await handleRedirect(request, reqUrl, env);
  }
};

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
