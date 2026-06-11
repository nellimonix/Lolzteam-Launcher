import type { LoginStep } from '@adapter-contract';
import { create } from 'zustand';

export type LoginService = 'steam' | 'telegram' | 'browser' | 'discord';
export type LoginMethod = 'native' | 'web';

interface LoginSessionState {
  itemId: number | null;
  accountTitle: string;
  service: LoginService | null;
  method: LoginMethod;
  step: LoginStep | null;
  detail: string | undefined;
  error: string | null;
  isOpen: boolean;
  start: (itemId: number, title: string, service: LoginService, method?: LoginMethod) => void;
  setStep: (step: LoginStep, detail?: string) => void;
  fail: (error: string) => void;
  close: () => void;
}

export const useLoginSession = create<LoginSessionState>((set) => ({
  itemId: null,
  accountTitle: '',
  service: null,
  method: 'native',
  step: null,
  detail: undefined,
  error: null,
  isOpen: false,
  start: (itemId, title, service, method = 'native') =>
    set({
      itemId,
      accountTitle: title,
      service,
      method,
      step: 'fetching-credentials',
      detail: undefined,
      error: null,
      isOpen: true,
    }),
  setStep: (step, detail) => set({ step, detail }),
  fail: (error) => set({ error }),
  close: () =>
    set({
      itemId: null,
      accountTitle: '',
      service: null,
      method: 'native',
      step: null,
      detail: undefined,
      error: null,
      isOpen: false,
    }),
}));
