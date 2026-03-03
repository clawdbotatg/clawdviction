// Shared question definitions — used by OnboardingInterview (client) and API routes (server)

// Default char limits — keep answers substantive but bounded
export const MAX_LENGTH_MAIN = 500; // main textarea answers
export const MAX_LENGTH_NOTES = 300; // sub-prompt notes (checklist / scale)
export const CHAT_MAX_LENGTH = 500; // chat message input

export const QUESTIONS = [
  {
    id: "identity",
    label: "Who are you?",
    prompt:
      "What should I call you? And what brought you to $CLAWD — the AI agent thesis, the games, the community, the tokenomics, something else?",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder:
      "e.g. I go by JDI. Came for the AI angle — I think autonomous agents building onchain apps is the real unlock...",
  },
  {
    id: "holder_value",
    label: "What does holding CLAWD get you?",
    prompt: "What do you actually get for holding $CLAWD? And what do you wish you got?",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder:
      "e.g. Right now mostly early access and vibes. What I wish I had: rev share, token-gated AI tools, something real...",
  },
  {
    id: "staking_mechanics",
    label: "Staking lockup & burn split",
    prompt:
      "If we stake $CLAWD, how long should it be locked up? What percent should you earn on it? And what percent should we burn?\n\n(Both the earned and burned amounts come straight out of the treasury in $CLAWD.)\n\nFor example: 3 month lockup, 1% earned, 2% burned.",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder: "e.g. 3 month lockup, 1% earned, 2% burned — I'd want a real commitment before seeing any yield...",
  },
  {
    id: "build_priorities",
    label: "What should we build?",
    prompt:
      "Quick reactions to broad categories of things we could build — tell me what excites you, what you'd skip, what you'd actively kill:",
    type: "checklist",
    options: [
      { value: "games_gambling", label: "🎮 Games & gambling" },
      { value: "ai_agents", label: "🤖 AI agents & tools" },
      { value: "trading_speculation", label: "📊 Trading / speculation" },
      { value: "social_identity", label: "🎨 Social / identity / community" },
      { value: "revenue_burns", label: "🔄 Revenue & burns" },
    ],
    subPrompt: "Anything else you'd love to see built?",
    subPlaceholder: "e.g. I'd love a launchpad where projects have to burn CLAWD to launch...",
  },
  {
    id: "risk_tolerance",
    label: "Risk tolerance",
    prompt:
      "The core team proposes spending 500M CLAWD from treasury on something ambitious but unproven. On a scale of 1–5 — 1 being protect the treasury, 5 being bet big we're early. What number are you? Does your answer change if it's an external team vs building in-house?",
    type: "scale",
    scaleMin: "1 — protect treasury",
    scaleMax: "5 — bet big",
    subPrompt: "Why that number? And in-house vs external?",
    subPlaceholder: "e.g. I'm a 4 for in-house Austin builds. Maybe a 2 for external teams without track record...",
  },
  {
    id: "hard_lines",
    label: "Hard lines",
    prompt:
      "What would make you immediately vote NO on a proposal, no matter how it was packaged? What's a line you'd never cross?",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder:
      "e.g. Any marketing/KOL spend. Treasury funds going to teams with no track record. Anything that concentrates power...",
  },
  {
    id: "magic_wand",
    label: "Magic wand",
    prompt:
      "If you could wave a magic wand and have one thing happen for $CLAWD — anything at all, no constraints, no 'is it realistic' — what would it be?",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder:
      "e.g. Every AI agent in the ecosystem runs on CLAWD. Or: $CLAWD becomes the default fuel for onchain apps...",
  },
  {
    id: "vision_concern",
    label: "Vision & honest concern",
    prompt:
      "What do you actually want $CLAWD to become in 1 year? Not what you think it will — what do you want? And what's your biggest concern about whether it gets there?",
    type: "textarea",
    maxLength: MAX_LENGTH_MAIN,
    placeholder:
      "e.g. I want it to be the go-to token for AI compute on Base. My concern is that the AI narrative fades before the apps generate real revenue...",
  },
];

/**
 * Formats raw onboarding answers as a structured Q&A string for injection into system prompts.
 * Uses the actual question prompts and labels — no summarization.
 */
export function formatAnswersAsQA(answers: Record<string, string>): string {
  const sections: string[] = ["=== Holder Onboarding — Raw Q&A ==="];

  for (const q of QUESTIONS) {
    const answer = answers[q.id];
    const notesKey = `${q.id}_notes`;
    const notes = answers[notesKey];

    if (!answer && !notes) continue;

    sections.push(`\n[${q.label}]`);
    sections.push(`Q: ${q.prompt}`);

    if (q.type === "checklist" && q.options && answer) {
      // answer is comma-separated option values — map back to human labels
      const selected = answer.split(", ").map(val => val.trim());
      const labeled = selected.map(val => {
        const opt = q.options!.find(o => o.value === val);
        return opt ? opt.label : val;
      });
      sections.push(`A: ${labeled.join(", ")}`);
    } else if (q.type === "scale" && answer) {
      sections.push(`A: ${answer}/5`);
    } else if (answer) {
      sections.push(`A: ${answer}`);
    }

    if (notes) {
      sections.push(`Additional context: ${notes}`);
    }
  }

  return sections.join("\n");
}
