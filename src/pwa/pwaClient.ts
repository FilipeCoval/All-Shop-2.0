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

// The Admin service worker intentionally keeps forms safe: it never forces a
// reload while an operator may still be editing an order or a lot. The small
// build file lets an already-open installed app notice a deployment even when
// the service-worker file itself did not change.
const ADMIN_BUILD_VERSION_KEY = 'allshop-admin-build-version';

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

const bindUpdateChecks = (registration: ServiceWorkerRegistration, checkAppBuild?: () => void) => {
  const requestUpdate = () => {
    checkForUpdate(registration);
    checkAppBuild?.();
  };
  window.addEventListener('focus', requestUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestUpdate();
  });
  // Mobile PWAs can stay open for days. Check regularly as well as when the
  // user returns to the app, so a new version is ready without reinstalling.
  window.setInterval(requestUpdate, 15 * 60 * 1000);
  requestUpdate();
};

const checkAdminBuildVersion = () => {
  if (!navigator.onLine) return;

  void fetch(`/admin-build.json?check=${Date.now()}`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<{ version?: unknown }>;
    })
    .then((payload) => {
      const version = typeof payload?.version === 'string' ? payload.version : '';
      if (!version) return;

      const installedVersion = window.localStorage.getItem(ADMIN_BUILD_VERSION_KEY);
      // The first version that includes this detector is the baseline. From
      // then on any deployment is surfaced immediately, not mistaken for an
      // update that the customer has to install from Chrome.
      if (!installedVersion) {
        window.localStorage.setItem(ADMIN_BUILD_VERSION_KEY, version);
        return;
      }
      if (installedVersion === version || state.needRefresh) return;

      updateServiceWorker = async (reloadPage = true) => {
        window.localStorage.setItem(ADMIN_BUILD_VERSION_KEY, version);
        publish({ needRefresh: false });
        if (reloadPage) window.location.reload();
      };
      publish({ needRefresh: true });
    })
    .catch(() => undefined);
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
      bindUpdateChecks(registration, checkAdminBuildVersion);
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
