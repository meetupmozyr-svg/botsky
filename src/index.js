import { 
  MSK_OFFSET, BOT_RE, normalizeUrl, parseCalendarCSV, 
  getFriendlyName, parseUA, hashIP, signToken, verifyToken, 
  timingSafeEqualString, htmlResponse, escapeHTML, sanitizeCSV 
} from './utils.js';

import { 
  renderTabs, renderLoginPage, renderInstructionsPage, 
  renderPrivacyPage, getConverterHtmlPage 
} from './views.js';

export default {
  async fetch(request, env, ctx) {
    if (!env.SECRET_KEY) {
      return new Response("Server configuration error: SECRET_KEY is missing.", { status: 500 });
    }

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
      const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
      const kvKey = `login_fail:${clientIp}`;
      let attempts = env.KV ? parseInt(await env.KV.get(kvKey) || "0", 10) : 0;
      if (attempts >= 5) return new Response("Too many login attempts.", { status: 429 });

      const formData = await request.formData();
      if (timingSafeEqualString(formData.get("password") || "", env.STATS_PASSWORD)) {
        if (env.KV) await env.KV.delete(kvKey);
        const token = await signToken(env.STATS_PASSWORD, env.SECRET_KEY);
        return new Response(null, {
          status: 302,
          headers: { "Location": reqUrl.toString(), "Set-Cookie": `stats_auth=${token}; Path=/stats; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict` }
        });
      } else {
        if (env.KV) await env.KV.put(kvKey, String(attempts + 1), { expirationTtl: 900 });
        return htmlResponse(renderLoginPage("Неверный пароль."));
      }
    }
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/stats_auth=([^;]+)/);
    if (!match || !(await verifyToken(match[1], env.STATS_PASSWORD, env.SECRET_KEY))) {
      return htmlResponse(renderLoginPage());
    }
  }

  return htmlResponse(`<div style="padding:40px;font-family:sans-serif;"><h1>Панель аналитики подключена через GitHub!</h1><p><a href="/stats">Перейти к списку встреч</a></p></div>`);
}

async function handleRedirect(request, reqUrl, env) {
  let destination = reqUrl.searchParams.get("url") || (reqUrl.pathname.length > 1 ? reqUrl.pathname.substring(1) + reqUrl.search : "");
  if (!destination) return new Response("Parameter 'url' is required", { status: 400 });

  const cleanDestination = normalizeUrl(destination);
  if (BOT_RE.test(request.headers.get("User-Agent") || "")) return Response.redirect(cleanDestination, 302);

  if (request.method === "POST") {
    const formData = await request.formData();
    if (formData.get("consent") !== "true") return new Response("Consent required", { status: 400 });

    const targetUrl = normalizeUrl(formData.get("destination") || cleanDestination);
    const visitor = formData.get("client_fp") || "fp_unknown";
    const ipHash = await hashIP(request.headers.get("CF-Connecting-IP") || "", env);

    if (env.meet) {
      await env.meet.prepare(`INSERT INTO visits (meeting, visitor_id, visited_at, ip_hash, user_agent, country) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(targetUrl, visitor, Date.now(), ipHash, request.headers.get("User-Agent") || "", request.headers.get("CF-IPCountry") || "XX").run();
    }

    return new Response(null, {
      status: 302,
      headers: { "Location": targetUrl, "Set-Cookie": `visitor_id=${visitor}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly` }
    });
  }

  return htmlResponse(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
    <h2>Переход к встрече</h2><form method="POST"><input type="hidden" name="destination" value="${escapeHTML(cleanDestination)}"><input type="hidden" name="consent" value="true"><button type="submit" style="padding:10px 20px;background:#2563eb;color:#white;border:none;border-radius:5px;cursor:pointer;">Подключиться</button></form>
  </body></html>`);
}
