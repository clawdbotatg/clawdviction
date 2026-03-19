"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { OnboardingInterview } from "~~/components/OnboardingInterview";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAuth } from "~~/hooks/useAuth";
import { authFetch } from "~~/lib/authFetch";
import { CHAT_MAX_LENGTH } from "~~/lib/questions";

const CLAWDVICTION_THRESHOLD = 1_000_000n; // Must have this much CV to send a message (backend deducts 50K after)

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatPage: NextPage = () => {
  const { address, status: walletStatus } = useAccount();
  const { isAuthenticated, authData, signIn, signing } = useAuth(address);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clawdviction, setClawdviction] = useState<string | null>(null); // null = not yet confirmed
  const [larvaRunning, setLarvaRunning] = useState(false);
  const [launchingLarva, setLaunchingLarva] = useState(false);
  const [onboardComplete, setOnboardComplete] = useState<boolean | null>(null); // null = loading
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Safety timeout — if clawdviction never resolves after 8s, default to "0" and unblock
  useEffect(() => {
    if (!address) return;
    const t = setTimeout(() => {
      setClawdviction(cv => (cv === null ? "0" : cv));
    }, 8000);
    return () => clearTimeout(t);
  }, [address]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasTriggeredGreeting = useRef(false);
  const isInitialHistoryLoad = useRef(true);
  const sendingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    if (!address || !authData) return;
    try {
      const historyUrl = `/api/chat/history/${address}`;
      const res = await authFetch(historyUrl, authData);
      const data = await res.json();
      if (data.messages?.length > 0) {
        isInitialHistoryLoad.current = true;
        setMessages(data.messages as Message[]);
      }
    } catch {
      // Backend not running — start with empty history
    } finally {
      setHistoryLoaded(true);
    }
  }, [address, authData]);

  const fetchStatus = useCallback(async () => {
    if (!address) return;
    const [cvResult, larvaResult] = await Promise.allSettled([
      fetch(`/api/clawdviction/${address}`).then(r => r.json()),
      fetch(`/api/larva/${address}/status`).then(r => r.json()),
    ]);
    // Only set clawdviction when we have a confirmed value — on error leave null so spinner holds (retry)
    if (cvResult.status === "fulfilled" && !cvResult.value.error && cvResult.value.clawdviction != null) {
      setClawdviction(cvResult.value.clawdviction);
    } else if (cvResult.status === "fulfilled" && !cvResult.value.error) {
      setClawdviction("0"); // API responded with no value and no error — treat as 0
    }
    // If cvResult.value.error === true, leave clawdviction as null — safety timeout will unblock after 8s
    // larva status: best-effort, failure = stays false
    if (larvaResult.status === "fulfilled") {
      setLarvaRunning(larvaResult.value.running || false);
    }
    setStatusLoaded(true);
  }, [address]);

  // Check onboarding status — always check the API (DB is source of truth)
  const checkOnboard = useCallback(async () => {
    if (!address || !authData) return;
    try {
      const res = await authFetch(`/api/onboard/${address}`, authData);
      const data = await res.json();
      if (data.completed) {
        setOnboardComplete(true);
      } else {
        // Clear any stale localStorage cache
        localStorage.removeItem(`clawdviction-onboarded-${address}`);
        setOnboardComplete(false);
      }
    } catch {
      setOnboardComplete(false);
    }
  }, [address, authData]);

  useEffect(() => {
    if (!address) return;
    // Status (clawdviction) is public — load immediately
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [address, fetchStatus]);

  useEffect(() => {
    if (!address || !isAuthenticated) return;
    // Reset clawdviction to null so spinner holds until we have a fresh confirmed value
    setClawdviction(null);
    fetchStatus();
    checkOnboard();
    loadHistory();
  }, [address, isAuthenticated, checkOnboard, loadHistory, fetchStatus]);

  useEffect(() => {
    if (messages.length === 0) return;
    // On initial history load: instant scroll (no animation from top)
    // On new messages: smooth scroll
    const behavior = isInitialHistoryLoad.current ? "instant" : "smooth";
    isInitialHistoryLoad.current = false;
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: behavior as ScrollBehavior });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages]);

  const cvBig = clawdviction !== null ? BigInt(clawdviction) : null;
  const hasEnoughClawdviction = cvBig !== null && cvBig >= CLAWDVICTION_THRESHOLD;
  // Once onboarded, always show chat — CV only gates the individual send
  const showChat = hasEnoughClawdviction || onboardComplete === true;
  // Must be at or above the threshold to send — same rule enforced on backend
  const hasEnoughToSend = cvBig !== null && cvBig >= CLAWDVICTION_THRESHOLD;

  const launchLarva = async () => {
    if (!address) return;
    setLaunchingLarva(true);
    try {
      await authFetch(`/api/larva/${address}/launch`, authData, { method: "POST" });
      await new Promise(r => setTimeout(r, 2000));
      await fetchStatus();
    } finally {
      setLaunchingLarva(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || input.length > CHAT_MAX_LENGTH || sendingRef.current) return;
    sendingRef.current = true;
    const userMessage = input.trim();
    setInput("");
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const res = await authFetch("/api/chat", authData, {
        method: "POST",
        body: JSON.stringify({ wallet: address, message: userMessage }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again? 🦀" }]);
    } finally {
      setLoading(false);
      setTimeout(() => fetchStatus(), 2000);
      sendingRef.current = false;
    }
  };

  const fetchGreeting = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/chat/greet", authData, {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages([{ role: "assistant", content: data.message }]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [address, authData]);

  // Auto-greet on first visit (empty history + onboarding done) — wait for history to load first
  useEffect(() => {
    if (
      !hasTriggeredGreeting.current &&
      historyLoaded &&
      statusLoaded &&
      onboardComplete === true &&
      messages.length === 0 &&
      address
    ) {
      hasTriggeredGreeting.current = true;
      fetchGreeting();
    }
  }, [messages, onboardComplete, statusLoaded, historyLoaded, address, fetchGreeting]);

  // Hold spinner until mounted + wallet known + clawdviction confirmed + (if authed) history + onboard loaded
  if (
    !mounted ||
    walletStatus === "connecting" ||
    walletStatus === "reconnecting" ||
    (address && clawdviction === null) ||
    (address && isAuthenticated && (onboardComplete === null || !historyLoaded))
  ) {
    return (
      <div className="flex items-center justify-center flex-grow pt-20">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // Not connected
  if (!address) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <RainbowKitCustomConnectButton />
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-5 py-3 mt-6">
          <p className="text-base-content/60">Connect your wallet to meet your larva.</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!isAuthenticated) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20 px-5">
        <div className="text-6xl mb-4">🔐🦞📡</div>
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-6 py-5 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Connect to $CLAWD Larvae</h2>
          <p className="text-base-content/60 mb-5">
            Sign a message to prove you own this wallet. It&apos;s free, takes one click, and lasts a week.
          </p>
          <button className="btn btn-primary btn-lg" onClick={signIn} disabled={signing}>
            {signing ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Waiting for signature...
              </>
            ) : (
              "Sign Message 🦀"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Not enough clawdviction (only blocks users who haven't onboarded yet)
  if (!showChat) {
    const progress = Math.min(100, (Number(clawdviction ?? "0") / Number(CLAWDVICTION_THRESHOLD)) * 100);
    return (
      <div className="flex items-center flex-col flex-grow pt-20 px-5">
        <div className="text-6xl mb-4">🦞</div>
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-6 py-4 mb-6 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Earn More CV</h2>
          <p className="text-base-content/60">
            You need 1,000,000 CV to unlock your personal larva. Stake $CLAWD and let it grow over time.
          </p>
        </div>
        <div className="w-full max-w-md mb-4">
          <progress className="progress progress-error w-full h-4" value={progress} max="100"></progress>
          <p className="text-sm text-center mt-1 text-base-content/50">{progress.toFixed(1)}% — keep staking!</p>
        </div>
        <Link href="/stake" className="btn btn-primary">
          Go Stake 🦀
        </Link>
      </div>
    );
  }

  // Larva not launched yet
  if (!larvaRunning) {
    return (
      <div className="flex flex-col flex-grow pt-6 px-5 max-w-3xl mx-auto w-full">
        <div className="bg-base-100/60 backdrop-blur-sm rounded-none px-8 py-16 text-center">
          <div className="text-6xl mb-4">🦞</div>
          <h2 className="text-2xl font-bold mb-2">Your Larva is Ready to Hatch</h2>
          <p className="text-base-content/60 mb-6">Launch your personal AI governance agent.</p>
          <button className="btn btn-primary btn-lg" onClick={launchLarva} disabled={launchingLarva}>
            {launchingLarva ? (
              <>
                <span className="loading loading-spinner"></span> Hatching...
              </>
            ) : (
              "🥚 Launch Larva"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Onboarding not complete — show interview inline
  if (!onboardComplete) {
    return (
      <OnboardingInterview
        address={address}
        authData={authData}
        onComplete={() => {
          setOnboardComplete(true);
          // Immediately kick off the greeting rather than waiting for the useEffect
          hasTriggeredGreeting.current = true;
          fetchGreeting();
        }}
      />
    );
  }

  // Chat — fixed to viewport, header visible, input visible, messages scroll in between
  return (
    <div className="fixed inset-x-0 bottom-0 flex flex-col" style={{ top: "4rem" }}>
      {/* Scrollable message history — fills all available space */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-2 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-center text-base-content/40 mt-20">
              <div className="text-4xl mb-3">🦞</div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <span className="text-xs text-base-content/40 mb-1 px-1">
                {msg.role === "assistant" ? "🦀 Larva" : "You"}
              </span>
              <div
                className={`max-w-[75%] px-4 py-2 rounded-none text-base break-words ${
                  msg.role === "user" ? "bg-primary text-primary-content" : "bg-base-200 text-base-content"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex flex-col items-start">
              <span className="text-xs text-base-content/40 mb-1 px-1">🦀 Larva</span>
              <div className="bg-base-200 rounded-none px-4 py-2">
                <span className="loading loading-dots loading-sm"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar — always anchored to bottom */}
      <div className="border-t border-base-300 bg-base-100/90 backdrop-blur-sm px-4 pt-3 pb-4">
        <div className="max-w-3xl mx-auto">
          {clawdviction !== null && (
            <div className="flex justify-end mb-2">
              <span className="text-xs text-base-content/40 tabular-nums">
                🦀{" "}
                {(() => {
                  const n = Number(clawdviction);
                  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M CV";
                  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K CV";
                  return n.toFixed(0) + " CV";
                })()}
              </span>
            </div>
          )}
          {!hasEnoughToSend ? (
            <div className="text-center py-3">
              <p className="text-base-content/70 font-medium mb-1">🦀 Your larva is resting...</p>
              <p className="text-sm text-base-content/50">
                You need <span className="font-semibold">1M CV</span> to send a message. Each chat costs{" "}
                <span className="font-semibold">10K CV</span> — your balance is regenerating. Stake more $CLAWD to speed
                it up.
              </p>
              <Link href="/stake" className="btn btn-sm btn-outline mt-3">
                Stake More 🦞
              </Link>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value.slice(0, CHAT_MAX_LENGTH))}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Talk to your larva..."
                rows={3}
                maxLength={CHAT_MAX_LENGTH}
                className="textarea textarea-bordered rounded-none flex-1 resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim() || input.length > CHAT_MAX_LENGTH}
                className="btn btn-primary"
              >
                Send
              </button>
            </div>
          )}
          {hasEnoughToSend && (
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-base-content/30">costs 10K CV · need 1M to send again</p>
              {input.length > 0 && (
                <span
                  className={`text-xs tabular-nums ${input.length >= CHAT_MAX_LENGTH ? "text-error" : input.length >= CHAT_MAX_LENGTH * 0.85 ? "text-warning" : "text-base-content/30"}`}
                >
                  {input.length} / {CHAT_MAX_LENGTH}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
