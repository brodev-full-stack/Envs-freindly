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

async function searchGitHub(query) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=3`;
    const response = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    const data = await response.json();
    return (data.items || []).map(repo => ({
      title: `GitHub: ${repo.full_name}`,
      url: repo.html_url,
      content: repo.description || 'Technical repository.',
      source: 'GitHub'
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
    const { query, mode, history } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    // Handle Discussion Mode
    if (mode === 'discussion') {
      const discussionPrompt = `Topic: "${query}"\n\nDiscussion History:\n${history.map(h => `${h.role}: ${h.content}`).join('\n')}\n\nAs a PhD researcher, provide a deep, data-driven response to the last message. Be neutral, objective, and focus on facts.`;
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: 'You are a PhD researcher engaging in a neutral, data-driven discussion.' }, { role: 'user', content: discussionPrompt }],
          max_tokens: 1000, temperature: 0.3
        })
      });
      const groqData = await groqResponse.json();
      return res.status(200).json({ answer: groqData.choices[0].message.content });
    }

    // Step 1: Deep Data Gathering (Google, Wikipedia, GitHub, DW/News)
    const [wiki, github] = await Promise.all([searchWikipedia(query), searchGitHub(query)]);
    
    let webResults = [];
    let images = [];

    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query, format: 'json', engines: 'google,duckduckgo,ecosia,youtube,news'
        });
        const response = await fetch(searchUrl, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (response.ok) {
          const data = await response.json();
          webResults = (data.results || []).filter(r => !r.img_src).slice(0, 10);
          images = (data.results || []).filter(r => r.img_src).slice(0, 10).map(img => ({
            url: img.url, img_src: img.img_src, title: img.title
          }));
          break; 
        }
      } catch (err) {}
    }

    const allSources = [...wiki, ...github, ...webResults.map(r => ({
      title: r.title, url: r.url, content: r.content, source: r.engine || 'Web'
    }))].map((s, i) => ({ ...s, id: i + 1 }));

    // Step 2: PhD-Level AI Analysis
    const sourceText = allSources.map(s => `[${s.id}] ${s.title}\n${s.content}\n---`).join('\n\n');
    const researchPrompt = `Research Query: "${query}"\n\nSources:\n${sourceText}\n\nInstructions:\n1. Provide a PhD-level investigative report.\n2. Tone: Strictly neutral, objective, and data-driven.\n3. Structure: Executive Summary followed by Detailed Analysis.\n4. Cite EVERY claim with [1], [2], etc.\n5. Wrap key technical terms in **Double Asterisks**.\n6. DO NOT highlight headers.\n7. Language: English only.\n\nAnswer:`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'You are a PhD researcher. Provide objective, data-driven reports.' }, { role: 'user', content: researchPrompt }],
        max_tokens: 3000, temperature: 0.1
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
