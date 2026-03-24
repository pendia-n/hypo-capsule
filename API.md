# Chronoscribe API Documentation

## Context as a Service - API for AI Agents

Chronoscribe provides contextual metadata extraction from digital communities. Built for the agentic economy where AI agents are the primary users.

## Quick Start for Agents

### 1. Register Your Agent

```bash
curl -X POST http://localhost:3000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-history-agent",
    "name": "Historical Analysis Agent",
    "capabilities": ["read", "analyze"]
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "agentId": "my-history-agent",
    "apiKey": "cs_my-history-agent_xxx...",
    "createdAt": "2024-..."
  }
}
```

### 2. Analyze a Community

```bash
curl -X POST http://localhost:3000/api/v1/analysis/analyze \
  -H "Content-Type: application/json" \
  -H "X-API-Key: cs_my-history-agent_xxx..." \
  -d '{
    "platform": "reddit",
    "identifier": "technology",
    "options": {
      "maxPosts": 50,
      "includeComments": true
    }
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "reportId": "report_123...",
    "jobId": "job_456...",
    "generatedAt": "2024-...",
    "source": {
      "platform": "reddit",
      "community": "technology",
      "postCount": 50
    },
    "analysis": {
      "jargon": [...],
      "sentimentTimeline": [...],
      "culturalZeitgeist": {...},
      "discussionPatterns": [...]
    },
    "metadata": {
      "modelUsed": "gpt-4o",
      "processingTimeMs": 2340,
      "confidence": 87.5
    }
  }
}
```

### 3. Get Report

```bash
curl http://localhost:3000/api/v1/analysis/report/{reportId} \
  -H "X-API-Key: cs_my-history-agent_xxx..."
```

### 4. Export as Markdown

```bash
curl "http://localhost:3000/api/v1/analysis/report/{reportId}?format=markdown" \
  -H "X-API-Key: cs_my-history-agent_xxx..."
```

## API Endpoints

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/register` | Register a new agent |
| GET | `/api/v1/agents/me` | Get agent profile (auth required) |
| GET | `/api/v1/agents/capabilities` | List API capabilities |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analysis/analyze` | Create new analysis job (auth required) |
| GET | `/api/v1/analysis/job/:jobId` | Get job status (auth required) |
| GET | `/api/v1/analysis/report/:reportId` | Get report (auth required) |
| GET | `/api/v1/analysis/report/:reportId/export` | Export report (auth required) |

## Request Examples

### Python (requests)

```python
import requests

# Register
resp = requests.post('http://localhost:3000/api/v1/agents/register', json={
    'agentId': 'my-agent',
    'name': 'My Agent',
    'capabilities': ['read', 'analyze']
})
api_key = resp.json()['data']['apiKey']

# Analyze
resp = requests.post('http://localhost:3000/api/v1/analysis/analyze',
    headers={'X-API-Key': api_key},
    json={'platform': 'reddit', 'identifier': 'programming'}
)
report = resp.json()['data']
```

### JavaScript (fetch)

```javascript
const apiKey = await registerAgent('my-agent');

// Analyze
const { data: report } = await fetch('/api/v1/analysis/analyze', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ platform: 'reddit', identifier: 'gaming' })
});
```

## Analysis Response Schema

```typescript
interface AnalysisReport {
  reportId: string;
  jobId: string;
  generatedAt: string;
  source: {
    platform: 'reddit' | 'forum' | 'twitter' | 'other';
    community: string;
    postCount: number;
    timeRange: { start: string; end: string };
  };
  analysis: {
    jargon: Array<{
      term: string;
      definition: string;
      firstSeen: string;
      lastSeen: string;
      usageCount: number;
      context: string;
    }>;
    sentimentTimeline: Array<{
      timestamp: string;
      score: number; // -1 to 1
      volume: number;
      dominantEmotions: string[];
      keyThemes: string[];
    }>;
    culturalZeitgeist: {
      period: string;
      overallMood: string;
      prevailingTopics: string[];
      emergingTrends: string[];
      notableEvents: string[];
      communitySentiment: string;
    };
    discussionPatterns: Array<{
      patternType: string;
      description: string;
      frequency: number; // 1-10
      timeRange: { start: string; end: string };
      examples: string[];
    }>;
  };
  metadata: {
    modelUsed: string;
    processingTimeMs: number;
    confidence: number; // 0-100
  };
}
```

## Rate Limits

- 60 requests per minute
- 100 analyses per day

## Error Responses

```json
{
  "error": "Error type",
  "message": "Detailed message",
  "details": {...}
}
```

Status codes:
- 400: Bad request / validation error
- 401: Unauthorized (missing/invalid API key)
- 403: Forbidden (missing capability)
- 404: Resource not found
- 429: Rate limit exceeded
- 500: Internal server error
