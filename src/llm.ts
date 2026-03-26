/**
 * LLM Service - Multi-provider abstraction layer
 * Supports: Google Gemini (free), Groq (free), OpenRouter
 * 
 * Set LLM_PROVIDER in .env to switch providers:
 *   - "gemini"     → Google Gemini (default, free tier)
 *   - "groq"       → Groq (free tier, fast)
 *   - "openrouter"  → OpenRouter (many models)
 */

import 'dotenv/config';

export type LLMProvider = 'gemini' | 'groq' | 'openrouter';

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function getConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'gemini') as LLMProvider;

  switch (provider) {
    case 'gemini':
      return {
        provider,
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.LLM_MODEL || 'gemini-2.0-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      };
    case 'openrouter':
      return {
        provider,
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free',
        baseUrl: 'https://openrouter.ai/api/v1',
      };
    default:
      throw new Error(`Unsupported LLM provider: ${provider}. Use "gemini", "groq", or "openrouter".`);
  }
}

/**
 * Call the LLM with a system prompt and user message.
 * Returns the raw text response.
 */
export async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error(
      `Missing API key for provider "${config.provider}". ` +
      `Set ${config.provider === 'gemini' ? 'GEMINI_API_KEY' : config.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'} in .env`
    );
  }

  if (config.provider === 'gemini') {
    return callGemini(config, systemPrompt, userMessage);
  } else {
    // Groq and OpenRouter both use OpenAI-compatible API format
    return callOpenAICompatible(config, systemPrompt, userMessage);
  }
}

/**
 * Google Gemini native API
 */
async function callGemini(config: LLMConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }
  return text;
}

/**
 * OpenAI-compatible API (used by Groq, OpenRouter)
 */
async function callOpenAICompatible(config: LLMConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  // OpenRouter requires extra headers
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://chronoscribe.network';
    headers['X-Title'] = 'Chronoscribe';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
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
    throw new Error(`${config.provider} API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Empty response from ${config.provider} API`);
  }
  return text;
}

/**
 * Get current provider info (for API responses)
 */
export function getProviderInfo(): { provider: string; model: string } {
  const config = getConfig();
  return { provider: config.provider, model: config.model };
}
