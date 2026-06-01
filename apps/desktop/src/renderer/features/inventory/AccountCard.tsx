import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  KeyRound,
  Lock,
  LogIn,
  Loader2,
  ShieldCheck,
  Star,
  Tag,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { AccountSummary, AccountTag, ServiceId, SteamInfo, TelegramInfo } from '@shared-types';
import { useLoginSession, type LoginService } from '~/stores/loginSession';
import { Modal } from '~/widgets/Modal/Modal';
import steamLogo from '~/assets/category/steam.svg';
import telegramLogo from '~/assets/category/telegram.svg';
import tiktokLogo from '~/assets/category/tiktok.svg';
import s from './AccountCard.module.scss';

interface AccountCardProps {
  item: AccountSummary;
}

const CATEGORY_LOGOS: Partial<Record<ServiceId, string>> = {
  steam: steamLogo,
  telegram: telegramLogo,
  tiktok: tiktokLogo,
};

const STEAM_ICON_BASE = 'https://nztcdn.com/steam/icon';

// lzt.market tag ids: 1 = valid, 2 = invalid. Matching by id survives title renames.
const VALID_TAG_ID = 1;
const INVALID_TAG_ID = 2;
// Status-driving tags rendered by the header dot, not as chips below the title.
const STATUS_TAG_IDS = new Set([VALID_TAG_ID, INVALID_TAG_ID]);

const formatHours = (hours: number, locale: string): string => {
  const intlLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(rounded);
};

