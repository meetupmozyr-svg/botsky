import { htmlResponse } from './utils.js';

export function renderAssistantPage() {
  const html = `<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50/80">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">
  <title>Умный ассистент преподавателя</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
  <style>
    .prose-chat { line-height: 1.68; font-size: 0.935rem; color: #1e293b; word-break: break-word; }
    .prose-chat p { margin-bottom: 0.65rem; }
    .prose-chat p:last-child { margin-bottom: 0; }
    .prose-chat ul, .prose-chat ol { margin-left: 1.25rem; margin-bottom: 0.65rem; list-style-type: disc; }
    .prose-chat strong { font-weight: 700; color: #0f172a; }

    /* 2026 Tactile Link Chips */
    .prose-chat a { 
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.7rem;
      border-radius: 0.65rem;
      background: #ffffff;
      color: #4338ca;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85em;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04);
      transition: all 0.15s ease-in-out;
      margin: 0.2rem 0.25rem 0.2rem 0;
    }
    .prose-chat a:hover { 
      background: #eef2ff; 
      border-color: #c7d2fe;
      color: #312e81;
      transform: translateY(-1px);
    }
    .prose-chat a::after {
      content: "↗";
      font-size: 0.85em;
      opacity: 0.7;
    }

    @keyframes pulse-dot {
      0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
      40% { transform: scale(1); opacity: 1; }
    }
    .typing-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #6366f1;
      animation: pulse-dot 1.4s infinite ease-in-out both;
    }
    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes shimmer {
      0% { opacity: 0.55; }
      50% { opacity: 1; }
      100% { opacity: 0.55; }
    }
    .animate-shimmer {
      animation: shimmer 1.8s infinite ease-in-out;
    }
  </style>
</head>
<body class="h-full flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-600 selection:text-white bg-gradient-to-b from-slate-50 via-slate-50/90 to-indigo-50/20">

  <!-- Top Header Navigation -->
  <header class="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-30 transition-all">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-sm font-bold text-lg ring-4 ring-indigo-50/80">
          🤖
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-bold text-slate-900 text-sm sm:text-base tracking-tight">Ассистент преподавателя</h1>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              База: 600+ статей
            </span>
          </div>
          <p class="text-[11px] text-slate-400 font-medium hidden sm:block">Регламенты Skyeng & Skysmart • Защита рейтинга и KPI</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <a 
          href="https://helpcenter.skyeng.ru" 
          target="_blank" 
          rel="noopener noreferrer" 
          title="Открыть официальный Help Center"
          class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
        >
          <span>Help Center</span>
          <span class="text-xs opacity-60">↗</span>
        </a>

        <button 
          onclick="clearChat()" 
          id="clearBtn" 
          title="Начать сначала" 
          class="hidden px-3.5 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
        >
          <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span>Новый вопрос</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Scroll Area with generous bottom padding -->
  <main class="flex-1 overflow-y-auto px-4 py-6 flex flex-col" id="chatScrollArea">
    <div class="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center space-y-6 pb-56" id="messagesContainer">

      <!-- Centered Hero Section -->
      <div id="centerHeroBox" class="py-4 sm:py-8 text-center space-y-6 my-auto">
        <div class="space-y-3">
          <div class="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-3xl shadow-lg shadow-indigo-500/20 text-white ring-8 ring-indigo-50/60">
            🎓
          </div>
          
          <div class="space-y-1">
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Чем я могу помочь вам сегодня?
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              Быстрые ответы по статусам уроков, отменам, форс-мажорам, перерывам, регламентам и выплатам.
            </p>
          </div>
        </div>

        <!-- Big Help Center Banner -->
        <div class="max-w-2xl mx-auto">
          <a 
            href="https://helpcenter.skyeng.ru" 
            target="_blank" 
            rel="noopener noreferrer"
            class="group flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all text-left shadow-sm"
          >
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                📚
              </div>
              <div>
                <div class="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                  <span>Официальный Help Center для преподавателей</span>
                  <span class="inline-block text-xs font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">600+ статей</span>
                </div>
                <div class="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Первоисточник всех действующих регламентов, стандартов и инструкций школы
                </div>
              </div>
            </div>
            <div class="text-indigo-600 font-bold text-sm sm:text-base pr-1 group-hover:translate-x-1 transition-transform">
              ↗
            </div>
          </a>
        </div>

        <!-- Centered Main Input Box -->
        <div class="bg-white p-3.5 sm:p-4 rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/90 max-w-2xl mx-auto transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
          <textarea
            id="centerMessageInput"
            rows="2"
            placeholder="Напишите ваш вопрос (например: «Ученик не пришел на урок, какой статус поставить?»)..."
            class="w-full bg-transparent border-0 resize-none outline-none text-sm sm:text-base text-slate-900 placeholder-slate-400 px-2 py-1 leading-relaxed"
            onkeydown="handleCenterKeyDown(event)"
          ></textarea>
          
          <div class="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-2">
            <span class="text-[11px] text-slate-400 pl-2 flex items-center gap-1">
              <span>Нажмите</span> <kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600">Enter ↵</kbd>
            </span>
            <button
              onclick="submitFromCenter()"
              class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Задать вопрос</span>
              <span class="text-sm">🚀</span>
            </button>
          </div>
        </div>

        <!-- Quick Question Chips -->
        <div class="space-y-3 max-w-2xl mx-auto pt-1">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left pl-1">Частые ситуации:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
            <button onclick="sendQuickPrompt('Ученик не пришел на урок. Какой статус выставить и сколько ждать?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-start gap-3 group cursor-pointer shadow-sm hover:-translate-y-0.5">
              <span class="text-base group-hover:scale-110 transition-transform">⏳</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Ученик не пришел на урок</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Правило 50 минут и 100% оплата</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('У меня форс-мажор за 15 минут до урока, как отменить без нарушений?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-start gap-3 group cursor-pointer shadow-sm hover:-translate-y-0.5">
              <span class="text-base group-hover:scale-110 transition-transform">⚡</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Форс-мажор перед уроком</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Порядок действий в Teachers Care</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('Ученик хочет сменить преподавателя. Какие последствия для меня?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-start gap-3 group cursor-pointer shadow-sm hover:-translate-y-0.5">
              <span class="text-base group-hover:scale-110 transition-transform">🔄</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Ученик хочет сменить учителя</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Штрафы, лимиты и действия в CRM</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('Как оформить перерыв в расписании без вреда рейтингу и штрафов?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-start gap-3 group cursor-pointer shadow-sm hover:-translate-y-0.5">
              <span class="text-base group-hover:scale-110 transition-transform">🏖️</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Перерыв и отпуск в расписании</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Зоны 72 ч и 14 дней, подбор замен</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Center Hero Red Alert Box -->
        <div class="max-w-2xl mx-auto bg-rose-50/90 border-2 border-rose-200/90 text-rose-950 p-3.5 rounded-2xl shadow-xs text-xs flex items-start sm:items-center gap-3 text-left">
          <span class="text-xl shrink-0 mt-0.5 sm:mt-0">🚨</span>
          <div class="leading-relaxed">
            <span class="font-bold text-rose-900">Важно:</span> ИИ-ассистент носит исключительно справочный характер и может ошибаться. В спорных вопросах, при срывах уроков и форс-мажорах всегда сверяйтесь с <b>Teachers Care</b> или дежурными в <b>Mattermost (MMT)</b>.
          </div>
        </div>

      </div>

      <!-- Messages container dynamically injected here -->
      <div id="chatHistoryBox" class="w-full space-y-6"></div>

    </div>
  </main>

  <!-- Sticky Bottom Floating Composer Island -->
  <footer id="bottomInputDock" class="hidden fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4 pointer-events-none">
    <div class="max-w-3xl mx-auto pointer-events-auto flex flex-col space-y-2.5">
      <form id="chatForm" onsubmit="handleSubmit(event)" class="relative flex items-end gap-2 bg-white/95 backdrop-blur-xl p-2.5 rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-300/40 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/15 transition-all">
        <textarea
          id="messageInput"
          rows="1"
          placeholder="Задайте уточняющий вопрос..."
          class="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-slate-900 placeholder-slate-400 max-h-36 px-3 py-2 leading-relaxed"
          onkeydown="handleBottomKeyDown(event)"
          oninput="autoResize(this)"
        ></textarea>

        <div class="flex items-center gap-1.5 shrink-0 pb-0.5">
          <button
            type="button"
            id="stopBtn"
            onclick="stopGeneration()"
            class="hidden px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs items-center gap-1.5 transition-all cursor-pointer"
          >
            <span class="w-2 h-2 rounded-xs bg-slate-700"></span>
            <span>Стоп</span>
          </button>

          <button
            type="submit"
            id="sendBtn"
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed active:scale-95"
          >
            <span>Спросить</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        </div>
      </form>

      <!-- Bottom Dock: VISIBLE RED DISCLAIMER BOX -->
      <div class="bg-rose-50/95 border-2 border-rose-200/90 text-rose-950 p-2.5 sm:p-3 rounded-2xl shadow-sm text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 backdrop-blur-md">
        <div class="flex items-center gap-2">
          <span class="text-base shrink-0">🚨</span>
          <span class="leading-snug">
            <strong class="font-bold text-rose-900">Внимание:</strong> ИИ носит справочный характер и может ошибаться. Проверяйте информацию в <b>Teachers Care</b> или <b>Mattermost (MMT)</b>.
          </span>
        </div>
        <a href="https://helpcenter.skyeng.ru" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-bold text-rose-700 hover:text-rose-900 shrink-0 text-[11px] underline underline-offset-2 ml-6 sm:ml-0">
          <span>База 600+ статей</span>
          <span>↗</span>
        </a>
      </div>
    </div>
  </footer>

  <script>
    let conversationHistory = [];
    let isGenerating = false;
    let currentAbortController = null;
    let cookingTimers = [];
    let renderScheduled = false;

    if (window.marked) {
      marked.setOptions({ breaks: true, gfm: true });
    }

    const scrollArea = document.getElementById('chatScrollArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const centerHeroBox = document.getElementById('centerHeroBox');
    const chatHistoryBox = document.getElementById('chatHistoryBox');
    const bottomInputDock = document.getElementById('bottomInputDock');
    const clearBtn = document.getElementById('clearBtn');
    
    const centerMessageInput = document.getElementById('centerMessageInput');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
    }

    function handleCenterKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitFromCenter();
      }
    }

    function handleBottomKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    }

    function scrollToBottom() {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function switchLayoutToChat() {
      centerHeroBox.classList.add('hidden');
      messagesContainer.classList.remove('justify-center');
      messagesContainer.classList.add('justify-start');
      bottomInputDock.classList.remove('hidden');
      clearBtn.classList.remove('hidden');
      clearBtn.classList.add('flex');
    }

    function clearChat() {
      if (isGenerating && currentAbortController) {
        currentAbortController.abort();
      }
      clearCookingTimers();
      conversationHistory = [];
      chatHistoryBox.innerHTML = '';
      centerHeroBox.classList.remove('hidden');
      messagesContainer.classList.remove('justify-start');
      messagesContainer.classList.add('justify-center');
      bottomInputDock.classList.add('hidden');
      clearBtn.classList.remove('flex');
      clearBtn.classList.add('hidden');
      centerMessageInput.value = '';
      messageInput.value = '';
    }

    function sendQuickPrompt(promptText) {
      executeUserQuery(promptText);
    }

    function submitFromCenter() {
      const text = centerMessageInput.value.trim();
      if (!text) return;
      centerMessageInput.value = '';
      executeUserQuery(text);
    }

    // Сообщение преподавателя: аккуратный пузырь мессенджера (без растягивания и центрирования)
    function appendUserMessage(text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-end w-full my-1.5';
      msgDiv.innerHTML = \`
        <div class="w-fit max-w-[85%] sm:max-w-[70%] ml-auto text-left bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-5 py-3 rounded-2xl rounded-br-sm shadow-xs text-sm leading-relaxed whitespace-pre-wrap font-normal break-words">
          \${escapeHTML(text)}
        </div>
      \`;
      chatHistoryBox.appendChild(msgDiv);
      scrollToBottom();
    }

    function clearCookingTimers() {
      cookingTimers.forEach(t => clearTimeout(t));
      cookingTimers = [];
    }

    function createAssistantBubble(isFirstTurn) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-start gap-3 assistant-msg-row w-full';
      
      const avatar = document.createElement('div');
      avatar.className = 'h-8 w-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-sm shadow-sm mt-1 border border-indigo-200/60';
      avatar.textContent = '🤖';

      const wrapper = document.createElement('div');
      wrapper.className = 'max-w-[92%] sm:max-w-[85%] flex flex-col space-y-2';

      const bubble = document.createElement('div');
      bubble.className = 'bg-white p-4 sm:p-5 rounded-2xl rounded-tl-none border border-slate-200/90 shadow-sm text-slate-800 prose-chat relative group overflow-hidden break-words';
      
      let initialLoadingHtml = isFirstTurn ? \`
        <div id="loadingStatusContainer" class="space-y-3">
          <div class="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
            <span>👋</span>
            <span>Здравствуйте! Сверяюсь с базой регламентов школы...</span>
          </div>
          <div class="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Проверяю по 600+ статьям Help Center...</span>
          </div>
        </div>
      \` : \`
        <div id="loadingStatusContainer" class="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Сверяюсь с Золотым стандартом...</span>
        </div>
      \`;

      bubble.innerHTML = initialLoadingHtml;
      wrapper.appendChild(bubble);
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(wrapper);
      chatHistoryBox.appendChild(msgDiv);
      scrollToBottom();

      clearCookingTimers();
      const statusSpan = bubble.querySelector('#cookingStatusText');
      if (statusSpan) {
        const t1 = setTimeout(() => {
          if (statusSpan && statusSpan.parentNode) {
            statusSpan.textContent = '⏳ Формирую точный ответ и ссылки...';
          }
        }, 1600);
        cookingTimers.push(t1);
      }

      return { bubble, wrapper };
    }

    function escapeHTML(str) {
      return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }

    function cleanModelThoughts(rawText) {
      return rawText.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();
    }

    // Извлечение настоящего сообщения ученику (минимум 35 символов)
    function extractMessageTemplate(fullText) {
      const quoteBlock = fullText.match(/>\\s*[«"]([\\s\\S]+?)[»"]/);
      if (quoteBlock && quoteBlock[1] && quoteBlock[1].trim().length > 30) {
        return quoteBlock[1].trim();
      }

      const sectionMatch = fullText.match(/(?:Готовое сообщение|сообщение ученику)[\\s\\S]*?(?:>|\\n)\\s*[«"]([\\s\\S]+?)[»"]/i);
      if (sectionMatch && sectionMatch[1] && sectionMatch[1].trim().length > 30) {
        return sectionMatch[1].trim();
      }

      const allQuotes = [...fullText.matchAll(/[«"]([\\s\\S]+?)[»"]/g)];
      let longest = '';
      for (const q of allQuotes) {
        const clean = q[1].trim();
        if (clean.length > longest.length && clean.length > 35) {
          longest = clean;
        }
      }
      return longest || null;
    }

    function renderSanitizedMarkdown(bubble, markdownText) {
      const rawHtml = marked.parse(markdownText);
      bubble.innerHTML = DOMPurify.sanitize(rawHtml);
      
      bubble.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });

      // Превращаем цитату-сообщение в аккуратную карточку с заголовком и отдельной кнопкой в шапке (без наложения на текст)
      bubble.querySelectorAll('blockquote').forEach(bq => {
        const textContent = bq.innerText.trim();
        if (textContent.length > 25 && !bq.dataset.styledCard) {
          bq.dataset.styledCard = "true";
          const rawTemplateText = textContent.replace(/^[«"\\s]+|[»"\\s]+$/g, '').trim();
          
          bq.className = 'my-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 p-4 shadow-xs relative text-left not-italic';
          bq.innerHTML = \`
            <div class="flex items-center justify-between border-b border-indigo-100/90 pb-2.5 mb-3">
              <span class="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <span>💬</span>
                <span>Готовое сообщение ученику</span>
              </span>
              <button type="button" class="template-copy-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200/90 hover:bg-indigo-50 shadow-xs transition-all active:scale-95 cursor-pointer">
                📋 Скопировать
              </button>
            </div>
            <div class="text-sm text-slate-800 leading-relaxed font-normal select-all">
              «\${escapeHTML(rawTemplateText)}»
            </div>
          \`;

          const copyBtn = bq.querySelector('.template-copy-btn');
          copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(rawTemplateText).then(() => {
              copyBtn.innerHTML = '✅ Скопировано!';
              setTimeout(() => { copyBtn.innerHTML = '📋 Скопировать'; }, 2000);
            });
          };
        }
      });
    }

    function addActionBar(wrapper, fullText) {
      if (wrapper.querySelector('.chat-action-bar')) return;

      const bar = document.createElement('div');
      bar.className = 'chat-action-bar flex flex-wrap items-center gap-2 pt-1';

      // 1. Кнопка скопировать ответ целиком
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer active:scale-95';
      copyBtn.innerHTML = '📋 Скопировать ответ';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.innerHTML = '✅ Скопировано!';
          setTimeout(() => { copyBtn.innerHTML = '📋 Скопировать ответ'; }, 2000);
        });
      };
      bar.appendChild(copyBtn);

      // 2. Кнопка в подвале (дополнительно)
      const template = extractMessageTemplate(fullText);
      if (template) {
        const tmplBtn = document.createElement('button');
        tmplBtn.type = 'button';
        tmplBtn.className = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer border border-indigo-200/90 active:scale-95 shadow-2xs';
        tmplBtn.innerHTML = '💬 Скопировать шаблон сообщения';
        tmplBtn.onclick = () => {
          navigator.clipboard.writeText(template).then(() => {
            tmplBtn.innerHTML = '✅ Шаблон скопирован!';
            setTimeout(() => { tmplBtn.innerHTML = '💬 Скопировать шаблон сообщения'; }, 2000);
          });
        };
        bar.appendChild(tmplBtn);
      }

      wrapper.appendChild(bar);
    }

    function stopGeneration() {
      if (currentAbortController) {
        currentAbortController.abort();
      }
      clearCookingTimers();
      isGenerating = false;
      sendBtn.disabled = false;
      stopBtn.classList.add('hidden');
    }

    async function executeUserQuery(userText) {
      if (isGenerating) return;

      switchLayoutToChat();
      appendUserMessage(userText);

      const isFirstTurn = !conversationHistory.some(m => m.role === 'assistant');
      conversationHistory.push({ role: 'user', content: userText });

      isGenerating = true;
      sendBtn.disabled = true;
      stopBtn.classList.remove('hidden');

      const { bubble, wrapper } = createAssistantBubble(isFirstTurn);
      let streamedResponse = '';
      currentAbortController = new AbortController();

      try {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationHistory }),
          signal: currentAbortController.signal
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Ошибка сервера (' + response.status + ')');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let hasReceivedFirstChunk = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const json = JSON.parse(dataStr);
                const delta = json.choices?.[0]?.delta?.content || json.response || '';
                if (delta) {
                  if (!hasReceivedFirstChunk) {
                    clearCookingTimers();
                    hasReceivedFirstChunk = true;
                  }
                  streamedResponse += delta;

                  if (!renderScheduled) {
                    renderScheduled = true;
                    requestAnimationFrame(() => {
                      const cleanedText = cleanModelThoughts(streamedResponse);
                      renderSanitizedMarkdown(bubble, cleanedText);
                      scrollToBottom();
                      renderScheduled = false;
                    });
                  }
                }
              } catch (err) {}
            }
          }
        }

        clearCookingTimers();
        const finalText = cleanModelThoughts(streamedResponse);
        if (!finalText.trim()) {
          throw new Error('Сервис вернул пустой ответ. Пожалуйста, попробуйте переформулировать вопрос.');
        }

        renderSanitizedMarkdown(bubble, finalText);
        conversationHistory.push({ role: 'assistant', content: finalText });
        addActionBar(wrapper, finalText);

      } catch (err) {
        clearCookingTimers();
        if (err.name === 'AbortError') {
          const finalText = cleanModelThoughts(streamedResponse);
          if (finalText) {
            renderSanitizedMarkdown(bubble, finalText);
            conversationHistory.push({ role: 'assistant', content: finalText });
            addActionBar(wrapper, finalText);
          }
        } else {
          bubble.innerHTML = \`
            <div class="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium">
              ⚠️ \${escapeHTML(err.message)}
            </div>
          \`;
        }
      } finally {
        isGenerating = false;
        sendBtn.disabled = false;
        stopBtn.classList.add('hidden');
        messageInput.focus();
        scrollToBottom();
      }
    }

    function handleSubmit(e) {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (!text) return;
      messageInput.value = '';
      autoResize(messageInput);
      executeUserQuery(text);
    }
  </script>
</body>
</html>`;
  return htmlResponse(html);
}
