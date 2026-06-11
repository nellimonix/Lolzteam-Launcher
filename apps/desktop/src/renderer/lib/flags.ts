import type { LocalePreference, MarketCurrency } from '@shared-types';

export const CURRENCY_FLAG: Record<MarketCurrency, string> = {
  rub: 'RU',
  uah: 'UA',
  kzt: 'KZ',
  byn: 'BY',
  usd: 'US',
  eur: 'EU',
  gbp: 'GB',
  cny: 'CN',
  try: 'TR',
  jpy: 'JP',
  brl: 'BR',
};

export const LOCALE_FLAG: Record<LocalePreference, string> = {
  ru: 'RU',
  en: 'GB',
};
