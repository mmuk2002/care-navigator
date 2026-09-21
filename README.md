# Harbor — a voice care navigator

**Live:** https://harbor-production-11ad.up.railway.app
**Repo:** https://github.com/mmuk2002/care-navigator

Harbor is a voice-first web app that helps a patient or family caregiver find their way through the
practical side of care: referrals, appointments, insurance questions, transportation, and what to ask a
professional. It is explicitly **non-clinical** — it never diagnoses, never interprets symptoms, and never
claims to have called or booked anything.

## The core idea

One structured extraction pass is the source of truth. Each finalized user turn produces a single
evidence-backed set of facts, and every live widget is a projection of that shared fact graph.

```
finalized turn
  → one structured LLM extraction (DeepSeek, Gemini as fallback)
  → validated shared fact graph   (every fact must quote the transcript)
  → many widget projections       (referral tracker, transport, care circle, …)
```

This is deliberately *not* one model call per widget. A shared, evidence-backed care state is cheaper,
faster, easier to debug, and cannot produce contradictory versions of the same care story.

### Why one call instead of many

- **Cheaper and faster.** One request per turn instead of 10–20.
- **Consistent.** Every widget reads the same facts, so they can't disagree.
- **Auditable.** Each fact carries the exact quoted span it came from, and the server rejects any fact
  whose words do not appear in the conversation.
- **Explainable.** The widgets are parallel consumers of one state, not independent guessers.

### Derived, not generated

Some views are computed deterministically from the fact graph rather than extracted, so they are
reproducible and testable:

- **Goal & next step** — priority-ordered resolution over the facts.
- **Logistics & feasibility** — cross-checks the appointment weekday against reported rides.
- **Blocked** — surfaces "can't do X until Y".
- **Goal progress** — referral ordered → sent → received → provider selected → appointment booked.

## Architecture

| Path | Role |
| --- | --- |
| `shared/types.ts` | Domain types and the widget vocabulary |
| `shared/cockpit.ts` | Projects the fact graph into care cards; all derived logic |
| `shared/settings.ts` | Defaults and normalization for settings/context |
| `server/db.ts` | PGlite (local) or Postgres (prod) behind one query interface |
| `server/store.ts` | Conversations, turns, facts, widget states, jobs, events |
| `server/persona.ts` | The navigator's system instructions and memory block |
| `server/gemini.ts` | Gemini Live session: audio, transcripts, resumption |
| `server/analysis.ts` | The single extraction pass, evidence validation, rule fallback |
| `server/index.ts` | Fastify REST + SSE + the `/voice` WebSocket |
| `src/` | Tailwind React client (Home, Session, Cockpit, Insights, …) |

### Voice

Audio flows browser ⇄ server ⇄ Gemini Live. The server owns the upstream socket so it can persist turns
as they finalize and survive a dropped connection using Gemini's session resumption handle.

### Extraction reliability

1. **DeepSeek** (`deepseek-chat`, OpenAI-compatible) is tried first — reliable and cheap for structured output.
2. **Gemini** models are tried in order as a fallback chain, under a total time budget.
3. **Rule-based reader** mines the turn if every model is unavailable, so the live view never stalls.

Facts are persisted atomically and only after passing evidence validation.

## Running locally

```bash
npm install
cp .env.example .env      # then add your keys
npm run dev               # http://localhost:5173
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Primary extractor (recommended) |
| `DEEPSEEK_MODEL` | Defaults to `deepseek-chat` |
| `GEMINI_API_KEY` | Required for voice; used for extraction fallback |
| `GEMINI_LIVE_MODEL` | Live dialog model, must support `bidiGenerateContent` (e.g. `gemini-3.8-live`) |
| `GEMINI_TEXT_MODEL` / `GEMINI_TEXT_FALLBACKS` | Extraction fallback chain |
| `ANALYSIS_TIMEOUT_MS` / `ANALYSIS_ATTEMPT_MS` | Total budget and per-attempt cap |
| `DATABASE_URL` | Use Postgres instead of embedded PGlite |
| `PORT` | Server port (default 5173) |

## Tests

```bash
npm test          # derived logic, evidence validation, rule fallback, transcript joining
npm run build     # typecheck + production client build
```

## Deploying on Railway

1. Create a project and add a **Postgres** plugin; Railway injects `DATABASE_URL`.
2. Add `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL=gemini-3.8-live`, and `DEEPSEEK_API_KEY`.
3. Deploy from the repo — the `Dockerfile` builds the client and serves it from the same process.
4. Health check: `GET /api/health`.

## Safety boundaries

- Non-clinical by construction: the persona prompt forbids diagnosis, treatment, dosage, and urgency advice.
- Emergencies are redirected to 911 or the care team.
- Harbor never claims a referral, booking, or coverage was verified — only that the person reported it.
- Every fact shows its source quote, and users can edit or delete anything captured.
