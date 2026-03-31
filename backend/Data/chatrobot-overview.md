# Chatrobot project

Chatrobot is a small full-stack demo: a Vite + TypeScript chat UI talks to an ASP.NET Core backend. The backend calls Google Gemini for replies and can optionally use a local knowledge base (RAG) built from Markdown files in `Data/`.

## Stack

- Frontend: Vite, TypeScript, plain DOM (no React in this folder).
- Backend: .NET 8 minimal APIs, `HttpClient` to Gemini `generateContent` and `streamGenerateContent`.
- Embeddings for RAG use `gemini-embedding-001` with `batchEmbedContents` at startup and `embedContent` per query.

## Configuration

Set `Google:ApiKey` in user secrets or `appsettings`, or set environment variable `GEMINI_API_KEY`. Without a key, chat fails; RAG indexing is skipped if the key is missing at startup.

## Security notes

The backend uses a short system prompt, a model allowlist, message length limits, and basic prompt-injection checks on the latest user message. This is educational—not a complete production safety story.

## RAG demo: what questions to ask

If you enable **Use knowledge base (RAG)** and ask questions that contain these exact phrases, the system should retrieve this section and answer with citations:

- `RAG-DEMO-ENABLE`
- `RAG-DEMO-CITATIONS`
- `RAG-DEMO-INDEX`

Good test questions:

- "How do I enable RAG? RAG-DEMO-ENABLE"
- "What citation format should I expect? RAG-DEMO-CITATIONS"
- "When is the RAG index built? RAG-DEMO-INDEX"

If you don't enable RAG, the assistant will answer without using this knowledge base.

