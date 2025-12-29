const fetch = require('node-fetch');

const CONFIG = {
  searxng: 'https://searx.be',
  maxSources: 6
};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    // HERE GOES YOUR API KEY: You should set this in your environment variables (e.g., .env file or Vercel dashboard)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Step 1: Web search (Server-side to bypass CORS)
    const searchUrl = `${CONFIG.searxng}/search?` + new URLSearchParams({
      q: query,
      format: 'json',
      engines: 'google,bing,duckduckgo'
    });

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error('Search engine failed');
    }
    const searchData = await searchResponse.json();

    if (!searchData?.results?.length) {
      return res.status(404).json({ error: 'No results found' });
    }

    // Step 2: Process sources
    const topSources = searchData.results
      .filter(r => r.content && r.content.length > 50)
      .slice(0, CONFIG.maxSources)
      .map((r, i) => ({
        id: i + 1,
        url: r.url,
        title: r.title,
        content: r.content,
        snippet: r.content.substring(0, 200) + '...'
      }));

    // Step 3: Build detailed prompt
    const sourceText = topSources.map((s, i) => 
      `[${i + 1}] ${s.title}\n${s.content}\n---`
    ).join('\n\n');

    const prompt = `Research Query: "${query}"

Sources:
${sourceText}

Provide a comprehensive, detailed answer (400-600 words) that:
1. Directly answers the query in the opening
2. Provides deep analysis with multiple paragraphs
3. Includes specific data, numbers, and facts
4. Cites EVERY claim with [1], [2], etc.
5. Covers multiple perspectives if sources differ
6. Is well-structured with logical flow
7. Explains context and background
8. Only uses information from the provided sources

Answer:`;

    // Step 4: Call Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert research assistant that provides detailed, well-cited answers. Always cite sources with [number] and provide comprehensive explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2500,
        temperature: 0.2,
        top_p: 0.9
      })
    });

    if (!groqResponse.ok) {
      throw new Error('Groq API failed');
    }

    const groqData = await groqResponse.json();
    return res.status(200).json({ 
      answer: groqData.choices[0].message.content,
      sources: topSources
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
