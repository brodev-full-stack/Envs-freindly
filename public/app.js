class SearchEngine {
  async search(query) {
    updateStage('Consulting the archives');
    
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
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
    this.elements = {
      query: document.getElementById('query'),
      searchBtn: document.getElementById('search-btn'),
      loading: document.getElementById('loading'),
      results: document.getElementById('results'),
      answerContent: document.getElementById('answer-content'),
      sourcesList: document.getElementById('sources-list'),
      sourceCount: document.getElementById('source-count'),
      copyBtn: document.getElementById('copy-btn'),
      newSearchBtn: document.getElementById('new-search-btn'),
      carousel: document.getElementById('image-carousel'),
      carouselTrack: document.getElementById('carousel-track'),
      videoSection: document.getElementById('video-section'),
      videoGrid: document.getElementById('video-grid'),
      headline: document.getElementById('article-headline'),
      date: document.getElementById('current-date')
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
    this.elements.newSearchBtn.addEventListener('click', () => this.reset());
  }

  async search() {
    const query = this.elements.query.value.trim();
    if (!query || query.length < 3) return;

    // Resume AudioContext on user gesture if needed
    if (window.audioCtx && window.audioCtx.state === 'suspended') {
      window.audioCtx.resume();
    }

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
  }

  displayResults(result, query) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');

    // Headline
    this.elements.headline.textContent = query.charAt(0).toUpperCase() + query.slice(1);

    // Images
    if (result.images && result.images.length > 0) {
      this.elements.carousel.classList.remove('hidden');
      this.elements.carouselTrack.innerHTML = result.images.map(img => `
        <div class="carousel-item" onclick="window.open('${img.url}', '_blank')">
          <img src="${img.img_src}" alt="${this.escape(img.title)}" onerror="this.parentElement.style.display='none'">
        </div>
      `).join('');
    } else {
      this.elements.carousel.classList.add('hidden');
    }

    // Article Body
    const formatted = result.answer
      .split('\n\n')
      .map(p => {
        let content = p.replace(/\[(\d+)\]/g, (match, num) => {
          const source = result.sources.find(s => s.id === parseInt(num));
          return source ? `<sup><a href="${source.url}" target="_blank">[${num}]</a></sup>` : match;
        });
        content = content.replace(/\*\*(.*?)\*\*/g, '<span class="highlight">$1</span>');
        return `<p>${content}</p>`;
      })
      .join('');
    this.elements.answerContent.innerHTML = formatted;

    // Videos
    if (result.videos && result.videos.length > 0) {
      this.elements.videoSection.classList.remove('hidden');
      this.elements.videoGrid.innerHTML = result.videos.map(v => `
        <div class="video-card" onclick="window.open('${v.url}', '_blank')">
          <div class="video-thumbnail">MEDIA</div>
          <div class="video-title">${this.escape(v.title)}</div>
        </div>
      `).join('');
    } else {
      this.elements.videoSection.classList.add('hidden');
    }

    // Sources
    this.elements.sourceCount.textContent = result.sources.length;
    this.elements.sourcesList.innerHTML = result.sources.map(s => `
      <div class="source-card" onclick="window.open('${s.url}', '_blank')">
        <span class="source-number">Source ${s.id} • ${s.source}</span>
        <div class="source-title">${this.escape(s.title)}</div>
        <div class="source-snippet">${this.escape(s.content.substring(0, 120))}...</div>
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

  reset() {
    this.elements.query.value = '';
    this.elements.results.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.elements.query.focus();
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

  // Handle URL query parameters for browser search integration
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (query) {
    ui.elements.query.value = query;
    ui.search();
  }
});