import React from 'react';
import { createRoot } from 'react-dom/client';
import PreorderModal from '../components/PreorderModal';
import PreorderEditModal from '../components/PreorderEditModal';
import { PreordersSection } from '../src/features/admin/PreordersSection';
import '../src/index.css';
import '../src/styles/admin3.css';

const product = { id: 2, name: 'TV Box teste', price: 40, maxQuantityPerOrder: 3 } as any;
const secondProduct = { id: 3, name: 'Comando teste', price: 10, maxQuantityPerOrder: 2, preorder: { enabled: true, capacity: 2, reservedQuantity: 0, estimatedDispatchDate: '2099-12-20', paymentDeadlineHours: 48 } } as any;
product.preorder = { enabled: true, capacity: 3, reservedQuantity: 0, estimatedDispatchDate: '2099-12-10', paymentDeadlineHours: 48 };
const offer = { enabled: true, capacity: 3, reservedQuantity: 0, remaining: 3, variantCapacities: {}, reservedByVariant: {}, hasVariantCapacities: false, estimatedDispatchDate: '2099-12-10', depositPercent: 50, paymentDeadlineHours: 48, note: '' } as const;
const params = new URLSearchParams(location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');
const demoOrder = { id: 'AS-123456789012', date: '2026-11-18', total: 80, status: 'A confirmar', items: [{ productId: 2, name: 'TV Box teste', price: 40, quantity: 2, selectedVariant: '' }], shippingInfo: { name: 'Cliente de teste', email: 'test@example.invalid', deliveryMethod: 'Pickup' }, preorder: { kind: 'PREORDER', status: 'DEPOSIT_PENDING', capacityHeld: true, messagePending: true, depositDue: 40, balanceDue: 40, quantity: 2, depositDeadlineAt: '2099-12-20' } } as any;
createRoot(document.getElementById('root')!).render(params.has('admin')
  ? <main className="admin-content" style={{ margin: 0, padding: 16 }}><PreordersSection orders={[demoOrder]} search="" onOpen={() => { document.title = 'Detalhes abertos'; }} /></main>
  : params.has('edit') ? <PreorderEditModal order={demoOrder} products={[product, secondProduct]} onClose={() => { document.title = 'Edição guardada'; }} />
  : <PreorderModal product={product} allProducts={[product, secondProduct]} currentUser={null} offer={offer} remaining={3} onClose={() => { document.title = 'Fechado'; }} />);
