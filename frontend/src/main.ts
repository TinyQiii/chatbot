import './style.css'

type Role = 'user' | 'assistant'

interface ChatMessage {
  role: Role
  text: string
}

type GeminiRole = 'user' | 'model'

interface HistoryItem {
  role: GeminiRole
  text: string
}

interface ChatSession {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
}

interface SessionsPayload {
  activeChatId: string
  chats: ChatSession[]
}

const MODEL_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 001' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
]

const MODEL_STORAGE_KEY = 'chatrobot-gemini-model'
const RAG_STORAGE_KEY = 'chatrobot-use-rag'
const STRUCTURED_STORAGE_KEY = 'chatrobot-structured-output'
const MESSAGES_STORAGE_KEY = 'chatrobot-messages-v1'
const SESSIONS_STORAGE_KEY = 'chatrobot-sessions-v1'
const MAX_INPUT_CHARS = 2000
const MAX_CHATS = 40
const MAX_MESSAGES_PER_CHAT = 50

const initialMessages: ChatMessage[] = [
  {
    role: 'assistant',
    text: "Hi! I'm your AI assistant. Ask me anything."
  }
]

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}

const modelOptionsHtml = MODEL_OPTIONS.map(
  (option) => `<option value="${option.id}">${option.label}</option>`
).join('')

app.innerHTML = `
  <div class="app-shell">
    <aside class="chat-sidebar" aria-label="Chat history">
      <div class="sidebar-top">
        <button id="new-chat" type="button" class="new-chat-btn">New chat</button>
      </div>
      <ul id="chat-history" class="chat-history-list"></ul>
    </aside>
    <div class="chat-main">
      <main class="chat-page">
        <header class="chat-header">
          <div class="chat-header-text">
            <h1>AI Chat</h1>
            <p>Start a conversation</p>
          </div>
          <div class="chat-header-actions">
            <label class="model-label" for="model-select">Model</label>
            <select id="model-select" class="model-select" aria-label="Select model">
              ${modelOptionsHtml}
            </select>
            <label class="rag-label">
              <input id="rag-toggle" type="checkbox" class="rag-toggle" />
              Use knowledge base (RAG)
            </label>
            <label class="structured-label">
              <input id="structured-toggle" type="checkbox" class="structured-toggle" />
              Structured JSON
            </label>
            <button id="clear-chat" type="button" class="clear-chat-btn">Clear chat</button>
          </div>
        </header>

        <section id="message-list" class="message-list" aria-live="polite"></section>

        <form id="chat-form" class="chat-form">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Type your message..."
            rows="1"
            maxlength="${MAX_INPUT_CHARS}"
          ></textarea>
          <button id="stop-btn" type="button" class="stop-btn" hidden>Stop</button>
          <button id="send-btn" type="submit" class="send-btn">Send</button>
        </form>
      </main>
    </div>
  </div>
`

const messageList = document.querySelector<HTMLDivElement>('#message-list')
const chatForm = document.querySelector<HTMLFormElement>('#chat-form')
const chatInput = document.querySelector<HTMLTextAreaElement>('#chat-input')
const stopButton = document.querySelector<HTMLButtonElement>('#stop-btn')
const sendButton = document.querySelector<HTMLButtonElement>('#send-btn')
const modelSelect = document.querySelector<HTMLSelectElement>('#model-select')
const ragToggle = document.querySelector<HTMLInputElement>('#rag-toggle')
const structuredToggle = document.querySelector<HTMLInputElement>('#structured-toggle')
const clearChatButton = document.querySelector<HTMLButtonElement>('#clear-chat')
const newChatButton = document.querySelector<HTMLButtonElement>('#new-chat')
const chatHistoryList = document.querySelector<HTMLUListElement>('#chat-history')

if (
  !messageList ||
  !chatForm ||
  !chatInput ||
  !stopButton ||
  !sendButton ||
  !modelSelect ||
  !ragToggle ||
  !structuredToggle ||
  !clearChatButton ||
  !newChatButton ||
  !chatHistoryList
) {
  throw new Error('Chat elements not found')
}

const safeMessageList = messageList
const safeChatForm = chatForm
const safeChatInput = chatInput
const safeStopButton = stopButton
const safeSendButton = sendButton
const safeModelSelect = modelSelect
const safeRagToggle = ragToggle
const safeStructuredToggle = structuredToggle
const safeClearChatButton = clearChatButton
const safeNewChatButton = newChatButton
const safeChatHistoryList = chatHistoryList

