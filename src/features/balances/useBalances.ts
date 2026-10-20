import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { useClaims } from "@/features/claim/ClaimsProvider";
import { applyClaims } from "@/features/claim/overlay";
import { useSession } from "@/features/token/TokenProvider";

import { toBalances, type Balances } from "./model";

type State = { data: Balances | null; error: unknown; loading: boolean };

/**
 * Loads balances when the screen gains focus; keeps the last good snapshot visible if a refresh fails.
 * Returned balances include the user's own recent claims until the snapshot catches up (see overlay.ts).
 */
export function useBalances() {
  const { api } = useSession();
  const { claims } = useClaims();
  const [state, setState] = useState<State>({ data: null, error: null, loading: true });
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = toBalances(await api.getBalances());
      if (id === latest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const data = state.data && { ...state.data, items: applyClaims(state.data.items, state.data.asOf, claims) };
  return { ...state, data, refresh };
}
