# Chronoscribe — Chronicle-as-a-Service API

Status: In Development

## What It Is

A **Chronicle-as-a-Service API** that provides LLM-powered analysis of user-uploaded chronicles/texts. Features an agent credit system for usage tracking, multi-provider LLM support (Gemini, etc.), and a clean REST API.

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Hono |
| **Database** | SQLite |
| **AI** | Gemini API + multi-provider LLM routing |

## Key Features

- LLM-powered text analysis via REST API
- Multi-provider LLM routing (Gemini, fallback models)
- Agent credit system for usage tracking/billing
- Submit text → get analysis → credit deducted

## Notes

Simple API-first design. No frontend. Pure backend service for integration into other apps.
