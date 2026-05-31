import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { AccountSummary, ServiceId } from '@shared-types';
import { useAccountsLoading } from './accountsLoading';

export const STREAM_SERVICES = ['steam', 'telegram', 'tiktok'] as const satisfies readonly ServiceId[];
export type StreamService = (typeof STREAM_SERVICES)[number];

export const isStreamService = (id: ServiceId | null): id is StreamService =>
  id !== null && (STREAM_SERVICES as readonly string[]).includes(id);

interface AccountsStreamState {
  streaming: boolean;
  loaded: ReadonlySet<StreamService>;
  streamed: Map<StreamService, AccountSummary[]>;
  setStreaming: (streaming: boolean) => void;
  setLoaded: (updater: (prev: ReadonlySet<StreamService>) => ReadonlySet<StreamService>) => void;
  resetAccumulator: () => void;
}

export const useAccountsStream = create<AccountsStreamState>((set) => ({
  streaming: false,
  loaded: new Set(),
  streamed: new Map(),
  setStreaming: (streaming) => set({ streaming }),
  setLoaded: (updater) => set((s) => ({ loaded: updater(s.loaded) })),
  resetAccumulator: () => set({ streamed: new Map() }),
}));

export const mergeWithStream = (base: AccountSummary[]): AccountSummary[] => {
  const touched = useAccountsStream.getState().streamed;
  const kept = base.filter(
    (it) => !(isStreamService(it.category) && touched.has(it.category)),
  );
  return [...kept, ...[...touched.values()].flat()];
};

export const startAccountsStream = () => {
  const st = useAccountsStream.getState();
  if (st.streaming) return;
  st.setStreaming(true);
  st.setLoaded(() => new Set());
  st.resetAccumulator();
  void window.launcher.accounts.listStream().catch(() => st.setStreaming(false));
};

export const useAccountsStreamController = () => {
  const qc = useQueryClient();

  useEffect(() => {
    const rebuild = () =>
      qc.setQueryData<AccountSummary[]>(['accounts'], (prev) =>
        mergeWithStream(prev ?? []),
      );

    const off = window.launcher.accounts.onCategory(
      ({ serviceId, items, categoryDone, done }) => {
        const st = useAccountsStream.getState();
        if (isStreamService(serviceId) && items.length > 0) {
          const acc = st.streamed.get(serviceId) ?? [];
          acc.push(...items);
          st.streamed.set(serviceId, acc);
          rebuild();
        }
        if (categoryDone && isStreamService(serviceId)) {
          if (!st.streamed.has(serviceId)) {
            st.streamed.set(serviceId, []);
            rebuild();
          }
          st.setLoaded((prev) => new Set(prev).add(serviceId));
        }
        if (done) st.setStreaming(false);
      },
    );

    let cancelled = false;
    void window.launcher.accounts.list().then((cached) => {
      if (cancelled) return;
      if (cached.length > 0) {
        useAccountsStream.getState().setLoaded(() => new Set(STREAM_SERVICES));
      } else {
        startAccountsStream();
      }
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [qc]);

  const streaming = useAccountsStream((st) => st.streaming);
  useEffect(() => {
    useAccountsLoading.getState().setLoading(streaming);
    return () => useAccountsLoading.getState().setLoading(false);
  }, [streaming]);
};
