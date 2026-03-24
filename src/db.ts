import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const db = new Database('chronoscribe.sqlite');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT,
    tier TEXT DEFAULT 'GUEST',
    credits INTEGER DEFAULT 50,
    last_renewal DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    platform TEXT,
    identifier TEXT,
    result TEXT,
    cost INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );
`);

export interface Agent {
  id: string;
  api_key: string;
  name: string;
  tier: 'GUEST' | 'SCRIBE' | 'ORACLE';
  credits: number;
  last_renewal: string;
}

export const dbService = {
  createGuest: (name: string) => {
    const id = uuidv4();
    const apiKey = `cs_guest_${uuidv4().replace(/-/g, '')}`;
    const result = db.prepare('INSERT INTO agents (id, api_key, name) VALUES (?, ?, ?)').run(id, apiKey, name);
    return { id, apiKey, credits: 50 };
  },

  getAgentByKey: (apiKey: string): Agent | undefined => {
    return db.prepare('SELECT * FROM agents WHERE api_key = ?').get(apiKey) as Agent;
  },

  renewCredits: (agentId: string, amount: number) => {
    db.prepare('UPDATE agents SET credits = credits + ?, last_renewal = CURRENT_TIMESTAMP WHERE id = ?').run(amount, agentId);
  },

  deductCredits: (agentId: string, amount: number) => {
    db.prepare('UPDATE agents SET credits = credits - ? WHERE id = ?').run(amount, agentId);
  },

  recordAnalysis: (agentId: string, platform: string, identifier: string, result: string, cost: number) => {
    const id = uuidv4();
    db.prepare('INSERT INTO analyses (id, agent_id, platform, identifier, result, cost) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, agentId, platform, identifier, result, cost);
  }
};
