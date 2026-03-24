#!/bin/bash

echo "--- 1. Agent Handshake (Getting Guest API Key) ---"
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/agents/handshake)
echo $RESPONSE | jq .
API_KEY=$(echo $RESPONSE | jq -r .data.apiKey)

echo -e "\n--- 2. Checking Initial Credits ---"
curl -s -X GET http://localhost:3001/api/v1/agents/me -H "X-API-Key: $API_KEY" | jq .

echo -e "\n--- 3. Performing Contextual Analysis (Costs 5 Credits) ---"
curl -s -X POST http://localhost:3001/api/v1/analysis/analyze \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"platform": "reddit", "identifier": "technology"}' | jq .

echo -e "\n--- 4. Checking Final Credits ---"
curl -s -X GET http://localhost:3001/api/v1/agents/me -H "X-API-Key: $API_KEY" | jq .

echo -e "\n--- 5. Viewing Monetization Plans ---"
curl -s -X GET http://localhost:3001/api/v1/credits/plans | jq .
