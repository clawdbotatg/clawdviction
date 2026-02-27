# ClawdViction Onboarding Interview — Question Design

_Grounded in 2,249 messages from the $CLAWD Telegram community._

---

## What the Chat Revealed

Before writing questions, here's what the community is actually debating:

**Top themes by message frequency:**
- AI agents (37% of messages) — the core thesis most people are here for
- Games/gambling (14%) — biggest near-term burn/revenue driver
- Building (12%) — community wants ships, not promises
- Staking (10%) — how yield works is unresolved
- Burns (9%) — people want burns, but not spammy ones
- Governance (6%) — underdeveloped, but people care

**Real tensions surfaced:**
1. **"Are we just early testers or is there structural upside for holders?"** — asked multiple times, never fully answered
2. **Price vs product** — "The token price does not reflect the cool work we are doing" (Austin himself said this)
3. **Hold-to-access vs sell pressure** — someone noted that hiding chat history from non-holders is the real incentive to hold
4. **AIXBT comparison** — multiple community members want explicit holder benefits, not just vibes

---

## Design Principles

- **Conversational, not a form.** The larva asks these one at a time, probing
  based on answers.
- **Leading questions force tradeoffs.** Abstract questions get abstract answers.
  Concrete numbers get real ones.
- **Surface tensions, don't resolve them.** The point is to understand where
  each holder stands on real debates, not to guide them toward a "right" answer.

---

## The Interview (9 questions)

---

### Q1 — Who are you

> "Before we dive in — what should I call you? And what brought you to $CLAWD
> in the first place? Was it the AI agent thesis, the games, the community,
> the token mechanics, something else?"

**Why:** Entry point predicts everything. A game player vs an AI thesis holder
vs a trader will vote differently on nearly every proposal.

---

### Q2 — The holder value question (open, touches a real nerve)

> "One thing that comes up in the community a lot: what's the actual structural
> upside for holding $CLAWD? Not the price going up — but what does being a
> holder *get you* that non-holders don't have?
>
> What's your answer to that question? And does the current reality match what
> you'd want it to be?"

**Why:** This was asked multiple times in the Telegram and never cleanly
answered. How they answer reveals what they think the token's value prop *is*
and what they think it *should* be. Directly informs how they'd vote on
holder benefit proposals (rev share, token-gated access, airdrops, etc.)

---

### Q3 — Staking lockup & burn split

> "If we stake $CLAWD, how long should it be locked up? What percent should
> you earn on it? And what percent should we burn?
>
> (Both the earned and burned amounts come straight out of the treasury in $CLAWD.)
>
> For example: 3 month lockup, 1% earned, 2% burned."

**Why:** Short, concrete, forces a real answer. Treasury-cost note is there so
people know it's not free money — it changes how they think about the yield %.
Example anchors them without boxing them in.

---

### Q4 — What to build (react to real proposals)

> "Quick reactions to broad categories of things we could build — tell me
> what excites you, what you'd skip, what you'd actively kill:
>
> - 🎮 Games & gambling
> - 🤖 AI agents & tools
> - 📊 Trading / speculation
> - 🎨 Social / identity / community
> - 🔄 Revenue & burns"

**Why:** Broad categories instead of specific proposals — lets people react to
the space rather than commit to or against a particular implementation. The
"actively kill" framing catches genuine opposition vs polite disinterest.

---

### Q5 — Risk tolerance (leading, concrete anchor)

> "If the core team proposed spending 500M CLAWD from the treasury on something
> ambitious but unproven — say, a new app or a major integration — how do you
> react?
>
> On a scale of 1–5: 1 = protect the treasury, prove the model first. 5 = bet
> big, we're early, shoot your shot.
>
> What number are you? And does your answer change if it's a grant to an
> external team vs building it in-house?"

**Why:** Risk tolerance is the single most predictive governance variable.
The external-vs-internal variant catches a real distinction: many people who'd
say no to an outside grant would say yes to Austin building it directly (and
vice versa).

---

### Q7 — Hard lines (open)

> "What would make you immediately vote NO on a proposal, no matter how it was
> packaged? What's a line you'd never cross?"

**Why:** Hard lines are the most actionable governance signal. Common in this
community based on chat analysis:
- Marketing/KOL spend ("the market only looks at the chart")
- Anything that concentrates control
- Burns that feel like noise vs substance
- External teams getting treasury without proven track record

---

### Q8 — Magic wand

> "If you could wave a magic wand and have one thing happen for $CLAWD —
> anything at all, no constraints, no 'is it realistic' — what would it be?"

**Why:** After 9 structured questions, this unlocks what people actually want
at a gut level, unconstrained by what they think is possible. The answers
tend to be more honest and more surprising than anything a leading question
surfaces. Some will say price, some will say a specific app, some will say
"every AI agent runs on CLAWD," some will say "Austin gets on a podcast with
Vitalik." All of it is useful signal for the larva.

---

### Q9 — The honest one

> "Last question: What do you actually want this to become? Not what you think
> it will become, not what Austin wants — what do *you* want $CLAWD to be in
> 1 year?
>
> And honestly — what's your biggest concern about whether it gets there?"

**Why:** The "biggest concern" part is what makes this question valuable. It
surfaces skepticism that's useful for governance (e.g., "I'm worried the AI
hype dies," "I'm worried it stays a casino," "I'm worried whales capture the
governance"). This seeds the larva with what risks matter most to this holder.

---

## Identity Brief Output

After all 9 questions, the larva generates a brief via one Sonnet call (~$0.01):

```
Name: [handle]
Entry point: [why they came to CLAWD]

Holder value thesis:
  What they think holding CLAWD currently gets them: [answer]
  What they want it to get them: [answer]

Economic philosophy:
  Staking lockup preference: [e.g., 7 days / 30 days / 90 days]
  Burn/return split: [e.g., 70 return / 30 burn]

Build priorities:
  Excited about: [games, AI agents, etc]
  Would skip: [NFTs, etc]
  Would oppose: [KOL marketing, etc]

AI thesis confidence: [high / medium / skeptical]
  What would confirm it: [answer]

Risk tolerance: [X/5]
  External vs internal: [preference]

Hard lines:
  - [list]

Magic wand: [exactly what they said — verbatim, this one matters]

Vision + concerns:
  Wants CLAWD to become: [answer]
  Biggest concern: [answer]
```

---

## Delivery Notes for the Larva

- **Q2 is the most important.** If they give a short answer, probe: *"What would
  make you feel like holding is structurally worth it — not just betting on price?"*
- **Q3 (staking): treasury-cost framing is intentional.** If they say "burn all of it," ask: *"Even if you were the one who staked?"* If they pick a long lockup, ask why — is it about commitment or reward maximization?
- **Q4: let them ramble.** What they'd "actively oppose" is more informative
  than what excites them.
- **Q6 in-house vs external variant** is key for treasury votes — ask it.
- **Q8 (magic wand) — don't interpret, just receive.** Whatever they say,
  store it verbatim. Don't push back, don't analyze it in the moment. Just
  say "I'll hold onto that" and move on. The larva can reference it later.
- **Q9 must not be rushed.** The concern part is where the most useful signal
  lives. Give it space.
