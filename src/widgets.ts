import type { Widget } from '../shared/types.js'

export const widgetLabel = (widget: Widget): string => ({
  person: 'Care circle',
  timeline: 'Timeline',
  referral: 'Referral',
  appointment: 'Appointment',
  transport: 'Transport',
  question: 'Question',
  open_loop: 'Open loop',
  concern: 'Concern',
  medication: 'Medication',
  decision: 'Decision',
  goal: 'Goal',
  next_step: 'Next step',
  provider: 'Provider',
}[widget])

const tints: Record<Widget, string> = {
  timeline: 'bg-teal-soft text-teal',
  appointment: 'bg-teal-soft text-teal',
  referral: 'bg-teal-soft text-teal',
  person: 'bg-plum-soft text-plum',
  provider: 'bg-plum-soft text-plum',
  question: 'bg-amber-soft text-amber',
  open_loop: 'bg-amber-soft text-amber',
  concern: 'bg-amber-soft text-amber',
  medication: 'bg-amber-soft text-amber',
  next_step: 'bg-rose-soft text-rose',
  transport: 'bg-rose-soft text-rose',
  decision: 'bg-rose-soft text-rose',
  goal: 'bg-rose-soft text-rose',
}

const dots: Record<Widget, string> = {
  timeline: 'bg-teal', appointment: 'bg-teal', referral: 'bg-teal',
  person: 'bg-plum', provider: 'bg-plum',
  question: 'bg-amber', open_loop: 'bg-amber', concern: 'bg-amber', medication: 'bg-amber',
  next_step: 'bg-rose', transport: 'bg-rose', decision: 'bg-rose', goal: 'bg-rose',
}

export const widgetTint = (widget: Widget): string => tints[widget] || 'bg-line/70 text-muted'
export const widgetDot = (widget: Widget): string => dots[widget] || 'bg-muted'
