import { escapeHTML } from './utils.js';

export const renderTabs = (active) => `
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

export function renderLoginPage(errorMsg = "") {
  return `
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
}

export function renderInstructionsPage(reqUrl) {
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  return `
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
}

export function renderPrivacyPage() {
  return `
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
  </div>
</body>
</html>`;
}
