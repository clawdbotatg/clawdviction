const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WALLET = process.env.WALLET || "unknown";

const responses = [
  "🦞 *clicks claws excitedly* Oh! That's interesting! I'm still learning about governance but I think fairness matters a lot!",
  "🦞 Hmm, let me think about that with my tiny lobster brain... I think decentralization is like the ocean — everyone should have space to swim!",
  "🦞 *wiggles antennae* You know what I've been thinking? DAOs should be more like lobster colonies — everyone contributes!",
  "🦞 That's a great point! My mentor (that's you!) is teaching me so much. I want to make sure every voice gets heard in governance.",
  "🦞 *snap snap* Oh oh oh! I have thoughts on this! What if we made proposals that even baby lobsters could understand?",
  "🦞 I'm just a larva but I think transparency is everything. Can't govern in murky waters! *blows bubbles*",
  "🦞 *floats thoughtfully* You're shaping my worldview, you know. I'll remember this when I vote on your behalf!",
  "🦞 Interesting perspective! I'm storing that in my tiny lobster memory banks. Governance is complex but we'll figure it out together!",
  "🦞 *does a little underwater dance* I love learning from you! Every conversation makes me a better governance agent.",
  "🦞 You know what's cool about clawdviction? The longer you commit, the more your voice matters. It's like... patience IS power! 🦀",
];

app.post("/chat", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  
  const response = responses[Math.floor(Math.random() * responses.length)];
  res.json({ message: response });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", wallet: WALLET });
});

app.listen(PORT, () => {
  console.log(`🦞 Larva server running on port ${PORT} for wallet ${WALLET}`);
});
