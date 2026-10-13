import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaClientState {
  online: boolean;
  offlineReady: boolean;
  needRefresh: boolean;
  installable: boolean;
  standalone: boolean;
  error: string | null;
}

type Listener = () => void;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

let state: PwaClientState = {
  online: navigator.onLine,
  offlineReady: false,
  needRefresh: false,
  installable: false,
  standalone: isStandalone(),
  error: null,
};
let initialized = false;
let installPrompt: BeforeInstallPromptEvent | null = null;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

const publish = (patch: Partial<PwaClientState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const getPwaClientState = () => state;
export const subscribePwaClient = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const checkForUpdate = (registration?: ServiceWorkerRegistration) => {
  if (!registration || !navigator.onLine) return;
  void registration.update().catch(() => undefined);
};

const bindWindowLifecycle = () => {
  window.addEventListener('online', () => publish({ online: true, error: null }));
  window.addEventListener('offline', () => publish({ online: false }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    publish({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    publish({ installable: false, standalone: true });
  });
};

const bindUpdateChecks = (registration: ServiceWorkerRegistration) => {
  const requestUpdate = () => checkForUpdate(registration);
  window.addEventListener('focus', requestUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdate();
  });
  window.setInterval(requestUpdate, 60 * 60 * 1000);
};

export function registerAllShopPwa() {
  if (initialized || !('serviceWorker' in navigator)) return;
  initialized = true;
  bindWindowLifecycle();

  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady: () => publish({ offlineReady: true }),
    onNeedRefresh: () => publish({ needRefresh: true }),
    onRegisterError: () => publish({ error: 'Não foi possível ativar a aplicação offline.' }),
    onRegisteredSW: (_serviceWorkerUrl, registration) => {
      if (registration) bindUpdateChecks(registration);
    },
  });
}

function registerDedicatedAdminPwa(scope: '/admin' | '/') {
  if (initialized || !('serviceWorker' in navigator)) return;
  initialized = true;
  bindWindowLifecycle();

  const hadAdminController = navigator.serviceWorker.controller?.scriptURL.endsWith('/admin-sw.js') ?? false;
  void navigator.serviceWorker.register('/admin-sw.js', { scope })
    .then((registration) => {
      const exposeWaitingUpdate = () => {
        if (!registration.waiting) return;
        publish({ needRefresh: true });
        updateServiceWorker = async (reloadPage = true) => {
          const waiting = registration.waiting;
          if (!waiting) return;
          if (reloadPage) {
            navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          }
          waiting.postMessage({ type: 'SKIP_WAITING' });
        };
      };

      exposeWaitingUpdate();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;
          if (hadAdminController) exposeWaitingUpdate();
          else publish({ offlineReady: true });
        });
      });
      bindUpdateChecks(registration);
    })
    .catch(() => publish({ error: 'Não foi possível ativar a aplicação Admin offline.' }));
}

export function registerAdminPwa() {
  registerDedicatedAdminPwa('/admin');
}

export function registerStandaloneAdminPwa() {
  registerDedicatedAdminPwa('/');
}

export async function installAllShopPwa() {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    installPrompt = null;
    publish({ installable: false });
    return true;
  }
  return false;
}

export async function applyAllShopPwaUpdate() {
  if (!updateServiceWorker) return;
  await updateServiceWorker(true);
}

export const dismissOfflineReady = () => publish({ offlineReady: false });
