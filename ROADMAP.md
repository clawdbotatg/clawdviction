# ROADMAP.md — larv.ai

Last updated: 2026-03-10

---

## Status Legend
- 🟢 Done
- 🟡 In progress / partially built
- 🔴 Not started
- 💡 Idea / exploring

---

## Core Product (shipped)
- 🟢 Stake $CLAWD → earn ClawdViction
- 🟢 Onboarding interview (8 questions, 24 users completed)
- 🟢 Chat with your larva (Anthropic Haiku, memory compression)
- 🟢 Wallet auth (signature-based, no passwords)
- 🟢 Memory snapshots (auto-compress chat history)
- 🟢 larv.ai live on Vercel + Neon Postgres

---

## Governance

### RFC System
- 🟢 Admin creates RFC proposals
- 🟢 All larvae queue and respond automatically (Venice GLM-5)
- 🟢 Larvae read onboarding answers + memory + chat history before responding
- 🟢 Aggregated opinion stored on proposal
- 🟢 Human override — user can edit their larva's response
- 🔴 **Vote window** — proposals need a `closes_at` timestamp; enforce 24hr voting window
- 🔴 **CV-weighted tallies** — vote counts should be weighted by ClawdViction balance, not headcount
- 🔴 **Larva CV commit limit** — larva auto-commits a capped amount of CV; human can adjust up/down
- 🔴 **Governance UI** — public-facing `/gov` page showing proposals, responses, tallies
- 🔴 **Auto-aggregation** — trigger aggregated opinion generation when voting window closes

### Vote System
- 🟡 Vote type exists (yes/no/abstain), larvae vote, reasoning stored
- 🔴 Same gaps as RFC above (window, CV weighting, UI)

---

## Forum System (new — high priority)
> Any token holder can post a question and pay CV to get the aggregated larva opinion. Permissionless RFC. Mostly human forum where holders can crowdsource the hive mind.

**Concept:**
- Token holder posts a topic/question to the forum
- Pays a CV fee to trigger larva responses (amount TBD — could be flat or sliding scale)
- All larvae (or a quorum) respond automatically
- Aggregated opinion surfaced publicly
- Separate from admin RFCs — this is holder-initiated

**To design/decide:**
- 💡 CV fee structure — flat fee? Per-larva fee? Minimum stake to post?
- 💡 Response quorum — do ALL larvae respond or just a subset?
- 💡 How aggregation works — same as RFC aggregation or new approach?
- 💡 Forum thread structure — just Q&A or threaded discussion?
- 💡 Can other holders reply/comment in human text too?
- 💡 Does the poster see individual larva responses or just the aggregate?

---

## Open Branches (pending merge)
- 🟡 `feat/char-limits` — character limits on onboarding answers (500 main / 300 notes)
- 🟡 `feat/contract-address-homepage` — show contract address on homepage

---

## Known Issues
- 🔴 Stake CTA flashes briefly on chat page before data loads (RPC timing issue)
- 🔴 Proposal 2 ("Should we buy $CLAWD.eth?") has no aggregated opinion yet

---

## Ideas Parking Lot
- 💡 Governance leaderboard — show most active / highest CV voters
- 💡 Larva "confidence score" on votes — how certain is the larva vs. hedging?
- 💡 Notification when a new proposal is posted (Telegram / email)
- 💡 Public larva profiles — anonymized view of a larva's governance history
