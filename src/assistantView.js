import { htmlResponse } from './utils.js';

export function renderAssistantPage() {
  const html = `
<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content">
  <title>Умный ассистент преподавателя</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    /* Markdown Typography Styling inside Chat Bubbles */
    .prose-chat { line-height: 1.6; font-size: 0.925rem; }
    .prose-chat p { margin-bottom: 0.65rem; }
    .prose-chat p:last-child { margin-bottom: 0; }
    .prose-chat ul, .prose-chat ol { margin-left: 1.25rem; margin-bottom: 0.65rem; list-style-type: disc; }
    .prose-chat ol { list-style-type: decimal; }
    .prose-chat li { margin-bottom: 0.25rem; }
    .prose-chat strong { font-weight: 700; color: #0f172a; }
    .prose-chat a { color: #4f46e5; text-decoration: underline; text-underline-offset: 2px; font-weight: 600; }
    .prose-chat a:hover { color: #4338ca; }
    .prose-chat code { font-family: monospace; background-color: #f1f5f9; padding: 0.15rem 0.35rem; border-radius: 0.25rem; font-size: 0.85em; }
    .prose-chat blockquote { 
      border-left: 4px solid #6366f1; 
      background-color: #f8fafc;
      padding: 0.75rem 1rem; 
      margin: 0.75rem 0; 
      color: #334155; 
      border-radius: 0 0.75rem 0.75rem 0;
      font-style: normal;
    }

    /* Typing dots animation */
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

    /* Shimmer animation for thinking status */
    @keyframes shimmer {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    .animate-shimmer {
      animation: shimmer 1.8s infinite ease-in-out;
    }
  </style>
</head>
<body class="h-full flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-500 selection:text-white">

  <!-- Top Header Navigation -->
  <header class="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center text-white shadow-sm font-bold text-base">
          🤖
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-bold text-slate-900 text-sm sm:text-base tracking-tight">Ассистент преподавателя</h1>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              База 133 статьи
            </span>
          </div>
        </div>
      </div>

      <button onclick="clearChat()" id="clearBtn" title="Начать сначала" class="hidden px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors items-center gap-1.5 cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        <span>Новый вопрос</span>
      </button>
    </div>
  </header>

  <!-- Main Area -->
  <main class="flex-1 overflow-y-auto px-4 py-6 flex flex-col" id="chatScrollArea">
    <div class="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center space-y-6" id="messagesContainer">

      <!-- Centered Hero / Start Section -->
      <div id="centerHeroBox" class="py-8 sm:py-12 text-center space-y-8 my-auto">
        <div class="space-y-3">
          <div class="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-3xl shadow-md text-white">
            🎓
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Чем я могу помочь вам сегодня?
          </h2>
          <p class="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            Задайте вопрос по отменам, переносам, статусам уроков, перерывам, регламентам или выплатам вознаграждения.
          </p>
        </div>

        <!-- Centered Main Input Box -->
        <div class="bg-white p-3 sm:p-4 rounded-3xl shadow-xl border border-slate-200/80 max-w-2xl mx-auto">
          <textarea
            id="centerMessageInput"
            rows="2"
            placeholder="Напишите ваш вопрос (например: «Ученик не пришел на урок, какой статус поставить?»)..."
            class="w-full bg-transparent border-0 resize-none outline-none text-sm sm:text-base text-slate-900 placeholder-slate-400 px-2 py-1 leading-relaxed"
            onkeydown="handleCenterKeyDown(event)"
          ></textarea>
          
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
            <span class="text-[11px] text-slate-400 pl-2">Нажмите Enter для отправки</span>
            <button
              onclick="submitFromCenter()"
              class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white font-bold text-sm shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Задать вопрос</span>
              <span class="text-base">🚀</span>
            </button>
          </div>
        </div>

        <!-- Quick Questions Chips -->
        <div class="space-y-3 max-w-2xl mx-auto pt-2">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider text-left pl-1">Быстрые подсказки:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            <button onclick="sendQuickPrompt('Ученик не пришел на урок. Какой статус выставить и сколько ждать?')" class="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 shadow-xs group cursor-pointer">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Ученик не пришел на урок: какой статус поставить?</span>
            </button>
            <button onclick="sendQuickPrompt('Как оформить перерыв без нарушения регламента и штрафов в рейтинг?')" class="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 shadow-xs group cursor-pointer">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Как взять перерыв без вреда рейтингу?</span>
            </button>
            <button onclick="sendQuickPrompt('Ученик просит отменить урок менее чем за 24 часа. Что делать?')" class="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 shadow-xs group cursor-pointer">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Отмена урока менее чем за 24 часа</span>
            </button>
            <button onclick="sendQuickPrompt('Когда перечисляется вознаграждение и как оно рассчитывается?')" class="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 shadow-xs group cursor-pointer">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Сроки и правила начисления вознаграждения</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  </main>

  <!-- Sticky Bottom Dock Input -->
  <footer id="bottomInputDock" class="hidden bg-white/90 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 sticky bottom-0 z-20 shadow-lg">
    <div class="max-w-3xl mx-auto space-y-2">
      <form id="chatForm" onsubmit="handleSubmit(event)" class="relative flex items-end gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-xs">
        <textarea
          id="messageInput"
          rows="1"
          placeholder="Задайте уточняющий вопрос..."
          class="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-slate-900 placeholder-slate-400 max-h-32 px-2 py-1 leading-relaxed"
          onkeydown="handleBottomKeyDown(event)"
          oninput="autoResize(this)"
        ></textarea>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            id="stopBtn"
            onclick="stopGeneration()"
            class="hidden px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs items-center gap-1 transition-all cursor-pointer"
          >
            <span class="w-2 h-2 rounded-xs bg-slate-700"></span>
            <span>Стоп</span>
          </button>

          <button
            type="submit"
            id="sendBtn"
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Спросить</span>
            <svg class="w-3.5 h-3.5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

    // Restore conversation from sessionStorage if present
    window.addEventListener('DOMContentLoaded', () => {
      try {
        const saved = sessionStorage.getItem('botsky_chat_history');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            conversationHistory = parsed;
            switchLayoutToChat();
            renderSavedConversation();
          }
        }
      } catch(e) {}
    });

    function saveHistory() {
      try {
        sessionStorage.setItem('botsky_chat_history', JSON.stringify(conversationHistory));
      } catch(e) {}
    }

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
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
    }

    function sendQuickPrompt(promptText) {
      executeUserQuery(promptText);
    }

    function submitFromCenter() {
      const text = centerMessageInput.value.trim();
      if (!text) return;
      executeUserQuery(text);
    }

    function appendUserMessage(text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-end';
      msgDiv.innerHTML = \`
        <div class="max-w-[85%] sm:max-w-[75%] bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-xs shadow-xs text-sm leading-relaxed whitespace-pre-wrap font-normal">
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

    // Creates assistant bubble with greeting (1st time only) + animated dynamic status
    function createAssistantBubble(isFirstTurn) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-start gap-3 assistant-msg-row';
      
      const avatar = document.createElement('div');
      avatar.className = 'h-8 w-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-sm shadow-xs mt-1';
      avatar.textContent = '🤖';

      const wrapper = document.createElement('div');
      wrapper.className = 'max-w-[92%] sm:max-w-[85%] flex flex-col space-y-2';

      const bubble = document.createElement('div');
      bubble.className = 'bg-white p-4 sm:p-5 rounded-2xl rounded-tl-xs border border-slate-200 shadow-xs text-slate-800 prose-chat relative group';
      
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
              <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Ищу по 133 статьям базы знаний...</span>
            </div>
          </div>
        \`;
      } else {
        initialLoadingHtml = \`
          <div id="loadingStatusContainer" class="flex items-center gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-3.5 py-2.5 rounded-xl">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span id="cookingStatusText" class="font-medium text-slate-600 animate-shimmer">🔍 Проверяю регламенты и информацию...</span>
          </div>
        \`;
      }

      bubble.innerHTML = initialLoadingHtml;

      wrapper.appendChild(bubble);
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(wrapper);
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();

      // Progressive cooking status updates if AI takes longer
      clearCookingTimers();
      const statusSpan = bubble.querySelector('#cookingStatusText');
      if (statusSpan) {
        const t1 = setTimeout(() => {
          if (statusSpan && statusSpan.parentNode) {
            statusSpan.textContent = '⏳ Сверяю правила и оцениваю риски для рейтинга...';
          }
        }, 2200);

        const t2 = setTimeout(() => {
          if (statusSpan && statusSpan.parentNode) {
            statusSpan.textContent = '🍳 Ответ почти готов, формирую рекомендацию и шаблон...';
          }
        }, 4500);

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
      bar.className = 'chat-action-bar flex items-center gap-2 pt-1';

      // 1. Copy full answer button
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer';
      copyBtn.innerHTML = '📋 Скопировать ответ';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.innerHTML = '✅ Скопировано!';
          setTimeout(() => { copyBtn.innerHTML = '📋 Скопировать ответ'; }, 2000);
        });
      };
      bar.appendChild(copyBtn);

      // 2. Extract and provide template copy button safely without backticks
      try {
        const templateMatch = fullText.match(/[«"]([^»"]+)[»"]/);
        if (templateMatch && templateMatch[1] && templateMatch[1].length > 10) {
          const rawTemplate = templateMatch[1].trim();
          const tmplBtn = document.createElement('button');
          tmplBtn.type = 'button';
          tmplBtn.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer border border-indigo-200/60';
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

    function renderSavedConversation() {
      messagesContainer.innerHTML = '';
      conversationHistory.forEach(item => {
        if (item.role === 'user') {
          appendUserMessage(item.content);
        } else if (item.role === 'assistant') {
          const { bubble, wrapper } = createAssistantBubble(false);
          bubble.innerHTML = marked.parse(item.content);
          bubble.querySelectorAll('a').forEach(a => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          });
          addActionBar(wrapper, item.content);
        }
      });
      scrollToBottom();
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

      // Check if this is the first assistant reply in current session
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
                const delta = json.choices?.[0]?.delta?.content || '';
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
