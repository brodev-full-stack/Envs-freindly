# 🌱 Eco AI Search

Lightweight AI-powered search engine with detailed, well-cited answers.

## Features
- Deep research with 400-600 word detailed answers
- Full citations from multiple sources
- Mobile-optimized interface
- Eco-friendly (minimal resource usage)

## Tech Stack
- **Search**: SearxNG (aggregates Google, Bing, DuckDuckGo)
- **AI**: Groq API (Llama 3.3 70B)
- **Hosting**: Vercel

## Setup

1. Clone repository
2. Install Vercel CLI: `npm install -g vercel`
3. Deploy: `vercel`
4. Add environment variable in Vercel dashboard:
   - Name: `GROQ_API_KEY`
   - Value: Your Groq API key from https://console.groq.com

## Local Development
```bash
npm install
vercel dev
```

## Environment Variables
- `GROQ_API_KEY`: Get from https://console.groq.com (free, 14,400 requests/day)

## License
MIT
