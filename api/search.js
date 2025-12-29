const fetch = require('node-fetch');

const CONFIG = {
  searxngInstances: [
    'https://searx.be',
    'https://search.mdel.net',
    'https://searx.work',
    'https://priv.au',
    'https://searx.tiekoetter.com',
    'https://searx.space'
  ]
};

// --- Data Source Helpers ---

async function searchGitHub(query) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`;
    const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    const data = await response.json();
    return (data.items || []).map(repo => ({
      title: repo.full_name,
      url: repo.html_url,
      content: repo.description || 'No description.',
      source: 'GitHub',
      stars: repo.stargazers_count
    }));
  } catch (err) { return []; }
}

async function searchBooks(query) {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3`;
    const response = await fetch(url);
    const data = await response.json();
    return (data.docs || []).map(book => ({
      title: `Book: ${book.title}`,
      url: `https://openlibrary.org${book.key}`,
      content: `Author: ${book.author_name ? book.author_name.join(', ') : 'Unknown'}. Published: ${book.first_publish_year || 'N/A'}.`,
      source: 'Open Library'
    }));
  } catch (err) { return []; }
}

async function searchNews(query) {
  // Using HN search as a reliable free news source
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=3`;
    const response = await fetch(url);
    const data = await response.json();
    return (data.hits || []).map(hit => ({
      title: hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      content: `News from HackerNews. Points: ${hit.points}.`,
      source: 'HackerNews'
    }));
  } catch (err) { return []; }
}

// --- Main API Handler ---

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    // Step 1: Gather Multi-modal Data
    const [githubRaw, books, news] = await Promise.all([
      searchGitHub(query),
      searchBooks(query),
      searchNews(query)
    ]);

    let webResults = [];
    let images = [];
    let videos = [];

    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'google,bing,duckduckgo,ecosia,youtube,google images'
        });

        const response = await fetch(searchUrl, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        if (response.ok) {
          const data = await response.json();
          webResults = (data.results || []).filter(r => !r.img_src && !r.template?.includes('video')).slice(0, 10);
          images = (data.results || []).filter(r => r.img_src).slice(0, 8).map(img => ({
            url: img.url,
            img_src: img.img_src,
            title: img.title
          }));
          videos = (data.results || []).filter(r => r.template?.includes('video') || r.url.includes('youtube.com')).slice(0, 4);
          break; 
        }
      } catch (err) {}
    }

    // Step 2: AI Filters GitHub for Relevance
    const githubPrompt = `Query: "${query}"\n\nGitHub Repos:\n${githubRaw.map((r, i) => `[${i}] ${r.title}: ${r.content}`).join('\n')}\n\nIdentify which indices are TRULY relevant to the query. Return ONLY a JSON array of indices, e.g., [0, 2]. If none are relevant, return [].`;
    
    const githubFilterResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: githubPrompt }],
        response_format: { type: 'json_object' }
      })
    });
    
    let relevantGithub = [];
    try {
      const filterData = await githubFilterResponse.json();
      const indices = JSON.parse(filterData.choices[0].message.content).indices || [];
      relevantGithub = indices.map(i => githubRaw[i]).filter(Boolean);
    } catch (e) { relevantGithub = githubRaw.slice(0, 2); }

    // Step 3: Final Research Prompt
    const allSources = [
      ...webResults.map(r => ({ ...r, source: r.engine || 'Web' })),
      ...relevantGithub,
      ...books,
      ...news
    ].map((s, i) => ({ ...s, id: i + 1 }));

    const sourceText = allSources.map(s => `[${s.id}] ${s.title} (Source: ${s.source})\n${s.content}\n---`).join('\n\n');
    
    const researchPrompt = `Research Query: "${query}"\n\nSources:\n${sourceText}\n\nInstructions:\n1. Start with a "GENERAL SUMMARY" (100 words).\n2. Follow with a "DEEP ANALYSIS" (400-500 words).\n3. Cite EVERY claim with [1], [2], etc.\n4. If a source is from Ecosia, explicitly mention "According to Ecosia results..."\n5. Wrap key technical terms in **Double Asterisks**.\n6. Language: English only.\n\nAnswer:`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'Expert research assistant. Cite sources. Reference Ecosia when applicable.' }, { role: 'user', content: researchPrompt }],
        max_tokens: 3000,
        temperature: 0.3
      })
    });

    const groqData = await groqResponse.json();
    
    return res.status(200).json({ 
      answer: groqData.choices[0].message.content,
      sources: allSources,
      images,
      videos
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
};
