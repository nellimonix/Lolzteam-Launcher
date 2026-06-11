import { IPC_CHANNELS } from '@shared-ipc';
import { MARKET_CURRENCIES, type MarketCurrency } from '@shared-types';
import { ipcMain } from 'electron';
import { listUserLabels, setCurrency } from '../services/market';

const isCurrency = (v: unknown): v is MarketCurrency =>
  typeof v === 'string' && (MARKET_CURRENCIES as readonly string[]).includes(v);

export const registerProfileIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.PROFILE_LABELS_GET, () => listUserLabels());
  ipcMain.handle(IPC_CHANNELS.PROFILE_LABELS_REFRESH, () => listUserLabels({ refresh: true }));
  ipcMain.handle(IPC_CHANNELS.PROFILE_SET_CURRENCY, (_e, payload?: { currency: unknown }) => {
    if (!isCurrency(payload?.currency)) return { ok: false, message: 'invalid_currency' };
    return setCurrency(payload.currency);
  });
};