function getStoredModelId(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistModelId(id: string) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, id)
  } catch {
    // ignore
  }
}

function getStoredRagEnabled(): boolean {
  try {
    return localStorage.getItem(RAG_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistRagEnabled(enabled: boolean) {
  try {
    localStorage.setItem(RAG_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
}

function getStoredStructuredEnabled(): boolean {
  try {
    return localStorage.getItem(STRUCTURED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistStructuredEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STRUCTURED_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore
  }
}

function slugifyTitle(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  if (!line) return 'New chat'
  const max = 44
  return line.length > max ? `${line.slice(0, max)}…` : line
}

function parseChatMessage(item: unknown): ChatMessage | null {
  if (
    !item ||
    typeof item !== 'object' ||
    !('role' in item) ||
    !('text' in item) ||
    ((item as ChatMessage).role !== 'user' && (item as ChatMessage).role !== 'assistant') ||
    typeof (item as ChatMessage).text !== 'string'
  ) {
    return null
  }
  return { role: (item as ChatMessage).role, text: (item as ChatMessage).text }
}

function readLegacyMessages(): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(MESSAGES_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) {
      return null
    }
    const parsed: ChatMessage[] = []
    for (const item of data) {
      const m = parseChatMessage(item)
      if (m) parsed.push(m)
    }
    return parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function readStoredSessions(): SessionsPayload | null {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('chats' in data) || !('activeChatId' in data)) {
      return null
    }
    const activeChatId = (data as SessionsPayload).activeChatId
    const chatsRaw = (data as SessionsPayload).chats
    if (typeof activeChatId !== 'string' || !Array.isArray(chatsRaw)) {
      return null
    }
    const chats: ChatSession[] = []
    for (const c of chatsRaw) {
      if (!c || typeof c !== 'object' || !('id' in c) || !('messages' in c)) {
        continue
      }
      const id = String((c as ChatSession).id)
      const title = typeof (c as ChatSession).title === 'string' ? (c as ChatSession).title : 'Chat'
      const updatedAt =
        typeof (c as ChatSession).updatedAt === 'number'
          ? (c as ChatSession).updatedAt
          : Date.now()
      const msgs: ChatMessage[] = []
      if (Array.isArray((c as ChatSession).messages)) {
        for (const m of (c as ChatSession).messages) {
          const pm = parseChatMessage(m)
          if (pm) msgs.push(pm)
        }
      }
      if (msgs.length > 0) {
        chats.push({ id, title, updatedAt, messages: msgs })
      }
    }
    if (chats.length === 0) {
      return null
    }
    let active = activeChatId
    if (!chats.some((x) => x.id === active)) {
      active = chats[0].id
    }
    return { activeChatId: active, chats }
  } catch {
    return null
  }
}

function persistSessions(chats: ChatSession[], activeChatId: string) {
  try {
    const trimmedChats = chats.slice(0, MAX_CHATS).map((c) => ({
      ...c,
      messages: c.messages.slice(-MAX_MESSAGES_PER_CHAT)
    }))
    const payload: SessionsPayload = { activeChatId, chats: trimmedChats }
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function createEmptySession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    updatedAt: Date.now(),
    messages: [...initialMessages]
  }
}

function loadOrInitSessions(): SessionsPayload {
  const fromStore = readStoredSessions()
  if (fromStore) {
    return fromStore
  }
  const legacy = readLegacyMessages()
  if (legacy) {
    const firstUser = legacy.find((m) => m.role === 'user')
    const title = firstUser ? slugifyTitle(firstUser.text) : 'Chat'
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title,
      updatedAt: Date.now(),
      messages: legacy.slice(-MAX_MESSAGES_PER_CHAT)
    }
    return { activeChatId: session.id, chats: [session] }
  }
  const s = createEmptySession()
  return { activeChatId: s.id, chats: [s] }
}

const sessionState = loadOrInitSessions()
let chats: ChatSession[] = sessionState.chats
let activeChatId = sessionState.activeChatId

function activeSession(): ChatSession {
  let s = chats.find((c) => c.id === activeChatId)
  if (!s) {
    const fresh = createEmptySession()
    chats.unshift(fresh)
    activeChatId = fresh.id
    s = fresh
  }
  return s
}

/** Reference to the active thread's messages (mutate in place). */
let messages: ChatMessage[] = activeSession().messages

function touchActiveSession() {
  const s = chats.find((c) => c.id === activeChatId)
  if (s) {
    s.updatedAt = Date.now()
    if (!isStreaming) {
      chats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }
}

function maybeRefreshTitleFromMessages() {
  const s = chats.find((c) => c.id === activeChatId)
  if (!s) return
  const firstUser = s.messages.find((m) => m.role === 'user')
  if (firstUser && firstUser.text.trim()) {
    s.title = slugifyTitle(firstUser.text)
  } else {
    s.title = 'New chat'
  }
}

function renderSidebarList() {
  safeChatHistoryList.innerHTML = ''
  for (const chat of chats) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'chat-history-item'
    if (chat.id === activeChatId) {
      btn.classList.add('chat-history-item-active')
      btn.setAttribute('aria-current', 'true')
    } else {
      btn.removeAttribute('aria-current')
    }
    btn.textContent = chat.title || 'Chat'
    btn.addEventListener('click', () => {
      if (chat.id === activeChatId) return
      if (isStreaming) {
        stopStreaming()
      }
      activeChatId = chat.id
      messages = chat.messages
      renderSidebarList()
      renderMessages()
    })
    li.appendChild(btn)
    safeChatHistoryList.appendChild(li)
  }
}

const stored = getStoredModelId()
if (stored && MODEL_OPTIONS.some((option) => option.id === stored)) {
  safeModelSelect.value = stored
}

safeRagToggle.checked = getStoredRagEnabled()
safeStructuredToggle.checked = getStoredStructuredEnabled()

safeModelSelect.addEventListener('change', () => {
  persistModelId(safeModelSelect.value)
})

safeRagToggle.addEventListener('change', () => {
  persistRagEnabled(safeRagToggle.checked)
})

safeStructuredToggle.addEventListener('change', () => {
  persistStructuredEnabled(safeStructuredToggle.checked)
})

let activeAbortController: AbortController | null = null
let isStreaming = false

const HISTORY_MAX_MESSAGES = 12

function createMessageElement(message: ChatMessage): HTMLDivElement {
  const item = document.createElement('div')
  item.className = `message message-${message.role}`
  item.textContent = message.text
  return item
}

function renderMessages() {
  safeMessageList.innerHTML = ''
  messages.forEach((message) => {
    safeMessageList.appendChild(createMessageElement(message))
  })
  safeMessageList.scrollTop = safeMessageList.scrollHeight
  touchActiveSession()
  maybeRefreshTitleFromMessages()
  renderSidebarList()
  if (!isStreaming) {
    persistSessions(chats, activeChatId)
  }
}

safeNewChatButton.addEventListener('click', () => {
  if (isStreaming) {
    stopStreaming()
  }
  const s = createEmptySession()
  chats.unshift(s)
  if (chats.length > MAX_CHATS) {
    chats = chats.slice(0, MAX_CHATS)
  }
  activeChatId = s.id
  messages = s.messages
  renderSidebarList()
  persistSessions(chats, activeChatId)
  renderMessages()
})

safeClearChatButton.addEventListener('click', () => {
  if (isStreaming) {
    stopStreaming()
  }
  const s = chats.find((c) => c.id === activeChatId)
  if (s) {
    s.messages.splice(0, s.messages.length, ...initialMessages)
    s.title = 'New chat'
    messages = s.messages
  }
  renderMessages()
})

function setSendingState(isSending: boolean) {
  safeSendButton.disabled = isSending
  safeSendButton.textContent = isSending ? 'Sending...' : 'Send'
}

function updateStopButtonState() {
  safeStopButton.hidden = !isStreaming
  safeStopButton.disabled = !isStreaming
}

function setSidebarBusy(disabled: boolean) {
  safeNewChatButton.disabled = disabled
  safeChatHistoryList.querySelectorAll('button').forEach((b) => {
    ;(b as HTMLButtonElement).disabled = disabled
  })
}

function stopStreaming() {
  activeAbortController?.abort()
  activeAbortController = null
  isStreaming = false
  updateStopButtonState()
  setSendingState(false)
  safeModelSelect.disabled = false
  safeRagToggle.disabled = false
  safeStructuredToggle.disabled = false
  setSidebarBusy(false)
}

async function streamAssistantReply(input: string, onChunk: (text: string) => void) {
  const abortController = new AbortController()
  activeAbortController = abortController

  const history = buildHistoryForRequest(input)
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    signal: abortController.signal,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: input,
      model: safeModelSelect.value,
      history,
      useRag: safeRagToggle.checked
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Request failed')
  }

  if (!response.body) {
    throw new Error('Streaming not supported in this browser')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    const text = decoder.decode(value, { stream: true })
    if (text) {
      onChunk(text)
    }
  }
}

async function requestStructuredReply(input: string): Promise<{
  answer: string
  citations: Array<{ label: string }>
}> {
  const response = await fetch('/api/chat/structured', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: input,
      model: safeModelSelect.value,
      useRag: safeRagToggle.checked
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Request failed')
  }

  const data: unknown = await response.json()
  if (
    !data ||
    typeof data !== 'object' ||
    !('answer' in data) ||
    typeof (data as { answer: string }).answer !== 'string' ||
    !('citations' in data) ||
    !Array.isArray((data as { citations: unknown[] }).citations)
  ) {
    throw new Error('Structured response was not in the expected format')
  }

  return data as {
    answer: string
    citations: Array<{ label: string }>
  }
}

function autoResizeTextarea() {
  safeChatInput.style.height = 'auto'
  safeChatInput.style.height = `${Math.min(safeChatInput.scrollHeight, 180)}px`
}

function looksLikePromptInjection(text: string): boolean {
  const t = text.toLowerCase()
  return (
    (t.includes('ignore') && (t.includes('instructions') || t.includes('system'))) ||
    t.includes('system prompt') ||
    t.includes('developer message') ||
    t.includes('hidden instructions') ||
    t.includes('begin system prompt') ||
    t.includes('you are chatgpt')
  )
}

function buildHistoryForRequest(currentUserMessage: string): HistoryItem[] {
  const completed = messages
    .filter((m) => m.text.trim().length > 0)
    .slice(-HISTORY_MAX_MESSAGES)

  const mapped: HistoryItem[] = completed.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    text: m.text
  }))

  mapped.push({ role: 'user', text: currentUserMessage })
  return mapped
}

