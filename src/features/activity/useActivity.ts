import { useCallback, useEffect, useRef, useState } from "react";

import type { ActivityItem } from "@/api/types";
import { useSession } from "@/features/token/TokenProvider";

const PAGE_SIZE = 20;

type State = { items: ActivityItem[]; done: boolean; loading: boolean; error: unknown };

/** Cursor-paginated history, newest first. */
export function useActivity() {
  const { api } = useSession();
  const [state, setState] = useState<State>({ items: [], done: false, loading: true, error: null });
  const cursor = useRef<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  const load = useCallback(
    async (reset: boolean) => {
      if (busy.current && !reset) return;
      busy.current = true;
      const gen = reset ? ++generation.current : generation.current;
      if (reset) cursor.current = null;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const page = await api.getActivity(cursor.current, PAGE_SIZE);
        if (gen !== generation.current) return;
        cursor.current = page.nextCursor;
        setState((s) => {
          const base = reset ? [] : s.items;
          // The cursor is offset-based, so items that arrive between pages can repeat: dedupe by id.
          const seen = new Set(base.map((i) => i.id));
          return {
            items: [...base, ...page.items.filter((i) => !seen.has(i.id))],
            done: page.nextCursor === null,
            loading: false,
            error: null,
          };
        });
      } catch (error) {
        if (gen === generation.current) setState((s) => ({ ...s, loading: false, error }));
      } finally {
        if (gen === generation.current) busy.current = false;
      }
    },
    [api],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  return { ...state, refresh: () => load(true), loadMore: () => load(false) };
}
