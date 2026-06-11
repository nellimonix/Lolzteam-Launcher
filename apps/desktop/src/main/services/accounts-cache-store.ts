import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_SOURCES, type AccountSource, type AccountSummary } from '@shared-types';
import { app } from 'electron';
import log from 'electron-log/main';

const FILE_NAMES: Record<AccountSource, string> = {
  purchased: 'accounts-cache.json',
  listings: 'accounts-cache-listings.json',
};

const CACHE_VERSION = 2;

const cacheFile = (source: AccountSource) =>
  join(app.getPath('userData'), FILE_NAMES[source]);

interface CachePayload {
  version: number;
  fetchedAt: number;
  items: AccountSummary[];
}

// Only the public AccountSummary list is persisted. AccountDetails (logins,
// passwords, 2FA secrets) is fetched live per-login and never touches disk.
class AccountsCacheStore {
  private readonly cached = new Map<AccountSource, CachePayload | null>();

  async load(source: AccountSource): Promise<CachePayload | null> {
    if (this.cached.has(source)) return this.cached.get(source) ?? null;
    let payload: CachePayload | null;
    try {
      const raw = await fs.readFile(cacheFile(source), 'utf8');
      const parsed = JSON.parse(raw) as Partial<CachePayload>;
      payload =
        parsed.version === CACHE_VERSION &&
        Array.isArray(parsed.items) &&
        typeof parsed.fetchedAt === 'number'
          ? { version: CACHE_VERSION, fetchedAt: parsed.fetchedAt, items: parsed.items }
          : null;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('[accounts-cache] failed to load', err);
      }
      payload = null;
    }
    this.cached.set(source, payload);
    return payload;
  }

  async save(source: AccountSource, items: AccountSummary[]): Promise<CachePayload> {
    const payload: CachePayload = { version: CACHE_VERSION, fetchedAt: Date.now(), items };
    try {
      await fs.writeFile(cacheFile(source), JSON.stringify(payload), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (err) {
      log.warn('[accounts-cache] failed to write', err);
    }
    this.cached.set(source, payload);
    return payload;
  }

  async clear(): Promise<void> {
    for (const source of ACCOUNT_SOURCES) {
      try {
        await fs.unlink(cacheFile(source));
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          log.warn('[accounts-cache] failed to remove', err);
        }
      }
      this.cached.set(source, null);
    }
  }
}

const store = new AccountsCacheStore();

export const loadCachedAccounts = (source: AccountSource): Promise<CachePayload | null> =>
  store.load(source);
export const saveCachedAccounts = (
  source: AccountSource,
  items: AccountSummary[],
): Promise<CachePayload> => store.save(source, items);
export const clearCachedAccounts = (): Promise<void> => store.clear();
