import { htmlResponse } from './utils.js';

export function renderAssistantPage() {
  const html = `
<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50/70">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">
  <title>Умный ассистент преподавателя</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    /* Modern 2026 Calm Prose Styling */
    .prose-chat { line-height: 1.65; font-size: 0.935rem; color: #1e293b; }
    .prose-chat h1, .prose-chat h2, .prose-chat h3 { font-weight: 700; color: #0f172a; margin-top: 1rem; margin-bottom: 0.5rem; }
    .prose-chat h3 { font-size: 1rem; display: flex; items-center; gap: 0.35rem; }
    .prose-chat p { margin-bottom: 0.75rem; }
    .prose-chat p:last-child { margin-bottom: 0; }
    .prose-chat ul, .prose-chat ol { margin-left: 1.25rem; margin-bottom: 0.75rem; list-style-type: disc; }
    .prose-chat ol { list-style-type: decimal; }
    .prose-chat li { margin-bottom: 0.35rem; padding-left: 0.2rem; }
    .prose-chat strong { font-weight: 700; color: #0f172a; }
    
    /* Verified Citation Pill Links (Perplexity Style) */
    .prose-chat a { 
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.55rem;
      border-radius: 0.5rem;
      background-color: #f1f5f9;
      color: #4338ca;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85em;
      border: 1px solid #e2e8f0;
      transition: all 0.15s ease-in-out;
      margin: 0.1rem 0.2rem 0.1rem 0;
    }
    .prose-chat a:hover { 
      background-color: #e0e7ff; 
      border-color: #c7d2fe;
      color: #3730a3;
      transform: translateY(-1px);
    }
    .prose-chat a::after {
      content: "↗";
      font-size: 0.85em;
      opacity: 0.7;
    }

    .prose-chat code { 
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background-color: #f1f5f9; 
      padding: 0.15rem 0.4rem; 
      border-radius: 0.375rem; 
      font-size: 0.85em; 
      color: #0f172a;
      border: 1px solid #e2e8f0;
    }

    /* Template Callout Block */
    .prose-chat blockquote { 
      border-left: 4px solid #6366f1; 
      background: linear-gradient(to right, #f8fafc, #ffffff);
      padding: 0.85rem 1.15rem; 
      margin: 0.85rem 0; 
      color: #1e293b; 
      border-radius: 0 0.875rem 0.875rem 0;
      font-style: normal;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.03);
      border-top: 1px solid #f1f5f9;
      border-right: 1px solid #f1f5f9;
      border-bottom: 1px solid #f1f5f9;
    }

    /* Shimmer and Typing Animations */
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
<body class="h-full flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-600 selection:text-white bg-slate-50/50">

  <!-- Top Header Navigation -->
  <header class="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-sm font-bold text-lg">
          🤖
        </div>
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="font-bold text-slate-900 text-sm sm:text-base tracking-tight">Ассистент преподавателя</h1>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              База: 695 статей
            </span>
          </div>
          <p class="text-[11px] text-slate-400 font-medium hidden sm:block">Регламенты Skyeng & Skysmart • Защита рейтинга и KPI</p>
        </div>
      </div>

      <button 
        onclick="clearChat()" 
        id="clearBtn" 
        title="Начать сначала" 
        class="hidden px-3.5 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all shadow-2xs items-center gap-1.5 cursor-pointer active:scale-95"
      >
        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        <span>Новый вопрос</span>
      </button>
    </div>
  </header>

  <!-- Main Area -->
  <main class="flex-1 overflow-y-auto px-4 py-6 flex flex-col" id="chatScrollArea">
    <div class="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center space-y-6" id="messagesContainer">

      <!-- Centered Hero / Start Section -->
      <div id="centerHeroBox" class="py-6 sm:py-10 text-center space-y-8 my-auto">
        <div class="space-y-3">
          <div class="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-3xl shadow-md text-white ring-8 ring-indigo-50/60">
            🎓
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Чем я могу помочь вам сегодня?
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            Задайте любой вопрос по статусам уроков, отменам, форс-мажорам, перерывам, регламентам или выплатам.
          </p>
        </div>

        <!-- Centered Main Input Box -->
        <div class="bg-white p-3.5 sm:p-4 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/90 max-w-2xl mx-auto transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
          <textarea
            id="centerMessageInput"
            rows="2"
            placeholder="Напишите ваш вопрос (например: «Ученик не пришел на урок, какой статус выставить?»)..."
            class="w-full bg-transparent border-0 resize-none outline-none text-sm sm:text-base text-slate-900 placeholder-slate-400 px-2 py-1 leading-relaxed"
            onkeydown="handleCenterKeyDown(event)"
          ></textarea>
          
          <div class="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-2">
            <span class="text-[11px] text-slate-400 pl-2 flex items-center gap-1">
              <span>Нажмите</span> <kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600">Enter ↵</kbd> <span>для отправки</span>
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

        <!-- Quick Questions Chips (2026 Interactive Card Style) -->
        <div class="space-y-3 max-w-2xl mx-auto pt-2">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left pl-1">Частые вопросы:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
            <button onclick="sendQuickPrompt('Ученик не пришел на урок. Какой статус выставить и сколько ждать?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-xs transition-all flex items-start gap-3 group cursor-pointer">
              <span class="text-base group-hover:scale-110 transition-transform">⏳</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Ученик не пришел на урок</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Сколько ждать и какой статус ставить</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('У меня форс-мажор, как отменить урок за 15 минут до начала без нарушений?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-xs transition-all flex items-start gap-3 group cursor-pointer">
              <span class="text-base group-hover:scale-110 transition-transform">⚡</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Форс-мажор за 15 минут</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Регламент отмены и риски рейтинга</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('Как оформить перерыв в расписании без вреда рейтингу и штрафов?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-xs transition-all flex items-start gap-3 group cursor-pointer">
              <span class="text-base group-hover:scale-110 transition-transform">🏖️</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Перерыв и отпуск в расписании</div>
                <div class="text-[11px] text-slate-400 mt-0.5">Зеленая зона и правило 14 дней</div>
              </div>
            </button>
            <button onclick="sendQuickPrompt('Когда выплачивается вознаграждение и как оно рассчитывается?')" class="p-3.5 rounded-2xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-xs transition-all flex items-start gap-3 group cursor-pointer">
              <span class="text-base group-hover:scale-110 transition-transform">💰</span>
              <div>
                <div class="text-xs font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">Вознаграждение и выплаты</div>
                <div class="text-[11px] text-slate-400 mt-0.5">График перечислений и надбавки за KPI</div>
              </div>
            </button>
          </div>
        </div>
      </div>

    </div>
  </main>

  <!-- Sticky Bottom Floating Composer Island -->
  <footer id="bottomInputDock" class="hidden sticky bottom-0 z-20 p-3 sm:p-4 pointer-events-none">
    <div class="max-w-3xl mx-auto pointer-events-auto">
      <form id="chatForm" onsubmit="handleSubmit(event)" class="relative flex items-end gap-2 bg-white/95 backdrop-blur-xl p-2.5 rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-200/60 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/15 transition-all">
        <textarea
          id="messageInput"
          rows="1"
          placeholder="Задайте уточняющий вопрос..."
          class="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-slate-900 placeholder-slate-400 max-h-36 px-2.5 py-1.5 leading-relaxed"
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
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed active:scale-95"
          >
            <span>Спросить</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  </footer>

  <script>
    let conversationHistory = [];
    let isGenerating = false;
    let currentAbortController = null;
    let cookingTimers = [];

    const scrollArea = document.getElementById('chatScrollArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const centerHeroBox = document.getElementById('centerHeroBox');
    const bottomInputDock = document.getElementById('bottomInputDock');
    const clearBtn = document.getElementById('clearBtn');
    
    const centerMessageInput = document.getElementById('centerMessageInput');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');

    function saveHistory() {
      try {
        sessionStorage.setItem('botsky_chat_history', JSON.stringify(conversationHistory));
      } catch (e) {}
    }

    window.addEventListener('DOMContentLoaded', () => {
      sessionStorage.removeItem('botsky_chat_history');
    });

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
      if (centerHeroBox && centerHeroBox.parentNode) {
        centerHeroBox.remove();
      }
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
      sessionStorage.removeItem('botsky_chat_history');
      messagesContainer.innerHTML = '';
      messagesContainer.classList.remove('justify-start');
      messagesContainer.classList.add('justify-center');
      messagesContainer.appendChild(centerHeroBox);
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

    function appendUserMessage(text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-end';
      msgDiv.innerHTML = \`
        <div class="max-w-[85%] sm:max-w-[75%] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4.5 py-3 rounded-2xl rounded-tr-xs shadow-xs text-sm leading-relaxed whitespace-pre-wrap font-normal">
          \${escapeHTML(text)}
        </div>
      \`;
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();
    }

    function clearCookingTimers() {
      cookingTimers.forEach(t => clearTimeout(t));
      cookingTimers = [];
    }

    function createAssistantBubble(isFirstTurn) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-start gap-3 assistant-msg-row';
      
      const avatar = document.createElement('div');
      avatar.className = 'h-8 w-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-sm shadow-2xs mt-1 border border-indigo-200/50';
      avatar.textContent = '🤖';

      const wrapper = document.createElement('div');
      wrapper.className = 'max-w-[95%] sm:max-w-[88%] flex flex-col space-y-2';

      const bubble = document.createElement('div');
      bubble.className = 'bg-white p-4.5 sm:p-5.5 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-xs text-slate-800 prose-chat relative group';
      
      let initialLoadingHtml = '';

      if (isFirstTurn) {
        initialLoadingHtml = \`
          <div id="loadingStatusContainer" class="space-y-3">
            <div class="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
              <span>👋</span>
              <span>Здравствуйте! Сверяюсь с регламентом школы...</span>
            </div>
            <div class="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Ищу по 695 статьям базы знаний...</span>
            </div>
          </div>
        \`;
      } else {
        initialLoadingHtml = \`
          <div id="loadingStatusContainer" class="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Сверяю регламенты и информацию...</span>
          </div>
        \`;
      }

      bubble.innerHTML = initialLoadingHtml;

      wrapper.appendChild(bubble);
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(wrapper);
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();

      clearCookingTimers();
      const statusSpan = bubble.querySelector('#cookingStatusText');
      if (statusSpan) {
        const t1 = setTimeout(() => {
          if (statusSpan && statusSpan.parentNode) {
            statusSpan.textContent = '⏳ Оцениваю правила и безопасность для рейтинга...';
          }
        }, 2000);

        const t2 = setTimeout(() => {
          if (statusSpan && statusSpan.parentNode) {
            statusSpan.textContent = '🍳 Формирую лаконичный алгоритм и шаблон...';
          }
        }, 4000);

        cookingTimers.push(t1, t2);
      }

      return { bubble, wrapper };
    }

    function escapeHTML(str) {
      return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }

    function addActionBar(wrapper, fullText) {
      if (wrapper.querySelector('.chat-action-bar')) return;

      const bar = document.createElement('div');
      bar.className = 'chat-action-bar flex flex-wrap items-center gap-2 pt-1';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer active:scale-95';
      copyBtn.innerHTML = '📋 Скопировать ответ';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.innerHTML = '✅ Скопировано!';
          setTimeout(() => { copyBtn.innerHTML = '📋 Скопировать ответ'; }, 2000);
        });
      };
      bar.appendChild(copyBtn);

      try {
        const templateMatch = fullText.match(/[«"]([^»"]+)[»"]/);
        if (templateMatch && templateMatch[1] && templateMatch[1].length > 10) {
          const rawTemplate = templateMatch[1].trim();
          const tmplBtn = document.createElement('button');
          tmplBtn.type = 'button';
          tmplBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer border border-indigo-200/60 active:scale-95';
          tmplBtn.innerHTML = '💬 Скопировать шаблон для ученика';
          tmplBtn.onclick = () => {
            navigator.clipboard.writeText(rawTemplate).then(() => {
              tmplBtn.innerHTML = '✅ Шаблон скопирован!';
              setTimeout(() => { tmplBtn.innerHTML = '💬 Скопировать шаблон для ученика'; }, 2000);
            });
          };
          bar.appendChild(tmplBtn);
        }
      } catch(e) {}

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
      saveHistory();

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

                  bubble.innerHTML = marked.parse(streamedResponse);
                  
                  bubble.querySelectorAll('a').forEach(a => {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                  });

                  scrollToBottom();
                }
              } catch (err) {}
            }
          }
        }

        clearCookingTimers();
        if (!streamedResponse.trim()) {
          throw new Error('Сервис вернул пустой ответ. Попробуйте переформулировать вопрос.');
        }
        conversationHistory.push({ role: 'assistant', content: streamedResponse });
        saveHistory();
        addActionBar(wrapper, streamedResponse);

      } catch (err) {
        clearCookingTimers();
        if (err.name === 'AbortError') {
          if (streamedResponse) {
            conversationHistory.push({ role: 'assistant', content: streamedResponse });
            saveHistory();
            addActionBar(wrapper, streamedResponse);
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
</html>
  `;
  return htmlResponse(html);
}
