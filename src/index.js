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

import { 
  handleAssistantChat, 
  classifyScenarioWithConfidence 
} from './assistant.js';

import { renderAssistantPage } from './assistantView.js';
import { executeEvaluationSuite } from './evalSuite.js';

// Семантическое разбиение контента на поисковые чанки
function splitContentIntoChunks(content, chunkSize = 800) {
  if (!content) return [];
  const text = String(content).trim();
  if (text.length <= chunkSize) return [text];

  const sections = text.split(/\n(?=###|##|\d+\.|\*|-)/g);
  const chunks = [];
  let currentChunk = '';

  for (const sec of sections) {
    if ((currentChunk + '\n' + sec).length <= chunkSize) {
      currentChunk += (currentChunk ? '\n' : '') + sec;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sec;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.length ? chunks : [text.slice(0, chunkSize)];
}

// Главная точка входа Cloudflare Worker
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

    // Служебная страница пакетной загрузки статей в D1 с авточанкованием
    if (reqUrl.pathname === "/import-articles") {
      return handleArticlesImport(request, env);
    }

    // Тестовый стенд оценки ассистента
    if (reqUrl.pathname === "/eval") {
      return renderEvaluationDashboard();
    }

    // API эндпоинт запуска автоматических тестов
    if (reqUrl.pathname === "/api/eval") {
      const suiteReport = await executeEvaluationSuite(classifyScenarioWithConfidence);
      return new Response(JSON.stringify(suiteReport), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (reqUrl.pathname === "/stats") {
      return await handleStats(request, reqUrl, env);
    }

    // Веб-интерфейс и API ассистента преподавателя
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

// Страница панели автотестов (/eval)
function renderEvaluationDashboard() {
  const html = `<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Тестовый стенд оценки ассистента</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-full py-10 px-4 sm:px-6 lg:px-8 font-sans text-slate-800">
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
      <div>
        <div class="text-xs font-bold text-indigo-600 uppercase tracking-wider">Тестовый стенд • Сентябрь 2026</div>
        <h1 class="text-2xl font-extrabold text-slate-900 mt-1">Автоматический тест пайплайна правил</h1>
        <p class="text-xs text-slate-500 mt-1">Регрессионное тестирование сценариев: неявки, 50 минут, отмены, форс-мажор, перерывы, B2B</p>
      </div>
      <button 
        onclick="runTests()" 
        id="runBtn"
        class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
      >
        <span>⚡ Запустить тесты</span>
      </button>
    </div>

    <div id="summaryCards" class="grid grid-cols-2 sm:grid-cols-4 gap-4 hidden">
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Всего тестов</div>
        <div id="totalTestsVal" class="text-2xl font-extrabold text-slate-900 mt-1">0</div>
      </div>
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Точность сценариев</div>
        <div id="scenarioAccVal" class="text-2xl font-extrabold text-emerald-600 mt-1">0%</div>
      </div>
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Точность решений</div>
        <div id="decisionAccVal" class="text-2xl font-extrabold text-indigo-600 mt-1">0%</div>
      </div>
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Статус стенда</div>
        <div id="suiteStatusVal" class="text-lg font-extrabold mt-1 text-slate-700">—</div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h2 class="font-bold text-sm text-slate-800">Матрица результатов</h2>
        <span id="testsCounter" class="text-xs text-slate-400">Нажмите «Запустить тесты»</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
          <thead class="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">ID</th>
              <th class="px-4 py-3">Входной запрос преподавателя</th>
              <th class="px-4 py-3">Ожидаемый / Распознанный сценарий</th>
              <th class="px-4 py-3">Предписанное решение</th>
              <th class="px-4 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody id="resultsBody" class="divide-y divide-slate-100 bg-white">
            <tr>
              <td colspan="5" class="px-4 py-12 text-center text-slate-400">
                Тесты еще не запускались
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    async function runTests() {
      const btn = document.getElementById('runBtn');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Выполняются тесты...</span>';

      try {
        const res = await fetch('/api/eval');
        const data = await res.json();

        document.getElementById('summaryCards').classList.remove('hidden');
        document.getElementById('totalTestsVal').textContent = data.totalTests;
        document.getElementById('scenarioAccVal').textContent = data.scenarioAccuracyPct + '%';
        document.getElementById('decisionAccVal').textContent = data.decisionAccuracyPct + '%';
        
        const statusEl = document.getElementById('suiteStatusVal');
        if (data.passedAll) {
          statusEl.textContent = '✅ Все пройдены (100%)';
          statusEl.className = 'text-lg font-extrabold mt-1 text-emerald-600';
        } else {
          statusEl.textContent = '⚠️ Есть ошибки';
          statusEl.className = 'text-lg font-extrabold mt-1 text-amber-600';
        }

        const tbody = document.getElementById('resultsBody');
        tbody.innerHTML = data.results.map(r => \`
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 font-mono font-bold text-slate-500">\${r.id}</td>
            <td class="px-4 py-3 font-medium text-slate-900 max-w-sm break-words">\${r.input}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold \${r.scenarioPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                \${r.actualScenario}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-600 font-mono text-[11px]">\${r.actualDecision}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">
              \${r.scenarioPassed && r.decisionPassed 
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">PASS</span>'
                : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">FAIL</span>'}
            </td>
          </tr>
        \`).join('');

      } catch (err) {
        alert('Ошибка запуска тестов: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡ Перезапустить тесты</span>';
      }
    }
  </script>
</body>
</html>`;
  return htmlResponse(html);
}

// Обработчик загрузки и нарезки статей в D1
async function handleArticlesImport(request, env) {
  if (!env.ARTICLES_DB) {
    return new Response("База данных ARTICLES_DB не привязана в wrangler.toml", { status: 500 });
  }

  // POST: сохранение статей и генерация чанков
  if (request.method === "POST") {
    try {
      const { articles } = await request.json();
      if (!Array.isArray(articles) || articles.length === 0) {
        return new Response(JSON.stringify({ error: "Пустой массив статей" }), { status: 400 });
      }

      await env.ARTICLES_DB.prepare(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY,
          title TEXT,
          category TEXT,
          url TEXT,
          content TEXT
        )
      `).run();

      await env.ARTICLES_DB.prepare(`
        CREATE TABLE IF NOT EXISTS article_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER,
          title TEXT,
          category TEXT,
          url TEXT,
          chunk_content TEXT,
          chunk_index INTEGER
        )
      `).run();

      await env.ARTICLES_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_articles_title ON articles(title)`).run();
      await env.ARTICLES_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chunks_title ON article_chunks(title)`).run();

      const stmts = [];

      for (const art of articles) {
        const artId = parseInt(art.id, 10);
        const title = String(art.title || "").trim();
        const category = String(art.category || art.domain || "").trim();
        const url = String(art.url || art.source_url || "").trim();
        const content = String(art.content || art.content_cleaned || art.summary || "").trim();

        stmts.push(
          env.ARTICLES_DB.prepare(`
            INSERT OR REPLACE INTO articles (id, title, category, url, content)
            VALUES (?, ?, ?, ?, ?)
          `).bind(artId, title, category, url, content)
        );

        const chunks = splitContentIntoChunks(content, 900);
        stmts.push(env.ARTICLES_DB.prepare(`DELETE FROM article_chunks WHERE article_id = ?`).bind(artId));

        chunks.forEach((chunkText, idx) => {
          stmts.push(
            env.ARTICLES_DB.prepare(`
              INSERT INTO article_chunks (article_id, title, category, url, chunk_content, chunk_index)
              VALUES (?, ?, ?, ?, ?, ?)
            `).bind(artId, title, category, url, chunkText, idx)
          );
        });
      }

      for (let i = 0; i < stmts.length; i += 50) {
        await env.ARTICLES_DB.batch(stmts.slice(i, i + 50));
      }

      return new Response(JSON.stringify({ success: true, count: articles.length }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  const html = `
<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Импорт базы знаний в Cloudflare D1</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-full flex items-center justify-center p-6 text-slate-800 font-sans">
  <div class="max-w-xl w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
    <div class="text-center space-y-2">
      <div class="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 text-2xl shadow-xs">
        ⚡
      </div>
      <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Загрузка базы в Cloudflare D1</h1>
      <p class="text-xs text-slate-500">
        Перетащите JSON-файлы с очищенными статьями для автоматического сохранения и нарезки на чанки.
      </p>
    </div>

    <div 
      id="dropZone"
      class="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all"
    >
      <input type="file" id="fileInput" class="hidden" accept=".json">
      <div class="space-y-3">
        <svg class="mx-auto h-10 w-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <div>
          <span class="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Выберите JSON файл</span>
          <span class="text-sm text-slate-500"> или перетащите его сюда</span>
        </div>
        <p class="text-[11px] text-slate-400">Файлы категорий 01–06 базы знаний</p>
      </div>
    </div>

    <div id="progressBox" class="hidden space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
      <div class="flex justify-between text-xs font-bold text-slate-700">
        <span id="statusLabel">Отправка и чанкование...</span>
        <span id="progressPercent">0%</span>
      </div>
      <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
        <div id="progressBar" class="bg-indigo-600 h-full rounded-full transition-all duration-200" style="width: 0%"></div>
      </div>
      <p id="detailLabel" class="text-[11px] text-slate-400 text-center">Загружено 0 из 0 статей</p>
    </div>

    <div id="successBox" class="hidden p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-center space-y-2">
      <div class="text-xl">🎉</div>
      <div class="font-bold text-sm">База знаний успешно обновлена!</div>
      <p class="text-xs text-emerald-700">Статьи нарезаны на поисковые чанки и готовы к использованию.</p>
      <div class="pt-2">
        <a href="/assistant" class="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs">
          Перейти к ассистенту →
        </a>
      </div>
    </div>
  </div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const progressBox = document.getElementById('progressBox');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const detailLabel = document.getElementById('detailLabel');
    const successBox = document.getElementById('successBox');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500', 'bg-indigo-50/40'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/40'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/40');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });

    async function handleFile(file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const articles = JSON.parse(e.target.result);
          if (!Array.isArray(articles)) throw new Error('Файл не содержит массив статей');

          dropZone.classList.add('hidden');
          progressBox.classList.remove('hidden');

          const chunkSize = 25;
          const total = articles.length;
          let uploaded = 0;

          for (let i = 0; i < total; i += chunkSize) {
            const chunk = articles.slice(i, i + chunkSize);
            const res = await fetch('/import-articles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ articles: chunk })
            });

            if (!res.ok) throw new Error('Ошибка сервера при загрузке: ' + res.status);

            uploaded += chunk.length;
            const pct = Math.round((uploaded / total) * 100);
            progressBar.style.width = pct + '%';
            progressPercent.textContent = pct + '%';
            detailLabel.textContent = 'Загружено и разбито ' + uploaded + ' из ' + total + ' статей';
          }

          progressBox.classList.add('hidden');
          successBox.classList.remove('hidden');

        } catch (err) {
          alert('Ошибка при импорте: ' + err.message);
          dropZone.classList.remove('hidden');
          progressBox.classList.add('hidden');
        }
      };
      reader.readAsText(file);
    }
  </script>
</body>
</html>
  `;
  return htmlResponse(html);
}

// Редирект и аналитика
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
      <div class="fixed inset-0 bg-cover bg-center bg-no-repeat -z-20 transition-all duration-500 scale-105" 
           style="background-image: url('${bgImageUrl}');">
      </div>
      <div class="fixed inset-0 bg-slate-900/10 backdrop-blur-none"></div>

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
