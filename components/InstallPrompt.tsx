
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, X, Smartphone } from 'lucide-react';
import {
  applyAllShopPwaUpdate,
  getPwaClientState,
  installAllShopPwa,
  subscribePwaClient,
} from '../src/pwa/pwaClient';

const InstallPrompt: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const pwaState = useSyncExternalStore(
    subscribePwaClient,
    getPwaClientState,
    getPwaClientState,
  );

  useEffect(() => {
    // Detetar se é iOS (iPhone/iPad) pois eles não suportam o evento automático
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Se for iOS e estiver no navegador (não instalado), mostrar ajuda
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isIosDevice && !isStandalone) {
        // No iOS mostramos sempre por alguns segundos ou deixamos fixo
        setIsVisible(true);
    }

  }, []);

  useEffect(() => {
    if (pwaState.installable && !pwaState.standalone) setIsVisible(true);
  }, [pwaState.installable, pwaState.standalone]);

  const handleInstallClick = async () => {
    const installed = await installAllShopPwa();
    if (installed) setIsVisible(false);
  };

  if (pwaState.needRefresh && !updateDismissed) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[70] bg-white dark:bg-slate-900 p-4 rounded-xl shadow-2xl border border-orange-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4 mb-[env(safe-area-inset-bottom)]" role="status">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 dark:bg-orange-950/60 p-2.5 rounded-xl text-orange-600 shrink-0">
            <RefreshCw size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white leading-tight">Nova versão disponível</h3>
            <p className="text-xs text-gray-500 dark:text-slate-300 mt-0.5">Atualize quando terminar o que está a fazer.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button onClick={() => setUpdateDismissed(true)} className="p-2 text-gray-500 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            Mais tarde
          </button>
          <button onClick={() => void applyAllShopPwaUpdate()} className="flex-1 md:flex-none bg-orange-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-orange-600 transition-all flex items-center justify-center gap-2 active:scale-95">
            <RefreshCw size={18} /> Atualizar agora
          </button>
        </div>
      </div>
    );
  }

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] bg-white p-4 rounded-xl shadow-2xl border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in-up mb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 p-2.5 rounded-xl text-primary shrink-0">
            <Smartphone size={24} />
        </div>
        <div>
            <h3 className="font-bold text-gray-900 leading-tight">Instalar App All-Shop</h3>
            <p className="text-xs text-gray-500 mt-0.5">Acesso rápido, notificações e modo offline.</p>
        </div>
      </div>
      
      {isIOS ? (
          // Instruções específicas para iPhone (que não tem botão nativo via JS)
          <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-200">
              <span>Toque em <strong>Partilhar</strong> <span className="inline-block border border-gray-300 rounded px-1">⎋</span> e <strong>Adicionar ao Ecrã Principal</strong> <span className="inline-block border border-gray-300 rounded px-1">+</span></span>
              <button onClick={() => setIsVisible(false)} className="p-2 text-gray-400 hover:text-gray-600 ml-2"><X size={18} /></button>
          </div>
      ) : (
          // Botão real para Android/PC
          <div className="flex items-center gap-2 w-full md:w-auto">
              <button 
                onClick={() => setIsVisible(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Agora não
              </button>
              <button 
                onClick={handleInstallClick}
                className="flex-1 md:flex-none bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-blue-600 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Download size={18} /> Instalar
              </button>
          </div>
      )}
    </div>
  );
};

export default InstallPrompt;
