"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";

interface Answers {
  [key: string]: string;
}

const QUESTIONS = [
  {
    id: "identity",
    label: "Who are you?",
    prompt:
      "What should I call you? And what brought you to $CLAWD — the AI agent thesis, the games, the community, the tokenomics, something else?",
    type: "textarea",
    placeholder:
      "e.g. I go by JDI. Came for the AI angle — I think autonomous agents building onchain apps is the real unlock...",
  },
  {
    id: "holder_value",
    label: "What does holding CLAWD get you?",
    prompt:
      "What's the actual structural upside for holding $CLAWD? Not price going up — but what does being a holder get you that non-holders don't? And does the current reality match what you'd want?",
    type: "textarea",
    placeholder:
      "e.g. Right now mostly early access and community. What I want is real rev share and token-gated AI compute...",
  },
  {
    id: "burn_return",
    label: "Burn vs return split",
    prompt:
      "Scenario: $CLAWD is staked and locked for 30 days. The protocol earns yield. For every 100 tokens of yield, what split feels right to you? And does your answer change if the lockup is 7 days instead of 30?",
    type: "textarea",
    placeholder:
      "e.g. 70 returned to stakers / 30 burned. For 7-day lockup I'd drop it to 20% burn — shorter risk, less burn justified...",
  },
  {
    id: "burn_philosophy",
    label: "How should burns work?",
    prompt:
      "Would you rather: (A) real-time burn tracking even if it's noisy, (B) milestone announcements only — every 10M burned, every 1% of supply, or (C) you don't care about notifications as long as burns are happening?",
    type: "radio",
    options: [
      { value: "A", label: "Real-time — I want to see every burn" },
      { value: "B", label: "Milestones only — less noise, more signal" },
      { value: "C", label: "Don't care — just make sure they happen" },
    ],
  },
  {
    id: "revenue_view",
    label: "Deflation vs utility",
    prompt:
      "Is CLAWD's value story about burning supply down over time — or does it need a visible revenue model beyond burns? Do you think burns ARE the revenue story, or is something missing?",
    type: "textarea",
    placeholder:
      "e.g. Burns are part of it but we need actual revenue people can point to. Like fees from apps flowing to holders...",
  },
  {
    id: "build_priorities",
    label: "What should we build?",
    prompt:
      "Quick reactions to real community proposals — tell me what excites you, what you'd skip, what you'd actively kill:",
    type: "checklist",
    options: [
      { value: "casino_games", label: "🎰 Casino/crash games — house rake burns CLAWD" },
      { value: "ai_agents", label: "🤖 Personal AI agents — hold CLAWD above threshold, get an agent" },
      { value: "fantasy_crypto", label: "📊 Fantasy crypto — bet CLAWD on which wallets perform best" },
      { value: "nft_characters", label: "🎮 NFT characters — earn XP from using CLAWD apps, level up" },
      { value: "auto_burn", label: "🔄 Games accepting ETH/USDC — auto-buy-and-burn CLAWD with proceeds" },
      { value: "insurance", label: "🛡️ Wallet insurance/recovery product" },
    ],
    subPrompt: "Anything else you'd love to see built?",
    subPlaceholder: "e.g. I'd love a launchpad where projects have to burn CLAWD to launch...",
  },
  {
    id: "ai_thesis",
    label: "The AI thesis",
    prompt:
      "Do you believe the core thesis — that CLAWD is the fuel for an ecosystem of AI agents building real onchain apps? Are you here because of it, despite it, or still deciding? What would make you more confident in the next 6 months?",
    type: "textarea",
    placeholder:
      "e.g. Fully believe it — every app shipped makes me more confident. What would confirm it: seeing the apps generate real revenue...",
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
    placeholder:
      "e.g. Any marketing/KOL spend. Treasury funds going to teams with no track record. Anything that concentrates power...",
  },
  {
    id: "magic_wand",
    label: "Magic wand",
    prompt:
      "If you could wave a magic wand and have one thing happen for $CLAWD — anything at all, no constraints, no 'is it realistic' — what would it be?",
    type: "textarea",
    placeholder: "e.g. Every AI agent in the ecosystem runs on CLAWD. Or: Austin gets on a podcast with Vitalik...",
  },
  {
    id: "vision_concern",
    label: "Vision & honest concern",
    prompt:
      "What do you actually want $CLAWD to become in 3 years? Not what you think it will — what do you want? And what's your biggest concern about whether it gets there?",
    type: "textarea",
    placeholder:
      "e.g. I want it to be the go-to token for AI compute on Base. My concern is that the AI narrative fades before the apps generate real revenue...",
  },
];