const formatLastSeen = (
  unixSeconds: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string => {
  const days = Math.floor((Date.now() - unixSeconds * 1000) / (24 * 60 * 60 * 1000));
  if (days <= 0) return t('inventory.card.steam.lastSeenToday');
  return t('inventory.card.steam.lastSeenDays', { count: days });
};

// "Куплен N дн./ч. назад". Falls back to an absolute date for older purchases.
const formatPurchasedAgo = (
  unixSeconds: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
): string => {
  const ms = Date.now() - unixSeconds * 1000;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 30) {
    const intlLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
    return new Intl.DateTimeFormat(intlLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(unixSeconds * 1000);
  }
  if (days >= 1) return t('inventory.card.purchasedDays', { count: days });
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return t('inventory.card.purchasedHours', { count: hours });
  return t('inventory.card.purchasedRecently');
};

// Windows fonts lack regional-indicator flag glyphs, so emoji flags render as
// letter pairs. Use raster flags from flagcdn (whitelisted in the CSP img-src).
const CountryFlag = ({ code }: { code: string }) => {
  if (code.length !== 2) return null;
  const cc = code.toLowerCase();
  return (
    <img
      className={s.flag}
      src={`https://flagcdn.com/h20/${cc}.png`}
      srcSet={`https://flagcdn.com/h40/${cc}.png 2x`}
      width={20}
      height={15}
      alt=""
      loading="lazy"
    />
  );
};

const REGION_NAMES_RU = new Intl.DisplayNames(['ru'], { type: 'region' });
const REGION_NAMES_EN = new Intl.DisplayNames(['en'], { type: 'region' });

const countryName = (code: string, locale: string): string => {
  try {
    const names = locale === 'ru' ? REGION_NAMES_RU : REGION_NAMES_EN;
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

const formatPrice = (value: number, currency: string, locale: string) => {
  const intlLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
};

// Categories the launcher can actually sign into, mapped to the login pipeline
// they use: native desktop clients (steam/telegram) vs. cookie-injection into a
// built-in browser window (tiktok/instagram/...).
const LOGIN_SERVICE_BY_CATEGORY: Partial<Record<NonNullable<AccountSummary['category']>, LoginService>> = {
  steam: 'steam',
  telegram: 'telegram',
  tiktok: 'browser',
  instagram: 'browser',
};

const toLoginService = (category: AccountSummary['category']): LoginService | null =>
  category ? LOGIN_SERVICE_BY_CATEGORY[category] ?? null : null;

const loginMethodFor = (service: LoginService): 'native' | 'web' =>
  service === 'browser' ? 'web' : 'native';

const SteamDetails = ({ steam }: { steam: SteamInfo }) => {
  const { t, i18n } = useTranslation();
  const banned = steam.vacBanned || steam.communityBanned || steam.tradeBanned;

  return (
    <div className={s.steam}>
      <div className={s.badges}>
        {banned ? (
          <>
            {steam.vacBanned && (
              <span className={`${s.badge} ${s.badgeDanger}`}>
                <Ban size={12} />
                {t('inventory.card.steam.banVac')}
              </span>
            )}
            {steam.communityBanned && (
              <span className={`${s.badge} ${s.badgeDanger}`}>
                <Ban size={12} />
                {t('inventory.card.steam.banCommunity')}
              </span>
            )}
            {steam.tradeBanned && (
              <span className={`${s.badge} ${s.badgeDanger}`}>
                <Ban size={12} />
                {t('inventory.card.steam.banTrade')}
              </span>
            )}
          </>
        ) : (
          <span className={`${s.badge} ${s.badgeOk}`}>
            <CheckCircle2 size={12} />
            {t('inventory.card.steam.noBan')}
          </span>
        )}
        {steam.isLimited && (
          <span className={`${s.badge} ${s.badgeWarn}`}>
            <Lock size={12} />
            {t('inventory.card.steam.limited')}
          </span>
        )}
        {steam.hasMfa && (
          <span className={s.badge}>
            <KeyRound size={12} />
            {t('inventory.card.steam.mfa')}
          </span>
        )}
        {steam.origin && (
          <span className={s.badge}>
            <Tag size={12} />
            {steam.origin}
          </span>
        )}
        {typeof steam.gameCount === 'number' && steam.gameCount > 0 && (
          <span className={s.badge}>
            {t('inventory.card.steam.games', { count: steam.gameCount })}
          </span>
        )}
        {steam.lastActivity && (
          <span className={s.badge}>
            <Clock size={12} />
            {formatLastSeen(steam.lastActivity, t)}
          </span>
        )}
      </div>

      {steam.games.length > 0 && (
        <ul className={s.games}>
          {steam.games.map((g) => (
            <li key={g.appId} className={s.game} title={`${g.title} · ${formatHours(g.hours, i18n.language)} ${t('inventory.card.steam.hoursShort')}`}>
              <img
                className={s.gameIcon}
                src={`${STEAM_ICON_BASE}/${g.parentGameId}.webp`}
                alt=""
                loading="lazy"
              />
              <span className={s.gameHours}>
                {formatHours(g.hours, i18n.language)} {t('inventory.card.steam.hoursShort')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const TelegramDetails = ({ tg }: { tg: TelegramInfo }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className={s.steam}>
      <div className={s.badges}>
        {tg.premium && (
          <span className={`${s.badge} ${s.badgeOk}`}>
            <Star size={12} />
            {t('inventory.card.telegram.premium')}
          </span>
        )}
        {tg.spamBlocked ? (
          <span className={`${s.badge} ${s.badgeDanger}`}>
            <Ban size={12} />
            {t('inventory.card.telegram.spamBlock')}
          </span>
        ) : (
          <span className={`${s.badge} ${s.badgeOk}`}>
            <CheckCircle2 size={12} />
            {t('inventory.card.telegram.noSpamBlock')}
          </span>
        )}
        {tg.origin && (
          <span className={s.badge}>
            <Tag size={12} />
            {tg.origin}
          </span>
        )}
        {tg.lastSeen && (
          <span className={s.badge}>
            <Clock size={12} />
            {formatLastSeen(tg.lastSeen, t)}
          </span>
        )}
        {tg.premium && tg.premiumExpires && (
          <span className={s.badge}>
            {t('inventory.card.telegram.premiumUntil', {
              date: new Intl.DateTimeFormat(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
                day: 'numeric',
                month: 'short',
              }).format(tg.premiumExpires * 1000),
            })}
          </span>
        )}
      </div>
    </div>
  );
};

const AccountCardImpl = ({ item }: AccountCardProps) => {
  const { t, i18n } = useTranslation();

  const formatWarranty = (warrantyEndsAt: number | null): string | null => {
    if (!warrantyEndsAt) return null;
    const ms = warrantyEndsAt * 1000 - Date.now();
    if (ms <= 0) return null;
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (days >= 1) return t('inventory.card.warrantyDays', { count: days });
    const hours = Math.ceil(ms / (60 * 60 * 1000));
    return t('inventory.card.warrantyHours', { count: hours });
  };

  const warranty = formatWarranty(item.warrantyEndsAt);
  const tags = item.tags ?? item.steam?.tags ?? item.telegram?.tags ?? [];
  const isInvalid = tags.some((tag) => tag.id === INVALID_TAG_ID);
  const chipTags = tags.filter((tag) => !STATUS_TAG_IDS.has(tag.id) && tag.title.trim() !== '');
  const service = toLoginService(item.category);
  const canLogin = service !== null;
  const categoryLogo = item.category ? CATEGORY_LOGOS[item.category] : undefined;

  const tg = item.telegram;
  const country = tg?.country ?? item.steam?.country ?? null;
  const aboutParts: ReactNode[] = [];
  if (country) {
    aboutParts.push(
      <span key="country" className={s.country}>
        <CountryFlag code={country} /> {countryName(country, i18n.language)}
      </span>,
    );
  }

  const purchased = item.purchasedAt
    ? formatPurchasedAgo(item.purchasedAt, t, i18n.language)
    : null;
  const activeItemId = useLoginSession((s) => s.itemId);
  const step = useLoginSession((s) => s.step);
  const error = useLoginSession((s) => s.error);
  // Only spin while this card's login is actually running. Once it resolves
  // (step 'done' or an error) the modal stays open showing the result, but the
  // button must return to its idle state.
  const inProgress = step !== null && step !== 'done' && error === null;
  const busy = inProgress && activeItemId === item.itemId;

  const [warnOpen, setWarnOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const openOnMarket = () => {
    setMenuOpen(false);
    void window.launcher.app.openExternal(`https://lzt.market/${item.itemId}/`);
  };

  const applyTags = (tags: AccountTag[]) => {
    qc.setQueryData<AccountSummary[]>(['accounts'], (prev) =>
      prev?.map((it) => {
        if (it.itemId !== item.itemId) return it;
        const next = { ...it, tags };
        if (it.steam) next.steam = { ...it.steam, tags };
        if (it.telegram) next.telegram = { ...it.telegram, tags };
        return next;
      }),
    );
  };

  const runCheck = async () => {
    setMenuOpen(false);
    if (checking) return;
    setCheckOpen(true);
    setChecking(true);
    setCheckResult(null);
    setCheckError(null);
    try {
      const res = await window.launcher.accounts.check(item.itemId);
      if (res.ok) {
        applyTags(res.tags);
        setCheckResult({ valid: res.valid, reason: res.reason });
      } else {
        setCheckError(res.message);
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : t('inventory.card.callError'));
    } finally {
      setChecking(false);
    }
  };

  const runLogin = async () => {
    if (!service) return;
    const sess = useLoginSession.getState();
    sess.start(item.itemId, item.title, service);
    try {
      const res = await window.launcher.accounts.login(
        item.itemId,
        loginMethodFor(service),
      );
      if (!res.ok) sess.fail(res.message ?? t('inventory.card.loginFailedFallback'));
    } catch (err) {
      sess.fail(err instanceof Error ? err.message : t('inventory.card.callError'));
    }
  };

  const handleLogin = () => {
    if (!service) return;
    // Steam sign-in may need to fetch the mafile (for a Steam Guard code), which
    // cancels the account's active warranty. Warn first when a warranty is live.
    if (service === 'steam' && warranty) {
      setWarnOpen(true);
      return;
    }
    void runLogin();
  };

  return (
    <article className={s.card}>
      <div className={s.topSection}>
        <header className={s.head}>
          <div className={s.thumbBlock}>
              {item.imageUrl ? (
                <img className={s.logo} src={item.imageUrl} alt="" />
              ) : categoryLogo ? (
                <img className={s.logo} src={categoryLogo} alt="" />
              ) : (
                <Tag size={20} />
              )}
            <span className={s.category}>{item.categoryTitle}</span>
          </div>
          <div className={`${s.status} ${isInvalid ? s.statusInvalid : ''}`}>
            <span className={s.dot}></span>
            <h3 className={s.text}>
              {isInvalid
                ? t('inventory.card.statusInvalid')
                : t('inventory.card.statusValid')}
            </h3>
          </div>
        </header>

        <h3 className={s.titleAccount}>{item.title}</h3>

        {aboutParts.length > 0 && (
          <div className={s.aboutBlock}>
            {aboutParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={s.dot}></span>}
                {part}
              </Fragment>
            ))}
          </div>
        )}

        <div className={s.parsedInfo}>
          {item.steam && <SteamDetails steam={item.steam} />}
          {item.telegram && <TelegramDetails tg={item.telegram} />}
        </div>

        {chipTags.length > 0 && (
          <div className={s.tagsBlock}>
            {chipTags.map((tag) => (
              <div key={tag.id} className={s.tagsItem}>
                {tag.title}
              </div>
            ))}
          </div>
        )}
      </div>


      <div className={s.bottomBlock}>
        <span className={s.divider}></span>

        <div className={s.bottomGroup}>
        {purchased && (
          <div className={s.bottomItem}>
              <span className={s.description}>
                {t('inventory.card.purchasedLabel')}
              </span>
            <span className={s.title}>{purchased}</span>
          </div>
        )}
        {warranty && (
          <div className={s.bottomItem}>
              <span className={s.description}>
                {t('inventory.card.warrantyLabel')}
              </span>
            <span className={s.title}>{warranty}</span>
          </div>
        )}
        <div className={s.bottomItem}>
            <span className={s.description}>
              {t('inventory.card.priceLabel')}
            </span>
          <span className={s.title}>
              {formatPrice(item.price, item.currency, i18n.language)}
            </span>
        </div>
      </div>
        <div className={s.buttonGroup}>
          <button
            type="button"
            className={`${s.login} ${isInvalid ? s.loginInvalid : ''}`}
            disabled={!canLogin || busy}
            onClick={handleLogin}
            title={
              canLogin
                ? isInvalid
                  ? t('inventory.card.loginInvalidTooltip')
                  : t('inventory.card.loginTooltip')
                : t('inventory.card.unsupportedTooltip')
            }
          >
            {busy ? <Loader2 size={16} className={s.spin} /> : <LogIn size={16} />}
            <span>{busy ? t('inventory.card.busy') : t('inventory.card.login')}</span>
          </button>
          <div className={s.menuWrap} ref={menuRef}>
            <button
              type="button"
              className={s.menuAccount}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={t('inventory.card.menuTooltip')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {menuOpen && (
              <div className={s.menu} role="menu">
                <button
                  type="button"
                  className={s.menuItem}
                  role="menuitem"
                  onClick={() => void runCheck()}
                  disabled={checking}
                >
                  <ShieldCheck size={16} />
                  <span>{t('inventory.card.checkValidity')}</span>
                </button>
                <button
                  type="button"
                  className={s.menuItem}
                  role="menuitem"
                  onClick={openOnMarket}
                >
                  <ExternalLink size={16} />
                  <span>{t('inventory.card.openOnMarket')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {warnOpen && (
        <Modal title={t('inventory.card.warrantyWarnTitle')} onClose={() => setWarnOpen(false)}>
          <p className={s.warnBody}>
            {t('inventory.card.warrantyWarnBody', { warranty })}
          </p>
          <div className={s.warnActions}>
            <button
              type="button"
              className={s.warnCancel}
              onClick={() => setWarnOpen(false)}
            >
              {t('inventory.card.warrantyWarnCancel')}
            </button>
            <button
              type="button"
              className={s.warnConfirm}
              onClick={() => {
                setWarnOpen(false);
                void runLogin();
              }}
            >
              {t('inventory.card.warrantyWarnConfirm')}
            </button>
          </div>
        </Modal>
      )}

      {checkOpen && (
        <Modal
          title={t('inventory.card.checkTitle')}
          onClose={() => setCheckOpen(false)}
        >
          <div className={s.checkBody}>
            {checking ? (
              <div className={s.checkPending}>
                <Loader2 size={32} className={s.spin} />
                <p className={s.checkText}>{t('inventory.card.checking')}</p>
              </div>
            ) : checkError ? (
              <div className={`${s.checkResult} ${s.checkResultWarn}`}>
                <AlertTriangle size={32} />
                <p className={s.checkText}>{t('inventory.card.checkErrorBody')}</p>
                <p className={s.checkSub}>{checkError}</p>
              </div>
            ) : checkResult ? (
              checkResult.valid ? (
                <div className={`${s.checkResult} ${s.checkResultOk}`}>
                  <CheckCircle2 size={32} />
                  <p className={s.checkText}>{t('inventory.card.checkValidResult')}</p>
                </div>
              ) : (
                <div className={`${s.checkResult} ${s.checkResultBad}`}>
                  <Ban size={32} />
                  <p className={s.checkText}>{t('inventory.card.checkInvalidResult')}</p>
                  {checkResult.reason && (
                    <p className={s.checkSub}>{checkResult.reason}</p>
                  )}
                </div>
              )
            ) : null}
          </div>
          <div className={s.warnActions}>
            <button
              type="button"
              className={s.warnConfirm}
              onClick={() => setCheckOpen(false)}
            >
              {t('inventory.card.checkClose')}
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
};

export const AccountCard = memo(AccountCardImpl);
