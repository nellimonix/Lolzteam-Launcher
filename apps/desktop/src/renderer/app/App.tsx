import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AuthStatus } from '@shared-types';
import { LoginScreen } from '~/features/auth/LoginScreen';
import { Shell } from '~/widgets/Shell/Shell';
import { InventoryView } from '~/features/inventory/InventoryView';
import { SettingsView } from '~/features/settings/SettingsView';
import { LoginProgressModal } from '~/features/inventory/LoginProgressModal';
import { useLoginSession } from '~/stores/loginSession';
import { useAccountsStreamController } from '~/stores/accountsStream';
import { useView } from '~/stores/view';
import { useLocaleSync } from '~/i18n/useLocaleSync';
import { Splash } from '~/widgets/Splash/Splash';

const AccountsStreamController = () => {
  useAccountsStreamController();
  return null;
};

export const App = () => {
  useLocaleSync();
  const qc = useQueryClient();
  const [splashDone, setSplashDone] = useState(false);

  const status = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => window.launcher.auth.getStatus(),
  });

  const [live, setLive] = useState<AuthStatus | null>(null);

  useEffect(() => {
    const off = window.launcher.auth.onStatusChanged((next) => {
      setLive(next);
      qc.setQueryData(['auth-status'], next);
      qc.invalidateQueries({ queryKey: ['accounts'] });
    });
    return off;
  }, [qc]);

  useEffect(() => {
    const off = window.launcher.accounts.onLoginProgress((evt) => {
      const sess = useLoginSession.getState();
      if (evt.itemId !== sess.itemId) return;
      if (sess.step === 'done' || sess.error !== null) return;
      sess.setStep(evt.step, evt.detail);
    });
    return off;
  }, []);

  const current = live ?? status.data ?? null;
  const view = useView((st) => st.view);

  const loading = status.isLoading && !current;

  let content: React.ReactNode = null;
  if (loading) {
    content = null;
  } else if (!current?.authenticated) {
    content = (
      <>
        <LoginScreen />
        <LoginProgressModal />
      </>
    );
  } else {
    content = (
      <Shell session={current.session}>
        <AccountsStreamController />
        {view === 'settings' ? <SettingsView /> : <InventoryView />}
        <LoginProgressModal />
      </Shell>
    );
  }

  return (
    <>
      {content}
      {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
    </>
  );
};
