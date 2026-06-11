import { IPC_CHANNELS } from '@shared-ipc';
import { DEFAULT_ACCOUNT_SOURCE, SERVICE_CATEGORY_ID } from '@shared-types';
import type { AccountSource, AccountSummary, ServiceId } from '@shared-types';
import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import { onTokenChange } from '../auth/token-store';
import {
  clearCachedAccounts,
  loadCachedAccounts,
  saveCachedAccounts,
} from '../services/accounts-cache-store';
import {
  addItemTag,
  checkAccountValidity,
  getAccountDetails,
  listAccountsByCategory,
  listAllAccounts,
  removeItemTag,
} from '../services/market';

const STREAM_ORDER: readonly ServiceId[] = [
  'steam',
  'telegram',
  'tiktok',
  'instagram',
  'discord',
] as const;

const inflight = new Map<AccountSource, Promise<AccountSummary[]>>();

const fetchAndCache = (source: AccountSource): Promise<AccountSummary[]> => {
  const existing = inflight.get(source);
  if (existing) return existing;
  const p = listAllAccounts(source)
    .then(async (items) => {
      if (items.length > 0) await saveCachedAccounts(source, items);
      return items;
    })
    .finally(() => {
      inflight.delete(source);
    });
  inflight.set(source, p);
  return p;
};

const loadCached = async (source: AccountSource): Promise<AccountSummary[]> => {
  const cached = await loadCachedAccounts(source);
  return cached?.items ?? [];
};

// Bumped on every new stream request. A running stream captures its generation
// and bails as soon as a newer one starts, so a source switch / refresh cancels
// the in-flight pagination instead of being silently dropped (which left the
// renderer stuck on "loading" forever and kept hitting the old endpoint).
let streamGeneration = 0;

const streamCategories = async (
  event: IpcMainInvokeEvent,
  source: AccountSource,
  only?: ServiceId,
): Promise<void> => {
  const generation = ++streamGeneration;
  const active = () => generation === streamGeneration && !event.sender.isDestroyed();
  const send = (payload: Parameters<typeof event.sender.send>[1]) => {
    if (active()) {
      event.sender.send(IPC_CHANNELS.ACCOUNTS_CATEGORY, payload);
    }
  };
  // When a single category is requested, stream only it and replace just its
  // slice of the cache. Otherwise stream the full fixed order and overwrite.
  const target = only !== undefined && STREAM_ORDER.includes(only) ? only : undefined;
  const order: readonly ServiceId[] = target ? [target] : STREAM_ORDER;
  const all: AccountSummary[] = [];
  let unfiltered: AccountSummary[] | null = null;
  const getUnfiltered = async (): Promise<AccountSummary[]> => {
    if (unfiltered === null) unfiltered = await listAllAccounts(source);
    return unfiltered;
  };
  for (const serviceId of order) {
    if (!active()) return;
    const categoryId = SERVICE_CATEGORY_ID[serviceId];
    if (categoryId === undefined) {
      const items = (await getUnfiltered()).filter((it) => it.category === serviceId);
      if (!active()) return;
      all.push(...items);
      if (items.length > 0) send({ source, serviceId, items, categoryDone: false, done: false });
      send({ source, serviceId, items: [], categoryDone: true, done: false });
      continue;
    }
    await listAccountsByCategory(
      source,
      categoryId,
      (pageItems, progress) => {
        if (!active()) return;
        all.push(...pageItems);
        send({
          source,
          serviceId,
          items: pageItems,
          categoryDone: false,
          done: false,
          page: progress.page,
          totalPages: progress.totalPages,
        });
      },
      active,
    );
    if (!active()) return;
    send({ source, serviceId, items: [], categoryDone: true, done: false });
  }
  if (!active()) return;
  if (target) {
    const cached = await loadCachedAccounts(source);
    if (cached) {
      const kept = cached.items.filter((it) => it.category !== target);
      await saveCachedAccounts(source, [...kept, ...all]);
    }
  } else if (all.length > 0) {
    await saveCachedAccounts(source, all);
  }
  const last = order[order.length - 1] as ServiceId;
  send({ source, serviceId: last, items: [], categoryDone: true, done: true });
};

const toItemId = (payload?: { itemId?: unknown }): number => {
  const id = Number(payload?.itemId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('invalid itemId');
  return id;
};

const toTagId = (payload?: { tagId?: unknown }): number => {
  const id = Number(payload?.tagId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('invalid tagId');
  return id;
};

const resolveSource = (source?: AccountSource): AccountSource =>
  source ?? DEFAULT_ACCOUNT_SOURCE;

export const registerAccountsIpc = () => {
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_LIST, (_e, payload?: { source?: AccountSource }) =>
    loadCached(resolveSource(payload?.source)),
  );
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_LIST_STREAM,
    (event, payload?: { only?: ServiceId; source?: AccountSource }) =>
      streamCategories(event, resolveSource(payload?.source), payload?.only),
  );
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_REFRESH, (_e, payload?: { source?: AccountSource }) =>
    fetchAndCache(resolveSource(payload?.source)),
  );
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_CLEAR_CACHE, async () => {
    inflight.clear();
    await clearCachedAccounts();
  });
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_GET, (_e, payload?: { itemId: number }) =>
    getAccountDetails(toItemId(payload)),
  );
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_CHECK, (_e, payload?: { itemId: number }) =>
    checkAccountValidity(toItemId(payload)),
  );
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_ADD_TAG, (_e, payload?: { itemId: number; tagId: number }) =>
    addItemTag(toItemId(payload), toTagId(payload)),
  );
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_REMOVE_TAG,
    (_e, payload?: { itemId: number; tagId: number }) =>
      removeItemTag(toItemId(payload), toTagId(payload)),
  );

  onTokenChange(() => {
    inflight.clear();
    void clearCachedAccounts();
  });
};
