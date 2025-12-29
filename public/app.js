const CONFIG = {
  apiEndpoint: '/api/search',
  searxng: 'https://searx.be',
  maxSources: 6
};

class SearchEngine {
  constructor() {
    this.sources = [];
  }

  async search(query) {
    // Step 1: Web search
    updateStage('Searching the web');
    const results = await this.webSearch(query);
    
    if (!results?.results?.length) {
      throw new Error('No results found');
    }

    // Step 2: Get top sources
    updateStage('Analyzing sources');
    const topSources = results.results
      .filter(r => r.content && r.content.length > 50)
      .slice(0, CONFIG.maxSources);

    this.sources = topSources.map((r, i) => ({
      id: i + 1,
      url: r.url,
      title: r.title,
      content: r.content,
      snippet: r.content.substring(0, 200) + '...'
    }));

    // Step 3: Generate answer
    updateStage('Generating detailed answer');
    const answer = await this.generateAnswer(query, this.sources);

    return { answer, sources: this.sources };
  }

  async webSearch(query) {
    const url = `${CONFIG.searxng}/search?` + new URLSearchParams({
      q: query,
      format: 'json',
      engines: 'google,bing,duckduckgo'
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');
    return await response.json();
  }

  async generateAnswer(query, sources) {
    const response = await fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, sources })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API failed');
    }

    const data = await response.json();
    return data.answer;
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
      newSearchBtn: document.getElementById('new-search-btn')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.searchBtn.addEventListener('click', () => this.search());
    this.elements.query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.search();
      }
    });
    this.elements.copyBtn.addEventListener('click', () => this.copy());
    this.elements.newSearchBtn.addEventListener('click', () => this.reset());
  }

  async search() {
    const query = this.elements.query.value.trim();
    if (!query || query.length < 3) {
      alert('Please enter a valid query (min 3 characters)');
      return;
    }

    this.showLoading();

    try {
      const result = await this.engine.search(query);
      this.displayResults(result);
    } catch (error) {
      this.showError(error.message);
    }
  }

  showLoading() {
    this.elements.loading.classList.remove('hidden');
    this.elements.results.classList.add('hidden');
  }

  displayResults(result) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');

    // Format answer with citations
    const formatted = result.answer
      .split('\n\n')
      .map(p => {
        const withLinks = p.replace(/\[(\d+)\]/g, (match, num) => {
          const source = result.sources.find(s => s.id === parseInt(num));
          if (source) {
            return `<sup><a href="${source.url}" target="_blank" title="${this.escape(source.title)}">[${num}]</a></sup>`;
          }
          return match;
        });
        return `<p>${withLinks}</p>`;
      })
      .join('');

    this.elements.answerContent.innerHTML = formatted;

    // Display sources
    this.elements.sourceCount.textContent = result.sources.length;
    this.elements.sourcesList.innerHTML = result.sources.map(s => `
      <div class="source-card" onclick="window.open('${s.url}', '_blank')">
        <div class="source-header">
          <span class="source-number">${s.id}</span>
          <div>
            <div class="source-title">${this.escape(s.title)}</div>
            <div class="source-url">${s.url}</div>
            <div class="source-snippet">${this.escape(s.snippet)}</div>
          </div>
        </div>
      </div>
    `).join('');

    this.elements.results.scrollIntoView({ behavior: 'smooth' });
  }

  showError(message) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
    this.elements.answerContent.innerHTML = `<p style="color: var(--secondary);">⚠️ ${this.escape(message)}</p>`;
    this.elements.sourcesList.innerHTML = '';
  }

  copy() {
    const text = this.elements.answerContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
      this.elements.copyBtn.textContent = '✓';
      setTimeout(() => {
        this.elements.copyBtn.textContent = '📋';
      }, 2000);
    });
  }

  reset() {
    this.elements.query.value = '';
    this.elements.results.classList.add('hidden');
    this.elements.query.focus();
  }

  escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

function updateStage(stage) {
  const el = document.getElementById('stage');
  if (el) el.textContent = stage;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const engine = new SearchEngine();
  new UI(engine);
  console.log('🌱 Eco AI Search ready!');
});
