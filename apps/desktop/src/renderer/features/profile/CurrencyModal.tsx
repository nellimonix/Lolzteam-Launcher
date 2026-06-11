import type { AuthStatus, MarketCurrency } from '@shared-types';
import { MARKET_CURRENCIES } from '@shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCY_FLAG } from '~/lib/flags';
import { startAccountsStream } from '~/stores/accountsStream';
import { Flag } from '~/widgets/Flag/Flag';
import { Modal } from '~/widgets/Modal/Modal';
import s from './SelectorModal.module.scss';

interface CurrencyModalProps {
  onClose: () => void;
}

export const CurrencyModal = ({ onClose }: CurrencyModalProps) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const status = qc.getQueryData<AuthStatus>(['auth-status']);
  const current = (status?.session?.currency ?? '').toLowerCase();
  const [busy, setBusy] = useState<MarketCurrency | null>(null);
  const [error, setError] = useState<string | null>(null);

  const select = async (currency: MarketCurrency) => {
    if (busy || currency === current) return;
    setBusy(currency);
    setError(null);
    try {
      const res = await window.launcher.profile.setCurrency(currency);
      if (!res.ok) {
        setError(res.message ?? t('settings.currency.failed'));
        return;
      }
      // Profile balance/currency and per-item prices are server-side in the new
      // currency now — refresh the auth status and re-stream the accounts.
      const next = await window.launcher.auth.getStatus();
      qc.setQueryData(['auth-status'], next);
      await window.launcher.accounts.clearCache();
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      startAccountsStream();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.currency.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={t('settings.currency.modalTitle')} closable onClose={onClose}>
      <div className={s.list} role="radiogroup" aria-label={t('settings.currency.modalTitle')}>
        {MARKET_CURRENCIES.map((code) => {
          const active = current === code;
          const isBusy = busy === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${s.option} ${active ? s.optionActive : ''}`}
              onClick={() => void select(code)}
              disabled={busy !== null}
            >
              <span className={s.optionMain}>
                <Flag code={CURRENCY_FLAG[code]} className={s.flag} />
                <span className={s.code}>{code.toUpperCase()}</span>
                <span className={s.name}>{t(`settings.currency.names.${code}`)}</span>
              </span>
              {isBusy ? (
                <Loader2 size={16} className={s.spin} />
              ) : active ? (
                <Check size={16} />
              ) : null}
            </button>
          );
        })}
      </div>
      {error && <p className={s.error}>{error}</p>}
    </Modal>
  );
};
