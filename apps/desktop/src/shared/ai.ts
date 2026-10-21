export type AiProviderKind = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export interface AiProviderInfo {
  id: string
  name: string
  kind: AiProviderKind
  baseUrl: string
  model: string
  temperature: number
  hasKey: boolean
}

export interface AiProviderInput {
  id?: string
  name: string
  kind: AiProviderKind
  baseUrl: string
  model: string
  apiKey?: string
  temperature?: number
}

export interface AiMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface AiConversationInfo {
  id: string
  title: string
  providerId: string
  messages: AiMessage[]
  createdAt: string
  updatedAt: string
}

export interface AiChatInput {
  providerId: string
  conversationId?: string
  messages: Array<Pick<AiMessage, 'role' | 'content'>>
  system?: string
}

export interface AiChatResult {
  reply: string
  conversation: AiConversationInfo
}

export const AI_PROVIDER_PRESETS: Array<{
  kind: AiProviderKind
  name: string
  baseUrl: string
  model: string
}> = [
  { kind: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { kind: 'openai', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { kind: 'openai', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { kind: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  { kind: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { kind: 'ollama', name: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434', model: 'llama3.1' },
]
