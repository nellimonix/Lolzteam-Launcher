import type { LocalePreference } from '@shared-types';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LOCALE_FLAG } from '~/lib/flags';
import { useSettings } from '~/stores/settings';
import { Flag } from '~/widgets/Flag/Flag';
import { Modal } from '~/widgets/Modal/Modal';
import s from './SelectorModal.module.scss';

const LOCALE_OPTIONS: readonly LocalePreference[] = ['ru', 'en'] as const;

interface LanguageModalProps {
  onClose: () => void;
}

export const LanguageModal = ({ onClose }: LanguageModalProps) => {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings);
  const setSettings = useSettings((st) => st.set);
  const current: LocalePreference = settings?.locale ?? 'ru';

  const select = async (locale: LocalePreference) => {
    const next = await window.launcher.settings.set({ locale });
    setSettings(next.settings);
    onClose();
  };

  return (
    <Modal title={t('settings.language.modalTitle')} closable onClose={onClose}>
      <div className={s.list} role="radiogroup" aria-label={t('settings.language.modalTitle')}>
        {LOCALE_OPTIONS.map((opt) => {
          const active = current === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${s.option} ${active ? s.optionActive : ''}`}
              onClick={() => void select(opt)}
            >
              <span className={s.optionMain}>
                <Flag code={LOCALE_FLAG[opt]} className={s.flag} />
                <span>{t(`settings.language.${opt}`)}</span>
              </span>
              {active && <Check size={16} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