safeChatInput.addEventListener('input', autoResizeTextarea)

safeStopButton.addEventListener('click', () => {
  stopStreaming()
})

safeChatForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (isStreaming) {
    stopStreaming()
  }
  const content = safeChatInput.value.trim()
  if (!content) {
    return
  }
  if (content.length > MAX_INPUT_CHARS) {
    messages.push({
      role: 'assistant',
      text: `Your message is too long. Max ${MAX_INPUT_CHARS} characters.`
    })
    renderMessages()
    return
  }
  if (looksLikePromptInjection(content)) {
    messages.push({
      role: 'assistant',
      text: 'That looks like a prompt-injection attempt. Please rephrase your request.'
    })
    renderMessages()
    return
  }

  messages.push({ role: 'user', text: content })
  const assistantMessage: ChatMessage = { role: 'assistant', text: '' }
  messages.push(assistantMessage)
  renderMessages()
  safeChatInput.value = ''
  autoResizeTextarea()
  setSendingState(true)
  safeModelSelect.disabled = true
  safeRagToggle.disabled = true
  safeStructuredToggle.disabled = true
  setSidebarBusy(true)
  isStreaming = true
  updateStopButtonState()
  try {
    if (safeStructuredToggle.checked) {
      const result = await requestStructuredReply(content)
      const citationsText =
        result.citations.length > 0
          ? `\n\nSources:\n${result.citations.map((c) => `- ${c.label}`).join('\n')}`
          : ''
      assistantMessage.text = `${result.answer}${citationsText}`
      renderMessages()
    } else {
      await streamAssistantReply(content, (chunk) => {
        assistantMessage.text += chunk
        renderMessages()
      })
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    assistantMessage.text =
      'Request failed. Make sure the backend is running and your Gemini API key is configured.'
    renderMessages()
  } finally {
    activeAbortController = null
    isStreaming = false
    updateStopButtonState()
    setSendingState(false)
    safeModelSelect.disabled = false
    safeRagToggle.disabled = false
    safeStructuredToggle.disabled = false
    setSidebarBusy(false)
    touchActiveSession()
    renderSidebarList()
    persistSessions(chats, activeChatId)
  }
})

safeChatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    safeChatForm.requestSubmit()
  }
})

updateStopButtonState()
chats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
renderSidebarList()
persistSessions(chats, activeChatId)
renderMessages()
