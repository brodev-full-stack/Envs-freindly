const fetch = require('node-fetch');

const CONFIG = {
  searxngInstances: [
    'https://searx.be',
    'https://search.mdel.net',
    'https://searx.work',
    'https://priv.au',
    'https://searx.tiekoetter.com',
    'https://searx.space',
    'https://search.disroot.org'
  ],
  maxSources: 8
};

async function searchGitHub(query) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=3`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    const data = await response.json();
    return (data.items || []).map(repo => ({
      title: `GitHub: ${repo.full_name}`,
      url: repo.html_url,
      content: repo.description || 'No description available.',
      source: 'GitHub'
    }));
  } catch (err) {
    console.error('GitHub search failed:', err);
    return [];
  }
}

async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      origin: '*'
    });
    const response = await fetch(url);
    const data = await response.json();
    if (!data.query?.search?.length) return [];
    return data.query.search.slice(0, 2).map(result => ({
      title: `Wikipedia: ${result.title}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
      content: result.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
      source: 'Wikipedia'
    }));
  } catch (err) {
    return [];
  }
}

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

    let sources = [];
    
    // Step 1: Parallel search for GitHub and Wikipedia
    const [githubResults, wikiResults] = await Promise.all([
      searchGitHub(query),
      searchWikipedia(query)
    ]);
    sources = [...githubResults, ...wikiResults];

    // Step 2: Try SearxNG (which includes Ecosia results via its engines)
    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'google,bing,duckduckgo,ecosia' // Added Ecosia
        });

        const searchResponse = await fetch(searchUrl, { 
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        
        if (searchResponse.ok) {
          const data = await searchResponse.json();
          if (data?.results?.length > 0) {
            const webSources = data.results
              .filter(r => r.content && r.content.length > 50)
              .slice(0, 4)
              .map(r => ({
                title: r.title,
                url: r.url,
                content: r.content,
                source: r.engine || 'Web'
              }));
            sources = [...sources, ...webSources];
            break; 
          }
        }
      } catch (err) {
        console.warn(`SearxNG instance failed: ${instance}`);
      }
    }

    if (sources.length === 0) {
      return res.status(503).json({ error: 'No information found. Please try a different query.' });
    }

    // Step 3: Structured Prompt for Summary + Deep Dive
    const sourceText = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.source})\n${s.content}\n---`).join('\n\n');
    
    const prompt = `Research Query: "${query}"

Sources:
${sourceText}

Instructions:
1. Start with a "GENERAL SUMMARY" (approx 100 words) that gives a quick overview.
2. Follow with a "DEEP ANALYSIS" (400-500 words) that provides a detailed breakdown.
3. Use multiple paragraphs and cite EVERY claim with [1], [2], etc.
4. Identify 5-8 key technical terms or important concepts and wrap them in double asterisks like **Term** so they can be highlighted.
5. Only use information from the provided sources.
6. Language: English only.

Answer:`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert research assistant. Provide a structured summary followed by a deep analysis. Wrap key terms in double asterisks.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.3
      })
    });

    if (!groqResponse.ok) throw new Error('AI processing failed');

    const groqData = await groqResponse.json();
    return res.status(200).json({ 
      answer: groqData.choices[0].message.content,
      sources: sources.map((s, i) => ({ ...s, id: i + 1 }))
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
};
