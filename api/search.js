const fetch = require('node-fetch');

const CONFIG = {
  searxngInstances: [
    'https://searx.be',
    'https://search.mdel.net',
    'https://searx.work',
    'https://priv.au',
    'https://searx.tiekoetter.com',
    'https://searx.space'
  ],
  maxSources: 10
};

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
    return data.query.search.slice(0, 3).map(result => ({
      title: `Wikipedia: ${result.title}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
      content: result.snippet.replace(/<\/?[^>]+(>|$)/g, ""),
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
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    // Step 1: High-Quality Sources (Wikipedia + DDG/Ecosia via SearxNG)
    const wikiResults = await searchWikipedia(query);
    let webResults = [];
    let images = [];
    let videos = [];

    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'duckduckgo,ecosia,youtube,google images'
        });

        const response = await fetch(searchUrl, { 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        if (response.ok) {
          const data = await response.json();
          webResults = (data.results || []).filter(r => !r.img_src && !r.template?.includes('video')).slice(0, 8);
          images = (data.results || []).filter(r => r.img_src).slice(0, 10).map(img => ({
            url: img.url,
            img_src: img.img_src,
            title: img.title
          }));
          videos = (data.results || []).filter(r => r.template?.includes('video') || r.url.includes('youtube.com') || r.url.includes('vimeo.com')).slice(0, 6);
          break; 
        }
      } catch (err) {}
    }

    const allSources = [
      ...wikiResults,
      ...webResults.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        source: r.engine || 'Web'
      }))
    ].map((s, i) => ({ ...s, id: i + 1 }));

    if (allSources.length === 0) {
      return res.status(503).json({ error: 'No high-quality information found. Please try again.' });
    }

    // Step 2: Deep AI Analysis Prompt
    const sourceText = allSources.map(s => `[${s.id}] ${s.title} (Source: ${s.source})\n${s.content}\n---`).join('\n\n');
    
    const researchPrompt = `Research Query: "${query}"

Sources:
${sourceText}

Instructions:
1. Write a high-quality, professional research report in the style of a major newspaper (like The New York Times).
2. Start with a "EXECUTIVE SUMMARY" (150 words) that provides a sophisticated overview.
3. Follow with a "DETAILED INVESTIGATION" (500-700 words) with deep analysis and multiple sections.
4. Cite EVERY claim with [1], [2], etc.
5. Explicitly mention Ecosia or Wikipedia when referencing their specific data.
6. Wrap key technical terms or important entities in **Double Asterisks**.
7. Maintain a formal, objective, and authoritative tone.
8. Language: English only.

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
          { role: 'system', content: 'You are a senior investigative journalist. Provide a deep, well-cited research report based on the provided sources.' },
          { role: 'user', content: researchPrompt }
        ],
        max_tokens: 3500,
        temperature: 0.2
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