const OnboardPage: NextPage = () => {
  const { address } = useAccount();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [checklistState, setChecklistState] = useState<Record<string, string[]>>({});
  const [scaleValues, setScaleValues] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  // Check if already completed
  useEffect(() => {
    if (!address) return;
    fetch(`${BACKEND_URL}/api/onboard/${address}`)
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          setAlreadyCompleted(true);
          setBrief(data.identity_brief);
          // Pre-fill answers
          if (data.answers) setAnswers(data.answers);
        }
      })
      .catch(() => {});
  }, [address]);

  const currentQ = QUESTIONS[step];
  const progress = (step / QUESTIONS.length) * 100;

  const setAnswer = (val: string) => {
    if (currentQ.type === "scale") {
      setScaleValues(prev => ({ ...prev, [currentQ.id]: Number(val) }));
    }
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
  };

  const getChecklistAnswer = (qid: string) => checklistState[qid] ?? [];

  const toggleChecklist = (qid: string, val: string) => {
    setChecklistState(prev => {
      const current = prev[qid] ?? [];
      const updated = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      // Also update text answers with the list
      setAnswers(a => ({ ...a, [qid]: updated.join(", ") }));
      return { ...prev, [qid]: updated };
    });
  };

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    if (!address) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/onboard/${address}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      setBrief(data.identity_brief);
      setDone(true);
      if (data.identity_brief && address) {
        localStorage.setItem(`clawdviction-brief-${address}`, data.identity_brief);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  // Not connected
  if (!address) {
    return (
      <div className="flex flex-col items-center flex-grow pt-20 px-5">
        <div className="text-6xl mb-4">🦞</div>
        <RainbowKitCustomConnectButton />
        <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-6 py-4 mt-6 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Meet Your Larva</h2>
          <p className="text-base-content/60">
            Connect your wallet to start the onboarding interview. This helps your larva understand who you are before
            you ever say a word.
          </p>
        </div>
      </div>
    );
  }

  // Done state
  if (done || (alreadyCompleted && brief && step === 0)) {
    return (
      <div className="flex flex-col items-center flex-grow pt-10 px-5 max-w-2xl mx-auto w-full">
        <div className="text-6xl mb-4">🦀</div>
        <div className="bg-base-100/60 backdrop-blur-sm rounded-xl px-6 py-4 mb-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Your larva knows you now.</h2>
          <p className="text-base-content/60">
            This brief will be injected into every conversation — your larva starts knowing who you are before you say a
            word.
          </p>
        </div>

        {brief && (
          <div className="w-full bg-base-200 rounded-none p-5 mb-6 text-sm font-mono whitespace-pre-wrap text-base-content/80">
            {brief}
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/chat" className="btn btn-primary [border-radius:0]">
            Talk to Your Larva 🦞
          </Link>
          <button
            className="btn btn-outline btn-sm [border-radius:0]"
            onClick={() => {
              setDone(false);
              setAlreadyCompleted(false);
              setStep(0);
            }}
          >
            Redo Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow pt-6 px-5 max-w-2xl mx-auto w-full bg-base-100/60 backdrop-blur-sm rounded-2xl my-4 pb-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-base-content/50">
            Question {step + 1} of {QUESTIONS.length}
          </span>
          <span className="text-sm text-base-content/50">{Math.round(progress)}% complete</span>
        </div>
        <progress className="progress progress-primary rounded-none w-full h-2" value={progress} max="100" />
      </div>

      {/* Question */}
      <div className="flex-1">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-base-content/40">{currentQ.label}</div>
        <p className="text-lg font-medium mb-5 leading-relaxed">{currentQ.prompt}</p>

        {/* Text area */}
        {currentQ.type === "textarea" && (
          <textarea
            className="textarea textarea-bordered rounded-none [border-radius:0] w-full h-36 text-base"
            placeholder={currentQ.placeholder}
            value={answers[currentQ.id] ?? ""}
            onChange={e => setAnswer(e.target.value)}
          />
        )}

        {/* Radio */}
        {currentQ.type === "radio" && (
          <div className="flex flex-col gap-3">
            {currentQ.options?.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer p-3 rounded-none border border-base-300 hover:bg-base-200 transition-colors"
              >
                <input
                  type="radio"
                  className="radio radio-primary"
                  name={currentQ.id}
                  value={opt.value}
                  checked={answers[currentQ.id] === opt.value}
                  onChange={() => setAnswer(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Checklist */}
        {currentQ.type === "checklist" && (
          <div className="flex flex-col gap-2">
            {currentQ.options?.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer p-3 rounded-none border border-base-300 hover:bg-base-200 transition-colors"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={getChecklistAnswer(currentQ.id).includes(opt.value)}
                  onChange={() => toggleChecklist(currentQ.id, opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
            {currentQ.subPrompt && (
              <div className="mt-4">
                <p className="text-sm text-base-content/60 mb-2">{currentQ.subPrompt}</p>
                <textarea
                  className="textarea textarea-bordered rounded-none [border-radius:0] w-full h-24 text-base"
                  placeholder={currentQ.subPlaceholder}
                  value={answers[`${currentQ.id}_notes`] ?? ""}
                  onChange={e => setAnswers(prev => ({ ...prev, [`${currentQ.id}_notes`]: e.target.value }))}
                />
              </div>
            )}
          </div>
        )}

        {/* Scale */}
        {currentQ.type === "scale" && (
          <div>
            <div className="flex justify-between text-sm text-base-content/50 mb-2">
              <span>{currentQ.scaleMin}</span>
              <span>{currentQ.scaleMax}</span>
            </div>
            <div className="flex gap-2 justify-center mb-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setAnswer(String(n))}
                  className={`btn btn-lg [border-radius:0] text-xl font-bold ${
                    (scaleValues[currentQ.id] ?? 0) === n ? "btn-primary" : "btn-outline"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {currentQ.subPrompt && (
              <div className="mt-5">
                <p className="text-sm text-base-content/60 mb-2">{currentQ.subPrompt}</p>
                <textarea
                  className="textarea textarea-bordered rounded-none [border-radius:0] w-full h-28 text-base"
                  placeholder={currentQ.subPlaceholder}
                  value={answers[`${currentQ.id}_notes`] ?? ""}
                  onChange={e => setAnswers(prev => ({ ...prev, [`${currentQ.id}_notes`]: e.target.value }))}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="mt-8 pt-4 border-t border-base-300 flex items-center justify-between gap-3">
        <button className="btn btn-ghost [border-radius:0]" onClick={handleBack} disabled={step === 0}>
          ← Back
        </button>

        <button className="btn btn-ghost btn-sm [border-radius:0] text-base-content/40" onClick={handleNext}>
          Skip
        </button>

        {step < QUESTIONS.length - 1 ? (
          <button className="btn btn-primary [border-radius:0]" onClick={handleNext}>
            Next →
          </button>
        ) : (
          <button className="btn btn-primary btn-lg [border-radius:0]" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Training your larva...
              </>
            ) : (
              "Done — Meet My Larva 🦞"
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardPage;
