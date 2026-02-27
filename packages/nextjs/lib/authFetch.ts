import type { AuthData } from "~~/hooks/useAuth";

export async function authFetch(url: string, authData: AuthData | null, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers ?? {}) as Record<string, string>),
  };

  if (authData) {
    headers["x-auth-signature"] = authData.signature;
    headers["x-auth-message"] = btoa(authData.message); // base64 to avoid \n in header
    headers["x-auth-address"] = authData.address;
  }

  return fetch(url, { ...options, headers });
}
