import { CheckCircle2, Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  applyAllShopPwaUpdate,
  dismissOfflineReady,
  getPwaClientState,
  installAllShopPwa,
  subscribePwaClient,
} from '../../pwa/pwaClient';

export function AdminPwaControls() {
  const pwa = useSyncExternalStore(subscribePwaClient, getPwaClientState, getPwaClientState);

  if (!pwa.online) {
    return <span className="admin-pwa-control offline" role="status" title="Pode consultar o ecrã já aberto. Guardar alterações exige ligação à internet.">
      <WifiOff aria-hidden="true" /> <span>Sem ligação</span>
    </span>;
  }

  if (pwa.needRefresh) {
    return <button className="admin-pwa-control update" type="button" onClick={() => {
      if (!window.confirm('Aplicar a nova versão da administração e recarregar a página?')) return;
      void applyAllShopPwaUpdate();
    }}>
      <RefreshCw aria-hidden="true" /> <span>Atualizar app</span>
    </button>;
  }

  if (pwa.installable && !pwa.standalone) {
    return <button className="admin-pwa-control install" type="button" onClick={() => void installAllShopPwa()}>
      <Download aria-hidden="true" /> <span>Instalar admin</span>
    </button>;
  }

  if (pwa.offlineReady) {
    return <span className="admin-pwa-control ready" role="status">
      <CheckCircle2 aria-hidden="true" /> <span>App pronta</span>
      <button type="button" onClick={dismissOfflineReady} aria-label="Fechar estado da PWA"><X aria-hidden="true" /></button>
    </span>;
  }

  if (pwa.error) {
    return <span className="admin-pwa-control offline" role="status" title={pwa.error}>
      <WifiOff aria-hidden="true" /> <span>PWA indisponível</span>
    </span>;
  }

  return null;
}
