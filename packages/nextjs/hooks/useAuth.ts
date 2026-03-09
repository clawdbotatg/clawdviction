"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignMessage } from "wagmi";

export interface AuthData {
  signature: string;
  message: string;
  address: string;
  expiresAt: number;
}

const AUTH_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

const storageKey = (addr: string) => `clawdviction-auth-${addr.toLowerCase()}`;

export function useAuth(address: string | undefined) {
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [signing, setSigning] = useState(false);
  const { signMessageAsync } = useSignMessage();

  // Load from localStorage on address change
  useEffect(() => {
    if (!address) {
      setAuthData(null);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(address));
      if (!raw) {
        setAuthData(null);
        return;
      }
      const data: AuthData = JSON.parse(raw);
      if (data.expiresAt > Date.now()) {
        setAuthData(data);
      } else {
        localStorage.removeItem(storageKey(address));
        setAuthData(null);
      }
    } catch {
      setAuthData(null);
    }
  }, [address]);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigning(true);
    try {
      const expiresAt = Date.now() + AUTH_DURATION_MS;
      const message = `Sign in to larv.ai\nWallet: ${address}\nExpires: ${new Date(expiresAt).toISOString()}`;
      const signature = await signMessageAsync({ message });
      const data: AuthData = { signature, message, address, expiresAt };
      localStorage.setItem(storageKey(address), JSON.stringify(data));
      setAuthData(data);
    } catch (e) {
      console.error("Sign in failed", e);
    } finally {
      setSigning(false);
    }
  }, [address, signMessageAsync]);

  const isAuthenticated = authData !== null && authData.expiresAt > Date.now();

  return { isAuthenticated, authData, signIn, signing };
}
