import type { Product } from '../../types/domain';

export type OrderStatus =
  | 'Pendente'
  | 'Processamento'
  | 'Pago'
  | 'Enviado'
  | 'Entregue'
  | 'Cancelado'
  | 'Reclamação'
  | 'Devolvido'
  | 'Levantamento em Loja';

export interface InventoryUnit {
  id?: string;
  serialNumber?: string;
  internalLabel?: string;
  barcode?: string;
  notes?: string;
  status?: string;
  addedAt?: string;
  reservedBy?: string;
  reservedUntil?: string;
  soldAt?: string;
  soldToOrder?: string;
  soldToCustomerName?: string;
  soldToCustomerEmail?: string;
}

export interface InventoryLot {
  id: string;
  publicProductId?: number;
  name: string;
  variant?: string;
  supplierName?: string;
  supplierOrderId?: string;
  purchaseDate?: string;
  quantityBought: number;
  quantitySold: number;
  purchasePrice?: number;
  salePrice?: number;
  status?: string;
  cashbackStatus?: string;
  cashbackValue?: number;
  cashbackPlatform?: string;
  cashbackExpectedDate?: string;
  cashbackPaidDate?: string;
  grossPurchaseTotal?: number;
  supplierShippingCost?: number;
  customsCost?: number;
  units?: InventoryUnit[];
}

export interface StockReservation {
  id: string;
  productId: number;
  variantName?: string;
  variantKey?: string;
  quantity: number;
  expiresAt: number | { seconds?: number; toMillis?: () => number };
}

export interface AdminOrderItem {
  productId?: number;
  name?: string;
  quantity?: number;
  price?: number;
  selectedVariant?: string;
  image?: string;
  unitIds?: string[];
  serialNumbers?: string[];
}

export interface AdminOrderPackage {
  id: string;
  trackingNumber?: string;
  weight?: number;
  items: AdminOrderItem[];
}

export interface AdminOrder {
  id: string;
  date?: string;
  total?: number;
  subtotal?: number;
  discountValue?: number;
  shippingCost?: number;
  storeShippingCost?: number;
  totalProductCost?: number;
  serialNumbersUsed?: string[];
  fulfillmentStatus?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  status: OrderStatus;
  stockDeducted?: boolean;
  shippingInfo?: {
    name?: string; email?: string; phone?: string; street?: string; doorNumber?: string;
    zip?: string; city?: string; paymentMethod?: string; deliveryMethod?: string;
  };
  items?: AdminOrderItem[];
  packages?: AdminOrderPackage[];
  trackingNumber?: string;
  statusHistory?: Array<{ status?: string; date?: string; notes?: string }>;
  cancellationRequest?: { status?: string; type?: string; reason?: string; requestedAt?: string };
  returnRequest?: { status?: string; reason?: string; requestedAt?: string; date?: string };
}

export interface AdminSnapshot {
  products: Product[];
  lots: InventoryLot[];
  reservations: StockReservation[];
  orders: AdminOrder[];
  users: AdminUser[];
  coupons: AdminCoupon[];
  tickets: SupportTicket[];
  imports: ImportShipment[];
  requests: ProductRequest[];
  categories: StoreCategory[];
  audit: AdminAuditEntry[];
}

export interface AdminUser {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  loyaltyPoints?: number;
  totalSpent?: number;
  isGuest?: boolean;
  fcmToken?: string;
  deviceTokens?: string[];
}

export interface AdminAuditEntry {
  id: string;
  action?: string;
  targetId?: string;
  adminEmail?: string;
  createdAt?: string | { seconds?: number; toDate?: () => Date };
}

export interface AdminCoupon {
  id: string;
  code?: string;
  type?: 'PERCENTAGE' | 'FIXED';
  value?: number;
  minPurchase?: number;
  isActive?: boolean;
  usageCount?: number;
  maxUsages?: number;
}

export interface SupportTicket {
  id: string;
  subject?: string;
  customerName?: string;
  customerEmail?: string;
  category?: string;
  status?: string;
  priority?: string;
  updatedAt?: string;
  unreadAdmin?: boolean;
}

export interface ImportShipment {
  id: string;
  name?: string;
  status?: 'GATHERING' | 'SHIPPED' | 'RECEIVED';
  agentShippingCost?: number;
  customsCost?: number;
  distributionMethod?: 'QUANTITY' | 'VALUE';
  purchaseCurrency?: 'EUR' | 'USD' | 'GBP' | 'CNY' | 'OTHER';
  actualPaidEur?: number;
  exchangeRate?: number;
  trackingNumber?: string;
  estimatedArrival?: string;
  notes?: string;
  orders?: ImportOrder[];
  createdAt?: string;
}

export interface ImportOrder {
  id: string;
  supplierName?: string;
  orderNumber?: string;
  localShippingCost?: number;
  items?: ImportItem[];
}

export interface ImportItem {
  id: string;
  publicProductId?: number;
  name?: string;
  variant?: string;
  quantity?: number;
  unitPrice?: number;
  purchaseTotal?: number;
  salePrice?: number;
  cashbackValue?: number;
  cashbackPlatform?: string;
  cashbackStatus?: 'NONE' | 'PENDING' | 'RECEIVED' | 'REJECTED';
  cashbackExpectedDate?: string;
}

export interface ProductRequest {
  id: string;
  productName?: string;
  userEmail?: string;
  category?: string;
  urgency?: string;
  status?: string;
  createdAt?: string;
}

export interface StoreCategory {
  id: string;
  name?: string;
  image?: string;
  order?: number;
}

export interface StockGroup {
  productId: number | null;
  name: string;
  lots: number;
  variants: string[];
  physical: number;
  reserved: number;
  available: number;
  sold: number;
  published: number;
  warnings: string[];
  lotItems: InventoryLot[];
}
