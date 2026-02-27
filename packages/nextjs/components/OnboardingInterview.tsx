"use client";

import { useEffect, useState } from "react";
import type { AuthData } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";

interface Answers {
  [key: string]: string;
}

export const QUESTIONS = [
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
    prompt: "What do you actually get for holding $CLAWD? And what do you wish you got?",
    type: "textarea",
    placeholder:
      "e.g. Right now mostly early access and vibes. What I wish I had: rev share, token-gated AI tools, something real...",
  },
  {
    id: "staking_mechanics",
    label: "Staking lockup & burn split",
    prompt:
      "If we stake $CLAWD, how long should it be locked up? What percent should you earn on it? And what percent should we burn?\n\n(Both the earned and burned amounts come straight out of the treasury in $CLAWD.)\n\nFor example: 3 month lockup, 1% earned, 2% burned.",
    type: "textarea",
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
    placeholder:
      "e.g. Any marketing/KOL spend. Treasury funds going to teams with no track record. Anything that concentrates power...",
  },
  {
    id: "magic_wand",
    label: "Magic wand",
    prompt:
      "If you could wave a magic wand and have one thing happen for $CLAWD — anything at all, no constraints, no 'is it realistic' — what would it be?",
    type: "textarea",
    placeholder:
      "e.g. Every AI agent in the ecosystem runs on CLAWD. Or: $CLAWD becomes the default fuel for onchain apps...",
  },
  {
    id: "vision_concern",
    label: "Vision & honest concern",
    prompt:
      "What do you actually want $CLAWD to become in 1 year? Not what you think it will — what do you want? And what's your biggest concern about whether it gets there?",
    type: "textarea",
    placeholder:
      "e.g. I want it to be the go-to token for AI compute on Base. My concern is that the AI narrative fades before the apps generate real revenue...",
  },
];

interface OnboardingInterviewProps {
  address: string;
  authData: AuthData | null;
  onComplete: (brief: string) => void;
}

const STORAGE_KEY = (addr: string) => `clawdviction-onboard-draft-${addr}`;

export const OnboardingInterview = ({ address, authData, onComplete }: OnboardingInterviewProps) => {
  const [step, setStep] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(address));
      return saved ? (JSON.parse(saved).step ?? 0) : 0;
    } catch {
      return 0;
    }
  });
  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(address));
      return saved ? (JSON.parse(saved).answers ?? {}) : {};
    } catch {
      return {};
    }
  });
  const [checklistState, setChecklistState] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(address));
      return saved ? (JSON.parse(saved).checklistState ?? {}) : {};
    } catch {
      return {};
    }
  });
  const [scaleValues, setScaleValues] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(address));
      return saved ? (JSON.parse(saved).scaleValues ?? {}) : {};
    } catch {
      return {};
    }
  });
  const [submitting, setSubmitting] = useState(false);

  // Persist draft to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY(address), JSON.stringify({ step, answers, checklistState, scaleValues }));
    } catch {}
  }, [step, answers, checklistState, scaleValues, address]);

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
      setAnswers(a => ({ ...a, [qid]: updated.join(", ") }));
      return { ...prev, [qid]: updated };
    });
  };

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) setStep((s: number) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s: number) => s - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/onboard/${address}`, authData, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      const brief = data.identity_brief || "";
      if (brief && address) {
        localStorage.setItem(`clawdviction-brief-${address}`, brief);
      }
      // Clear the draft now that we've submitted
      localStorage.removeItem(STORAGE_KEY(address));
      onComplete(brief);
    } catch (e) {
      console.error(e);
      onComplete("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col pt-6 px-5 max-w-2xl mx-auto w-full my-4 gap-4">
      {/* Intro box */}
      <div className="bg-base-100/60 backdrop-blur-sm rounded-2xl px-6 py-5 flex gap-4 items-start">
        <div className="text-3xl">🦞</div>
        <div>
          <h2 className="font-bold text-lg mb-1">Before we start chatting...</h2>
          <p className="text-base-content/60 text-sm leading-relaxed">
            Your larva needs to know who you are. These questions help train it on your values, preferences, and
            governance philosophy — so it can represent you accurately from day one. Takes about 3 minutes.
          </p>
        </div>
      </div>
      {/* Interview card */}
      <div className="bg-base-100/60 backdrop-blur-sm rounded-2xl">
        {/* Header */}
        <div className="px-5 pt-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-base-content/50">
              Question {step + 1} of {QUESTIONS.length}
            </span>
            <span className="text-sm text-base-content/50">{Math.round(progress)}% complete</span>
          </div>
          <progress className="progress progress-primary rounded-none w-full h-2" value={progress} max="100" />
        </div>

        {/* Question */}
        <div className="px-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-base-content/40">
            {currentQ.label}
          </div>
          <p className="text-lg font-medium mb-5 leading-relaxed whitespace-pre-line">{currentQ.prompt}</p>

          {/* Textarea */}
          {currentQ.type === "textarea" && (
            <textarea
              className="textarea textarea-bordered rounded-none [border-radius:0] w-full h-36 text-base"
              placeholder={currentQ.placeholder}
              value={answers[currentQ.id] ?? ""}
              onChange={e => setAnswer(e.target.value)}
            />
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
        <div className="mt-4 pt-3 pb-4 px-5 border-t border-base-300 flex items-center justify-between gap-3">
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
      </div>{" "}
      {/* end interview card */}
    </div>
  );
};
