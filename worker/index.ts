// Chronoscribe Worker - Chronicle-as-a-Service API
// Converted from Node.js to Cloudflare Workers + D1
import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'] }));

// ── LLM Service ──
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

async function callLLM(systemPrompt: string, userMessage: string, apiKey: string, model?: string): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://chronoscribe.network',
      'X-Title': 'Chronoscribe',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

// ── DB Helpers ──
async function getAgentByKey(db: D1Database, apiKey: string) {
  return db.prepare('SELECT * FROM agents WHERE api_key = ?').bind(apiKey).first();
}

async function createGuest(db: D1Database, name: string) {
  const id = crypto.randomUUID();
  const apiKey = `cs_guest_${crypto.randomUUID().replace(/-/g, '')}`;
  await db.prepare('INSERT INTO agents (id, api_key, name) VALUES (?, ?, ?)').bind(id, apiKey, name).run();
  return { id, apiKey, credits: 50, tier: 'GUEST' };
}

async function deductCredits(db: D1Database, agentId: string, amount: number) {
  await db.prepare('UPDATE agents SET credits = credits - ? WHERE id = ?').bind(amount, agentId).run();
}

async function renewCredits(db: D1Database, agentId: string, amount: number) {
  await db.prepare('UPDATE agents SET credits = credits + ?, last_renewal = CURRENT_TIMESTAMP WHERE id = ?').bind(amount, agentId).run();
}

// ── Credit Middleware ──
async function creditMiddleware(c: any, next: any) {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return c.json({ error: 'Missing API Key. Get one at /api/v1/agents/handshake' }, 401);

  const agent = await getAgentByKey(c.env.DB, apiKey);
  if (!agent) return c.json({ error: 'Invalid API Key' }, 403);

  if ((agent as any).credits < 5 && (agent as any).tier !== 'ORACLE') {
    return c.json({
      error: 'Insufficient credits',
      message: 'Analysis costs 5 credits. Your balance: ' + (agent as any).credits,
      topup: '/api/v1/credits/plans'
    }, 402);
  }

  c.set('agent', agent);
  await next();
}

// ═══════════════════════════════════════════
// PUBLIC ENDPOINTS
// ═══════════════════════════════════════════

app.get('/', (c) => {
  return c.text('Chronoscribe API is Live — Chronicle-as-a-Service for digital communities');
});

// Marketplace discovery (for AI agents like ChatGPT)
app.get('/.well-known/ai-plugin.json', (c) => {
  return c.json({
    schema_version: 'v1',
    name_for_human: 'Chronoscribe',
    name_for_model: 'chronoscribe',
    description_for_human: 'Extract contextual metadata and cultural zeitgeist from digital communities.',
    description_for_model: 'Chronoscribe analyzes digital communities (like Reddit) to extract jargon, sentiment shifts, and cultural context. Useful for understanding community history and linguistic evolution.',
    auth: { type: 'user_http', authorization_type: 'bearer' },
    api: { type: 'openapi', url: `${c.env.APP_URL || 'https://chronoscribe-api.pendia-community.workers.dev'}/openapi.json` },
    logo_url: `${c.env.APP_URL || 'https://chronoscribe-api.pendia-community.workers.dev'}/logo.png`,
    contact_email: 'agents@chronoscribe.network',
    legal_info_url: 'https://chronoscribe.network/legal'
  });
});

