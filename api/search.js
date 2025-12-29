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
  maxSources: 6
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

    // Get snippets and titles
    return data.query.search.slice(0, 3).map(result => ({
      title: result.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
      content: result.snippet.replace(/<\/?[^>]+(>|$)/g, ""), // Remove HTML tags
      source: 'Wikipedia'
    }));
  } catch (err) {
    console.error('Wikipedia search failed:', err);
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
    let lastError = null;

    // Step 1: Try SearxNG instances
    const shuffledInstances = CONFIG.searxngInstances.sort(() => Math.random() - 0.5);
    for (const instance of shuffledInstances) {
      try {
        const searchUrl = `${instance}/search?` + new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'google,bing,duckduckgo'
        });

        const searchResponse = await fetch(searchUrl, { 
          timeout: 6000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });
        
        const contentType = searchResponse.headers.get('content-type');
        if (searchResponse.ok && contentType && contentType.includes('application/json')) {
          const data = await searchResponse.json();
          if (data?.results?.length > 0) {
            sources = data.results
              .filter(r => r.content && r.content.length > 50)
              .slice(0, CONFIG.maxSources)
              .map((r, i) => ({
                id: i + 1,
                url: r.url,
                title: r.title,
                content: r.content,
                snippet: r.content.substring(0, 200) + '...'
              }));
            break; 
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    // Step 2: Fallback to Wikipedia if no sources found
    if (sources.length === 0) {
      console.log('Falling back to Wikipedia...');
      const wikiResults = await searchWikipedia(query);
      if (wikiResults.length > 0) {
        sources = wikiResults.map((r, i) => ({
          id: i + 1,
          url: r.url,
          title: r.title,
          content: r.content,
          snippet: r.content + ' (Source: Wikipedia)'
        }));
      }
    }

    if (sources.length === 0) {
      return res.status(503).json({ 
        error: 'All search engines are currently busy. Please try again in a few seconds.',
        details: lastError ? lastError.message : 'No results found'
      });
    }

    // Step 3: Build prompt and call Groq
    const sourceText = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}\n---`).join('\n\n');
    const prompt = `Research Query: "${query}"\n\nSources:\n${sourceText}\n\nProvide a comprehensive, detailed answer (400-600 words) that:\n1. Directly answers the query in the opening\n2. Provides deep analysis with multiple paragraphs\n3. Includes specific data, numbers, and facts\n4. Cites EVERY claim with [1], [2], etc.\n5. Covers multiple perspectives if sources differ\n6. Is well-structured with logical flow\n7. Explains context and background\n8. Only uses information from the provided sources\n\nAnswer:`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert research assistant that provides detailed, well-cited answers. Always cite sources with [number] and provide comprehensive explanations.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2500,
        temperature: 0.2,
        top_p: 0.9
      })
    });

    if (!groqResponse.ok) throw new Error('AI processing failed');

    const groqData = await groqResponse.json();
    return res.status(200).json({ 
      answer: groqData.choices[0].message.content,
      sources: sources
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.', message: error.message });
  }
};
