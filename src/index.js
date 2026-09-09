import { MSK_OFFSET, BOT_RE, normalizeUrl, hashIP, signToken, verifyToken, timingSafeEqualString, htmlResponse, escapeHTML } from './utils.js';
import { renderPrivacyPage, getConverterHtmlPage, renderLoginPage, renderInstructionsPage } from './views.js';
import { getScheduleMap, renderAllMeetings, renderMonthlyRanking, renderMonthlyReport, renderScheduleManager, renderSingleMeeting, handleCSVExport, handleCSVUpload } from './stats.js';

export default {
  async fetch(request, env, ctx) {
    if (!env.SECRET_KEY) return new Response("Server configuration error: SECRET_KEY is missing.", { status: 500 });

    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (reqUrl.pathname === "/privacy") return htmlResponse(renderPrivacyPage());
    if (reqUrl.pathname === "/cleaner" || reqUrl.pathname === "/converter") return htmlResponse(getConverterHtmlPage());
    if (reqUrl.pathname === "/stats") return await handleStats(request, reqUrl, env);

    const queryUrl = reqUrl.searchParams.get("url");
    if (reqUrl.pathname === "/" && !queryUrl) return htmlResponse(renderInstructionsPage(reqUrl));

    return await handleRedirect(request, reqUrl, env);
  }
};

async function handleStats(request, reqUrl, env) {
  if (env.STATS_PASSWORD) {
    if (request.method === "POST" && !reqUrl.searchParams.get("action")) {
      const formData = await request.formData();
      if (timingSafeEqualString(formData.get("password") || "", env.STATS_PASSWORD)) {
        const token = await signToken(env.STATS_PASSWORD, env.SECRET_KEY);
        return new Response(null, { status: 302, headers: { "Location": reqUrl.toString(), "Set-Cookie": `stats_auth=${token}; Path=/stats; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict` } });
      }
      return htmlResponse(renderLoginPage("Неверный пароль."));
    }
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/stats_auth=([^;]+)/);
    if (!match || !(await verifyToken(match[1], env.STATS_PASSWORD, env.SECRET_KEY))) {
      return htmlResponse(renderLoginPage());
    }
  }

  if (reqUrl.searchParams.get("action") === "toggle_hide") {
    const meetingToToggle = reqUrl.searchParams.get("meeting");
    if (meetingToToggle && env.meet) {
      await env.meet.prepare(`CREATE TABLE IF NOT EXISTS hidden_meetings (meeting TEXT PRIMARY KEY)`).run();
      const existing = await env.meet.prepare(`SELECT meeting FROM hidden_meetings WHERE meeting = ?`).bind(meetingToToggle).first();
      if (existing) await env.meet.prepare(`DELETE FROM hidden_meetings WHERE meeting = ?`).bind(meetingToToggle).run();
      else await env.meet.prepare(`INSERT OR REPLACE INTO hidden_meetings (meeting) VALUES (?)`).bind(meetingToToggle).run();
    }
    return Response.redirect(new URL(reqUrl.searchParams.get("redirect") || "/stats", request.url).toString(), 302);
  }

  if (reqUrl.searchParams.get("action") === "upload_csv" && request.method === "POST") {
    return await handleCSVUpload(request, env);
  }

  const reportType = reqUrl.searchParams.get("report");
  const { scheduleDict, scheduleEventsList } = await getScheduleMap(env);

  if (reportType === "schedule") return await renderScheduleManager(env, scheduleDict, reqUrl);
  if (reportType === "monthly_ranking") return await renderMonthlyRanking(reqUrl, env, scheduleDict, scheduleEventsList);
  if (reportType === "monthly") return await renderMonthlyReport(reqUrl, env, scheduleDict, scheduleEventsList);

  const meetingId = reqUrl.searchParams.get("meeting");
  if (!meetingId) return await renderAllMeetings(reqUrl, env, scheduleDict, scheduleEventsList);
  
  if (reqUrl.searchParams.get("export") === "csv") return await handleCSVExport(meetingId, env);
  return await renderSingleMeeting(meetingId, env, scheduleDict);
}

