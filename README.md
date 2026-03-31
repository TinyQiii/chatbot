<<<<<<< HEAD
# chatbot
=======
# chatrobot

一个小型全栈 Gemini Chat Demo：

- **Streaming chat**：前端实时显示流式输出（`/api/chat/stream`）
- **RAG**：读取本地 `backend/Data/*.md`（切块 + embedding + 相似度检索），回答带引用 `[SOURCE:filename#chunk]`
- **Structured outputs**：JSON schema 结构化返回（`/api/chat/structured`），前端可渲染 Sources
- **多会话侧边栏**：支持新建/切换会话；聊天记录持久化到 `localStorage`

## 目录结构

```
chatrobot/
  backend/    # .NET 8 minimal APIs（Gemini proxy + RAG + structured）
  frontend/   # Vite + TypeScript（纯 DOM 实现，不是 React）
```

## 运行方式

### 1) 启动后端（.NET 8）

进入目录：

```bash
cd chatrobot/backend
```

配置 Gemini API Key（二选一）：

- **方式 A（推荐）**：环境变量

```bash
export GEMINI_API_KEY="YOUR_KEY"
```

- **方式 B**：User Secrets

```bash
dotnet user-secrets init
dotnet user-secrets set "Google:ApiKey" "YOUR_KEY"
```

启动：

```bash
dotnet run
```

后端默认地址通常是 `http://localhost:5083`，并带 Swagger：`/swagger`

### 2) 启动前端（Vite）

新开一个终端：

```bash
cd chatrobot/frontend
npm install
npm run dev
```

前端会通过 Vite proxy 将 `/api/*` 代理到 `http://localhost:5083`（见 `frontend/vite.config.ts`）。

## 使用说明

### RAG

- 在 UI 勾选 **Use knowledge base (RAG)**
- 知识库文件位于：`chatrobot/backend/Data/`
- 修改/新增 `Data/*.md` 后，**需要重启后端**（索引在启动时构建）

可直接测试（复制到输入框）：

- `How do I enable RAG? RAG-DEMO-ENABLE`
- `What citation format should I expect? RAG-DEMO-CITATIONS`
- `When is the RAG index built? RAG-DEMO-INDEX`

### Structured JSON

- 在 UI 勾选 **Structured JSON**
- 前端会走 `POST /api/chat/structured`，后端让模型按 JSON schema 返回：
  - `answer`：最终答案
  - `citations[]`：引用列表（如有）

## 常见问题

- **遇到 429 Too Many Requests**：通常是 Gemini 配额/限流（RAG 还会额外调用 embedding，更容易触发）。可以等一会儿再试、关闭 RAG 或降低请求频率。

>>>>>>> 8203783 (first commit)
