import type { AdminOrder, AdminOrderPackage } from './adminTypes';

export type ShippingLabelSender = {
  storeName: string;
  senderName: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  logoUrl?: string;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const orderReference = (order: AdminOrder) => String(order.id ?? '').replace(/^#/, '') || '—';

const shippingPackages = (order: AdminOrder, estimatedWeight: number): AdminOrderPackage[] => {
  if (order.packages?.length) return order.packages;
  return [{ id: 'default', weight: estimatedWeight, items: order.items ?? [], trackingNumber: order.trackingNumber }];
};

const formatWeight = (value: unknown) => {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? `${weight.toFixed(3)} kg` : 'Peso por indicar';
};

/**
 * Generates a neutral A6 dispatch label. The carrier's own postage/barcode
 * label remains theirs; this sheet is the All-Shop label that goes on the box.
 */
export function buildShippingLabelDocument(order: AdminOrder, sender: ShippingLabelSender, estimatedWeight = 0, printedAt = new Date()): string {
  const customer = order.shippingInfo ?? {};
  const packages = shippingPackages(order, estimatedWeight);
  const totalPackages = packages.length;
  const addressExtra = [customer.street, customer.doorNumber].filter(Boolean).join(', ');
  const printedDate = printedAt.toLocaleDateString('pt-PT');
  const safeLogo = sender.logoUrl ? `<img src="${escapeHtml(sender.logoUrl)}" alt="${escapeHtml(sender.storeName)}" class="logo" />` : `<strong class="brand-name">${escapeHtml(sender.storeName)}</strong>`;

  const pages = packages.map((pack, index) => {
    const tracking = pack.trackingNumber || order.trackingNumber || '';
    const packageItems = (pack.items ?? []).map((item) => `${Math.max(0, Number(item.quantity ?? 0))}× ${String(item.name ?? 'Artigo')}${item.selectedVariant ? ` · ${item.selectedVariant}` : ''}`).filter(Boolean);
    const pageBreak = index === totalPackages - 1 ? '' : 'page-break-after: always;';
    return `<article class="label" style="${pageBreak}">
      <header>
        <div class="sender">${safeLogo}<div><small>REMETENTE</small><strong>${escapeHtml(sender.storeName)}</strong><span>${escapeHtml(sender.senderName)}</span><span>${escapeHtml(sender.street)}</span><span>${escapeHtml(sender.zip)} ${escapeHtml(sender.city)}</span><span>${escapeHtml(sender.country)}</span></div></div>
        <div class="dispatch"><strong>ENVIO</strong><span>${totalPackages > 1 ? `VOLUME ${index + 1} / ${totalPackages}` : 'VOLUME ÚNICO'}</span></div>
      </header>
      <section class="recipient"><small>DESTINATÁRIO</small><strong>${escapeHtml(customer.name || 'Nome por indicar')}</strong><span>${escapeHtml(addressExtra || 'Morada por indicar')}</span>${customer.addressExtra ? `<span>${escapeHtml(customer.addressExtra)}</span>` : ''}<b>${escapeHtml(customer.zip || '')} ${escapeHtml(customer.city || '')}</b><em>Tel. ${escapeHtml(customer.phone || 'por indicar')}</em></section>
      <footer>
        <div><small>ENCOMENDA</small><strong>#${escapeHtml(orderReference(order))}</strong><span>${formatWeight(pack.weight ?? estimatedWeight)} · ${printedDate}</span></div>
        <div class="tracking"><small>RASTREIO</small><strong>${tracking ? escapeHtml(tracking) : 'Por atribuir'}</strong></div>
      </footer>
      ${packageItems.length ? `<p class="items">${packageItems.map((item) => escapeHtml(item)).join(' · ')}</p>` : ''}
    </article>`;
  }).join('');

  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8" /><title>Etiquetas de envio — ${escapeHtml(orderReference(order))}</title><style>
    @page { size: A6 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e5e7eb; color: #0f172a; font-family: Arial, sans-serif; }
    .label { width: 148mm; height: 105mm; margin: 0 auto 12px; padding: 10mm; display: flex; flex-direction: column; background: #fff; border: 1px dashed #94a3b8; }
    header { display: flex; justify-content: space-between; gap: 12mm; padding-bottom: 5mm; border-bottom: 2px solid #0f172a; }
    .sender { display: flex; gap: 4mm; min-width: 0; }
    .logo { width: 24mm; height: 14mm; object-fit: contain; object-position: left center; }
    .brand-name { min-width: 24mm; color: #f97316; font-size: 16pt; }
    .sender div, .recipient, footer > div { display: grid; gap: 1.2mm; }
    small { color: #64748b; font-size: 7pt; font-weight: 700; letter-spacing: .08em; }
    .sender strong { font-size: 10pt; }.sender span { color: #475569; font-size: 7.5pt; line-height: 1.1; }
    .dispatch { min-width: 31mm; padding: 3mm; align-self: flex-start; border: 2px solid #f97316; color: #c2410c; text-align: center; }.dispatch strong { display: block; font-size: 14pt; }.dispatch span { font-size: 7pt; font-weight: 700; }
    .recipient { flex: 1; margin: 7mm 0 4mm 18mm; }.recipient strong { font-size: 18pt; line-height: 1.05; text-transform: uppercase; }.recipient span { font-size: 13pt; line-height: 1.2; }.recipient b { margin-top: 1mm; font-size: 16pt; }.recipient em { margin-top: 1mm; color: #475569; font-size: 9pt; font-style: normal; }
    footer { display: flex; justify-content: space-between; align-items: end; gap: 6mm; padding-top: 4mm; border-top: 2px solid #0f172a; }.tracking { min-width: 58mm; padding: 2.5mm 4mm; border: 1px solid #94a3b8; text-align: center; }.tracking strong { font-family: 'Courier New', monospace; font-size: 11pt; }.items { max-width: 100%; margin: 2mm 0 0; overflow: hidden; color: #64748b; font-size: 6.5pt; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; }
    @media print { body { background: #fff; }.label { margin: 0; border: 0; } }
  </style></head><body>${pages}<script>window.onload = function () { window.focus(); window.print(); };</script></body></html>`;
}
