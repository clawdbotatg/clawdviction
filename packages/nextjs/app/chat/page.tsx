"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const CLAWDVICTION_THRESHOLD = 1_000_000n * 10n ** 18n; // 1M in wei-seconds

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatPage: NextPage = () => {
  const { address } = useAccount();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clawdviction, setClawdviction] = useState("0");
  const [larvaRunning, setLarvaRunning] = useState(false);
  const [launchingLarva, setLaunchingLarva] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from backend on mount
  const loadHistory = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/history/${address}`);
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages(data.messages as Message[]);
      }
    } catch {
      // Backend not running — start with empty history
    }
  }, [address]);

  // Poll clawdviction + larva status from backend
  const fetchStatus = useCallback(async () => {
    if (!address) return;
    try {
      const [cvRes, larvaRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/clawdviction/${address}`),
        fetch(`${BACKEND_URL}/api/larva/${address}/status`),
      ]);
      const cvData = await cvRes.json();
      const larvaData = await larvaRes.json();
      setClawdviction(cvData.clawdviction || "0");
      setLarvaRunning(larvaData.running || false);
    } catch {
      // Backend not running — try Next.js API fallback
    }
  }, [address]);

  useEffect(() => {
    loadHistory();
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [loadHistory, fetchStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasEnoughClawdviction = BigInt(clawdviction) >= CLAWDVICTION_THRESHOLD;

  const launchLarva = async () => {
    if (!address) return;
    setLaunchingLarva(true);
    try {
      await fetch(`${BACKEND_URL}/api/larva/${address}/launch`, { method: "POST" });
      await new Promise(r => setTimeout(r, 2000));
      await fetchStatus();
    } finally {
      setLaunchingLarva(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    // Build updated message list (including new user message)
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      let data;
      try {
        // Backend: handles its own history via SQLite — just send wallet + message
        const res = await fetch(`${BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, message: userMessage }),
        });
        data = await res.json();
      } catch {
        // Next.js fallback: send full message history for session continuity
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, message: userMessage, messages: updatedMessages }),
        });
        data = await res.json();
      }
      if (data.message) {
        setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again? 🦀" }]);
    } finally {
      setLoading(false);
    }
  };

  // Not connected
  if (!address) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <p className="text-base-content/60 mb-6">Connect your wallet to meet your larva.</p>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  // Not enough clawdviction
  if (!hasEnoughClawdviction) {
    const progress = Math.min(100, (Number(clawdviction) / Number(CLAWDVICTION_THRESHOLD)) * 100);
    return (
      <div className="flex items-center flex-col flex-grow pt-20 px-5">
        <div className="text-6xl mb-4">🦞</div>
        <h2 className="text-2xl font-bold mb-2">Earn More ClawdViction</h2>
        <p className="text-base-content/60 mb-6 text-center max-w-md">
          You need 1M clawdviction to unlock your personal larva. Stake $CLAWD and let it grow over time.
        </p>
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

  return (
    <div className="flex flex-col flex-grow pt-6 px-5 max-w-3xl mx-auto w-full">
      {!larvaRunning ? (
        <div className="text-center py-20">
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
      ) : (
        <>
          <div className="alert alert-info mb-4">
            <span>🦀 Your larva is alive! Teach it your values — it&apos;ll represent you in governance.</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-[50vh]">
            {messages.length === 0 && (
              <div className="text-center text-base-content/40 mt-20">
                <div className="text-4xl mb-3">🦞</div>
                <p>Say hello to your baby lobster.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat ${msg.role === "user" ? "chat-end" : "chat-start"}`}>
                <div className="chat-header">{msg.role === "assistant" ? "🦀 Larva" : "You"}</div>
                <div className={`chat-bubble ${msg.role === "user" ? "chat-bubble-primary" : "chat-bubble-secondary"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-secondary">
                  <span className="loading loading-dots loading-sm"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="sticky bottom-0 bg-base-100 pt-4 pb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Talk to your larva..."
                className="input input-bordered flex-1"
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()} className="btn btn-primary">
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatPage;
