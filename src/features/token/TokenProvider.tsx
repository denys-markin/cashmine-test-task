import { createContext, use, useMemo, useState, type ReactNode } from "react";

import { createApi, type Api } from "@/api/client";
import { readItem, removeByPrefix, writeItem } from "@/lib/storage";

import { TokenScreen } from "./TokenScreen";

const TOKEN_KEY = "cashmine.token";

/** Everything persisted on behalf of a token lives under this prefix and is wiped when the token changes. */
export const SCOPED_PREFIX = "cashmine.scoped.";

/** Short, non-secret fingerprint (FNV-1a) used to namespace per-token data. */
export function tokenScope(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

type Session = {
  api: Api;
  /** Prefix for storage keys that belong to the current token. */
  storagePrefix: string;
  changeToken: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <TokenProvider>");
  return session;
}

/**
 * Shows the token screen until there is a token, and again when the user wants to change it
 * or the API rejects it (401). The app below unmounts meanwhile, so in-memory data
 * (balances, forms) never survives a token change.
 */
export function TokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => readItem(TOKEN_KEY));
  const [prompt, setPrompt] = useState<null | "change" | "rejected">(null);

  const api = useMemo(
    () => (token ? createApi({ token, onUnauthorized: () => setPrompt("rejected") }) : null),
    [token],
  );

  function save(next: string) {
    if (next !== token) removeByPrefix(SCOPED_PREFIX);
    writeItem(TOKEN_KEY, next);
    setToken(next);
    setPrompt(null);
  }

  if (!token || !api || prompt) {
    return (
      <TokenScreen
        message={prompt === "rejected" ? "Your token was rejected (invalid or expired). Enter a new one." : null}
        onSave={save}
        onCancel={token && prompt === "change" ? () => setPrompt(null) : undefined}
      />
    );
  }

  return (
    <SessionContext
      value={{
        api,
        storagePrefix: `${SCOPED_PREFIX}${tokenScope(token)}.`,
        changeToken: () => setPrompt("change"),
      }}
    >
      {children}
    </SessionContext>
  );
}
