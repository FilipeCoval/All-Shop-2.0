import { Camera, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function SerialScanner({ onScan, onClose }: { onScan: (serial: string) => void; onClose: () => void }) {
  const readerId = `serial-reader-${useId().replace(/:/g, '')}`;
  const callbackRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);
  callbackRef.current = onScan;

  useEffect(() => {
    let active = true;
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    void import('html5-qrcode').then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (!active) return;
      scanner = new Html5Qrcode(readerId, { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.CODE_93, Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX], verbose: false });
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 120 } },
          (value) => { if (active) callbackRef.current(value.trim().toUpperCase()); },
          () => undefined,
        );
      } catch {
        if (active) setError('Não foi possível abrir a câmara. Confirme a permissão do navegador.');
      }
    });
    return () => {
      active = false;
      if (scanner?.isScanning) void scanner.stop().then(() => scanner?.clear()).catch(() => undefined);
      else scanner?.clear();
    };
  }, [readerId]);

  return <div className="serial-scanner-overlay" role="dialog" aria-modal="true" aria-label="Ler número de série">
    <section><header><span><Camera /></span><div><strong>Ler S/N com a câmara</strong><small>Aponte para o código da unidade.</small></div><button type="button" onClick={onClose} aria-label="Fechar"><X /></button></header><div id={readerId} className="serial-camera" />{error && <p className="form-error">{error}</p>}<button type="button" className="secondary-button" onClick={onClose}>Cancelar</button></section>
  </div>;
}
