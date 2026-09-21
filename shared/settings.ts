import type { CareContext, Settings } from './types.js'

export const defaultContext = (): CareContext => ({ subject: 'self', patient_name: '', relationship: 'self', speaker_name: '' })

export const defaultSettings = (): Settings => ({
  provider: 'gemini',
  voice: 'Aoede',
  context: defaultContext(),
  preferences: {
    mode: 'get_things_done',
    tone: 'warm',
    verbosity: 'balanced',
    pace: 'unhurried',
    language: 'English',
    captions: true,
    largeText: false,
    agentName: 'Harbor',
  },
})

export const voiceOptions = ['Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Zephyr']

/** Merge a stored/partial settings object with the defaults so the UI never sees holes. */
export function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const base = defaultSettings()
  if (!input) return base
  return {
    provider: input.provider || base.provider,
    voice: input.voice || base.voice,
    context: { ...base.context, ...(input.context || {}) },
    preferences: { ...base.preferences, ...(input.preferences || {}) },
  }
}
