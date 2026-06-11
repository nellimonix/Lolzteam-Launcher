import { describe, expect, it } from 'vitest';
import { parseSetCookie, webCookiesToInjectable } from '../web-cookies';

describe('parseSetCookie', () => {
  it('parses a real steam-session WebBrowser Set-Cookie string', () => {
    const raw =
      'steamLoginSecure=76561198000000000%7C%7CeyJ0eXAiOiJKV1QifQ.token; Path=/; Secure; HttpOnly; SameSite=None; Domain=steamcommunity.com';
    const c = parseSetCookie(raw);
    expect(c).not.toBeNull();
    expect(c?.name).toBe('steamLoginSecure');
    // The value must NOT contain any trailing attributes.
    expect(c?.value).toBe('76561198000000000%7C%7CeyJ0eXAiOiJKV1QifQ.token');
    expect(c?.domain).toBe('steamcommunity.com');
    expect(c?.path).toBe('/');
    expect(c?.secure).toBe(true);
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('no_restriction');
    expect(c?.url).toBe('https://steamcommunity.com/');
  });

  it('parses the sessionid cookie steam-session synthesizes per domain', () => {
    const c = parseSetCookie(
      'sessionid=abc123; Path=/; Secure; SameSite=None; Domain=store.steampowered.com',
    );
    expect(c?.name).toBe('sessionid');
    expect(c?.value).toBe('abc123');
    expect(c?.domain).toBe('store.steampowered.com');
    expect(c?.secure).toBe(true);
  });

  it('strips a leading dot from the domain', () => {
    const c = parseSetCookie('x=1; Domain=.steampowered.com; Path=/');
    expect(c?.domain).toBe('steampowered.com');
  });

  it('derives expirationDate from Max-Age', () => {
    const before = Math.floor(Date.now() / 1000);
    const c = parseSetCookie('x=1; Domain=steamcommunity.com; Max-Age=3600');
    expect(c?.expirationDate).toBeGreaterThanOrEqual(before + 3600);
  });

  it('returns null for a bare name=value with no Domain (MobileApp/SteamClient form)', () => {
    // acquireWebSession only uses WebBrowser tokens, but guard the bare form anyway.
    expect(parseSetCookie('steamLoginSecure=blahblah')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseSetCookie('')).toBeNull();
    expect(parseSetCookie('=novalue; Domain=x.com')).toBeNull();
    expect(parseSetCookie('noequalssign; Domain=x.com')).toBeNull();
  });
});

describe('webCookiesToInjectable', () => {
  it('maps a full cookie set and drops unparsable entries', () => {
    const cookies = [
      'steamLoginSecure=tok%7C%7Cjwt; Path=/; Secure; HttpOnly; SameSite=None; Domain=steamcommunity.com',
      'sessionid=sid; Path=/; Secure; SameSite=None; Domain=steamcommunity.com',
      'steamLoginSecure=bare', // no Domain → dropped
    ];
    const out = webCookiesToInjectable(cookies);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.name)).toEqual(['steamLoginSecure', 'sessionid']);
    expect(out.every((c) => !c.value.includes(';'))).toBe(true);
  });
});
