const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim()

/**
 * The part of a live (in-progress) transcript that a saved turn does not already show.
 *
 * A turn is persisted mid-utterance, so the live text and the saved text overlap and
 * can differ only by whitespace. Comparing normalized values avoids showing the same
 * words twice, and when the live line extends the saved one only the new tail is shown.
 */
export function pendingLive(live: string, finalized: string): string {
  const normalizedLive = normalize(live)
  if (!normalizedLive) return ''
  const normalizedFinal = normalize(finalized)
  if (!normalizedFinal) return live
  if (normalizedFinal === normalizedLive || normalizedFinal.startsWith(normalizedLive)) return ''
  if (!normalizedLive.startsWith(normalizedFinal)) return live
  return live.replace(/^\s+/, '').slice(finalized.trim().length).trim()
}

/** The text of the most recent saved turn for a speaker. */
export function lastTurnText(turns: { speaker: string; text: string }[], speaker: 'user' | 'assistant'): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].speaker === speaker) return turns[index].text
  }
  return ''
}
