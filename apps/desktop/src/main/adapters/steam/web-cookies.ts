import type { InjectableCookie } from '../browser/extract';

const SAME_SITE: Record<string, InjectableCookie['sameSite']> = {
  none: 'no_restriction',
  lax: 'lax',
  strict: 'strict',
};

export const parseSetCookie = (raw: string): InjectableCookie | null => {
  const segments = raw.split(';');
  const first = segments[0] ?? '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;

  const attrs = new Map<string, string>();
  for (const seg of segments.slice(1)) {
    const i = seg.indexOf('=');
    const key = (i === -1 ? seg : seg.slice(0, i)).trim().toLowerCase();
    if (key) attrs.set(key, i === -1 ? '' : seg.slice(i + 1).trim());
  }

  const rawDomain = attrs.get('domain');
  if (!rawDomain) return null;
  const domain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
  const path = attrs.get('path') || '/';
  const secure = attrs.has('secure');
  const httpOnly = attrs.has('httponly');
  const sameSite = SAME_SITE[(attrs.get('samesite') || '').toLowerCase()] ?? 'unspecified';

  const cookie: InjectableCookie = {
    url: `${secure ? 'https' : 'http'}://${domain}${path.startsWith('/') ? path : `/${path}`}`,
    name,
    value,
    domain,
    path,
    secure,
    httpOnly,
    sameSite,
  };

  const maxAge = attrs.get('max-age');
  const expires = attrs.get('expires');
  if (maxAge && Number.isFinite(Number(maxAge))) {
    cookie.expirationDate = Math.floor(Date.now() / 1000) + Number(maxAge);
  } else if (expires) {
    const ms = Date.parse(expires);
    if (!Number.isNaN(ms)) cookie.expirationDate = Math.floor(ms / 1000);
  }
  return cookie;
};

export const webCookiesToInjectable = (cookies: string[]): InjectableCookie[] => {
  const out: InjectableCookie[] = [];
  for (const raw of cookies) {
    const cookie = parseSetCookie(raw);
    if (cookie) out.push(cookie);
  }
  return out;
};
