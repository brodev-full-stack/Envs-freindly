class ChatStore {
  constructor() {
    this.storageKey = 'eco_ai_chats';
    this.chats = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
  }

  saveChat(query, answer, sources, images) {
    const chat = {
      id: Date.now(),
      title: query.substring(0, 40),
      query,
      answer,
      sources,
      images,
      timestamp: new Date().toISOString()
    };
    this.chats.unshift(chat);
    if (this.chats.length > 20) this.chats.pop();
    localStorage.setItem(this.storageKey, JSON.stringify(this.chats));
    return chat;
  }

  getHistory() {
    return this.chats;
  }
}

class UI {
  constructor(store) {
    this.store = store;
    this.zoomLevel = 1;
    this.elements = {
      query: document.getElementById('query'),
      searchBtn: document.getElementById('search-btn'),
      chatMessages: document.getElementById('chat-messages'),
      welcomeScreen: document.getElementById('welcome-screen'),
      chatHistory: document.getElementById('chat-history'),
      newChatBtn: document.getElementById('new-chat-btn'),
      zoomIn: document.getElementById('zoom-in'),
      zoomOut: document.getElementById('zoom-out'),
      toggleContrast: document.getElementById('toggle-contrast')
    };

    this.bindEvents();
    this.renderHistory();
  }

  bindEvents() {
    this.elements.searchBtn.addEventListener('click', () => this.handleSearch());
    this.elements.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSearch();
      }
    });
    this.elements.newChatBtn.addEventListener('click', () => this.resetChat());
    
    // Accessibility
    this.elements.zoomIn.addEventListener('click', () => this.zoom(0.1));
    this.elements.zoomOut.addEventListener('click', () => this.zoom(-0.1));
    this.elements.toggleContrast.addEventListener('click', () => document.body.classList.toggle('high-contrast'));

    // Auto-resize textarea
    this.elements.query.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  }

  zoom(delta) {
    this.zoomLevel += delta;
    document.body.style.zoom = this.zoomLevel;
  }

  resetChat() {
    this.elements.welcomeScreen.classList.remove('hidden');
    this.elements.chatMessages.innerHTML = '';
    this.elements.chatMessages.appendChild(this.elements.welcomeScreen);
    this.elements.query.value = '';
    this.renderHistory();
  }

  async handleSearch() {
    const query = this.elements.query.value.trim();
    if (!query || query.length < 2) return;

    this.elements.welcomeScreen.classList.add('hidden');
    this.elements.query.value = '';
    this.elements.query.style.height = 'auto';

    const messageRow = this.createMessageRow(query);
    this.elements.chatMessages.appendChild(messageRow);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) throw new Error('Search failed');
      const result = await response.json();
      
      this.renderAnswer(messageRow, result);
      this.store.saveChat(query, result.answer, result.sources, result.images);
      this.renderHistory();
    } catch (error) {
      this.renderError(messageRow, error.message);
    }
  }

  createMessageRow(query) {
    const row = document.createElement('div');
    row.className = 'message-row container';
    row.innerHTML = `
      <div class="message-query">${this.escape(query)}</div>
      <div class="loading-indicator">Searching the open web...</div>
    `;
    return row;
  }

  renderAnswer(row, result) {
    const loading = row.querySelector('.loading-indicator');
    if (loading) loading.remove();

    // Images
    let imagesHtml = '';
    if (result.images && result.images.length > 0) {
      imagesHtml = `
        <div class="image-grid">
          ${result.images.map(img => `
            <div class="image-item" onclick="window.open('${img.url}', '_blank')">
              <img src="${img.img_src}" alt="${this.escape(img.title)}" onerror="this.parentElement.style.display='none'">
            </div>
          `).join('')}
        </div>
      `;
    }

    // Sources
    const sourcesHtml = `
      <div class="sources-row">
        ${result.sources.map(s => `
          <div class="source-mini" onclick="window.open('${s.url}', '_blank')">
            <div class="source-mini-title">${this.escape(s.title)}</div>
            <div class="source-mini-url">${s.source}</div>
          </div>
        `).join('')}
      </div>
    `;

    // Answer
    const formatted = result.answer
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        let content = line.replace(/\[(\d+)\]/g, (match, num) => {
          const source = result.sources.find(s => s.id === parseInt(num));
          return source ? `<sup><a href="${source.url}" target="_blank">[${num}]</a></sup>` : match;
        });
        content = content.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
        return `<p>${content}</p>`;
      })
      .join('');

    row.innerHTML += `
      ${imagesHtml}
      ${sourcesHtml}
      <div class="answer-row">${formatted}</div>
    `;
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  renderError(row, message) {
    const loading = row.querySelector('.loading-indicator');
    if (loading) loading.remove();
    row.innerHTML += `<div class="answer-row" style="color: var(--moz-red)">⚠️ ${this.escape(message)}</div>`;
  }

  renderHistory() {
    const history = this.store.getHistory();
    this.elements.chatHistory.innerHTML = history.map(chat => `
      <div class="history-item" onclick="window.location.href='/?q=${encodeURIComponent(chat.query)}'">
        ${this.escape(chat.title)}
      </div>
    `).join('');
  }

  escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.addEventListener('load', () => {
  const store = new ChatStore();
  const ui = new UI(store);
  
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (query) {
    ui.elements.query.value = query;
    ui.handleSearch();
  }
});
