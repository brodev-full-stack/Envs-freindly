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

async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', list: 'search', srsearch: query, format: 'json', origin: '*'
    });
    const response = await fetch(url, { timeout: 5000 });
    const data = await response.json();
    return (data.query?.search || []).slice(0, 3).map(r => ({
      title: `Wikipedia: ${r.title}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
      content: r.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
      source: 'Wikipedia'
    }));
  } catch (err) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query, history = [] } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    // Step 1: Search (Google Proxy via SearxNG + Wikipedia Fallback)
    const wiki = await searchWikipedia(query);
    let webResults = [];
    let images = [];

    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query, format: 'json', engines: 'google,duckduckgo,ecosia'
        });
        const response = await fetch(searchUrl, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (response.ok) {
          const data = await response.json();
          webResults = (data.results || []).filter(r => !r.img_src).slice(0, 8);
          images = (data.results || []).filter(r => r.img_src).slice(0, 6).map(img => ({
            url: img.url, img_src: img.img_src, title: img.title
          }));
          break; 
        }
      } catch (err) {}
    }

    const allSources = [...wiki, ...webResults.map(r => ({
      title: r.title, url: r.url, content: r.content, source: r.engine || 'Google'
    }))].map((s, i) => ({ ...s, id: i + 1 }));

    // Step 2: Perplexity-style Chat Analysis
    const sourceText = allSources.map(s => `[${s.id}] ${s.title}: ${s.content}`).join('\n');
    const chatPrompt = `Sources:\n${sourceText}\n\nUser Query: "${query}"\n\nInstructions:\n1. Provide a concise, accurate answer based on the sources.\n2. Use a Perplexity-style tone: helpful, direct, and factual.\n3. Cite sources using [1], [2], etc.\n4. If you don't know something, check Wikipedia or state you don't know.\n5. Wrap key terms in **Double Asterisks**.\n6. Keep it in English.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a helpful AI search assistant. Be accurate and cite sources.' },
          ...history.slice(-4), // Include recent history for context
          { role: 'user', content: chatPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.0 // Lowest temperature for maximum accuracy
      })
    });

    const groqData = await groqResponse.json();
    return res.status(200).json({ 
      answer: groqData.choices[0].message.content,
      sources: allSources,
      images
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
};
