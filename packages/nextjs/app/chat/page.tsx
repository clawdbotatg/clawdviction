"use client";

import { useState, useRef, useEffect } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ChatPage: NextPage = () => {
  const { address } = useAccount();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: totalStaked } = useScaffoldReadContract({
    contractName: "ClawdVictionStaking",
    functionName: "totalStaked",
    args: [address],
    watch: true,
  });

  const hasStake = totalStaked && totalStaked > 0n;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!address) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦀</div>
        <h2 className="text-2xl font-bold">Connect Your Wallet</h2>
        <p className="text-base-content/60 mt-2">Your larva is waiting to meet you.</p>
      </div>
    );
  }

  if (!hasStake) {
    return (
      <div className="flex items-center flex-col flex-grow pt-20">
        <div className="text-6xl mb-4">🦞</div>
        <h2 className="text-2xl font-bold">Stake First</h2>
        <p className="text-base-content/60 mt-2">
          You need to stake $CLAWD before you can train your larva.
        </p>
        <a href="/stake" className="btn btn-primary mt-4">
          Go Stake 🦀
        </a>
      </div>
    );
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, message: userMessage }),
      });

      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again? 🦀" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-grow pt-6 px-5 max-w-3xl mx-auto w-full">
      <div className="alert alert-info mb-4">
        <span>🦀 Your larva is ready. Teach it your values — it&apos;ll represent you in governance.</span>
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
            <div className="chat-header">
              {msg.role === "assistant" ? "🦀 Larva" : "You"}
            </div>
            <div
              className={`chat-bubble ${
                msg.role === "user" ? "chat-bubble-primary" : "chat-bubble-secondary"
              }`}
            >
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Talk to your larva..."
            className="input input-bordered flex-1"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="btn btn-primary"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
