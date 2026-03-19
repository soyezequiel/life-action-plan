export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  result: string
}

export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage: { promptTokens: number; completionTokens: number }
}

export interface AgentRuntime {
  chat(messages: LLMMessage[]): Promise<LLMResponse>
  stream(messages: LLMMessage[]): AsyncIterable<string>
  streamChat?(messages: LLMMessage[], onToken: (token: string) => void): Promise<LLMResponse>
  newContext(): AgentRuntime
}

export interface SkillContext {
  planDir: string
  profileId?: string
  planId?: string
  budgetRestante?: number
  userLocale: string
  formalityLevel: 'informal' | 'neutral' | 'formal'
  tokenMultiplier: number
}

export interface SkillResult {
  success: boolean
  filesWritten: string[]
  summary: string
  tokensUsed: { input: number; output: number }
}
