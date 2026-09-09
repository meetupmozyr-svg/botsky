import { htmlResponse, escapeHTML } from './utils.js';

export function renderLoginPage(errorMsg = "") {
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

export function renderInstructionsPage(reqUrl) {
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

export function renderPrivacyPage() {
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

export function getConverterHtmlPage() {
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