async function handleRedirect(request, reqUrl, env) {
  let destination = reqUrl.searchParams.get("url") || (reqUrl.pathname.length > 1 ? reqUrl.pathname.substring(1) + reqUrl.search : "");
  if (!destination) return new Response("Parameter 'url' is required", { status: 400 });

  const cleanDestination = normalizeUrl(destination);
  const ALLOWED = (env.ALLOWED_HOSTS || "").split(",").map(h => h.trim()).filter(Boolean);

  if (ALLOWED.length > 0) {
    try { if (!ALLOWED.includes(new URL(cleanDestination).hostname)) return new Response("Forbidden redirect target", { status: 403 }); } catch { return new Response("Invalid URL", { status: 400 }); }
  }

  if (BOT_RE.test(request.headers.get("User-Agent") || "")) return Response.redirect(cleanDestination, 302);

  const utmSource = reqUrl.searchParams.get("utm_source") || reqUrl.searchParams.get("source") || reqUrl.searchParams.get("ref") || "";
  let refererHostname = "";
  try { const ref = request.headers.get("Referer"); if (ref) refererHostname = new URL(ref).hostname; } catch(e) {}
  const determinedSource = utmSource || refererHostname || "Прямой переход (Direct)";

  if (request.method === "POST") {
    const formData = await request.formData();
    if (formData.get("consent") !== "true") return new Response("Consent required", { status: 400 });

    const targetUrl = normalizeUrl(formData.get("destination") || cleanDestination);
    const clientFingerprint = formData.get("client_fp") || "";
    const deviceSig = formData.get("device_sig") || "";
    const clickSource = formData.get("click_source") || determinedSource;

    const nowMSK = new Date(Date.now() + MSK_OFFSET);
    const pad = (n) => String(n).padStart(2, '0');
    const mskDateStr = `${nowMSK.getUTCFullYear()}-${pad(nowMSK.getUTCMonth() + 1)}-${pad(nowMSK.getUTCDate())}`;
    
    const meetingId = `[Вне расписания] ${targetUrl}|${mskDateStr}|unscheduled`;

    let visitor = null;
    const cookie = request.headers.get("Cookie");
    if (cookie) {
      const match = cookie.match(/visitor_id=([^;]+)/);
      if (match && match[1]) visitor = match[1];
    }
    if (!visitor && clientFingerprint && !clientFingerprint.startsWith('fallback_')) visitor = clientFingerprint;

    const rawIp = request.headers.get("CF-Connecting-IP") || "";
    const userAgent = request.headers.get("User-Agent") || "";
    const country = request.headers.get("CF-IPCountry") || "XX";

    if (!visitor || clientFingerprint.startsWith('fallback_')) {
      visitor = "fp_" + (await hashIP(`${rawIp}:${userAgent}:${deviceSig}`, env)).substring(0, 18);
    }
    const ipHash = rawIp ? await hashIP(rawIp, env) : "";

    if (env.meet) {
      try {
        await env.meet.prepare(`INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent, country, source) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(meetingId, visitor, Date.now(), ipHash, userAgent, country, clickSource).run();
      } catch (err) {
        try { await env.meet.prepare(`INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent, country) VALUES (?, ?, ?, ?, ?, ?)`).bind(meetingId, visitor, Date.now(), ipHash, userAgent, country).run(); } catch(e) {}
      }
    }

    return new Response(null, {
      status: 302,
      headers: { "Location": targetUrl, "Set-Cookie": `visitor_id=${visitor}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly` }
    });
  }

  let cleanHost = cleanDestination;
  try { cleanHost = new URL(cleanDestination).hostname; } catch {}

  const bgImageUrl = "https://sun9-74.vkuserphoto.ru/s/v1/ig2/npu_pP_hhE9Z9msyt8O0ZqkNSu0jeY1pI6bozg9pXYKRoW5M93GbxLLq87viFCSQ7NBrRE7cgmjZsBWnO6sAHzmz.jpg?quality=95&as=32x18,48x27,72x41,108x61,160x90,240x135,360x203,480x270,540x304,640x360,720x405,1080x608,1280x720,1440x810,1672x941&from=bu&u=0rcrS36OUVo-vJGCHcjMyHXPDxAiMcc3qoRaevN8YYY&cs=1672x0";

  const consentHtml = `<!DOCTYPE html><html lang="ru" class="h-full"><head><meta charset="UTF-8"><title>Переход к встрече</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="min-h-full flex items-center justify-center p-4 relative overflow-x-hidden">
    <div class="fixed inset-0 bg-cover bg-center bg-no-repeat -z-20 scale-105" style="background-image: url('${bgImageUrl}');"></div>
    <div class="fixed inset-0 bg-slate-900/10"></div>
    <div class="max-w-md w-full bg-white/95 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border space-y-6">
      <div class="text-center">
        <h2 class="text-2xl font-extrabold text-slate-900">Переход к встрече</h2>
        <p class="mt-2 text-sm text-slate-500">Платформа: <span class="font-mono">${escapeHTML(cleanHost)}</span></p>
      </div>
      <form method="POST" class="space-y-6" id="consentForm">
        <input type="hidden" name="destination" value="${escapeHTML(cleanDestination)}">
        <input type="hidden" name="consent" value="true">
        <input type="hidden" name="client_fp" id="clientFpInput" value="">
        <input type="hidden" name="device_sig" id="deviceSigInput" value="">
        <input type="hidden" name="click_source" value="${escapeHTML(determinedSource)}">
        <label class="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" id="consentCheckbox" required class="mt-1 h-5 w-5 rounded">
          <span class="text-sm text-slate-700">Я согласен с условиями обработки данных</span>
        </label>
        <button type="submit" id="submitBtn" disabled class="w-full py-3 bg-slate-300 text-white font-bold rounded-xl cursor-not-allowed">Подключиться</button>
      </form>
    </div>
    <script>
      document.getElementById('consentForm').addEventListener('submit', () => {
        let did = localStorage.getItem('_meet_did');
        if (!did) { did = 'd_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36); localStorage.setItem('_meet_did', did); }
        document.getElementById('clientFpInput').value = did;
        document.getElementById('deviceSigInput').value = screen.width + 'x' + screen.height;
      });
      document.getElementById('consentCheckbox').addEventListener('change', (e) => {
        const btn = document.getElementById('submitBtn');
        btn.disabled = !e.target.checked;
        btn.className = e.target.checked ? "w-full py-3 bg-sky-600 text-white font-bold rounded-xl cursor-pointer shadow-md" : "w-full py-3 bg-slate-300 text-white font-bold rounded-xl cursor-not-allowed";
      });
    </script></body></html>`;

  return htmlResponse(consentHtml);
}
