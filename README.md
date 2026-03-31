# chatrobot

Small full-stack Gemini chat demo:

- **Streaming chat**: token-by-token UI updates (`/api/chat/stream`)
- **RAG**: loads local `backend/Data/*.md` (chunking + embeddings + similarity search) and answers with citations like `[SOURCE:filename#chunk]`
- **Structured outputs**: JSON Schema response (`/api/chat/structured`) so the UI can render “Sources”
- **Multi-chat sidebar**: create/switch chats; sessions are persisted in `localStorage`

## Structure

```
chatrobot/
  backend/    # .NET 8 minimal APIs (Gemini proxy + RAG + structured output)
  frontend/   # Vite + TypeScript (plain DOM, not React)
```

## Run

### 1) Backend (.NET 8)

Go to:

```bash
cd chatrobot/backend
```

Configure the Gemini API key (choose one):

- **Option A (recommended)**: environment variable

```bash
export GEMINI_API_KEY="YOUR_KEY"
```

- **Option B**: .NET user secrets

```bash
dotnet user-secrets init
dotnet user-secrets set "Google:ApiKey" "YOUR_KEY"
```

Start:

```bash
dotnet run
```

Default backend URL is typically `http://localhost:5083` with Swagger at `/swagger`.

### 2) Frontend (Vite)

Open a new terminal:

```bash
cd chatrobot/frontend
npm install
npm run dev
```

The frontend proxies `/api/*` to `http://localhost:5083` via Vite (see `frontend/vite.config.ts`).

## Usage

### RAG

- Enable **Use knowledge base (RAG)** in the UI
- Knowledge base files live in `chatrobot/backend/Data/`
- After editing/adding `Data/*.md`, **restart the backend** (index is built on startup)

Test prompts (copy into the input box):

- `How do I enable RAG? RAG-DEMO-ENABLE`
- `What citation format should I expect? RAG-DEMO-CITATIONS`
- `When is the RAG index built? RAG-DEMO-INDEX`

### Structured JSON

- Enable **Structured JSON** in the UI
- The UI calls `POST /api/chat/structured`. The backend asks the model to return JSON that matches a schema:
  - `answer`: final answer text
  - `citations[]`: citations (if any)

## Troubleshooting

- **429 Too Many Requests**: usually Gemini quota / rate limiting (RAG adds embedding calls, so it hits limits faster). Wait a bit, disable RAG, or reduce request frequency.
