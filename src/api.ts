import type { Conversation, ConversationDetail, Fact, PatientProfile, Settings } from '../shared/types.js'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

export interface Bootstrap {
  visitor: string
  settings: Settings
  profile: PatientProfile
  conversations: Conversation[]
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap', { method: 'POST' }),
  profile: () => request<PatientProfile>('/api/profile'),
  saveContext: (context: Settings['context']) => request<PatientProfile>('/api/context', { method: 'PUT', body: JSON.stringify(context) }),
  saveSettings: (settings: Settings) => request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  conversations: (query = '') => request<Conversation[]>(`/api/conversations${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  createConversation: () => request<ConversationDetail>('/api/conversations', { method: 'POST' }),
  conversation: (id: string) => request<ConversationDetail>(`/api/conversations/${id}`),
  endConversation: (id: string) => request<ConversationDetail>(`/api/conversations/${id}/end`, { method: 'POST' }),
  deleteConversation: (id: string) => request<{ removed: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  sendTurn: (id: string, text: string) => request<{ turn: unknown }>(`/api/conversations/${id}/turns`, { method: 'POST', body: JSON.stringify({ text }) }),
  updateFact: (id: string, patch: { detail?: string; status?: Fact['status'] }) => request<Fact>(`/api/facts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
}
