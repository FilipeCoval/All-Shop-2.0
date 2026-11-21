import type { Request, Response } from 'express';
import { db } from '../services/firebase-admin.js';

const normaliseOrderId = (value: unknown): string | null => {
  const id = String(value || '').trim().toUpperCase().replace(/^#+/, '');
  return /^AS-\d{6,12}$/.test(id) ? id : null;
};

const normaliseEmail = (value: unknown): string | null => {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const publicOrderView = (id: string, data: Record<string, any>) => ({
  id: String(data.id || id).replace(/^#+/, ''),
  date: typeof data.date === 'string' ? data.date : null,
  status: typeof data.status === 'string' ? data.status : 'Processamento',
  trackingNumber: typeof data.trackingNumber === 'string' ? data.trackingNumber : undefined,
  packages: Array.isArray(data.packages)
    ? data.packages.map((pkg: any) => ({
        id: String(pkg?.id || ''),
        trackingNumber: typeof pkg?.trackingNumber === 'string' ? pkg.trackingNumber : undefined,
        weight: Number.isFinite(Number(pkg?.weight)) ? Number(pkg.weight) : undefined,
        items: Array.isArray(pkg?.items)
          ? pkg.items.map((item: any) => ({
              productId: Number(item?.productId) || 0,
              selectedVariant: typeof item?.selectedVariant === 'string' ? item.selectedVariant : undefined,
              quantity: Math.max(1, Number(item?.quantity) || 1),
            }))
          : [],
      }))
    : [],
  items: Array.isArray(data.items)
    ? data.items.map((item: any) => {
        if (typeof item === 'string') return item;
        return {
          name: String(item?.name || 'Produto'),
          quantity: Math.max(1, Number(item?.quantity) || 1),
          selectedVariant: typeof item?.selectedVariant === 'string' ? item.selectedVariant : undefined,
        };
      })
    : [],
});

/**
 * Public order tracking uses order number + purchase email. It deliberately
 * returns only delivery/status data and never exposes address, phone, token,
 * payment, price or any other customer data.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!db) return res.status(503).json({ error: 'O rastreio está temporariamente indisponível. Tente novamente dentro de momentos.' });

  const orderId = normaliseOrderId(req.body?.orderId);
  const email = normaliseEmail(req.body?.email);
  if (!orderId || !email) return res.status(400).json({ error: 'Indique um número de encomenda válido e o email usado na compra.' });

  try {
    const directCandidates = await Promise.all([
      db.collection('orders').doc(orderId).get(),
      db.collection('orders').doc(`#${orderId}`).get(),
    ]);

    let match = directCandidates.find((snapshot) => {
      if (!snapshot.exists) return false;
      const storedEmail = String(snapshot.data()?.shippingInfo?.email || '').trim().toLowerCase();
      return storedEmail === email;
    });

    // Compatibility for older orders whose Firestore document ID differs from
    // the visible AS- number. Email is checked server-side before any result is returned.
    if (!match) {
      const legacy = await db.collection('orders').where('id', 'in', [orderId, `#${orderId}`]).limit(2).get();
      match = legacy.docs.find((snapshot) => String(snapshot.data()?.shippingInfo?.email || '').trim().toLowerCase() === email);
    }

    if (!match?.exists) {
      // Generic response prevents an attacker from checking whether an order ID exists.
      return res.status(404).json({ error: 'Encomenda não encontrada. Verifique o ID e o email associado.' });
    }

    return res.status(200).json({ success: true, order: publicOrderView(match.id, match.data() || {}) });
  } catch (error) {
    console.error('[track-order]', error);
    return res.status(500).json({ error: 'Não foi possível consultar a encomenda agora. Tente novamente.' });
  }
}
