import { escapeHTML, sanitizeCSV } from './utils.js';

export const renderTabs = (active) => `
  <div class="flex flex-wrap gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
    <a href="/stats" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">📊 Все встречи</a>
    <a href="/stats?report=monthly" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active === 'monthly' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">📅 Дашборд за месяц</a>
    <a href="/stats?report=monthly_ranking" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${active === 'ranking' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">🏆 Рейтинг встреч за месяц</a>
    <a href="/stats?report=schedule" class="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${active === 'schedule' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}">
      Календарь расписания (CSV)
    </a>
  </div>
`;

export function renderLoginPage(errorMsg = "") {
  return `<!DOCTYPE html>
    <html lang="ru" class="h-full bg-slate-50">
    <head><meta charset="UTF-8"><title>Вход</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="h-full flex items-center justify-center px-4">
      <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <h2 class="text-3xl font-extrabold text-slate-900 text-center">Вход в аналитику</h2>
        <form class="mt-8 space-y-6" method="POST">
          ${errorMsg ? `<div class="p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">${escapeHTML(errorMsg)}</div>` : ''}
          <input name="password" type="password" required class="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-slate-900" placeholder="Пароль">
          <button type="submit" class="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg">Войти</button>
        </form>
      </div>
    </body></html>`;
}

export function renderInstructionsPage(reqUrl) {
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  return `<!DOCTYPE html>
    <html lang="ru" class="h-full bg-slate-50">
    <head><meta charset="UTF-8"><title>Генератор ссылок</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="min-h-full py-12 px-4"><div class="max-w-2xl mx-auto space-y-8">
      <h1 class="text-3xl font-extrabold text-slate-900 text-center">Генератор ссылок</h1>
      <div class="bg-white p-6 rounded-2xl shadow-xl border space-y-4">
        <label class="block text-xs font-bold text-slate-400 uppercase">URL встречи</label>
        <input type="text" id="targetInput" placeholder="https://zoom.us/..." class="w-full px-4 py-3 border rounded-xl text-sm">
        <div>
          <label class="block text-xs font-bold text-indigo-600 uppercase mb-1">Прямая ссылка</label>
          <input type="text" id="outputDirect" readonly class="w-full px-4 py-2 bg-slate-50 border rounded-xl font-mono text-xs" value="${baseUrl}/">
        </div>
      </div>
    </div>
    <script>
      const targetInput = document.getElementById('targetInput');
      const outputDirect = document.getElementById('outputDirect');
      const base = "${baseUrl}/";
      targetInput.addEventListener('input', function() {
        let cleanVal = this.value.trim().replace(/^https?:\\/\\//i, '');
        outputDirect.value = cleanVal ? base + cleanVal : base;
      });
    </script></body></html>`;
}

export function renderPrivacyPage() {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Политика</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8 max-w-2xl mx-auto"><h1 class="text-2xl font-bold mb-4">Политика конфиденциальности</h1><p>Данные защищены хэшированием.</p></body></html>`;
}

export function getConverterHtmlPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Converter</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="p-8"><h1 class="text-2xl font-bold">Converter</h1></body></html>`;
}
