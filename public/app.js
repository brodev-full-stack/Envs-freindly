class SearchEngine {
  async search(query, mode = 'research', history = []) {
    updateStage(mode === 'discussion' ? 'Consulting the PhD team' : 'Analyzing global data streams');
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode, history })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Investigation failed');
    }
    return await response.json();
  }
}

class UI {
  constructor(engine) {
    this.engine = engine;
    this.zoomLevel = 1;
    this.discussionHistory = [];
    this.currentTopic = '';
    this.elements = {
      query: document.getElementById('query'),
      searchBtn: document.getElementById('search-btn'),
      loading: document.getElementById('loading'),
      results: document.getElementById('results'),
      answerContent: document.getElementById('answer-content'),
      sourcesList: document.getElementById('sources-list'),
      sourceCount: document.getElementById('source-count'),
      copyBtn: document.getElementById('copy-btn'),
      gallery: document.getElementById('image-gallery'),
      galleryGrid: document.getElementById('gallery-grid'),
      headline: document.getElementById('article-headline'),
      date: document.getElementById('current-date'),
      zoomIn: document.getElementById('zoom-in'),
      zoomOut: document.getElementById('zoom-out'),
      toggleContrast: document.getElementById('toggle-contrast'),
      discussionMessages: document.getElementById('discussion-messages'),
      discussionQuery: document.getElementById('discussion-query'),
      discussionBtn: document.getElementById('discussion-btn')
    };

    this.initDate();
    this.bindEvents();
  }

  initDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    this.elements.date.textContent = new Date().toLocaleDateString('en-US', options);
  }

  bindEvents() {
    this.elements.searchBtn.addEventListener('click', () => this.search());
    this.elements.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search();
    });
    this.elements.copyBtn.addEventListener('click', () => this.copy());
    this.elements.discussionBtn.addEventListener('click', () => this.discuss());
    this.elements.discussionQuery.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.discuss();
    });
    
    // Accessibility
    this.elements.zoomIn.addEventListener('click', () => this.zoom(0.1));
    this.elements.zoomOut.addEventListener('click', () => this.zoom(-0.1));
    this.elements.toggleContrast.addEventListener('click', () => document.body.classList.toggle('high-contrast'));
  }

  zoom(delta) {
    this.zoomLevel += delta;
    document.body.style.zoom = this.zoomLevel;
  }

  async search() {
    const query = this.elements.query.value.trim();
    if (!query || query.length < 3) return;
    this.currentTopic = query;
    this.discussionHistory = [];
    this.elements.discussionMessages.innerHTML = '';
    this.showLoading();
    try {
      const result = await this.engine.search(query);
      this.displayResults(result, query);
    } catch (error) {
      this.showError(error.message);
    }
  }

  async discuss() {
    const query = this.elements.discussionQuery.value.trim();
    if (!query) return;
    
    this.addMessage('user', query);
    this.elements.discussionQuery.value = '';
    this.discussionHistory.push({ role: 'user', content: query });

    try {
      const result = await this.engine.search(this.currentTopic, 'discussion', this.discussionHistory);
      this.addMessage('ai', result.answer);
      this.discussionHistory.push({ role: 'ai', content: result.answer });
    } catch (error) {
      this.addMessage('ai', 'Error connecting to the PhD team.');
    }
  }

  addMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = `message ${role}`;
    msg.textContent = text;
    this.elements.discussionMessages.appendChild(msg);
    this.elements.discussionMessages.scrollTop = this.elements.discussionMessages.scrollHeight;
  }

  showLoading() {
    this.elements.loading.classList.remove('hidden');
    this.elements.results.classList.add('hidden');
  }

  displayResults(result, query) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
    this.elements.headline.textContent = query.charAt(0).toUpperCase() + query.slice(1);

    // Images Gallery (Google Results)
    if (result.images && result.images.length > 0) {
      this.elements.gallery.classList.remove('hidden');
      this.elements.galleryGrid.innerHTML = result.images.map(img => `
        <div class="gallery-item" onclick="window.open('${img.url}', '_blank')">
          <img src="${img.img_src}" alt="${this.escape(img.title)}" onerror="this.parentElement.style.display='none'">
        </div>
      `).join('');
    } else {
      this.elements.gallery.classList.add('hidden');
    }

    // Article Body
    const formatted = result.answer
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        if (line.startsWith('##')) return `<h3>${line.replace('##', '').trim()}</h3>`;
        let content = line.replace(/\[(\d+)\]/g, (match, num) => {
          const source = result.sources.find(s => s.id === parseInt(num));
          return source ? `<sup><a href="${source.url}" target="_blank">[${num}]</a></sup>` : match;
        });
        content = content.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
        return `<p>${content}</p>`;
      })
      .join('');
    this.elements.answerContent.innerHTML = formatted;

    // Sources (Consolidated)
    this.elements.sourceCount.textContent = result.sources.length;
    this.elements.sourcesList.innerHTML = result.sources.map(s => `
      <div class="source-card" onclick="window.open('${s.url}', '_blank')">
        <span class="source-number">Source ${s.id} • ${s.source}</span>
        <div class="source-title">${this.escape(s.title)}</div>
        <div class="source-snippet">${this.escape(s.content.substring(0, 100))}...</div>
      </div>
    `).join('');

    window.scrollTo({ top: this.elements.results.offsetTop - 50, behavior: 'smooth' });
  }

  showError(message) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
    this.elements.answerContent.innerHTML = `<p style="color: #aa0000;">⚠️ ${this.escape(message)}</p>`;
  }

  copy() {
    const text = this.elements.answerContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = this.elements.copyBtn.textContent;
      this.elements.copyBtn.textContent = 'Copied';
      setTimeout(() => this.elements.copyBtn.textContent = originalText, 2000);
    });
  }

  escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

function updateStage(stage) {
  const el = document.querySelector('#loading p');
  if (el) el.innerHTML = `${stage}<span class="dots">...</span>`;
}

window.addEventListener('load', () => {
  const engine = new SearchEngine();
  const ui = new UI(engine);
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (query) {
    ui.elements.query.value = query;
    ui.search();
  }
});
