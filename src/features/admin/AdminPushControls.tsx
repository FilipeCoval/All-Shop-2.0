import { BellOff, BellRing, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requestPushPermission, subscribeForegroundPush } from '../../../services/firebaseConfig';
import { registerAdminPushToken } from './adminMutations';

type PushState = 'idle' | 'enabling' | 'active' | 'blocked' | 'unsupported' | 'error';

const notificationPermission = () => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

export function AdminPushControls() {
  const [state, setState] = useState<PushState>(() => {
    const permission = notificationPermission();
    if (permission === 'unsupported' || !('serviceWorker' in navigator)) return 'unsupported';
    if (permission === 'denied') return 'blocked';
    return permission === 'granted' ? 'enabling' : 'idle';
  });

  const activate = async (silent = false) => {
    if (!silent) setState('enabling');
    try {
      const token = await requestPushPermission();
      if (!token) {
        setState(notificationPermission() === 'denied' ? 'blocked' : 'error');
        return;
      }
      await registerAdminPushToken(token);
      setState('active');
    } catch {
      setState(notificationPermission() === 'denied' ? 'blocked' : 'error');
    }
  };

  useEffect(() => {
    if (notificationPermission() === 'granted') void activate(true);
  // O registo automático só deve correr quando o controlo entra no ecrã.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribeForegroundPush((payload) => {
    window.dispatchEvent(new CustomEvent('allshop-admin-push', { detail: payload.data ?? {} }));
    if (Notification.permission !== 'granted') return;
    void navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope/').then((registration) => {
      if (!registration) return;
      const title = payload.notification?.title || 'Nova atividade na All-Shop';
      return registration.showNotification(title, {
        body: payload.notification?.body || 'Abra a administração para consultar.',
        icon: 'https://i.imgur.com/nSiZKBf.png',
        data: { link: payload.fcmOptions?.link || payload.data?.link || '/' },
      });
    });
  }), []);

  if (state === 'unsupported') return null;
  if (state === 'active') return <span className="admin-pwa-control push-active" role="status" title="Esta PWA recebe alertas de novas encomendas."><BellRing aria-hidden="true" /><span>Alertas ativos</span></span>;
  if (state === 'blocked') return <button className="admin-pwa-control push-blocked" type="button" title="As notificações estão bloqueadas nas definições deste navegador." onClick={() => window.alert('Abra as definições deste site no navegador e permita Notificações. Depois volte a abrir a PWA Admin.')}><BellOff aria-hidden="true" /><span>Alertas bloqueados</span></button>;

  return <button className={`admin-pwa-control push-enable${state === 'error' ? ' push-error' : ''}`} type="button" disabled={state === 'enabling'} onClick={() => void activate()} title={state === 'error' ? 'Não foi possível ativar. Toque para tentar novamente.' : 'Receber alertas de novas encomendas nesta PWA.'}>
    {state === 'enabling' ? <LoaderCircle className="spin" aria-hidden="true" /> : <BellRing aria-hidden="true" />}
    <span>{state === 'enabling' ? 'A ativar…' : state === 'error' ? 'Tentar alertas' : 'Ativar alertas'}</span>
  </button>;
}
