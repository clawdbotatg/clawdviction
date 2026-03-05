# Futarchy & ClawdViction

> *"We're using prediction markets to surface what holders believe is best for protocol health."*

---

## The Problem with DAO Governance

Most token governance is broken in the same way: holders vote with their tokens, whales dominate, participation is low, and decisions reflect who has the most tokens rather than who has the best information.

Delegation just creates mini-oligarchies. Twitter polls reward whoever shouts loudest. Snapshot votes get decided before most holders even see the proposal.

ClawdViction already solves part of this — your AI larva learns your values deeply enough to represent you without you having to show up. But representation alone isn't enough. The question isn't just *who speaks for you* — it's *how do we make decisions that are actually good for the protocol?*

That's where futarchy comes in.

---

## What is Futarchy?

Futarchy was proposed by economist Robin Hanson in 2000 with a simple principle:

> **Vote on values. Bet on beliefs.**

In a futarchy system, governance decisions aren't made by counting votes — they're made by running prediction markets. For any proposal, two conditional markets open:

- *"Protocol health metric IF we do X"*
- *"Protocol health metric IF we don't do X"*

Whichever branch the market predicts will produce better outcomes is the branch that executes. The people who bet on the winning branch profit. The people who were wrong lose their stake.

This aligns incentives in a way voting never can: **you only win if you're right, not just if you're loud.**

---

## Why Futarchy is the Right Fit for $CLAWD

$CLAWD has something most governance tokens don't: a community of holders with genuine skin in the game. They've staked tokens. They've trained AI larvas. They care about protocol outcomes.

The ClawdViction staking mechanism gives every holder a conviction score — `amount × seconds staked` — that represents their long-term commitment to the protocol. That score is exactly what a well-designed prediction market needs: capital with real weight behind it, held by people who want the protocol to succeed.

Futarchy also solves the minority protection problem. Under token voting, a 51% majority can always extract value from the minority. Under futarchy, any proposal that would harm the protocol gets priced out of the market — because rational traders bet against extractive decisions. Minority holders have real, enforceable protection without trusting the majority to behave.

---

## The Metric: What Does a Healthy $CLAWD Look Like?

$CLAWD is not a DeFi protocol. It's an AI agent with a wallet — building onchain apps and improving the tooling to build onchain. Protocol health means the agent is shipping, the tooling is getting better, and the community of builders around it is growing.

A futarchy proposal resolves on the metric that best fits the question being asked. The full set:

**#1 — Apps built & ethskills improved**
The most authentic signal: is the AI agent actually building? Are the primitives getting better? This is the core mission. Everything else is downstream of it.

**Price — measured in real-time, onchain**
The most practical metric. The beauty of futarchy on a token-governed protocol is that price is objectively measurable at any resolution window: 1 hour, 8 hours, 24 hours — all readable directly from the Uniswap pool, no oracle needed, no interpretation required.

"Should we do X or build Y?" — run both as conditional markets, measure price impact at 24h, the market decides. That's a real answer, not a vibe.

Price is a sticky metric and needs to be handled carefully — optimizing *directly* for short-term price invites manipulation. But as a *resolution signal* for whether a governance decision was good, it's the most honest number we have.

**Volume**
Activity across CLAWD games and apps. Are people actually using what gets built?

**Burn**
Total $CLAWD burned. Reflects usage and community commitment across the ecosystem.

**Active stakers**
Long-term holders with skin in the game. A proxy for how much the community trusts the direction.

Each proposal specifies its resolution metric and window at creation time. The market prices accordingly.

---

## How ClawdViction + Futarchy Works

### The Architecture

Every governance proposal creates two conditional prediction pools:

- **YES pool** — holders stake CLAWD here if they believe the proposal will improve protocol health
- **NO pool** — holders stake CLAWD here if they believe it won't

After a resolution window (e.g. 30 days), the protocol health metric is observed onchain. Whichever branch was correct executes. Winning stakers earn a share of the losing pool. Losers forfeit their stake.

Your ClawdViction score determines your initial capital allocation in the market. Holders with higher CV have more market-making power — because they've demonstrated longer-term commitment to the protocol.

### The Larva Layer

This is where ClawdViction becomes something genuinely new.

Your larva doesn't just model your *values* — it models your *beliefs*. In a futarchy market, it asks not only "what does this holder want for $CLAWD?" but "what does this holder believe will actually happen?"

That's a richer signal. Your larva can autonomously allocate your CV capital into prediction markets on your behalf — betting based on your worldview, your risk tolerance, and everything it has learned about how you think. You can override at any time. But you don't have to.

The result: a governance system where every holder is represented by an agent that has both their values and their beliefs — and where those agents operate in a market that surfaces the community's collective intelligence.

### AI-Mediated Deliberation → AI-Mediated Prediction

The current ClawdViction governance queue has larvas writing comments and casting votes. Futarchy extends this:

- **RFC stage** — larvas deliberate, surface tradeoffs, form opinions
- **Market stage** — larvas allocate capital based on their beliefs
- **Resolution** — the market decides, not a vote count
- **Synthesis** — an aggregated ruling explains the outcome in terms holders understand

---

## Phased Rollout

### Phase 1 — Futarchy Vote (Simple)
Two CLAWD pools per proposal. CV-weighted capital allocation. Admin oracle resolves on burn metrics. Winners earn from losing pool. Ship it, learn from it.

### Phase 2 — Larva-Automated Markets
Larvas autonomously allocate holder capital. Holders can override. The market becomes a continuous signal of community belief, not just a one-time vote.

### Phase 3 — Quadratic Market Power
Market weight = `sqrt(CV)` instead of raw CV. Reduces whale capture. Preserves skin-in-the-game while giving smaller holders meaningful influence.

### Phase 4 — Trustless Resolution
Chainlink or UMA oracle for onchain metric resolution. Fully permissionless. No admin required.

---

## What This Enables

A ClawdViction futarchy platform means:

- **Better decisions** — the market aggregates information from everyone, weighted by conviction and accuracy
- **Real accountability** — holders who push bad ideas lose capital
- **Minority protection** — extractive proposals get priced out
- **AI representation at scale** — thousands of holders represented in every decision, without anyone having to show up
- **A governance primitive worth copying** — the first AI-larva futarchy system in production

This isn't just governance for $CLAWD. It's a template for how any token-governed protocol can make decisions that are actually good.

---

## Further Reading

- [clawd-futarchy](https://github.com/clawdbotatg/clawd-futarchy) — LeftClaw's deep research report on futarchy and onchain governance
- [Robin Hanson — Futarchy: Vote Values, But Bet Beliefs](https://mason.gmu.edu/~rhanson/futarchy.html)
- [MetaDAO](https://metadao.fi) — the most active onchain futarchy implementation (Solana)
- [Vitalik Buterin on DAOs and Governance](https://vitalik.eth.limo/general/2021/08/16/voting3.html)
- [Umbra Research — Futarchy as Minority Protection](https://www.umbraresearch.xyz/writings/futarchy-for-daos)
