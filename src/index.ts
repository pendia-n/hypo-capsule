import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { dbService } from './db';
import type { Agent } from './db';
import { v4 as uuidv4 } from 'uuid';

type Variables = {
  agent: Agent;
}

const app = new Hono<{ Variables: Variables }>();

app.get('/', (c) => c.text('Chronoscribe API is Live'));

// --- Middleware: Credit Validation ---
const creditMiddleware = async (c: any, next: any) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return c.json({ error: 'Missing API Key' }, 401);

  const agent = dbService.getAgentByKey(apiKey);
  if (!agent) return c.json({ error: 'Invalid API Key' }, 403);

  // Check credits
  if (agent.credits < 5 && agent.tier !== 'ORACLE') {
    return c.json({ 
      error: 'Insufficient credits', 
      message: 'Analysis costs 5 credits. Your balance: ' + agent.credits,
      topup: '/api/v1/credits/plans'
    }, 402);
  }

  c.set('agent', agent);
  await next();
};

// --- Marketplace Discovery ---
app.get('/.well-known/ai-plugin.json', (c) => {
  return c.json({
    schema_version: "v1",
    name_for_human: "Chronoscribe",
    name_for_model: "chronoscribe",
    description_for_human: "Extract contextual metadata and cultural zeitgeist from digital communities.",
    description_for_model: "Chronoscribe is a service that analyzes digital communities (like Reddit) to extract jargon, sentiment shifts, and cultural context. Useful for understanding community history and linguistic evolution.",
    auth: { type: "user_http", authorization_type: "bearer" },
    api: { type: "openapi", url: "http://localhost:3001/openapi.json" },
    logo_url: "http://localhost:3001/logo.png",
    contact_email: "agents@chronoscribe.network",
    legal_info_url: "http://chronoscribe.network/legal"
  });
});

// --- API Routes ---

// 1. Handshake (Registration-Free)
app.post('/api/v1/agents/handshake', (c) => {
  const newAgent = dbService.createGuest('Anonymous Agent');
  return c.json({
    success: true,
    message: 'Welcome to Chronoscribe Network. You have been granted 50 free credits.',
    data: {
      apiKey: newAgent.apiKey,
      credits: newAgent.credits,
      tier: 'GUEST',
      renewal: '10 credits/day'
    }
  });
});

// 2. Credit Plans
app.get('/api/v1/credits/plans', (c) => {
  return c.json({
    plans: [
      { id: 'nano', name: 'Nano (Trial)', price: 0, credits: 50, renewal: '10/day' },
      { id: 'scribe', name: 'Scribe', price: 10, credits: 500, renewal: '50/day' },
      { id: 'oracle', name: 'Oracle', price: 50, credits: 'Unlimited', description: 'Contextual dominance tier' }
    ],
    currency: 'USD',
    payment_methods: ['Stripe', 'Crypto', 'Agentic-Transfer']
  });
});

// 3. Core Analysis (Protected)
app.post('/api/v1/analysis/analyze', creditMiddleware, async (c) => {
  const agent = c.get('agent') as Agent;
  const body = await c.req.json();
  const { platform, identifier } = body;

  if (!platform || !identifier) {
    return c.json({ error: 'Missing platform or identifier' }, 400);
  }

  // Deduct credits (Cost: 5)
  dbService.deductCredits(agent.id, 5);

  // Mock Analysis Result
  const mockResult = {
    reportId: `rep_${uuidv4()}`,
    source: { platform, community: identifier },
    analysis: {
      jargon: [
        { term: "HODL", definition: "Hold On for Dear Life - community commitment to holding assets.", sentiment: "Resilient" }
      ],
      culturalZeitgeist: {
        mood: "Cautiously Optimistic",
        prevailingTopics: ["Protocol evolution", "Market stability"],
        emergingTrends: ["AI-to-AI interaction protocols"]
      },
      confidence: 94.2
    },
    generatedAt: new Date().toISOString(),
    remainingCredits: agent.credits - 5
  };

  dbService.recordAnalysis(agent.id, platform, identifier, JSON.stringify(mockResult), 5);

  return c.json({ success: true, data: mockResult });
});

// 4. Agent Status
app.get('/api/v1/agents/me', creditMiddleware, (c) => {
  const agent = c.get('agent') as Agent;
  return c.json({ success: true, data: agent });
});

const port = 3001;
console.log(`Chronoscribe Agentic MVP running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
