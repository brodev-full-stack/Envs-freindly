class SearchEngine {
  async search(query) {
    updateStage('Searching the open web');
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Search failed');
    }
    return await response.json();
  }
}

class UI {
  constructor(engine) {
    this.engine = engine;
    this.zoomLevel = 1;
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
      headline: document.getElementById('result-headline'),
      zoomIn: document.getElementById('zoom-in'),
      zoomOut: document.getElementById('zoom-out'),
      toggleContrast: document.getElementById('toggle-contrast')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.searchBtn.addEventListener('click', () => this.search());
    this.elements.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search();
    });
    this.elements.copyBtn.addEventListener('click', () => this.copy());
    
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
    if (!query || query.length < 2) return;
    this.showLoading();
    try {
      const result = await this.engine.search(query);
      this.displayResults(result, query);
    } catch (error) {
      this.showError(error.message);
    }
  }

  showLoading() {
    this.elements.loading.classList.remove('hidden');
    this.elements.results.classList.add('hidden');
    window.scrollTo({ top: this.elements.loading.offsetTop - 100, behavior: 'smooth' });
  }

  displayResults(result, query) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
    this.elements.headline.textContent = query;

    // Images Gallery
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

    // Answer Body
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

    // Sources
    this.elements.sourcesList.innerHTML = result.sources.map(s => `
      <div class="source-card" onclick="window.open('${s.url}', '_blank')">
        <span class="source-number">${s.id} • ${s.source}</span>
        <div class="source-title">${this.escape(s.title)}</div>
        <div class="source-snippet">${this.escape(s.content.substring(0, 80))}...</div>
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
