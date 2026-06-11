export const ACCOUNT_SOURCES = ['purchased', 'listings'] as const;

export type AccountSource = (typeof ACCOUNT_SOURCES)[number];

export const DEFAULT_ACCOUNT_SOURCE: AccountSource = 'purchased';

export const isAccountSource = (v: unknown): v is AccountSource =>
  typeof v === 'string' && (ACCOUNT_SOURCES as readonly string[]).includes(v);
