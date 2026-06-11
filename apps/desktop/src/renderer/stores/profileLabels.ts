import type { UserLabel } from '@shared-types';
import { create } from 'zustand';

interface ProfileLabelsState {
  labels: UserLabel[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useProfileLabels = create<ProfileLabelsState>((set, get) => ({
  labels: [],
  loading: false,
  loaded: false,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const labels = await window.launcher.profile.getLabels();
      set({ labels, loaded: true });
    } catch {
    } finally {
      set({ loading: false });
    }
  },
  refresh: async () => {
    set({ loading: true });
    try {
      const labels = await window.launcher.profile.refreshLabels();
      set({ labels, loaded: true });
    } catch {
    } finally {
      set({ loading: false });
    }
  },
}));
