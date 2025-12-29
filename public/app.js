class SearchEngine {
  async search(query) {
    updateStage('Analyzing the web');
    
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Research failed');
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
    
    // Auto-resize textarea
    this.elements.query.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
  }

  async search() {
    const query = this.elements.query.value.trim();
    if (!query || query.length < 3) {
      alert('Please enter a valid research query');
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
    this.elements.loading.scrollIntoView({ behavior: 'smooth' });
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
        <span class="source-number">Source ${s.id}</span>
        <div class="source-title">${this.escape(s.title)}</div>
        <div class="source-snippet">${this.escape(s.snippet)}</div>
      </div>
    `).join('');

    this.elements.results.scrollIntoView({ behavior: 'smooth' });
  }

  showError(message) {
    this.elements.loading.classList.add('hidden');
    this.elements.results.classList.remove('hidden');
    this.elements.answerContent.innerHTML = `<p style="color: #ff3b30;">⚠️ ${this.escape(message)}</p>`;
    this.elements.sourcesList.innerHTML = '';
  }

  copy() {
    const text = this.elements.answerContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = this.elements.copyBtn.textContent;
      this.elements.copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        this.elements.copyBtn.textContent = originalText;
      }, 2000);
    });
  }

  reset() {
    this.elements.query.value = '';
    this.elements.query.style.height = 'auto';
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const engine = new SearchEngine();
  new UI(engine);
});
