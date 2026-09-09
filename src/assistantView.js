import { htmlResponse } from './utils.js';

export function renderAssistantPage() {
  const html = `
<!DOCTYPE html>
<html lang="ru" class="h-full bg-slate-50">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Умный ассистент преподавателя — Skyeng & Skysmart</title>
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
    .prose-chat blockquote { border-left: 3px solid #cbd5e1; padding-left: 0.75rem; margin: 0.5rem 0; color: #475569; font-style: italic; }

    /* Pulsing animation for typing indicator */
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
  </style>
</head>
<body class="h-full flex flex-col font-sans text-slate-800 antialiased">

  <!-- Top Header Navigation -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
    <div class="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-sm font-bold text-lg">
          🤖
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-bold text-slate-900 text-base sm:text-lg tracking-tight">Ассистент преподавателя</h1>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              База 133 статьи
            </span>
          </div>
          <p class="text-xs text-slate-500">Ответы по регламентам, методике, отменам и финансам</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="clearChat()" title="Очистить диалог" class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span class="hidden sm:inline">Новый диалог</span>
        </button>
        <a href="/stats" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors">
          📊 Статистика
        </a>
      </div>
    </div>
  </header>

  <!-- Chat Messages Container -->
  <main class="flex-1 overflow-y-auto px-4 py-6" id="chatScrollArea">
    <div class="max-w-4xl mx-auto space-y-5" id="messagesContainer">

      <!-- Welcome Card (Shown on Empty State) -->
      <div id="welcomeBox" class="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>👋</span> Здравствуйте, коллега!
          </h2>
          <p class="text-sm text-slate-600 mt-2 leading-relaxed">
            Я корпоративный ассистент школы Skyeng и Skysmart. Я обучен на всей официальной базе знаний HelpCenter (133 статьи) и готов помочь вам быстро разобраться в регламентах, статусах, переносах, начислениях и методических стандартах.
          </p>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Частые вопросы преподавателей:</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onclick="sendQuickPrompt('Ученик не пришел на урок. Какой статус выставить и сколько ждать?')" class="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 group">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Ученик не пришел на урок: какой статус выставить?</span>
            </button>
            <button onclick="sendQuickPrompt('Как уйти на перерыв без нарушения регламента и штрафов в рейтинг?')" class="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 group">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Как оформить перерыв без вреда рейтингу?</span>
            </button>
            <button onclick="sendQuickPrompt('Ученик просит отменить урок менее чем за 24 часа. Что делать?')" class="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 group">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Ученик просит отмену менее чем за 24 часа</span>
            </button>
            <button onclick="sendQuickPrompt('Когда перечисляется вознаграждение и как оно рассчитывается?')" class="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-xs font-medium text-slate-700 hover:text-indigo-900 transition-all flex items-start gap-2 group">
              <span class="text-indigo-500 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              <span>Сроки и правила начисления вознаграждения</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  </main>

  <!-- Input Dock Sticky Area -->
  <footer class="bg-white border-t border-slate-200 p-4 sticky bottom-0 z-20">
    <div class="max-w-4xl mx-auto">
      <form id="chatForm" onsubmit="handleSubmit(event)" class="relative flex items-end gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-xs">
        <textarea
          id="messageInput"
          rows="1"
          placeholder="Задайте любой вопрос по правилам, урокам или оплате..."
          class="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-slate-900 placeholder-slate-400 max-h-32 px-2 py-1 leading-relaxed"
          onkeydown="handleKeyDown(event)"
          oninput="autoResize(this)"
        ></textarea>

        <button
          type="submit"
          id="sendBtn"
          class="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
          </svg>
        </button>
      </form>
      <div class="text-[11px] text-slate-400 text-center mt-2 flex items-center justify-center gap-2">
        <span>Ответы генерируются на основе 133 официальных статей HelpCenter Skyeng/Skysmart</span>
      </div>
    </div>
  </footer>

  <script>
    let conversationHistory = [];
    let isGenerating = false;

    const scrollArea = document.getElementById('chatScrollArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeBox = document.getElementById('welcomeBox');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    function autoResize(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    }

    function scrollToBottom() {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    function clearChat() {
      if (isGenerating) return;
      conversationHistory = [];
      messagesContainer.innerHTML = '';
      if (welcomeBox) messagesContainer.appendChild(welcomeBox);
      messageInput.value = '';
      autoResize(messageInput);
    }

    function sendQuickPrompt(promptText) {
      messageInput.value = promptText;
      autoResize(messageInput);
      handleSubmit(new Event('submit'));
    }

    function appendUserMessage(text) {
      if (welcomeBox && welcomeBox.parentNode) {
        welcomeBox.remove();
      }

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

    function createAssistantBubble() {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex justify-start gap-3';
      
      const avatar = document.createElement('div');
      avatar.className = 'h-8 w-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 font-bold text-sm shadow-xs mt-1';
      avatar.textContent = '🤖';

      const bubble = document.createElement('div');
      bubble.className = 'max-w-[90%] sm:max-w-[85%] bg-white p-4 sm:p-5 rounded-2xl rounded-tl-xs border border-slate-200 shadow-xs text-slate-800 prose-chat';
      
      // Initial typing indicator
      bubble.innerHTML = \`
        <div class="flex items-center gap-1.5 py-1">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      \`;

      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();

      return bubble;
    }

    function escapeHTML(str) {
      return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (isGenerating) return;

      const userText = messageInput.value.trim();
      if (!userText) return;

      appendUserMessage(userText);
      conversationHistory.push({ role: 'user', content: userText });

      messageInput.value = '';
      autoResize(messageInput);
      isGenerating = true;
      sendBtn.disabled = true;

      const assistantBubble = createAssistantBubble();
      let streamedResponse = '';

      try {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationHistory })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Ошибка при обращении к серверу (' + response.status + ')');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop(); // keep trailing line

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const json = JSON.parse(dataStr);
                const delta = json.choices?.[0]?.delta?.content || '';
                streamedResponse += delta;

                // Render Markdown on the fly
                assistantBubble.innerHTML = marked.parse(streamedResponse);
                
                // Ensure links open in new tab safely
                assistantBubble.querySelectorAll('a').forEach(a => {
                  a.target = '_blank';
                  a.rel = 'noopener noreferrer';
                });

                scrollToBottom();
              } catch (err) {}
            }
          }
        }

        conversationHistory.push({ role: 'assistant', content: streamedResponse });

      } catch (err) {
        assistantBubble.innerHTML = \`
          <div class="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium">
            ⚠️ \${escapeHTML(err.message)}
          </div>
        \`;
      } finally {
        isGenerating = false;
        sendBtn.disabled = false;
        messageInput.focus();
        scrollToBottom();
      }
    }
  </script>
</body>
</html>
  `;
  return htmlResponse(html);
}
