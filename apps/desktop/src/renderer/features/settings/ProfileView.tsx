import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { labelColors } from '~/lib/labelColor';
import { useProfileLabels } from '~/stores/profileLabels';
import s from './ProfileView.module.scss';

interface ProfileViewProps {
  onBack: () => void;
}

export const ProfileView = ({ onBack }: ProfileViewProps) => {
  const { t } = useTranslation();
  const labels = useProfileLabels((p) => p.labels);
  const loading = useProfileLabels((p) => p.loading);
  const load = useProfileLabels((p) => p.load);
  const refresh = useProfileLabels((p) => p.refresh);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={s.container}>
      <div className={s.block}>
        <header className={s.header}>
          <button
            type="button"
            className={s.back}
            onClick={onBack}
            aria-label={t('settings.profile.back')}
          >
            <ArrowLeft size={18} />
          </button>
          <span className={s.headerTitle}>{t('settings.profile.labelsTitle')}</span>
        </header>

        <div className={s.labelsBlock}>
          <div className={s.labelsHead}>
            <div className={s.text}>
              <span className={s.title}>{t('settings.profile.labelsTitle')}</span>
              <span className={s.description}>{t('settings.profile.labelsHint')}</span>
            </div>
            <button
              type="button"
              className={s.refreshBtn}
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className={s.spin} /> : <RefreshCw size={14} />}
              <span>{t('settings.profile.refresh')}</span>
            </button>
          </div>

          {labels.length === 0 ? (
            <p className={s.empty}>
              {loading ? t('settings.profile.loading') : t('settings.profile.empty')}
            </p>
          ) : (
            <div className={s.chips}>
              {labels.map((label) => {
                const c = labelColors(label.bc);
                return (
                  <span
                    key={label.id}
                    className={s.chip}
                    style={{ backgroundColor: c.background, color: c.text }}
                  >
                    {label.title}
                  </span>
                );
              })}
            </div>
          )}

          <span className={s.webHint}>{t('settings.profile.webOnlyHint')}</span>
        </div>
      </div>
    </div>
  );
};
