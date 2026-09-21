// Each fact is tagged with the widget it feeds, so the widgets are direct
// projections of one structured extraction rather than an intermediate layer.
export const widgets = [
  'person', 'timeline', 'referral', 'appointment', 'transport', 'question',
  'open_loop', 'attempt', 'concern', 'medication', 'decision', 'goal',
  'next_step', 'provider', 'preference', 'readiness',
] as const
export type Widget = typeof widgets[number]

/** How strongly a provider/preference requirement was stated. */
export type Level = 'required' | 'preferred' | 'nice_to_have'
/** How much the person emphasized something (for the visit agenda). */
export type Priority = 'high' | 'normal'
/** Whether a fact is the patient's report or has been confirmed. */
export type Certainty = 'reported' | 'confirmed' | 'needs_verification'
export type FactStatus = 'reported' | 'completed' | 'corrected' | 'superseded'

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
  /** Stable id for a streaming utterance, so partials update one row instead of appending. */
  source_id: string | null
  created_at: string
}

export interface Fact {
  id: string
  conversation_id: string
  widget: Widget
  title: string
  detail: string
  status: FactStatus
  level: Level | null
  priority: Priority | null
  certainty: Certainty
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
  /** This patient's facts from earlier conversations, used for memory and conflicts. */
  memory: Fact[]
  widgets: WidgetState[]
}

export interface PatientProfile {
  facts: Fact[]
  conversation_count: number
  context: CareContext | null
  last_activity: string | null
}

/** A newer statement that contradicts an earlier one and needs the user's choice. */
export interface Conflict {
  widget: Widget
  title: string
  previous: string
  next: string
  previousId: string
  nextId: string
}

export interface AppEvent {
  seq: number
  conversation_id: string
  type: 'turn' | 'fact' | 'widget' | 'conversation'
  data: unknown
  created_at: string
}
