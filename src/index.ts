import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { dbService } from './db';
import type { Agent } from './db';
import { v4 as uuidv4 } from 'uuid';
import { callLLM, getProviderInfo } from './llm';

type Variables = {
  agent: Agent;
}

const app = new Hono<{ Variables: Variables }>();

app.get('/', (c) => {
  const { provider, model } = getProviderInfo();
  return c.text(`Chronoscribe API is Live — powered by ${provider} (${model})`);
});

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

// --- Analysis Prompt ---
const ANALYSIS_SYSTEM_PROMPT = `You are Chronoscribe, an expert cultural analyst for digital communities. 
You extract contextual metadata including jargon, sentiment, and cultural zeitgeist from community descriptions.

You MUST respond with valid JSON matching this exact schema:
{
  "jargon": [
    { "term": "string", "definition": "string", "sentiment": "string" }
  ],
  "culturalZeitgeist": {
    "mood": "string",
    "prevailingTopics": ["string"],
    "emergingTrends": ["string"]
  },
  "confidence": number (0-100)
}

Provide 3-5 jargon terms, 2-4 prevailing topics, and 2-3 emerging trends.
Base your analysis on your knowledge of the given community.`;

// 3. Core Analysis (Protected) — Now powered by LLM
app.post('/api/v1/analysis/analyze', creditMiddleware, async (c) => {
  const agent = c.get('agent') as Agent;
  const body = await c.req.json();
  const { platform, identifier } = body;

  if (!platform || !identifier) {
    return c.json({ error: 'Missing platform or identifier' }, 400);
  }

  // Deduct credits (Cost: 5)
  dbService.deductCredits(agent.id, 5);

  const startTime = Date.now();
  const { provider, model } = getProviderInfo();

  try {
    const userMessage = `Analyze the "${identifier}" community on ${platform}. Provide jargon, cultural zeitgeist, and confidence score.`;

    const llmResponse = await callLLM(ANALYSIS_SYSTEM_PROMPT, userMessage);

    let analysis: any;
    try {
      analysis = JSON.parse(llmResponse);
    } catch {
      // If the LLM returns markdown-wrapped JSON, extract it
      const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const result = {
      reportId: `rep_${uuidv4()}`,
      source: { platform, community: identifier },
      analysis,
      metadata: {
        provider,
        modelUsed: model,
        processingTimeMs,
      },
      generatedAt: new Date().toISOString(),
      remainingCredits: agent.credits - 5,
    };

    dbService.recordAnalysis(agent.id, platform, identifier, JSON.stringify(result), 5);

    return c.json({ success: true, data: result });
  } catch (error: any) {
    // Refund credits on LLM failure
    dbService.renewCredits(agent.id, 5);

    return c.json({
      error: 'Analysis failed',
      message: error.message || 'LLM inference error',
      provider,
      model,
      remainingCredits: agent.credits, // credits refunded
    }, 502);
  }
});

// 4. Agent Status
app.get('/api/v1/agents/me', creditMiddleware, (c) => {
  const agent = c.get('agent') as Agent;
  return c.json({ success: true, data: agent });
});

// 5. Provider Info
app.get('/api/v1/provider', (c) => {
  const info = getProviderInfo();
  return c.json({ success: true, data: info });
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';
const { provider, model } = getProviderInfo();
console.log(`🕰️  Chronoscribe Agentic MVP running on http://${host}:${port}`);
console.log(`🤖 LLM Provider: ${provider} | Model: ${model}`);

serve({
  fetch: app.fetch,
  port,
  hostname: host,
});
