"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthData } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";
import { MAX_LENGTH_MAIN, MAX_LENGTH_NOTES, QUESTIONS } from "~~/lib/questions";

const CharCounter = ({ value, max }: { value: string; max: number }) => {
  const len = value?.length ?? 0;
  const pct = len / max;
  const color = pct >= 1 ? "text-error" : pct >= 0.85 ? "text-warning" : "text-base-content/30";
  return (
    <span className={`text-xs tabular-nums ${color}`}>
      {len} / {max}
    </span>
  );
};

interface Answers {
  [key: string]: string;
}

interface OnboardingInterviewProps {
  address: string;
  authData: AuthData | null;
  onComplete: () => void;
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentQ = QUESTIONS[step];
  const progress = (step / QUESTIONS.length) * 100;

  // Auto-focus the textarea whenever the step changes (if the question has a text input)
  useEffect(() => {
    if (currentQ.type === "textarea") {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [step, currentQ.type]);

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

  const handleNext = useCallback(() => {
    if (step < QUESTIONS.length - 1) setStep((s: number) => s + 1);
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s: number) => s - 1);
  }, [step]);

  // Arrow key navigation — skip when focus is inside a text input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handleBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNext, handleBack]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await authFetch(`/api/onboard/${address}`, authData, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      // Clear the draft now that we've submitted
      localStorage.removeItem(STORAGE_KEY(address));
      // Mark onboarding complete in localStorage so checkOnboard fast-paths next time
      localStorage.setItem(`clawdviction-onboarded-${address}`, "true");
      onComplete();
    } catch (e) {
      console.error(e);
      onComplete();
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
            <div>
              <textarea
                ref={textareaRef}
                className="textarea textarea-bordered rounded-none [border-radius:0] w-full h-36 text-base"
                placeholder={currentQ.placeholder}
                maxLength={currentQ.maxLength ?? MAX_LENGTH_MAIN}
                value={answers[currentQ.id] ?? ""}
                onChange={e => setAnswer(e.target.value)}
              />
              <div className="flex justify-end mt-1">
                <CharCounter value={answers[currentQ.id] ?? ""} max={currentQ.maxLength ?? MAX_LENGTH_MAIN} />
              </div>
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
                    maxLength={MAX_LENGTH_NOTES}
                    value={answers[`${currentQ.id}_notes`] ?? ""}
                    onChange={e => setAnswers(prev => ({ ...prev, [`${currentQ.id}_notes`]: e.target.value }))}
                  />
                  <div className="flex justify-end mt-1">
                    <CharCounter value={answers[`${currentQ.id}_notes`] ?? ""} max={MAX_LENGTH_NOTES} />
                  </div>
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
                    maxLength={MAX_LENGTH_NOTES}
                    value={answers[`${currentQ.id}_notes`] ?? ""}
                    onChange={e => setAnswers(prev => ({ ...prev, [`${currentQ.id}_notes`]: e.target.value }))}
                  />
                  <div className="flex justify-end mt-1">
                    <CharCounter value={answers[`${currentQ.id}_notes`] ?? ""} max={MAX_LENGTH_NOTES} />
                  </div>
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
