const fetch = require('node-fetch');

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
    const { query, sources } = req.body;

    if (!query || !sources || sources.length === 0) {
      return res.status(400).json({ error: 'Query and sources required' });
    }

    // HERE GOES YOUR API KEY: You should set this in your environment variables (e.g., .env file or Vercel dashboard)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Build detailed prompt
    const sourceText = sources.map((s, i) => 
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

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    if (!response.ok) {
      throw new Error('Groq API failed');
    }

    const data = await response.json();
    return res.status(200).json({ answer: data.choices[0].message.content });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
