# Harbor — 7-minute flagship demo

**The one line:** *The patient speaks once, and the entire care journey moves forward.*

**The one visual:** one natural sentence lands → five widgets change → one old widget disappears → one new widget appears → the navigator asks exactly one sensible next question.

---

## Before you start

1. `npm run dev` (or use the deployed URL).
2. Open the app. Click **Personalize Harbor**.
   - Choose **Someone I care for**
   - Your name: `Elena` · Their name: `Maria` · Relationship: `mother`
   - **Save settings**
3. Seed the persistent memory for Beat 7: start a short conversation and say
   *"Maria prefers afternoon appointments."* Then end it. (This is "a previous session".)
4. Start a fresh conversation. Turn on **Type instead** as a fallback in case the mic misbehaves — it uses the same persona and the same extraction pipeline.
5. Open **Recommended / Custom** on the Live care view once and back, so the audience sees the workspace is theirs to shape.

**Say to the audience:** "Everything you'll see comes from one extraction pass per turn. The widgets aren't asking the model separately — they're projections of one shared, evidence-backed care state."

---

## Beat 1 — Chaos becomes structure (0:00–1:00)

**Say:**

> "Hi, I'm helping my mom Maria and honestly this has become kind of a mess. We're trying to get her into neurology. Her PCP, Dr. Patel, told us he sent the referral Monday, but the neurology office says they never got it. I've already called them twice and they said they'd call me back yesterday, but they haven't. Mom has Medicare, she doesn't drive, we'd prefer a woman doctor and Spanish would be nice if possible."

**Expected navigator:** one short turn that names the blocker and asks one question — *not* a readback. Close to:
> "That's a frustrating loop. Since only Dr. Patel's office can actually resend it, I'd start there rather than with neurology again. What did they say when you told them neurology never received it?"

**Expected screen:**
- **Goal & next step** — goal understood, next step = *Confirm the referral was received*
- **Referral tracker** — ordered ✓ / PCP says sent Monday ✓ / neurology received ✕ (discrepancy)
- **Open loops** — callback expected yesterday
- **Already tried** — called neurology ×2
- **Provider requirements** — Medicare (required) · female clinician (preferred) · Spanish (nice to have)
- **Transportation** — doesn't drive
- **Care circle** — Dr. Patel
- **What changed today** — everything above

**Say to the audience:** "Notice she never filled out a referral form, a provider-preference form, a caregiver form, or a task tracker. She just told her story."

---

## Beat 2 — One update, six consequences (1:00–2:00)

**Say:**

> "Actually, I just remembered — neurology called about ten minutes ago. They said the resent referral finally came through."

**Expected navigator:**
> "That's a relief — the loop finally closed. Did they give you an appointment date, or say someone would call to schedule?"

**Expected screen (the cascade):**
- Referral → **received ✓**
- **Open loops** → the callback loop resolves
- **Blocked** → clears
- **Goal progress** → Referral received ✓, appointment stage now current
- **Next step** → *Schedule the appointment*
- **Timeline** → Today: neurology confirmed receipt

**Pause here.** Let them see one sentence change six things.

---

## Beat 3 — The workspace reorganizes (2:00–3:00)

**Say:**

> "Yes. They gave Mom next Thursday at 2 PM with Dr. Rivera."

**Expected screen:**
- **Upcoming care** materializes: Dr. Rivera · Thursday 2 PM
- **Appointment readiness** materializes (Transportation ?, Questions ?, Medication list ?, Insurance ?)
- **Referral tracker collapses** to a resolved line
- **Next step** → *Arrange transportation*

**Say to the audience:** "The UI doesn't just update — it changes composition. A solved problem gives up its space to the next one."

---

## Beat 4 — Cross-widget reasoning (3:00–3:45)

**Say:**

> "Sarah can usually take Mom on Thursdays."

**Expected:** Transportation shows a **potential** ride, not a confirmed one. The navigator asks:
> "Has Sarah already confirmed she can take her next Thursday?"

**Say:**

> "Yeah, she said she can."

**Expected screen:**
- Transportation → **Sarah · confirmed**
- **Appointment readiness** → Transportation ✓
- **Care circle** → Sarah
- **Next step** advances to the remaining prep item

**Say to the audience:** "That was a bare 'yeah' — the system resolved it against what it already knew."

---

## Beat 5 — The agenda builds itself (3:45–4:30)

**Say:**

> "Her memory has gotten worse lately, and she's also been sleeping really badly. The memory stuff is definitely the bigger concern."

**Expected screen:**
- **Visit agenda** appears, **memory ranked first** (high priority), sleep second
- Concerns stored in her own words — **no diagnosis anywhere**

**Say to the audience:** "No 'signs of dementia progression'. Just what the family said, organized and prioritized."

---

## Beat 6 — Correcting yourself mid-sentence (4:30–5:00)

**Say:**

> "She's been forgetting names for about two months — actually, no, more like three weeks."

**Expected:** only the corrected value survives — *about three weeks*. The retracted "two months" is not committed.

**Say to the audience:** "Live conversation state stays provisional until the utterance stabilizes, because people correct themselves constantly in natural speech."

---

## Beat 7 — Contradiction with persistent memory (5:00–5:45)

**Say:**

> "Actually mornings work much better for Mom now."

**Expected:**
- A **Possible update** card: Previously *afternoons* → Now *mornings*, with **Use the new one / Keep previous**
- The navigator asks the conflict question out loud: *"I have afternoons saved from before. Should I update Maria's preference to mornings going forward?"*

**Say:** "Yes."

**Say to the audience:** "We never ask permission to remember. We only interrupt when a new fact genuinely contradicts an old one — because that changes future scheduling."

---

## Beat 8 — The UI surfaces the gap (5:45–6:15)

**Say:**

> "Actually I don't think we have an updated medication list."

**Expected:** **Appointment readiness** → *Medication list □ needed*; a task appears and the next step updates.

**Say to the audience:** "The interface itself prompted useful conversation. It's participating in the workflow, not just reflecting speech."

---

## Beat 9 — End of call (6:15–6:45)

Click **End and summarize**.

**Expected full-screen:**
- **Resolved** — referral, callback, transportation
- **Scheduled** — neurology · Dr. Rivera · Thursday 2 PM
- **Prepared** — memory, sleep
- **Still to do** — medication list
- **Current objective** — get Maria ready for Thursday

---

## Beat 10 — Come back tomorrow (6:45–7:00)

Click **Back to today**. The Home screen now shows the **upcoming visit**, the **confirmed ride**, the **top discussion item**, and the **one remaining prep item** — all derived from persistent memory, not the conversation.

**Say to the audience:** "This is the part that matters. The system remembers the **care journey**, not just the conversation. Tomorrow she can just ask *'what's left for Mom's appointment?'* and it answers."

---

## If something goes wrong

| Problem | Recovery |
| --- | --- |
| Mic not working | Click **Type instead** and paste the utterance. Same pipeline, same widgets. |
| Navigator is too chatty | Open **Adjust the navigator** → set **Length: Brief**, or switch **Mode: Just listen**. Applies mid-call. |
| A fact looks wrong | Hover it → **Edit** or **Delete**. A **Removed … Undo** toast appears for 8 seconds. |
| Widgets feel cluttered | Switch **Recommended ↔ Custom**, or **+ Add widget** to pin exactly what you want. |
| Model outage | The navigator keeps working; extraction falls back to the rule-based reader automatically. |

---

## The line to close on

> "The patient speaks once, and the entire care journey moves forward."
