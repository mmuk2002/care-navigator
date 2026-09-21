// Each fact is tagged with the widget it feeds, so the widgets are direct
// projections of one structured extraction rather than an intermediate layer.
export const widgets = [
  'person', 'timeline', 'referral', 'appointment', 'transport', 'question',
  'open_loop', 'concern', 'medication', 'decision', 'goal', 'next_step', 'provider',
] as const
export type Widget = typeof widgets[number]

export type CareSubject = 'self' | 'other'
export type Provider = 'gemini' | 'openai'

export interface CareContext {
  subject: CareSubject
  patient_name: string
  relationship: string
  speaker_name: string
}

export interface NavigatorPreferences {
  mode: 'get_things_done' | 'just_listen' | 'prepare_me' | 'caregiver'
  tone: 'warm' | 'calm' | 'direct'
  verbosity: 'brief' | 'balanced' | 'detailed'
  pace: 'unhurried' | 'balanced'
  language: string
  captions: boolean
  largeText: boolean
  agentName: string
}

export interface Settings {
  provider: Provider
  voice: string
  context: CareContext
  preferences: NavigatorPreferences
}

export interface ConversationSummary {
  talked_about: string[]
  decisions: string[]
  next_steps: string[]
  waiting_on: string[]
  questions: string[]
}

export interface Conversation {
  id: string
  visitor_id: string
  patient_key: string
  status: 'ready' | 'connecting' | 'live' | 'ended' | 'incomplete'
  settings: Settings
  summary: ConversationSummary | null
  title: string | null
  started_at: string
  ended_at: string | null
}

export interface Turn {
  id: string
  conversation_id: string
  speaker: 'user' | 'assistant'
  text: string
  seq: number
  interrupted: boolean
  created_at: string
}

export interface Fact {
  id: string
  conversation_id: string
  widget: Widget
  title: string
  detail: string
  status: 'reported' | 'completed' | 'corrected'
  source_turn_id: string
  source_quote: string
  event_date: string | null
  created_at: string
}

export interface WidgetState {
  widget: Widget
  status: 'waiting' | 'working' | 'current' | 'failed'
  updated_at: string | null
}

export interface ConversationDetail {
  conversation: Conversation
  turns: Turn[]
  facts: Fact[]
  widgets: WidgetState[]
}

export interface PatientProfile {
  facts: Fact[]
  conversation_count: number
  context: CareContext | null
  last_activity: string | null
}

export interface AppEvent {
  seq: number
  conversation_id: string
  type: 'turn' | 'fact' | 'widget' | 'conversation'
  data: unknown
  created_at: string
}