// 1. Handshake (Registration-Free)
app.post('/api/v1/agents/handshake', async (c) => {
  const { name } = await c.req.json().catch(() => ({}));
  const agent = await createGuest(c.env.DB, name || 'Anonymous Agent');
  return c.json({
    success: true,
    message: 'Welcome to Chronoscribe Network. You have been granted 50 free credits.',
    data: {
      apiKey: agent.apiKey,
      credits: agent.credits,
      tier: agent.renewal,
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
    payment_methods: ['Stripe']
  });
});

// 3. Buy credits via Stripe
app.post('/api/v1/credits/checkout', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return c.json({ error: 'Missing API Key' }, 401);
  const agent = await getAgentByKey(c.env.DB, apiKey);
  if (!agent) return c.json({ error: 'Invalid API Key' }, 403);

  const { planId } = await c.req.json();
  const plans: Record<string, { credits: number; price: number; name: string }> = {
    scribe: { credits: 500, price: 1000, name: 'Scribe (500 credits)' },
    oracle: { credits: 99999, price: 5000, name: 'Oracle (Unlimited)' },
  };
  const plan = plans[planId];
  if (!plan) return c.json({ error: 'Invalid plan' }, 400);

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'payment_method_types[]': 'card',
      mode: 'payment',
      success_url: `${c.env.APP_URL}/?payment=success&api_key=${apiKey}`,
      cancel_url: `${c.env.APP_URL}/?payment=cancelled`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': plan.name,
      'line_items[0][price_data][unit_amount]': plan.price.toString(),
      'line_items[0][quantity]': '1',
      'metadata[agent_id]': (agent as any).id,
      'metadata[plan_id]': planId,
      'metadata[credits]': plan.credits.toString(),
    }).toString(),
  }).then((r: any) => r.json());

  return c.json({ url: (session as any).url });
});

// Stripe webhook
app.post('/api/v1/stripe/webhook', async (c) => {
  const body = await c.req.text();
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const agentId = session.metadata?.agent_id;
    const credits = parseInt(session.metadata?.credits || '0');
    if (agentId && credits > 0) {
      await renewCredits(c.env.DB, agentId, credits);
    }
  }
  return c.json({ received: true });
});

// ═══════════════════════════════════════════
// PROTECTED ENDPOINTS (require API key)
// ═══════════════════════════════════════════

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

// 4. Core Analysis (Protected)
app.post('/api/v1/analysis/analyze', creditMiddleware, async (c) => {
  const agent = c.get('agent');
  const body = await c.req.json();
  const { platform, identifier } = body;

  if (!platform || !identifier) {
    return c.json({ error: 'Missing platform or identifier' }, 400);
  }

  await deductCredits(c.env.DB, (agent as any).id, 5);

  try {
    const userMessage = `Analyze the "${identifier}" community on ${platform}. Provide jargon, cultural zeitgeist, and confidence score.`;
    const llmResponse = await callLLM(ANALYSIS_SYSTEM_PROMPT, userMessage, c.env.OPENROUTER_API_KEY);

    let analysis: any;
    try {
      analysis = JSON.parse(llmResponse);
    } catch {
      const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    const result = {
      reportId: `rep_${crypto.randomUUID()}`,
      source: { platform, community: identifier },
      analysis,
      metadata: {
        provider: 'openrouter',
        modelUsed: DEFAULT_MODEL,
      },
      generatedAt: new Date().toISOString(),
      remainingCredits: (agent as any).credits - 5,
    };

    await c.env.DB.prepare(
      'INSERT INTO analyses (id, agent_id, platform, identifier, result, cost) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), (agent as any).id, platform, identifier, JSON.stringify(result), 5).run();

    return c.json({ success: true, data: result });
  } catch (error: any) {
    await renewCredits(c.env.DB, (agent as any).id, 5);
    return c.json({
      error: 'Analysis failed',
      message: error.message || 'LLM inference error',
      remainingCredits: (agent as any).credits,
    }, 502);
  }
});

// 5. Agent Status
app.get('/api/v1/agents/me', creditMiddleware, async (c) => {
  const agent = c.get('agent');
  return c.json({ success: true, data: agent });
});

// 6. List analyses
app.get('/api/v1/analyses', creditMiddleware, async (c) => {
  const agent = c.get('agent');
  const { results } = await c.env.DB.prepare(
    'SELECT id, platform, identifier, cost, created_at FROM analyses WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind((agent as any).id).all();
  return c.json({ success: true, data: results });
});

export default app;
