
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, TrendingUp, DollarSign, Package, AlertCircle, 
  Plus, Search, Edit2, Trash2, X, Sparkles, Link as LinkIcon,
  History, ShoppingCart, User as UserIcon, MapPin, BarChart2, TicketPercent, ToggleLeft, ToggleRight, Save, Bell, Truck, Globe, FileText, CheckCircle, Copy, Bot, Send, Users, Eye, AlertTriangle, Camera, Zap, ZapOff, QrCode, Home, ArrowLeft, RefreshCw, ClipboardEdit, MinusCircle, Calendar, Info, Database, UploadCloud, Tag, Image as ImageIcon, AlignLeft, ListPlus, ArrowRight as ArrowRightIcon, Layers, Lock, Unlock, CalendarClock, Upload, Loader2, ChevronDown, ChevronRight, ShieldAlert, XCircle, Mail, ScanBarcode, ShieldCheck, ZoomIn, BrainCircuit, Wifi, WifiOff, ExternalLink, Key as KeyIcon, Coins, Combine, Printer, Headphones, Wallet, AtSign, Scale, Calculator, Store, Settings, Megaphone, Smartphone, Timer, Volume2, VolumeX, BellRing, Wand2, Star, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInventory } from '../hooks/useInventory';
import { useStockReservations } from '../hooks/useStockReservations';
import { InventoryProduct, ProductStatus, CashbackStatus, SaleRecord, Order, Coupon, User as UserType, PointHistory, UserTier, ProductUnit, Product, OrderItem, SupportTicket, ProductVariant, StockReservation } from '../types';
import { extractSerialNumberFromImage, generateProductContent } from '../services/geminiService';
import { INITIAL_PRODUCTS, LOYALTY_TIERS, STORE_NAME } from '../constants';
import {   db, storage , modularDb } from '../services/firebaseConfig';
import { collection, doc, updateDoc, onSnapshot, query, orderBy, limit, doc as docRef, setDoc, deleteDoc, getDoc, runTransaction, arrayUnion, writeBatch, where, getDocs, addDoc } from 'firebase/firestore';
import { ref, deleteObject, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

import ClientDetailsModal from './ClientDetailsModal';
import ProfitCalculatorModal from './ProfitCalculatorModal';

import BarcodeScanner from './BarcodeScanner';

import OrderDetailsModal from './OrderDetailsModal';
import KpiCard from './KpiCard';
import InventoryTab from './InventoryTab';
import CatalogTab from './CatalogTab';
import CatalogModal from './CatalogModal';
import OrdersTab from './OrdersTab';
import ManualOrderModal from './ManualOrderModal';
import OrderFulfillmentModal from './OrderFulfillmentModal';
import ReportsTab from './ReportsTab';
import { ImportsTab } from './ImportsTab';
import SupportTicketModal from './SupportTicketModal';
import AnalyticsModal from './AnalyticsModal';
import CategoriesTab from './CategoriesTab';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { notifyNewOrder } from '../services/telegramNotifier';
import { supabaseSync } from '../services/supabaseSync';
import { isSupabaseEnabled } from '../services/supabaseConfig';
import OrderXRayModal from './OrderXRayModal';
import RequestsTab from './RequestsTab';

// --- HELPERS ---

// Extracted logic to limit rendering loop sizes and avoid crashes:
const getSafeItems = (items: any): (OrderItem | string)[] => {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') return [items];
    return [];
};

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

// --- DASHBOARD COMPONENT ---
interface DashboardProps {
    user: UserType | null;
    isAdmin: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ user, isAdmin }) => {
  const { products, loading, addProduct, updateProduct, deleteProduct } = useInventory(isAdmin);
  const { reservations } = useStockReservations();
  const { categories: storeCategories } = useStoreCategories();
  
  const notifiedOrders = useRef(new Set<string>());
  const isInitialLoadRef = useRef(true);

  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'coupons' | 'clients' | 'support' | 'marketing' | 'reports' | 'store_products' | 'imports' | 'catalog' | 'categories' | 'backups' | 'requests'>('inventory');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{current: string, progress: number} | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [selectedProductForSale, setSelectedProductForSale] = useState<InventoryProduct | null>(null);
  const [notifications, setNotifications] = useState<Order[]>([]);
  const [showToast, setShowToast] = useState<Order | null>(null);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [isOnlineDetailsOpen, setIsOnlineDetailsOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
  const [selectedOrderForFulfillment, setSelectedOrderForFulfillment] = useState<Order | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isCouponsLoading, setIsCouponsLoading] = useState(false);
  const [newCoupon, setNewCoupon] = useState<Coupon>({ code: '', type: 'PERCENTAGE', value: 10, minPurchase: 0, isActive: true, usageCount: 0, validProductId: undefined });
  const [publicProductsList, setPublicProductsList] = useState<Product[]>([]);

  const activeProducts = useMemo(() => {
    if (publicProductsList.length === 0) return products;

    return products
      .filter(p => p.publicProductId && publicProductsList.some(pub => String(pub.id) === String(p.publicProductId)))
      .map(p => {
        const pub = publicProductsList.find(pub => String(pub.id) === String(p.publicProductId));
        if (pub) {
          return {
            ...p,
            name: pub.name,
            category: pub.category,
            salePrice: pub.price,
            images: pub.images && pub.images.length > 0 ? pub.images : p.images,
          };
        }
        return p;
      });
  }, [products, publicProductsList]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'search' | 'add_unit' | 'sell_unit' | 'tracking' | 'verify_product'>('search');
  const [modalUnits, setModalUnits] = useState<ProductUnit[]>([]);
  const [manualUnitCode, setManualUnitCode] = useState('');
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // AI Generation State
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  
  // Sound State
  const [isSoundEnabled, setIsSoundEnabled] = useState(user?.notificationsEnabled !== undefined ? user.notificationsEnabled : true);

  useEffect(() => {
      if (user && user.notificationsEnabled !== undefined) {
          setIsSoundEnabled(user.notificationsEnabled);
      }
  }, [user?.notificationsEnabled]);

  const toggleSound = async () => {
      const newValue = !isSoundEnabled;
      setIsSoundEnabled(newValue);
      if (user) {
          try {
              await updateDoc(doc(modularDb, 'users', user.uid), {
                  notificationsEnabled: newValue
              });
          } catch (e) {
              console.error("Erro ao guardar preferência de som:", e);
          }
      }
  };
  
  // Notification Modal Data Updated Type
  const [notificationModalData, setNotificationModalData] = useState<{
      productName: string; 
      productId: number;
      subject: string; 
      body: string; 
      bcc: string; 
      alertsToDelete: any[];
      targetUserIds: string[]; // Lista de IDs de utilizadores para push
  } | null>(null);

  const [copySuccess, setCopySuccess] = useState('');
  const [linkedOrderId, setLinkedOrderId] = useState<string>('');
  const [selectedOrderForSaleDetails, setSelectedOrderForSaleDetails] = useState<Order | null>(null);
  const [selectedUnitsForSale, setSelectedUnitsForSale] = useState<string[]>([]);
  const [manualUnitSelect, setManualUnitSelect] = useState('');
  const [orderMismatchWarning, setOrderMismatchWarning] = useState<string | null>(null);
  const [securityCheckPassed, setSecurityCheckPassed] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  
  // Marketing / Push Form State
  const [pushForm, setPushForm] = useState({ title: '', body: '', target: 'all', image: '' });
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Manual Order Modal State
  const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
  
  const handleSyncPublicStore = async () => {
    if (!window.confirm("Esta ação irá reconstruir todos os produtos públicos com base no seu Gestor de Inventário. Deseja continuar?")) return;
    
    setSyncStatus({ current: 'Sincronizando loja com o inventário...', progress: 10 });
    try {
        const invQ = await getDocs(collection(modularDb, 'products_inventory'));
        const publicIds = new Set<number>();
        
        invQ.docs.forEach(d => {
            const data = d.data();
            if (data.publicProductId) {
                publicIds.add(Number(data.publicProductId));
            }
        });
        
        let i = 0;
        for (const pid of Array.from(publicIds)) {
            // Re-trigger stock sync, which will also recreate missing products because of our previous fix
            await updateDoc(doc(modularDb, 'products_inventory', invQ.docs[0].id), { _lastSync: Date.now() }); // dummy update to force refresh
            const pIdNum = Number(pid);
            if (!isNaN(pIdNum)) {
               const pds = await getDocs(query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', pIdNum)));
               if (!pds.empty) {
                   await updateProduct(pds.docs[0].id, { _lastSync: Date.now() } as any); // This triggers refreshPublicProductStock internally!
               }
            }
            i++;
            setSyncStatus({ current: `A reconstruir produto ${i}/${publicIds.size}`, progress: 10 + Math.round((i / publicIds.size) * 80) });
        }
        
        setSyncStatus({ current: 'Loja Sincronizada com Sucesso!', progress: 100 });
        setTimeout(() => setSyncStatus(null), 3000);
        window.location.reload();
    } catch (e) {
        console.error("Erro na sincronização:", e);
        alert("Erro ao sincronizar loja.");
        setSyncStatus(null);
    }
  };

  const handleSyncAllData = async () => {
    if (!isSupabaseEnabled()) {
        alert("O Supabase não está configurado. Adicione as chaves VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nos segredos antes de sincronizar.");
        return;
    }
    if (!window.confirm("Esta ação irá enviar TODOS os dados atuais do Firebase para o Supabase. Deseja continuar?")) return;
    
    setIsSyncingAll(true);
    setSyncStatus({ current: 'Iniciando sincronização...', progress: 0 });

    try {
      // 1. Sync Products (Catalog)
      setSyncStatus({ current: 'Sincronizando Catálogo de produtos...', progress: 10 });
      const productsSnap = await getDocs(collection(modularDb, 'products_public'));
      
      const productItems = productsSnap.docs.map(doc => {
          const data = doc.data();
          const docIdNum = parseInt(doc.id, 10);
          const productId = (data.id !== undefined && data.id !== null) ? Number(data.id) : (isNaN(docIdNum) ? null : docIdNum);
          
          if (productId === null) {
              console.warn(`Sincronização: Documento ${doc.id} ignorado por falta de ID numérico.`);
              return null;
          }
          return { ...data, id: productId } as Product;
      }).filter(p => p !== null) as Product[];

      for (let i = 0; i < productItems.length; i++) {
        await supabaseSync.saveProduct(productItems[i]);
        setSyncStatus({ current: `Sincronizando Produtos: ${i + 1}/${productItems.length}`, progress: 10 + (Math.round((i / productItems.length) * 30)) });
      }

      // 2. Sync Users
      setSyncStatus({ current: 'Sincronizando Clientes...', progress: 40 });
      const usersSnap = await getDocs(collection(modularDb, 'users'));
      const userItems = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType));
      for (let i = 0; i < userItems.length; i++) {
        await supabaseSync.saveUser(userItems[i]);
        setSyncStatus({ current: `Sincronizando Clientes: ${i + 1}/${userItems.length}`, progress: 40 + (Math.round((i / userItems.length) * 30)) });
      }

      // 3. Sync Orders
      setSyncStatus({ current: 'Sincronizando Encomendas...', progress: 70 });
      const ordersSnap = await getDocs(collection(modularDb, 'orders'));
      const orderItems = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      for (let i = 0; i < orderItems.length; i++) {
        await supabaseSync.saveOrder(orderItems[i]);
        setSyncStatus({ current: `Sincronizando Encomendas: ${i + 1}/${orderItems.length}`, progress: 70 + (Math.round((i / orderItems.length) * 30)) });
      }

      setSyncStatus({ current: 'Sincronização concluída com sucesso!', progress: 100 });
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (error) {
      console.error("Erro na sincronização manual:", error);
      alert("Erro ao sincronizar dados. Verifique a consola.");
      setSyncStatus(null);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const [salesSearchTerm, setSalesSearchTerm] = useState('');
  const [detailsModalData, setDetailsModalData] = useState<{ title: string; data: any[]; columns: { header: string; accessor: string | ((item: any) => React.ReactNode); }[]; total: number } | null>(null);
  const [isPublicIdEditable, setIsPublicIdEditable] = useState(false);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [clientsSearchTerm, setClientsSearchTerm] = useState('');
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [generateQty, setGenerateQty] = useState(1);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isXRayModalOpen, setIsXRayModalOpen] = useState(false);
  
  const [isCashbackManagerOpen, setIsCashbackManagerOpen] = useState(false);
  const [cashbackManagerFilter, setCashbackManagerFilter] = useState<'ALL' | 'PENDING'>('PENDING');
  const [expandedCashbackAccounts, setExpandedCashbackAccounts] = useState<string[]>([]);

  const [selectedUserDetails, setSelectedUserDetails] = useState<UserType | null>(null);
  const [isSyncingStock, setIsSyncingStock] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isTicketsLoading, setIsTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const [inventorySearchTerm, setInventorySearchTerm] = useState('');

  // Coupon Calculator State
  const [couponCalcOriginal, setCouponCalcOriginal] = useState('');
  const [couponCalcTarget, setCouponCalcTarget] = useState('');

  const couponCalcResult = useMemo(() => {
      const orig = parseFloat(couponCalcOriginal);
      const target = parseFloat(couponCalcTarget);
      if (isNaN(orig) || isNaN(target) || orig <= 0) return null;
      const diff = orig - target;
      if (diff <= 0) return { fixed: 0, percent: 0 };
      const percent = (diff / orig) * 100;
      return { fixed: diff, percent: percent };
  }, [couponCalcOriginal, couponCalcTarget]);

  const [formData, setFormData] = useState({
    name: '', description: '', category: '', publicProductId: '' as string, variant: '',
    purchaseDate: new Date().toISOString().split('T')[0], supplierName: '', supplierOrderId: '', 
    quantityBought: '', purchasePrice: '', salePrice: '', targetSalePrice: '', originalPrice: '', promoEndsAt: '',
    cashbackValue: '', cashbackStatus: 'NONE' as CashbackStatus, cashbackPlatform: '', cashbackAccount: '', cashbackExpectedDate: '',
    badges: [] as string[], newImageUrl: '', 
    images: [] as string[], features: [] as string[], newFeature: '', comingSoon: false,
    weight: '', specs: {} as Record<string, string | boolean>, newSpecKey: '', newSpecValue: ''
  });

  const selectedPublicProductVariants = useMemo(() => { if (!formData.publicProductId) return []; const prod = publicProductsList.find(p => p.id === Number(formData.publicProductId)); return prod?.variants || []; }, [formData.publicProductId, publicProductsList]);
  const [saleForm, setSaleForm] = useState({ quantity: '1', unitPrice: '', shippingCost: '', date: new Date().toISOString().split('T')[0], notes: '', supplierName: '', supplierOrderId: '' });
  const pendingOrders = useMemo(() => allOrders.filter(o => {
    const isCancelled = ['Cancelado', 'Devolvido', 'Reclamação'].includes(o.status);

    // Se o stock já foi deduzido (ex: em encomendas manuais), não deve contar como "pendente" para o cálculo de stock disponível
    if (o.stockDeducted === true) return false;

    // "stockDeducted" means public stock was deduced at checkout, but back-office quantitySold may not be.
    const isFulfilled = o.fulfillmentStatus === 'COMPLETED' || 
                        (o.fulfillmentStatus === undefined && ['Enviado', 'Entregue'].includes(o.status));
    
    return !isCancelled && !isFulfilled;
  }), [allOrders]);
  
  const groupedCashback = useMemo(() => {
      const pendingItems = activeProducts.filter(p => p.cashbackValue > 0 && (cashbackManagerFilter === 'ALL' || p.cashbackStatus === cashbackManagerFilter));
      
      const groups: Record<string, { total: number, items: InventoryProduct[] }> = {};
      
      pendingItems.forEach(item => {
          const account = item.cashbackAccount || 'Sem Conta Definida';
          if (!groups[account]) groups[account] = { total: 0, items: [] };
          groups[account].items.push(item);
          groups[account].total += item.cashbackValue;
      });

      return groups;
  }, [activeProducts, cashbackManagerFilter]);


  const [editingStoreProduct, setEditingStoreProduct] = useState<Product | null>(null);





  // EFFECTS
  useEffect(() => { if (activeTab === 'support' && isAdmin) { setIsTicketsLoading(true); const unsubscribe = onSnapshot(query(collection(modularDb, 'support_tickets'), orderBy('createdAt', 'desc')), snapshot => { setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket))); setIsTicketsLoading(false); }); return () => unsubscribe(); } }, [activeTab, isAdmin]);
  
  useEffect(() => { if (linkedOrderId) { const order = allOrders.find(o => o.id === linkedOrderId); setSelectedOrderForSaleDetails(order || null); if (selectedProductForSale && order) { const safeItems = getSafeItems(order.items); const isCompatible = safeItems.some(item => { if (typeof item === 'string') return false; const idMatch = item.productId === selectedProductForSale.publicProductId; if (!idMatch) return false; const inventoryHasVariant = !!selectedProductForSale.variant; const orderHasVariant = !!item.selectedVariant; if (inventoryHasVariant && orderHasVariant) return item.selectedVariant === selectedProductForSale.variant; if (!inventoryHasVariant && !orderHasVariant) return true; if (!inventoryHasVariant && orderHasVariant) return false; if (inventoryHasVariant && !orderHasVariant) return true; return false; }); if (!isCompatible) setOrderMismatchWarning("ATENÇÃO: Este produto NÃO consta na encomenda selecionada!"); else setOrderMismatchWarning(null); if (order) { const item = safeItems.find(i => typeof i !== 'string' && i.productId === selectedProductForSale.publicProductId) as OrderItem | undefined; if (item) { setSaleForm(prev => ({ ...prev, unitPrice: item.price.toString() })); } } } } else { setSelectedOrderForSaleDetails(null); setOrderMismatchWarning(null); } }, [linkedOrderId, allOrders, selectedProductForSale]);
  
  // --- ORDER NOTIFICATION LISTENER ---
  useEffect(() => { 
      if(!isAdmin) return; 
      
      const ordersQuery = query(collection(modularDb, 'orders'), orderBy('date', 'desc'), limit(10));
      
      const unsubscribe = onSnapshot(ordersQuery, snapshot => { 
          if (isInitialLoadRef.current) {
              snapshot.forEach(doc => {
                  const orderData = doc.data() as Order;
                  if (orderData.status !== 'Pendente') {
                      notifiedOrders.current.add(doc.id);
                  }
              });
              // Só marca como carregado se já veio do servidor, ou se formos forçados pela cache a achar que é "completo"
              if (!snapshot.metadata.fromCache) {
                  isInitialLoadRef.current = false;
              }
              return;
          }

          snapshot.docChanges().forEach(change => { 
                const order = change.doc.data() as Order;
                
                // 1. Notificar se for encomenda NOVA e já não for pendente (ex: manual)
                // Não notificar se a encomenda for muito antiga (mais de 2 horas), para evitar spam
                const orderDate = new Date(order.date).getTime();
                const isRecent = order.date ? (Date.now() - orderDate < 7200000) : false; // 2 horas
                
                const isNewReal = change.type === 'added' && order.status !== 'Pendente' && isRecent;
                // 2. Notificar se for uma encomenda que foi AGORA confirmada pelo cliente
                const isNowConfirmed = change.type === 'modified' && order.status === 'Processamento' && isRecent;

                console.log(`Order check: ${order.id}, type: ${change.type}, status: ${order.status}, isRecent: ${isRecent}, isNewReal: ${isNewReal}, isNowConfirmed: ${isNowConfirmed}, notified: ${notifiedOrders.current.has(order.id)}`);

                if ((isNewReal || isNowConfirmed) && !notifiedOrders.current.has(order.id)) {
                      notifiedOrders.current.add(order.id);
                      
                      // Evitar duplicados no array de notificações da UI
                      setNotifications(prev => {
                          if (prev.some(n => n.id === order.id)) return prev;
                          return [order, ...prev];
                      });
                      
                      setShowToast(order); 

                      // Native Browser Notification
                      if ("Notification" in window) {
                          if (Notification.permission === "granted") {
                              new Notification("Nova Encomenda!", {
                                  body: `Encomenda #${order.id.slice(-5)} de ${order.shippingInfo.name || 'Cliente'} - Estado: ${order.status}`,
                              });
                          } else if (Notification.permission !== "denied") {
                              Notification.requestPermission();
                          }
                      }
                      
                      // Tocar som se ativado
                      if (isSoundEnabled) {
                          try {
                              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                              if (AudioContextClass) {
                                  const audioCtx = new AudioContextClass();
                                  const oscillator = audioCtx.createOscillator();
                                  const gainNode = audioCtx.createGain();
                                  
                                  oscillator.type = 'bell' as any || 'sine'; // Fallback to sine if not supported
                                  oscillator.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6 Note
                                  oscillator.frequency.exponentialRampToValueAtTime(1318.51, audioCtx.currentTime + 0.1); // E6 Note
                                  
                                  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                                  gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05);
                                  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
                                  
                                  oscillator.connect(gainNode);
                                  gainNode.connect(audioCtx.destination);
                                  
                                  oscillator.start(audioCtx.currentTime);
                                  oscillator.stop(audioCtx.currentTime + 0.8);
                              }
                          } catch (e) {
                              console.warn("Audio Context playback failed:", e);
                          }
                      }

                      setTimeout(() => setShowToast(null), 8000); 
                } 
          }); 
      }); 

      return () => unsubscribe(); 
  }, [isAdmin, isSoundEnabled]);

  useEffect(() => { if (!isAdmin) return; const unsubscribe = onSnapshot(collection(modularDb, 'products_public'), snap => { const loadedProducts: Product[] = []; snap.forEach(doc => { const id = parseInt(doc.id, 10); const data = doc.data(); if (!isNaN(id)) loadedProducts.push({ ...data, id: data.id || id } as Product); }); setPublicProductsList(loadedProducts); }); return () => unsubscribe(); }, [isAdmin]);
  useEffect(() => { if(!isAdmin) return; const unsubscribe = onSnapshot(collection(modularDb, 'online_users'), snapshot => { const now = Date.now(); const activeUsers: any[] = []; snapshot.forEach(doc => { const data = doc.data(); if (data && typeof data.lastActive === 'number' && (now - data.lastActive < 30000)) { activeUsers.push({ id: doc.id, ...data }); } }); setOnlineUsers(activeUsers); }); return () => unsubscribe(); }, [isAdmin]);
  useEffect(() => { if(!isAdmin) return; const ordersQuery = query(collection(modularDb, 'orders'), orderBy('date', 'desc')); const unsubscribe = onSnapshot(ordersQuery, snapshot => { setAllOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order))); setIsOrdersLoading(false); }); return () => unsubscribe(); }, [isAdmin]);
  
  useEffect(() => { 
      // Carregar utilizadores sempre que precisarmos de dados para notificações ou gestão
      if (isAdmin) { 
          setIsUsersLoading(true); 
          const unsubscribeUsers = onSnapshot(collection(modularDb, 'users'), snapshot => { 
              setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserType))); 
              setIsUsersLoading(false); 
          }); 
          
          let unsubscribeCoupons = () => {};
          if(activeTab === 'coupons') {
              setIsCouponsLoading(true);
              unsubscribeCoupons = onSnapshot(collection(modularDb, 'coupons'), snapshot => { 
                  const allCoupons = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()})) as Coupon[];
                  // Filtrar cupões de clientes (que têm userId) para mostrar apenas campanhas
                  const adminCoupons = allCoupons.filter(c => !c.userId);
                  setCoupons(adminCoupons); 
                  setIsCouponsLoading(false); 
              });
          }
          
          return () => { unsubscribeUsers(); unsubscribeCoupons(); };
      } 
  }, [activeTab, isAdmin]);
  
  useEffect(() => { if (!isAdmin) return; const unsubscribe = onSnapshot(collection(modularDb, 'stock_alerts'), snapshot => { const alerts: any[] = []; snapshot.forEach(doc => alerts.push({ id: doc.id, ...doc.data() })); setStockAlerts(alerts); }); return () => unsubscribe(); }, [isAdmin]);

  // HANDLERS
  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); return true; };
  const handleCopy = (text: string) => { if (copyToClipboard(text)) { setCopySuccess('Copied'); setTimeout(() => setCopySuccess(''), 2000); } else alert("Não foi possível copiar."); };
  const handleCopyToClipboard = (text: string, type: string) => { if (copyToClipboard(text)) { setCopySuccess(type); setTimeout(() => setCopySuccess(''), 2000); } else alert("Não foi possível copiar."); };

  // ... (Manual Order & Push Functions remain the same) ...
  const handleManualOrderConfirm = async (order: Order, deductions: { batchId: string, quantity: number, saleRecord: SaleRecord }[]) => {
      try {
        await setDoc(doc(modularDb, 'orders', order.id), order);

        for (const ded of deductions) {
            const product = products.find(p => p.id === ded.batchId);
            if (product) {
                const newSold = (product.quantitySold || 0) + ded.quantity;
                const status: ProductStatus = newSold >= product.quantityBought ? 'SOLD' : 'PARTIAL';
                await updateProduct(product.id, { quantitySold: newSold, status: status, salesHistory: [...(product.salesHistory || []), ded.saleRecord] });
            }
        }
        setIsManualOrderModalOpen(false);
        alert("Encomenda manual registada com sucesso!");
      } catch (error) { console.error("Erro ao criar encomenda manual:", error); alert("Erro ao processar a encomenda."); }
  };

  const handleSendPush = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pushForm.title || !pushForm.body) return alert("Preencha título e mensagem.");
      setIsSendingPush(true); setPushResult(null);
      try {
          const response = await fetch('/api/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pushForm) });
          const data = await response.json();
          if (response.ok && data.success) { 
              let msg = `Sucesso! Enviado para ${data.sentCount} dispositivos.`;
              if (data.failureCount > 0) msg += ` (${data.failureCount} falhas: ${data.failedTokens.join(', ')})`;
              setPushResult({ success: true, msg }); 
              setPushForm({ title: '', body: '', target: 'all', image: '' }); 
          } else { 
              setPushResult({ success: false, msg: data.error || data.details || 'Erro desconhecido ao enviar.' }); 
          }
      } catch (err) { console.error(err); setPushResult({ success: false, msg: 'Erro de comunicação com o servidor.' }); } finally { setIsSendingPush(false); }
  };

  const handleSendPushToWaitingList = async () => {
      if (!notificationModalData || notificationModalData.targetUserIds.length === 0) return;
      setIsSendingPush(true);
      try {
          const response = await fetch('/api/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Produto Disponível! 📦', body: `${notificationModalData.productName} acabou de chegar ao stock! Compre antes que esgote.`, target: 'segment', userIds: notificationModalData.targetUserIds, link: `https://www.all-shop.net/#product/${notificationModalData.productId}` }) });
          const data = await response.json();
          if(data.success) { 
              let msg = `Enviado para ${data.sentCount} utilizadores interessados!`;
              if (data.failureCount > 0) msg += ` (${data.failureCount} falhas).`;
              alert(msg);
          } else { alert("Erro ao enviar: " + (data.error || 'Desconhecido')); }
      } catch (e) { alert("Erro de comunicação."); } finally { setIsSendingPush(false); }
  };

  // ... (Other handlers like stock alerts and product submit remain the same) ...
  const checkAndProcessStockAlerts = async (publicProductId: number | null, productName: string, newStock: number) => {
      if (!publicProductId) return;
      try {
          const alertsQuery = query(collection(modularDb, 'stock_alerts'), where('productId', '==', publicProductId));
          const snapshot = await getDocs(alertsQuery);
          if (snapshot.empty) { if (newStock === 999) alert("Não existem clientes na lista de espera para este produto."); return; }
          const alerts = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
          const emails = alerts.map((a: any) => a.email);
          const uniqueEmails = [...new Set(emails)];
          let targetUserIds: string[] = [];
          if (allUsers.length > 0) { 
              targetUserIds = allUsers.filter(u => uniqueEmails.includes(u.email)).map(u => u.uid); 
          } else { 
              const limitEmails = uniqueEmails.slice(0, 10); 
              if (limitEmails.length > 0) { 
                  const usersQuery = await getDocs(query(collection(modularDb, 'users'), where('email', 'in', limitEmails))); 
                  usersQuery.forEach(docSnap => targetUserIds.push(docSnap.id)); 
              } 
          }
          const bccString = uniqueEmails.join(', ');
          setNotificationModalData({ productName: productName, productId: publicProductId, subject: `Chegou: ${productName} já disponível na All-Shop!`, body: `Olá,\n\nO produto que aguardava (${productName}) acabou de chegar ao nosso stock!\n\nPode comprar agora em: https://www.all-shop.net/#product/${publicProductId}\n\nObrigado,\nEquipa All-Shop`, bcc: bccString, alertsToDelete: alerts, targetUserIds: targetUserIds });
      } catch (error) { console.error("Erro ao processar alertas de stock:", error); }
  };

  const handleGenerateDescription = async () => {
      if (!formData.name || !formData.category) {
          alert("Preencha o Nome e Categoria primeiro.");
          return;
      }
      setIsGeneratingContent(true);
      const content = await generateProductContent(formData.name, formData.category);
      if (content) {
          setFormData(prev => ({
              ...prev,
              description: content.description,
              features: [...prev.features, ...content.features]
          }));
      } else {
          alert("Não foi possível gerar a descrição. Tente novamente.");
      }
      setIsGeneratingContent(false);
  };

  // Store Product Management Helpers


  const handleProductSubmit = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (selectedPublicProductVariants.length > 0 && !formData.variant) return alert("Selecione a variante."); 
      const qBought = Number(formData.quantityBought) || 0; 
      const existingProduct = products.find(p => p.id === editingId); 
      const currentSold = existingProduct ? existingProduct.quantitySold : 0; 
      const availableStock = Math.max(0, qBought - currentSold);
      const currentSalePrice = formData.salePrice ? Number(formData.salePrice) : 0; 
      let productStatus: ProductStatus = 'IN_STOCK'; 
      if (currentSold >= qBought && qBought > 0) productStatus = 'SOLD'; 
      else if (currentSold > 0) productStatus = 'PARTIAL'; 
      
      const payload: any = { name: formData.name, description: formData.description, category: formData.category, publicProductId: formData.publicProductId !== '' && formData.publicProductId !== null ? Number(formData.publicProductId) : null, variant: formData.variant || null, purchaseDate: formData.purchaseDate, supplierName: formData.supplierName, supplierOrderId: formData.supplierOrderId, quantityBought: qBought, quantitySold: currentSold, salesHistory: (existingProduct && Array.isArray(existingProduct.salesHistory)) ? existingProduct.salesHistory : [], purchasePrice: Number(formData.purchasePrice) || 0, targetSalePrice: formData.targetSalePrice ? Number(formData.targetSalePrice) : null, salePrice: currentSalePrice, originalPrice: formData.originalPrice ? Number(formData.originalPrice) : null, promoEndsAt: formData.promoEndsAt || null, cashbackValue: Number(formData.cashbackValue) || 0, cashbackStatus: formData.cashbackStatus, cashbackPlatform: formData.cashbackPlatform, cashbackAccount: formData.cashbackAccount, cashbackExpectedDate: formData.cashbackExpectedDate, units: modalUnits, status: productStatus, badges: formData.badges, images: formData.images, features: formData.features, comingSoon: formData.comingSoon, weight: formData.weight ? parseFloat(formData.weight) : 0, specs: formData.specs }; 
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]); 
      
      try { 
          if (editingId) {
              await updateProduct(editingId, payload);
          } else {
              await addProduct(payload); 
          }
          setIsModalOpen(false); 
          if (payload.publicProductId && availableStock > 0 && !payload.comingSoon) { await checkAndProcessStockAlerts(payload.publicProductId, payload.name, availableStock); }
      } catch (err) { alert('Erro ao guardar.'); } 
  };
  
    
  const handleEdit = (product: InventoryProduct) => { 
    setEditingId(product.id); 
    setFormData({ 
        name: product.name, description: product.description || '', category: product.category, 
        publicProductId: product.publicProductId ? product.publicProductId.toString() : '', 
        variant: product.variant || '', purchaseDate: product.purchaseDate, 
        supplierName: product.supplierName || '', supplierOrderId: product.supplierOrderId || '', 
        quantityBought: product.quantityBought.toString(), purchasePrice: product.purchasePrice.toString(), 
        salePrice: product.salePrice ? product.salePrice.toString() : '', 
        targetSalePrice: product.targetSalePrice ? product.targetSalePrice.toString() : '', 
        originalPrice: product.originalPrice ? product.originalPrice.toString() : '', 
        promoEndsAt: product.promoEndsAt || '', cashbackValue: product.cashbackValue.toString(), 
        cashbackStatus: product.cashbackStatus, cashbackPlatform: product.cashbackPlatform || '', 
        cashbackAccount: product.cashbackAccount || '', cashbackExpectedDate: product.cashbackExpectedDate || '', 
        badges: product.badges || [], images: product.images || [], newImageUrl: '', 
        features: product.features || [], newFeature: '', comingSoon: product.comingSoon || false, 
        weight: product.weight ? product.weight.toString() : '', specs: product.specs || {}, 
        newSpecKey: '', newSpecValue: '' 
    }); 
    
    if (product.publicProductId) {
        const publicProd = publicProductsList.find(p => p.id === Number(product.publicProductId));
        if (publicProd) setEditingStoreProduct(publicProd);
        else setEditingStoreProduct(null);
    } else {
        setEditingStoreProduct(null);
    }

    setModalUnits(product.units || []); 
    setGeneratedCodes([]); 
    setIsPublicIdEditable(false); 
    setIsModalOpen(true); 
  };
  const handleAddNew = () => { setEditingId(null); setFormData({ name: '', description: '', category: 'TV Box', publicProductId: '', variant: '', purchaseDate: new Date().toISOString().split('T')[0], supplierName: '', supplierOrderId: '', quantityBought: '', purchasePrice: '', salePrice: '', targetSalePrice: '', originalPrice: '', promoEndsAt: '', cashbackValue: '', cashbackStatus: 'NONE', cashbackPlatform: '', cashbackAccount: '', cashbackExpectedDate: '', badges: [], images: [], newImageUrl: '', features: [], newFeature: '', comingSoon: false, weight: '', specs: {}, newSpecKey: '', newSpecValue: '' }); setModalUnits([]); setGeneratedCodes([]); setIsPublicIdEditable(false); setIsModalOpen(true); };
  const handleCreateVariant = (parentProduct: InventoryProduct) => { setEditingId(null); setFormData({ name: parentProduct.name, description: parentProduct.description || '', category: parentProduct.category, publicProductId: parentProduct.publicProductId ? parentProduct.publicProductId.toString() : '', variant: '', purchaseDate: new Date().toISOString().split('T')[0], supplierName: parentProduct.supplierName || '', supplierOrderId: '', quantityBought: '', purchasePrice: parentProduct.purchasePrice.toString(), salePrice: parentProduct.salePrice ? parentProduct.salePrice.toString() : '', targetSalePrice: parentProduct.targetSalePrice ? parentProduct.targetSalePrice.toString() : '', originalPrice: parentProduct.originalPrice ? parentProduct.originalPrice.toString() : '', promoEndsAt: parentProduct.promoEndsAt || '', cashbackValue: '', cashbackStatus: 'NONE', cashbackPlatform: '', cashbackAccount: '', cashbackExpectedDate: '', badges: parentProduct.badges || [], images: parentProduct.images || [], newImageUrl: '', features: parentProduct.features || [], newFeature: '', comingSoon: parentProduct.comingSoon || false, weight: parentProduct.weight ? parentProduct.weight.toString() : '', specs: parentProduct.specs || {}, newSpecKey: '', newSpecValue: '' }); setModalUnits([]); setGeneratedCodes([]); setIsPublicIdEditable(false); setIsModalOpen(true); };
  const handleDelete = async (id: string) => { if (!id) return; if (window.confirm('Apagar registo?')) { try { await deleteProduct(id); } catch (error: any) { alert("Erro: " + error.message); } } };
  const handleDeleteGroup = async (groupId: string, items: InventoryProduct[]) => { 
      if (!window.confirm(`Apagar grupo "${items[0].name}" e ${items.length} lotes?`)) return; 
      try { 
          const batch = writeBatch(modularDb); 
          items.forEach(item => batch.delete(doc(modularDb, 'products_inventory', item.id))); 
          if (items[0].publicProductId) {
              const publicQuery = query(collection(modularDb, 'products_public'), where('id', '==', Number(items[0].publicProductId)), limit(1));
              const publicSnap = await getDocs(publicQuery);
              if (!publicSnap.empty) {
                  batch.delete(publicSnap.docs[0].ref);
              }
          }
          await batch.commit(); 
      } catch (e) { alert("Erro ao apagar grupo."); } 
  };
  const openSaleModal = (product: InventoryProduct) => { setSelectedProductForSale(product); setSaleForm({ quantity: '1', unitPrice: product.salePrice ? product.salePrice.toString() : product.targetSalePrice ? product.targetSalePrice.toString() : '', shippingCost: '', date: new Date().toISOString().split('T')[0], notes: '', supplierName: product.supplierName || '', supplierOrderId: product.supplierOrderId || '' }); setSelectedUnitsForSale([]); setLinkedOrderId(''); setSelectedOrderForSaleDetails(null); setOrderMismatchWarning(null); setSecurityCheckPassed(false); setVerificationCode(''); setIsSaleModalOpen(true); };
  const handleDeleteSale = async (saleId: string, isOnline: boolean = false) => { 
    if(!editingId || !window.confirm("Anular venda e repor stock?")) return; 
    
    try {
      await runTransaction(modularDb, async (transaction) => {
        const productRef = doc(modularDb, 'products_inventory', editingId);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) throw new Error("Produto não encontrado.");
        
        const productData = productDoc.data() as InventoryProduct;
        const product = { ...productData, id: productDoc.id } as InventoryProduct;
        let newSold = product.quantitySold || 0;
        let newHistory = product.salesHistory || [];
        let newUnits = [...(product.units || [])];
        let quantityToRestock = 0;

        if (!isOnline) {
          const sale = product.salesHistory?.find(s => s.id === saleId);
          if(!sale) throw new Error("Registo de venda manual não encontrado.");
          quantityToRestock = sale.quantity;
          newHistory = newHistory.filter(s => s.id !== saleId);
          
          if (sale.serialNumbers && sale.serialNumbers.length > 0) {
            newUnits = newUnits.map(u => sale.serialNumbers?.includes(u.id) ? { ...u, status: 'AVAILABLE' as const } : u);
          }
        } else {
          const orderRef = doc(modularDb, 'orders', saleId);
          const orderDoc = await transaction.get(orderRef);
          if (!orderDoc.exists()) throw new Error("Encomenda não encontrada no sistema.");
          const orderData = orderDoc.data() as Order;
          const order = { ...orderData, id: orderDoc.id } as Order;
          
          const safeItems = getSafeItems(order.items);
          const relevantItems = safeItems.filter(item => 
            typeof item !== 'string' && 
            item.productId?.toString() === product.publicProductId?.toString() && 
            (!product.variant || item.selectedVariant === product.variant)
          ) as OrderItem[];

          quantityToRestock = relevantItems.reduce((acc, i) => acc + i.quantity, 0);
          
          const serialsToRevert: string[] = [];
          relevantItems.forEach(i => {
              if (i.serialNumbers) serialsToRevert.push(...i.serialNumbers);
              if (i.unitIds) serialsToRevert.push(...i.unitIds);
          });
          
          if (serialsToRevert.length > 0) {
            newUnits = newUnits.map(u => serialsToRevert.includes(u.id) ? { ...u, status: 'AVAILABLE' as const } : u);
          }

          transaction.update(orderRef, {
              status: 'Pago',
              stockDeducted: false,
              fulfilledAt: null,
              fulfilledBy: null,
              fulfillmentStatus: 'PENDING',
              serialNumbersUsed: [],
              pointsAwarded: false,
              items: order.items.map(item => {
                  if (typeof item === 'string') return item;
                  const i = item as OrderItem;
                  if (i.productId?.toString() === product.publicProductId?.toString() && (!product.variant || i.selectedVariant === product.variant)) {
                      return { ...i, serialNumbers: [], unitIds: [] };
                  }
                  return i;
              })
          });
        }

        newSold = Math.max(0, newSold - quantityToRestock);
        const newStatus = newSold >= (product.quantityBought || 0) ? 'SOLD' : newSold > 0 ? 'PARTIAL' : 'IN_STOCK'; 
        
        transaction.update(productRef, { 
          quantitySold: newSold, 
          salesHistory: newHistory, 
          status: newStatus as ProductStatus, 
          units: newUnits 
        });
      });
      
      alert("Venda anulada e stock reposto com sucesso!");
    } catch(e: any) { 
        console.error("Erro ao anular:", e);
        alert("Erro ao anular venda: " + e.message); 
    } 
  };
  const handleSaleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!selectedProductForSale) return; const qty = parseInt(saleForm.quantity) || 1; const price = parseFloat(saleForm.unitPrice) || 0; const shipping = parseFloat(saleForm.shippingCost) || 0; const newSale: SaleRecord = { id: `MANUAL-${Date.now()}`, date: saleForm.date, quantity: qty, unitPrice: price, shippingCost: shipping, notes: saleForm.notes, serialNumbers: selectedUnitsForSale };    try { 
        const currentSold = (selectedProductForSale.quantitySold || 0) + qty; 
        const status = currentSold >= selectedProductForSale.quantityBought ? 'SOLD' : 'PARTIAL'; 
        let updatedUnits = selectedProductForSale.units || []; 
        if (selectedUnitsForSale.length > 0) { 
            updatedUnits = updatedUnits.map(u => selectedUnitsForSale.includes(u.id) ? { ...u, status: 'SOLD' as const } : u); 
        } 
        await updateProduct(selectedProductForSale.id, { quantitySold: currentSold, salesHistory: [...(selectedProductForSale.salesHistory || []), newSale], status: status as ProductStatus, units: updatedUnits }); 
        if (linkedOrderId) { 
            const orderRef = doc(modularDb, 'orders', linkedOrderId); 
            const orderDoc = await getDoc(orderRef); 
            if (orderDoc.exists()) { 
                const orderData = orderDoc.data() as Order; 
                const updatedItems = orderData.items.map((item: any) => { 
                    const isMatch = item.productId === selectedProductForSale.publicProductId && ((!item.selectedVariant && !selectedProductForSale.variant) || (item.selectedVariant === selectedProductForSale.variant)); 
                    if (isMatch) { 
                        const updatedItem = { ...item };
                        updatedItem.fulfilledQuantity = (updatedItem.fulfilledQuantity || 0) + qty;
                        if (selectedUnitsForSale.length > 0) {
                            const currentSn = item.serialNumbers || []; 
                            updatedItem.serialNumbers = [...new Set([...currentSn, ...selectedUnitsForSale])];
                        }
                        return updatedItem;
                    } 
                    return item; 
                }); 
                const additionalCost = qty * (selectedProductForSale.purchasePrice || 0);
                const newTotalCost = (orderData.totalProductCost || 0) + additionalCost;
                await updateDoc(orderRef, { items: updatedItems, stockDeducted: true, totalProductCost: newTotalCost }); 
            } 
        } 
        setIsSaleModalOpen(false); 
    } catch(e) { 
        console.error(e); 
        alert("Erro ao registar venda."); 
    } 
  };
  
  // Other small handlers (rest of file remains)
  const handlePublicProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => { 
    const selectedId = e.target.value; 
    setFormData(prev => ({ ...prev, publicProductId: selectedId, variant: '' })); 
    if (selectedId) { 
        const publicProd = publicProductsList.find(p => p.id === Number(selectedId)); 
        if (publicProd) {
            setFormData(prev => ({ ...prev, publicProductId: selectedId, name: publicProd.name, category: publicProd.category })); 
            setEditingStoreProduct(publicProd);
        } else {
            setEditingStoreProduct(null);
        }
    } else {
        setEditingStoreProduct(null);
    }
  };
  const handleAddImage = () => { if (formData.newImageUrl && formData.newImageUrl.trim()) { setFormData(prev => ({ ...prev, images: [...prev.images, prev.newImageUrl.trim()], newImageUrl: '' })); } };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const file = e.target.files?.[0]; 
    if (!file) return; 

    console.log("Iniciando upload de imagem de inventário:", file.name);
    setIsUploading(true); 
    setUploadProgress(0); 

    const storageRef = ref(storage, `products/${Date.now()}_${file.name}`); 
    let uploadTask: any;
    try {
      uploadTask = uploadBytesResumable(storageRef, file); 
    } catch (putError) {
      console.error("Erro ao iniciar put no storage:", putError);
      setIsUploading(false);
      setUploadProgress(null);
      alert("Erro ao iniciar o carregamento. Verifique as permissões.");
      return;
    }

    uploadTask.on('state_changed', 
      (snapshot: any) => { 
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100; 
        setUploadProgress(progress); 
        console.log(`Upload progress (inventário): ${Math.round(progress)}%`);
      }, 
      (error: any) => { 
        console.error("Erro no upload de inventário:", error); 
        setIsUploading(false); 
        setUploadProgress(null); 
        alert("Erro ao carregar imagem. Tente novamente."); 
      }, 
      async () => { 
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref); 
          console.log("Upload de inventário concluído:", downloadURL);
          setFormData(prev => {
              const updated = { ...prev, images: [...prev.images, downloadURL] };
              return updated;
          }); 
          setIsUploading(false); 
          setUploadProgress(null); 
          if (fileInputRef.current) fileInputRef.current.value = ''; 
        } catch (err) {
          console.error("Erro ao obter URL de download (inventário):", err);
          setIsUploading(false);
          setUploadProgress(null);
        }
      } 
    ); 
  };
  const handleRemoveImage = (indexToRemove: number) => { setFormData(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== indexToRemove) })); };
  const handleMoveImage = (index: number, direction: 'left' | 'right') => { if ((direction === 'left' && index === 0) || (direction === 'right' && index === formData.images.length - 1)) return; const newImages = [...formData.images]; const targetIndex = direction === 'left' ? index - 1 : index + 1; [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]]; setFormData(prev => ({ ...prev, images: newImages })); };
  const handleAddFeature = () => { if (formData.newFeature && formData.newFeature.trim()) { setFormData(prev => ({ ...prev, features: [...prev.features, formData.newFeature.trim()], newFeature: '' })); } };
  const handleRemoveFeature = (indexToRemove: number) => { setFormData(prev => ({ ...prev, features: prev.features.filter((_, idx) => idx !== indexToRemove) })); };



  const handleAddSpec = () => {
    if (formData.newSpecKey && formData.newSpecValue) {
      setFormData(prev => ({
        ...prev,
        specs: { ...(prev.specs || {}), [prev.newSpecKey]: prev.newSpecValue },
        newSpecKey: '',
        newSpecValue: ''
      }));
    }
  };

  const handleRemoveSpec = (key: string) => {
    setFormData(prev => {
      const newSpecs = { ...(prev.specs || {}) };
      delete newSpecs[key];
      return { ...prev, specs: newSpecs };
    });
  };


  const syncInventoryFromPublicProduct = async (publicId: number) => {
    try {
      const pubRef = doc(modularDb, 'products_public', publicId.toString());
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) return;
      const pub = pubSnap.data() as Product;

      const inventoryQuery = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', Number(publicId)));
      const inventorySnap = await getDocs(inventoryQuery);
      const lots = inventorySnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() as InventoryProduct }));

      const batch = writeBatch(modularDb);
      let totalUpdated = 0;
      const normalizeVName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();

      if (pub.variants && pub.variants.length > 0) {
        for (const variant of pub.variants) {
          const vName = variant.name;
          const targetStock = Number(variant.stock) || 0;
          console.log(`[Sync] Checando variante: "${vName}", targetStock: ${targetStock}`);
          const matchingLots = lots.filter(l => {
            const lotV = l.data.variant || '';
            const match = normalizeVName(lotV) === normalizeVName(vName);
            if (match) console.log(`[Sync] Lote ${l.id} deu match com variante ${vName} (lotVariant: "${lotV}")`);
            return match;
          });

          if (matchingLots.length > 0) {
            const firstLot = matchingLots[0];
            const sold = Number(firstLot.data.quantitySold) || 0;
            const newBought = targetStock + sold;
            if (firstLot.data.quantityBought !== newBought) {
              batch.update(firstLot.ref, { quantityBought: newBought });
              totalUpdated++;
            }
            for (let i = 1; i < matchingLots.length; i++) {
              const otherLot = matchingLots[i];
              const otherSold = Number(otherLot.data.quantitySold) || 0;
              if (otherLot.data.quantityBought !== otherSold) {
                batch.update(otherLot.ref, { quantityBought: otherSold });
                totalUpdated++;
              }
            }
          } else {
            const newDocRef = doc(collection(modularDb, 'products_inventory'));
            const newLot: Omit<InventoryProduct, 'id'> = {
              publicProductId: pub.id,
              variant: vName,
              quantityBought: targetStock,
              quantitySold: 0,
              name: pub.name,
              category: pub.category || '',
              purchasePrice: 0,
              salePrice: variant.price || pub.price || 0,
              purchaseDate: new Date().toISOString().split('T')[0],
              description: `Lote automático sincronizado para variante ${vName}`,
              status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
              cashbackValue: 0,
              cashbackStatus: 'NONE',
            };
            batch.set(newDocRef, newLot);
            totalUpdated++;
          }
        }
        const publicVariantNames = pub.variants.map((v: any) => normalizeVName(v.name));
        const obsoleteLots = lots.filter(l => l.data.variant && !publicVariantNames.includes(normalizeVName(l.data.variant)));
        for (const obs of obsoleteLots) {
          const sold = Number(obs.data.quantitySold) || 0;
          if (obs.data.quantityBought !== sold) {
            batch.update(obs.ref, { quantityBought: sold });
            totalUpdated++;
          }
        }
      } else {
        const targetStock = Number(pub.stock) || 0;
        if (lots.length > 0) {
          const firstLot = lots[0];
          const sold = Number(firstLot.data.quantitySold) || 0;
          const newBought = targetStock + sold;
          if (firstLot.data.quantityBought !== newBought) {
            batch.update(firstLot.ref, { quantityBought: newBought });
            totalUpdated++;
          }
          for (let i = 1; i < lots.length; i++) {
            const otherLot = lots[i];
            const otherSold = Number(otherLot.data.quantitySold) || 0;
            if (otherLot.data.quantityBought !== otherSold) {
              batch.update(otherLot.ref, { quantityBought: otherSold });
              totalUpdated++;
            }
          }
        } else {
          const newDocRef = doc(collection(modularDb, 'products_inventory'));
          const newLot: Omit<InventoryProduct, 'id'> = {
            publicProductId: pub.id,
            variant: '',
            quantityBought: targetStock,
            quantitySold: 0,
            name: pub.name,
            category: pub.category || '',
            purchasePrice: 0,
            salePrice: pub.price || 0,
            purchaseDate: new Date().toISOString().split('T')[0],
            description: `Lote automático sincronizado para ${pub.name}`,
            status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
            cashbackValue: 0,
            cashbackStatus: 'NONE',
          };
          batch.set(newDocRef, newLot);
          totalUpdated++;
        }
      }
      if (totalUpdated > 0) {
        await batch.commit();
        console.log(`[local sync] Sincronizados ${totalUpdated} itens no inventário para produto ${publicId}`);
      }
    } catch (err) {
      console.error("Erro na sincronização local de inventário:", err);
    }
  };

  const handleSyncPublicStock = async () => {
    if (publicProductsList.length === 0) {
      alert("A lista de produtos públicos está vazia ou ainda a carregar.");
      return;
    }
    if (!window.confirm("Isto irá recalculado o stock do inventário (Lotes) para coincidir com os valores reais da loja pública (que é a sua fonte de verdade).\n\nContinuar?")) return;
    
    console.log(`[Sync] Iniciando sincronização reversa: Loja Pública -> Inventário para ${publicProductsList.length} produtos...`);
    setIsSyncingStock(true);
    try {
      const batches = [];
      let currentBatch = writeBatch(modularDb);
      let operationsInBatch = 0;
      let totalUpdated = 0;
      
      const normalizeVName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim().toLowerCase();

      // Buscar IDs de produtos públicos para re-fetch
      const publicIds = publicProductsList.map(p => p.id);

      for (const publicId of publicIds) {
        // Fetch fresh product
        const pubSnap = await getDoc(doc(modularDb, 'products_public', String(publicId)));
        if (!pubSnap.exists()) continue;
        const pub = { ...pubSnap.data(), id: publicId } as Product;
        
        // Obter lotes de inventário deste produto
        const inventoryQuery = query(collection(modularDb, 'products_inventory'), where('publicProductId', '==', Number(pub.id)));
        const inventorySnap = await getDocs(inventoryQuery);
        const lots = inventorySnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() as InventoryProduct }));

        if (pub.variants && pub.variants.length > 0) {
          // O produto tem variantes configuradas no catálogo público
          for (const variant of pub.variants) {
            const vName = variant.name;
            const targetStock = Number(variant.stock) || 0;
            
            // Encontrar lotes que têm esta variante
            const matchingLots = lots.filter(l => normalizeVName(l.data.variant || '') === normalizeVName(vName));
            
            if (matchingLots.length > 0) {
              // Ajustar o primeiro lote para ter o stock desejado (+ as unidades vendidas)
              // E definir os restantes lotes adicionais/duplicados para quantityBought = quantitySold (stock = 0)
              const firstLot = matchingLots[0];
              const sold = Number(firstLot.data.quantitySold) || 0;
              const newBought = targetStock + sold;
              
              if (firstLot.data.quantityBought !== newBought) {
                currentBatch.update(firstLot.ref, { quantityBought: newBought });
                operationsInBatch++;
                totalUpdated++;
              }
              
              // Definir restantes para stock 0
              for (let i = 1; i < matchingLots.length; i++) {
                const otherLot = matchingLots[i];
                const otherSold = Number(otherLot.data.quantitySold) || 0;
                if (otherLot.data.quantityBought !== otherSold) {
                  currentBatch.update(otherLot.ref, { quantityBought: otherSold });
                  operationsInBatch++;
                  totalUpdated++;
                }
              }
            } else {
              // Se não existe lote para esta variante, criar um novo
              const newDocRef = doc(collection(modularDb, 'products_inventory'));
              const newLot: Omit<InventoryProduct, 'id'> = {
                publicProductId: pub.id,
                variant: vName,
                quantityBought: targetStock,
                quantitySold: 0,
                name: pub.name,
                category: pub.category || '',
                purchasePrice: 0,
                salePrice: variant.price || pub.price || 0,
                purchaseDate: new Date().toISOString().split('T')[0],
                description: `Lote automático sincronizado para variante ${vName}`,
                status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
                cashbackValue: 0,
                cashbackStatus: 'NONE',
              };
              currentBatch.set(newDocRef, newLot);
              operationsInBatch++;
              totalUpdated++;
            }
          }
          
          // Tratar lotes de variantes que já não existem no catálogo público para este produto
          const publicVariantNames = pub.variants.map((v: any) => normalizeVName(v.name));
          const obsoleteLots = lots.filter(l => l.data.variant && !publicVariantNames.includes(normalizeVName(l.data.variant)));
          for (const obs of obsoleteLots) {
            const sold = Number(obs.data.quantitySold) || 0;
            if (obs.data.quantityBought !== sold) {
              currentBatch.update(obs.ref, { quantityBought: sold });
              operationsInBatch++;
              totalUpdated++;
            }
          }
        } else {
          // O produto não tem variantes
          const targetStock = Number(pub.stock) || 0;
          
          if (lots.length > 0) {
            const firstLot = lots[0];
            const sold = Number(firstLot.data.quantitySold) || 0;
            const newBought = targetStock + sold;
            
            if (firstLot.data.quantityBought !== newBought) {
              currentBatch.update(firstLot.ref, { quantityBought: newBought });
              operationsInBatch++;
              totalUpdated++;
            }
            
            // Definir restantes lotes para stock 0
            for (let i = 1; i < lots.length; i++) {
              const otherLot = lots[i];
              const otherSold = Number(otherLot.data.quantitySold) || 0;
              if (otherLot.data.quantityBought !== otherSold) {
                currentBatch.update(otherLot.ref, { quantityBought: otherSold });
                operationsInBatch++;
                totalUpdated++;
              }
            }
          } else {
            // Criar um novo lote de inventário se nenhum existir
            const newDocRef = doc(collection(modularDb, 'products_inventory'));
            const newLot: Omit<InventoryProduct, 'id'> = {
              publicProductId: pub.id,
              variant: '',
              quantityBought: targetStock,
              quantitySold: 0,
              name: pub.name,
              category: pub.category || '',
              purchasePrice: 0,
              salePrice: pub.price || 0,
              purchaseDate: new Date().toISOString().split('T')[0],
              description: `Lote automático sincronizado para ${pub.name}`,
              status: targetStock > 0 ? 'IN_STOCK' : 'SOLD',
              cashbackValue: 0,
              cashbackStatus: 'NONE',
            };
            currentBatch.set(newDocRef, newLot);
            operationsInBatch++;
            totalUpdated++;
          }
        }
        
        if (operationsInBatch >= 400) {
          batches.push(currentBatch);
          currentBatch = writeBatch(modularDb);
          operationsInBatch = 0;
        }
      }

      if (operationsInBatch > 0) {
        batches.push(currentBatch);
      }

      await Promise.all(batches.map(b => b.commit()));
      console.log(`[Sync] Sincronização pública -> inventário concluída. total de updates realizados: ${totalUpdated}`);
      alert(`Sincronização concluída com sucesso! Os stocks dos lotes foram todos ajustados para bater certo com a loja pública (${totalUpdated} correções efetuadas).`);
    } catch (err) {
      console.error("Erro na sincronização reversa:", err);
      alert("Erro ao realizar sincronização: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSyncingStock(false);
    }
  };
  const handleOrderStatusChange = async (orderId: string, newStatus: string) => { 
      try { 
          const orderRef = doc(modularDb, 'orders', orderId); 
          const orderSnap = await getDoc(orderRef); 
          if(!orderSnap.exists()) return; 
          const currentOrder = orderSnap.data() as Order; 
          const updates: any = { 
              status: newStatus, 
              statusHistory: arrayUnion({ 
                  status: newStatus, 
                  date: new Date().toISOString(), 
                  notes: 'Estado alterado via Backoffice' 
              }) 
          }; 

          // Safe parsing of total to avoid NaN database writes on old orders
          const orderTotal = typeof currentOrder.total === 'number'
              ? currentOrder.total
              : parseFloat(currentOrder.total as any) || 0;

          // Prepare Matching Inventory Lots to restore stock on cancellation
          const inventoryDocsToRead: any[] = [];
          if (newStatus === 'Cancelado' && currentOrder.status !== 'Cancelado' && Array.isArray(currentOrder.items)) {
              for (const item of currentOrder.items) {
                  if (typeof item === 'object' && item !== null && item.productId) {
                      const q = query(
                          collection(modularDb, 'products_inventory'),
                          where('publicProductId', '==', Number(item.productId))
                      );
                      const qSnap = await getDocs(q);
                      qSnap.forEach(d => {
                          const invData = d.data();
                          const orderVariant = String(item.selectedVariant || '').trim().toLowerCase();
                          const batchVariant = String(invData.variant || '').trim().toLowerCase();
                          if (orderVariant === batchVariant) {
                              inventoryDocsToRead.push({ ref: d.ref, id: d.id, itemQty: item.quantity, productId: item.productId });
                          }
                      });
                  }
              }
          }

          await runTransaction(modularDb, async (transaction) => {
              // 1. Gather all reads
              const reads: any = { updates: [], userUpdate: null };

              const invSnaps: Record<string, any> = {};
              for (const docToRead of inventoryDocsToRead) {
                  const snap = await transaction.get(docToRead.ref);
                  invSnaps[docToRead.id] = snap;
              }
              
              const isUserValid = typeof currentOrder.userId === 'string' && currentOrder.userId.trim() !== '';
              if (newStatus === 'Entregue' && !currentOrder.pointsAwarded && isUserValid) { 
                  const userRef = doc(modularDb, 'users', currentOrder.userId as string); 
                  const userDoc = await transaction.get(userRef); 
                  if (userDoc.exists()) { 
                      const userData = userDoc.data() as UserType; 
                      const tier = userData.tier || 'Bronze'; 
                      let multiplier = 1; 
                      if (tier === 'Prata') multiplier = LOYALTY_TIERS.SILVER.multiplier; 
                      if (tier === 'Ouro') multiplier = LOYALTY_TIERS.GOLD.multiplier; 
                      const pointsToAward = Math.floor(orderTotal * multiplier); 
                      if (!isNaN(pointsToAward) && pointsToAward > 0) { 
                          const newHistory: PointHistory = { 
                              id: `earn-${orderId}`, 
                              date: new Date().toISOString(), 
                              amount: pointsToAward, 
                              reason: `Compra #${orderId} (Nível ${tier})`, 
                              orderId: orderId 
                          }; 
                          reads.userUpdate = {
                              ref: userRef,
                              data: {
                                  loyaltyPoints: (userData.loyaltyPoints || 0) + pointsToAward, 
                                  pointsHistory: [newHistory, ...(Array.isArray(userData.pointsHistory) ? userData.pointsHistory : [])] 
                              }
                          };
                          updates.pointsAwarded = true; 
                      } 
                  } 
              }

              if (newStatus === 'Cancelado' && currentOrder.status !== 'Cancelado' && Array.isArray(currentOrder.items)) {
                  // A. Repor o stock no lote de inventário correspondente (products_inventory)
                  for (const docToRead of inventoryDocsToRead) {
                      const invSnap = invSnaps[docToRead.id];
                      if (invSnap && invSnap.exists()) {
                          const invData = invSnap.data() as InventoryProduct;
                          let currentQtySold = Number(invData.quantitySold || 0);
                          let newQtySold = currentQtySold;

                          if (currentOrder.stockDeducted) {
                              newQtySold = Math.max(0, currentQtySold - docToRead.itemQty);
                          }

                          let updatedUnits = invData.units ? [...invData.units] : null;
                          if (updatedUnits) {
                              updatedUnits = updatedUnits.map(unit => {
                                  if (unit.soldToOrder === orderId) {
                                      return {
                                          ...unit,
                                          status: 'AVAILABLE',
                                          soldAt: undefined,
                                          soldToOrder: undefined
                                      };
                                  }
                                  return unit;
                              });
                          }

                          const invUpdateData: any = {
                              quantitySold: newQtySold,
                              status: newQtySold >= (invData.quantityBought || 0) ? 'SOLD' : (newQtySold > 0 ? 'PARTIAL' : 'AVAILABLE')
                          };
                          if (updatedUnits) {
                              invUpdateData.units = updatedUnits;
                          }

                          reads.updates.push({
                              ref: docToRead.ref,
                              data: invUpdateData
                          });
                      }
                  }

                  // B. Depois, repor stock na coleção principal (products_public)
                  for (const item of currentOrder.items) {
                      if (typeof item !== 'object' || item === null || !item.productId) continue;
                      const productDocRef = doc(modularDb, 'products_public', item.productId.toString());
                      const productDoc = await transaction.get(productDocRef);
                      if (productDoc.exists()) {
                          const productData = productDoc.data() as Product;
                          
                          let updatedVariants = productData.variants;
                          if (item.selectedVariant && productData.variants) {
                              const vIndex = productData.variants.findIndex((v: any) => v.name === item.selectedVariant);
                              if (vIndex !== -1) {
                                  updatedVariants = [...productData.variants];
                                  updatedVariants[vIndex] = {
                                      ...updatedVariants[vIndex],
                                      stock: (updatedVariants[vIndex].stock || 0) + item.quantity
                                  };
                              }
                          }
                          
                          const updateData: any = { stock: (productData.stock || 0) + item.quantity };
                          if (updatedVariants) updateData.variants = updatedVariants;
                          
                          reads.updates.push({
                              ref: productDoc.ref,
                              data: Object.fromEntries(Object.entries(updateData).filter(([_,v]) => v !== undefined))
                          });
                      }
                  }

                  if (currentOrder.pointsAwarded && isUserValid) {
                      const userRef = doc(modularDb, 'users', currentOrder.userId as string);
                      const userDoc = await transaction.get(userRef);
                      if (userDoc.exists()) {
                          const userData = userDoc.data() as UserType;
                          const tier = userData.tier || 'Bronze';
                          let multiplier = 1;
                          if (tier === 'Prata') multiplier = LOYALTY_TIERS.SILVER.multiplier;
                          if (tier === 'Ouro') multiplier = LOYALTY_TIERS.GOLD.multiplier;
                          const pointsToRemove = Math.floor(orderTotal * multiplier);
                          
                          if (!isNaN(pointsToRemove) && pointsToRemove > 0) {
                              const newHistory: PointHistory = {
                                  id: `refund-${orderId}`,
                                  date: new Date().toISOString(),
                                  amount: -pointsToRemove,
                                  reason: `Cancelamento da Compra #${orderId}`,
                                  orderId: orderId
                              };
                              const newTotalSpent = Math.max(0, (userData.totalSpent || 0) - orderTotal);
                              let newTier: UserTier = 'Bronze';
                              if (newTotalSpent >= LOYALTY_TIERS.GOLD.threshold) newTier = 'Ouro';
                              else if (newTotalSpent >= LOYALTY_TIERS.SILVER.threshold) newTier = 'Prata';
                              
                              reads.userUpdate = {
                                  ref: userRef,
                                  data: {
                                      totalSpent: newTotalSpent,
                                      tier: newTier,
                                      loyaltyPoints: Math.max(0, (userData.loyaltyPoints || 0) - pointsToRemove),
                                      pointsHistory: [newHistory, ...(Array.isArray(userData.pointsHistory) ? userData.pointsHistory : [])]
                                  }
                              };
                              updates.pointsAwarded = false;
                          }
                      }
                  }
              }

              // 2. Perform all writes
              if (reads.userUpdate) transaction.update(reads.userUpdate.ref, reads.userUpdate.data);
              for (const update of reads.updates) {
                  transaction.update(update.ref, update.data);
              }
              transaction.update(orderRef, updates);
          });

          // Enviar notificação Telegram caso mude manualmente de Pendente para Processamento ou Pago
          if (currentOrder.status === 'Pendente' && (newStatus === 'Processamento' || newStatus === 'Pago')) {
              try {
                  await notifyNewOrder({ ...currentOrder, status: newStatus }, currentOrder.shippingInfo?.name || 'Cliente');
              } catch (notifyError) {
                  console.error("Erro ao notificar via Telegram:", notifyError);
              }
          }

          setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o)); 
          if (selectedOrderDetails?.id === orderId) { 
              setSelectedOrderDetails(prev => prev ? { ...prev, ...updates } : null); 
          } 
          
          // Sync updated order to Supabase
          supabaseSync.saveOrder({ ...currentOrder, ...updates });
      } catch (error) { 
          console.error("Erro ao mudar estado:", error); 
          const errorMsg = error instanceof Error ? error.message : String(error);
          alert("Erro ao atualizar estado da encomenda: " + errorMsg); 
      } 
  };
  const handleDeleteOrder = async (orderId: string) => { 
      if(!window.confirm("ATENÇÃO: Apagar a encomenda é irreversível. Deseja continuar?")) return; 
      try { 
          const orderRef = doc(modularDb, 'orders', orderId);
          const orderDoc = await getDoc(orderRef);
          if (orderDoc.exists()) {
              const orderData = orderDoc.data() as Order;
              
              // Safe parsing of total to avoid NaN calculations on old orders
              const orderTotal = typeof orderData.total === 'number' 
                  ? orderData.total 
                  : parseFloat(orderData.total as any) || 0;

              if (orderData.status !== 'Cancelado' && orderData.fulfillmentStatus !== 'COMPLETED') {
                  await runTransaction(modularDb, async (transaction) => {
                      const reads: any = { updates: [], userUpdate: null };

                      if (Array.isArray(orderData.items)) {
                          for (const item of orderData.items) {
                              if (typeof item !== 'object' || item === null || !item.productId) continue;
                              const productDocRef = doc(modularDb, 'products_public', item.productId.toString());
                              const productDoc = await transaction.get(productDocRef);
                              if (productDoc.exists()) {
                                  const productData = productDoc.data() as Product;
                                  
                                  let updatedVariants = productData.variants;
                                  if (item.selectedVariant && productData.variants) {
                                      const vIndex = productData.variants.findIndex((v: any) => v.name === item.selectedVariant);
                                      if (vIndex !== -1) {
                                          updatedVariants = [...productData.variants];
                                          updatedVariants[vIndex] = {
                                              ...updatedVariants[vIndex],
                                              stock: (updatedVariants[vIndex].stock || 0) + item.quantity
                                          };
                                      }
                                  }
                                  
                                  const updateData: any = { stock: (productData.stock || 0) + item.quantity };
                                  if (updatedVariants) updateData.variants = updatedVariants;
                                  
                                  reads.updates.push({
                                      ref: productDoc.ref,
                                      data: Object.fromEntries(Object.entries(updateData).filter(([_,v]) => v !== undefined))
                                  });
                              }
                          }
                      }

                      // Remover pontos se já tinham sido atribuídos
                      if (orderData.pointsAwarded && orderData.userId) {
                          const userRef = doc(modularDb, 'users', orderData.userId);
                          const userDoc = await transaction.get(userRef);
                          if (userDoc.exists()) {
                              const userData = userDoc.data() as UserType;
                              const tier = userData.tier || 'Bronze';
                              let multiplier = 1;
                              if (tier === 'Prata') multiplier = LOYALTY_TIERS.SILVER.multiplier;
                              if (tier === 'Ouro') multiplier = LOYALTY_TIERS.GOLD.multiplier;
                              const pointsToRemove = Math.floor(orderTotal * multiplier);
                              
                              if (!isNaN(pointsToRemove) && pointsToRemove > 0) {
                                  const newHistory: PointHistory = {
                                      id: `delete-${orderId}`,
                                      date: new Date().toISOString(),
                                      amount: -pointsToRemove,
                                      reason: `Remoção da Compra #${orderId}`,
                                      orderId: orderId
                                  };
                                  
                                  const newTotalSpent = Math.max(0, (userData.totalSpent || 0) - orderTotal);
                                  let newTier: UserTier = 'Bronze';
                                  if (newTotalSpent >= LOYALTY_TIERS.GOLD.threshold) newTier = 'Ouro';
                                  else if (newTotalSpent >= LOYALTY_TIERS.SILVER.threshold) newTier = 'Prata';

                                  reads.userUpdate = {
                                      ref: userRef,
                                      data: {
                                          totalSpent: newTotalSpent,
                                          tier: newTier,
                                          loyaltyPoints: Math.max(0, (userData.loyaltyPoints || 0) - pointsToRemove),
                                          pointsHistory: [newHistory, ...(userData.pointsHistory || [])]
                                      }
                                  };
                              }
                          }
                      }

                      // Perform all writes
                      if (reads.userUpdate) transaction.update(reads.userUpdate.ref, reads.userUpdate.data);
                      for (const update of reads.updates) {
                          transaction.update(update.ref, update.data);
                      }
                      transaction.delete(orderRef);
                  });
              } else {
                  await deleteDoc(orderRef);
              }
              setAllOrders(prev => prev.filter(o => o.id !== orderId));
              alert("Encomenda apagada com sucesso.");
          }
      } catch (error) { 
          console.error("Erro ao apagar encomenda:", error); 
          alert("Erro ao apagar. Esta encomenda pode estar vinculada a outros registos."); 
      } 
  };
  const handleUpdateTracking = async (orderId: string, tracking: string) => { 
      try { 
          await updateDoc(doc(modularDb, 'orders', orderId), { trackingNumber: tracking }); 
          if (selectedOrderDetails) {
              const updatedOrder = {...selectedOrderDetails, trackingNumber: tracking};
              setSelectedOrderDetails(updatedOrder);
              supabaseSync.saveOrder(updatedOrder);
          } else {
              // Try to find the order in allOrders to sync
              const order = allOrders.find(o => o.id === orderId);
              if (order) supabaseSync.saveOrder({ ...order, trackingNumber: tracking });
          }
      } catch (e) { 
          alert("Erro ao gravar rastreio"); 
      } 
  };
  const handleAddUnit = (code: string) => { if (modalUnits.some(u => u.id === code)) return alert("Este código já foi adicionado."); setModalUnits(prev => [...prev, { id: code, status: 'AVAILABLE', addedAt: new Date().toISOString() }]); };
  const handleRemoveUnit = (id: string) => setModalUnits(prev => prev.filter(u => u.id !== id));
  const handleGenerateCodes = () => { const newCodes: string[] = []; for(let i=0; i < generateQty; i++) { const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase(); newCodes.push(`INT-${randomPart}`); } setGeneratedCodes(prev => [...prev, ...newCodes]); if (isModalOpen) { const newUnits = newCodes.map(code => ({ id: code, status: 'AVAILABLE' as const, addedAt: new Date().toISOString() })); setModalUnits(prev => [...prev, ...newUnits]); } };
  const handleSelectUnitForSale = (code: string) => { if (!selectedProductForSale) return; const unit = selectedProductForSale.units?.find(u => u.id === code); if (!unit) return alert("Erro: Este S/N não pertence a este lote de produto."); if (unit.status !== 'AVAILABLE') return alert("Erro: Este S/N já foi vendido ou está reservado."); if (selectedUnitsForSale.includes(code)) return alert("Aviso: Este S/N já foi adicionado a esta venda."); setSelectedUnitsForSale(prev => [...prev, code]); setSecurityCheckPassed(true); };
  const handleVerifyProduct = (code: string) => { if (!selectedProductForSale) return; const cleanCode = code.trim().toUpperCase(); if (cleanCode === selectedProductForSale.publicProductId?.toString() || selectedProductForSale.units?.some(u => u.id.toUpperCase() === cleanCode)) { setSecurityCheckPassed(true); setVerificationCode(code); } else { alert(`Código ${code} NÃO corresponde a este produto! Verifique se pegou na caixa correta.`); setSecurityCheckPassed(false); } };
  
  const handleNotifySubscribers = (productId: number, productName: string, variantName?: string) => { /* ... */ };
  const handleClearSentAlerts = async () => { if (!notificationModalData) return; if (!window.confirm("Isto irá apagar os alertas da base de dados. Confirma que já enviou o email?")) return; try { const batch = writeBatch(modularDb); notificationModalData.alertsToDelete.forEach(alertItem => { batch.delete(doc(modularDb, 'stock_alerts', alertItem.id)); }); await batch.commit(); setNotificationModalData(null); alert("Lista de espera limpa com sucesso!"); } catch(e) { alert("Erro ao limpar alertas."); } };
  
  const handleAddCoupon = async (e: React.FormEvent) => { 
      e.preventDefault();
      try {
          await addDoc(collection(modularDb, 'coupons'), newCoupon);
          setNewCoupon({ code: '', type: 'PERCENTAGE', value: 10, minPurchase: 0, isActive: true, usageCount: 0, validProductId: undefined });
          alert("Cupão criado!");
      } catch(e) { alert("Erro ao criar cupão."); }
  };
  
  const handleToggleCoupon = async (coupon: Coupon) => { if(!coupon.id) return; try { await updateDoc(doc(modularDb, 'coupons', coupon.id), { isActive: !coupon.isActive }); } catch(e) { alert("Erro ao atualizar cupão."); } };
  const handleDeleteCoupon = async (id?: string) => { if (!id || !window.confirm("Apagar cupão permanentemente?")) return; try { await deleteDoc(doc(modularDb, 'coupons', id)); setCoupons(prevCoupons => prevCoupons.filter(coupon => coupon.id !== id)); } catch (e) { alert("Erro ao apagar o cupão."); console.error("Delete coupon error:", e); } };
  const handleOpenInvestedModal = () => { setDetailsModalData({ title: "Detalhe do Investimento", data: products.map(p => ({ id: p.id, name: p.name, qty: p.quantityBought, cost: (p.purchasePrice || 0), total: (p.purchasePrice || 0) * (p.quantityBought || 1) })).filter(i => i.total > 0).sort((a,b) => b.total - a.total), total: stats.totalInvested, columns: [{ header: "Produto", accessor: "name" }, { header: "Qtd. Comprada", accessor: "qty" }, { header: "Custo Unit.", accessor: (i) => formatCurrency(i.cost) }, { header: "Total", accessor: (i) => formatCurrency(i.total) }] }); };
  const handleOpenRevenueModal = () => { setDetailsModalData({ title: "Receita Realizada", data: products.flatMap(p => { const manualSales = (p.salesHistory || []).map(s => ({ id: s.id, name: p.name, date: s.date, qty: s.quantity, val: s.quantity * s.unitPrice })); const manualQty = manualSales.reduce((acc, s) => acc + s.qty, 0); const onlineQty = Math.max(0, (p.quantitySold || 0) - manualQty); const onlineSales = onlineQty > 0 ? [{ id: `online-${p.id}`, name: `${p.name} (Online)`, date: new Date().toISOString().split('T')[0], qty: onlineQty, val: onlineQty * (p.salePrice || 0) }] : []; return [...manualSales, ...onlineSales]; }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), total: stats.realizedRevenue, columns: [{ header: "Data", accessor: (i) => new Date(i.date).toLocaleDateString() }, { header: "Produto", accessor: "name" }, { header: "Qtd", accessor: "qty" }, { header: "Valor", accessor: (i) => formatCurrency(i.val) }] }); };
  const handleOpenProfitModal = () => { setDetailsModalData({ title: "Lucro Líquido por Produto", data: products.map(p => { const manualQty = (p.salesHistory || []).reduce((acc, s) => acc + (s.quantity || 0), 0); const onlineQty = Math.max(0, (p.quantitySold || 0) - manualQty); const revenue = (p.salesHistory || []).reduce((acc, s) => acc + ((s.quantity || 0) * (s.unitPrice || 0)), 0) + (onlineQty * (p.salePrice || 0)); const cogs = (p.quantitySold || 0) * (p.purchasePrice || 0); const cashback = p.cashbackStatus === 'RECEIVED' ? ((p.cashbackValue || 0) / (p.quantityBought || 1)) * (p.quantitySold || 0) : 0; return { id: p.id, name: p.name, profit: revenue - cogs + cashback }; }).filter(p => p.profit !== 0).sort((a,b) => b.profit - a.profit), total: stats.realizedProfit, columns: [{ header: "Produto", accessor: "name" }, { header: "Lucro", accessor: (i) => <span className={i.profit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{formatCurrency(i.profit)}</span> }] }); };
  const handleOpenCashbackManager = () => { setIsCashbackManagerOpen(true); };
  
  // --- HANDLE PRINT LABELS COM BARCODE REAL ---
  const handlePrintLabels = () => {
    if (generatedCodes.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // HTML Template para impressão com JsBarcode
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imprimir Etiquetas</title>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <style>
            body { font-family: 'Arial', sans-serif; padding: 10px; margin: 0; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
            .label { border: 1px dashed #ccc; padding: 10px; text-align: center; height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; page-break-inside: avoid; }
            .barcode { width: 100%; max-height: 80px; }
            @media print { .no-print { display: none; } .label { border: none; } }
            .no-print { padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; margin-bottom: 20px; display: block; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">🖨️ Imprimir Agora</button>
          <div class="grid">
            ${generatedCodes.map(code => `
              <div class="label">
                <svg class="barcode" jsbarcode-format="CODE128" jsbarcode-value="${code}" jsbarcode-textmargin="0" jsbarcode-fontoptions="bold" jsbarcode-height="50" jsbarcode-width="2" jsbarcode-displayValue="true" jsbarcode-fontSize="14"></svg>
              </div>
            `).join('')}
          </div>
          <script>JsBarcode(".barcode").init();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const toggleCashbackAccount = (account: string) => { setExpandedCashbackAccounts(prev => prev.includes(account) ? prev.filter(a => a !== account) : [...prev, account]); };
  const handleMarkBatchReceived = async (itemsToUpdate: InventoryProduct[]) => { if(!window.confirm(`Marcar ${itemsToUpdate.length} itens como RECEBIDO?`)) return; try { const batch = writeBatch(modularDb); itemsToUpdate.forEach(item => { const ref = doc(modularDb, 'products_inventory', item.id); batch.update(ref, { cashbackStatus: 'RECEIVED' }); }); await batch.commit(); alert("Cashback atualizado com sucesso!"); } catch(e) { alert("Erro ao atualizar cashback."); } };
  const handleUpdateTicketStatus = async (ticketId: string, newStatus: string) => { try { await updateDoc(doc(modularDb, 'support_tickets', ticketId), { status: newStatus }); if(selectedTicket) setSelectedTicket({...selectedTicket, status: newStatus} as any); } catch (error) { alert("Erro ao atualizar ticket."); } };
  const handleDeleteTicket = async (ticketId: string) => { if(!window.confirm("Apagar ticket permanentemente?")) return; try { await deleteDoc(doc(modularDb, 'support_tickets', ticketId)); setSelectedTicket(null); } catch (error) { alert("Erro ao apagar."); } };

  const filteredClients = useMemo(() => { 
      // 1. Começar com os utilizadores registados
      const combinedClients: UserType[] = [...allUsers];
      const registeredEmails = new Set(allUsers.map(u => (u.email || '').toLowerCase().trim()));

      // 2. Procurar nas encomendas por clientes convidados (sem conta registada)
      const guestMap = new Map<string, UserType>();

      allOrders.forEach(order => {
          const email = (order.shippingInfo?.email || '').toLowerCase().trim();
          
          // Se este email NÃO pertence a um utilizador registado
          if (email && !registeredEmails.has(email)) {
              if (!guestMap.has(email)) {
                  // Criar um perfil de "Convidado" temporário
                  guestMap.set(email, {
                      uid: `guest-${email}`,
                      name: order.shippingInfo.name || 'Convidado',
                      email: email,
                      totalSpent: 0,
                      tier: 'Bronze', // Convidados são sempre Bronze
                      loyaltyPoints: 0,
                      isGuest: true // Flag para identificar visualmente
                  } as UserType);
              }

              // Atualizar totais do convidado
              const guest = guestMap.get(email)!;
              if (order.status !== 'Cancelado') {
                  guest.totalSpent = (guest.totalSpent || 0) + order.total;
              }
          }
      });

      // 3. Adicionar convidados à lista final
      combinedClients.push(...Array.from(guestMap.values()));

      // 4. Filtragem por pesquisa
      if (!clientsSearchTerm) return combinedClients;
      
      const lowerTerm = clientsSearchTerm.toLowerCase();
      return combinedClients.filter(u => 
          (u.name && u.name.toLowerCase().includes(lowerTerm)) || 
          (u.email && u.email.toLowerCase().includes(lowerTerm))
      ); 
  }, [allUsers, allOrders, clientsSearchTerm]);

  const stats = useMemo(() => { 
    let totalInvested = 0, realizedRevenue = 0, realizedProfit = 0, pendingCashback = 0, potentialProfit = 0; 
    let totalOnlineShippingPaid = 0;

    allOrders.forEach(o => {
        if ((o.status === 'Enviado' || o.status === 'Entregue') && o.storeShippingCost) {
            totalOnlineShippingPaid += o.storeShippingCost;
        }
    });

    activeProducts.forEach(p => { 
        const invested = (p.purchasePrice || 0) * (p.quantityBought || 1); 
        totalInvested += invested; 
        
        let revenue = 0, totalShippingPaid = 0; 
        const manualQtySold = (p.salesHistory || []).reduce((acc, sale) => acc + (sale.quantity || 0), 0); 
        const onlineQtySold = Math.max(0, (p.quantitySold || 0) - manualQtySold); 
        
        revenue = (p.salesHistory || []).reduce((acc, sale) => acc + ((sale.quantity || 0) * (sale.unitPrice || 0)), 0) + (onlineQtySold * (p.salePrice || 0)); 
        totalShippingPaid = (p.salesHistory || []).reduce((acc, sale) => acc + (sale.shippingCost || 0), 0); 
        realizedRevenue += revenue; 
        
        const cogs = (p.quantitySold || 0) * (p.purchasePrice || 0); 
        const profitFromSales = revenue - cogs - totalShippingPaid; 
        
        const cashback = p.cashbackStatus === 'RECEIVED' ? ((p.cashbackValue || 0) / (p.quantityBought || 1)) * (p.quantitySold || 0) : 0; 
        realizedProfit += profitFromSales + cashback; 
        
        if (p.cashbackStatus === 'PENDING') { pendingCashback += (p.cashbackValue || 0); } 
        
        const remainingStock = (p.quantityBought || 0) - (p.quantitySold || 0); 
        if (remainingStock > 0 && p.targetSalePrice) { potentialProfit += ((p.targetSalePrice || 0) - (p.purchasePrice || 0)) * remainingStock; } 
    }); 
    
    realizedProfit -= totalOnlineShippingPaid;

    return { totalInvested, realizedRevenue, realizedProfit, pendingCashback, potentialProfit }; 
  }, [activeProducts, allOrders]);

  const navItems = [
    { id: 'catalog', label: 'Catálogo', icon: Globe },
    { id: 'inventory', label: 'Stock/Lotes', icon: Package },
    { id: 'orders', label: 'Encomendas', icon: ShoppingCart },
    { id: 'requests', label: 'Pedidos de Produtos', icon: ClipboardEdit },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'support', label: 'Suporte', icon: Headphones },
    { id: 'coupons', label: 'Cupões', icon: TicketPercent },
    { id: 'marketing', label: 'Marketing', icon: Megaphone },
    { id: 'reports', label: 'Relatórios', icon: BarChart2 },
    { id: 'imports', label: 'Importações', icon: Truck },
    { id: 'categories', label: 'Categorias', icon: Layers },
    { id: 'backups', label: 'Backups', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100 pb-20 animate-fade-in relative">
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Mobile Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] md:hidden"
            />
            {/* Mobile Sidebar */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-white dark:bg-slate-900 z-[80] md:hidden shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 dark:bg-indigo-500 p-2 rounded-lg text-white">
                    <LayoutDashboard size={24} />
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Backoffice</h1>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={24} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                {navItems.map(item => (
                  <button 
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl text-base font-bold transition-all ${activeTab === item.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                  >
                    <item.icon size={20} className="flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showToast && (
          <div className="fixed top-24 right-4 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-blue-100 dark:border-slate-700 p-4 z-[60] max-w-sm animate-slide-in-right flex items-start gap-4">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full text-green-600 dark:text-green-400"><CheckCircle size={24} /></div>
              <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">Nova Encomenda!</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{showToast.shippingInfo?.name} acabou de comprar.</p>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatCurrency(showToast.total)}</p>
              </div>
              <button onClick={() => setShowToast(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18}/></button>
          </div>
      )}

      <div className="flex bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100 relative">
        {/* Sidebar */}
        <div className="w-[195px] bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex-shrink-0 hidden md:block">
          <div className="p-4 h-[68.8px] border-b border-gray-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 dark:bg-indigo-500 p-2 rounded-lg text-white"><LayoutDashboard size={24} /></div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Backoffice</h1>
              </div>
          </div>
          <nav className="p-4 space-y-1 h-[470px] w-[201.2px]">
              {navItems.map(item => (
                  <button 
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left rounded-lg text-sm font-bold transition-all ${activeTab === item.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                  >
                      <item.icon size={18} className="flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                  </button>
              ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
            <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 p-4 flex justify-between items-center transition-colors sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg md:hidden"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {navItems.find(n => n.id === activeTab)?.label}
                    </div>
                </div>
                {/* Header Actions (Sound, Notifications, Home) */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={toggleSound} 
                        className={`p-2 rounded-full transition-colors relative ${isSoundEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
                        title={isSoundEnabled ? "Silenciar notificações" : "Ativar som de encomendas"}
                    >
                        {isSoundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>

                    <div className="relative">
                        <button onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full relative transition-colors"><Bell size={20} />{notifications.length > 0 && <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">{notifications.length}</span>}</button>
                    </div>
                     <button onClick={() => window.location.hash = '/'} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full" title="Voltar à Loja"><Home size={20} /></button>
                </div>
            </header>
            
            <div className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        {/* ... Tab Contents ... */}
        {activeTab === 'backups' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Database className="text-indigo-500" />
                            Gestão de Backups & Segurança
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Sincronize os dados do Firebase com o Supabase para redundância offline.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={handleSyncPublicStore}
                            disabled={isSyncingAll}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-200 dark:shadow-none"
                        >
                            <UploadCloud size={20} />
                            Construir Loja a partir do Inventário
                        </button>
                        <button 
                            onClick={handleSyncAllData}
                            disabled={isSyncingAll}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                        >
                            {isSyncingAll ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                            {isSyncingAll ? 'Sincronizando...' : 'Sincronizar Tudo agora'}
                        </button>
                    </div>
                </div>

                {syncStatus && (
                    <div className="mb-8 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{syncStatus.current}</span>
                            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{syncStatus.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${syncStatus.progress}%` }}
                                className="bg-indigo-500 h-full"
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                            <ShieldCheck size={18} className="text-green-500" />
                            Estado da Cópia
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">O Supabase atua como uma base de dados secundária. Sempre que cria uma encomenda ou altera um produto, uma cópia é enviada automaticamente.</p>
                    </div>
                    <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                            <Zap size={18} className="text-amber-500" />
                            Alta Disponibilidade
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Em caso de falha no Firebase, o site pode ser configurado para alternar automaticamente para os dados do backup.</p>
                    </div>
                    <div className="p-4 border border-gray-100 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                            <Lock size={18} className="text-blue-500" />
                            Segurança Total
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Os seus dados estão agora protegidos em duas infraestruturas independentes (Google e Supabase/Vercel).</p>
                    </div>
                </div>
            </div>
        )}
        {activeTab === 'requests' && (
            <div className="p-6 md:p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-left">Pedidos de Produtos</h2>
                <RequestsTab user={user} isAdmin={isAdmin} />
            </div>
        )}
        {activeTab === 'catalog' && (
            <CatalogTab 
                products={publicProductsList}
                onEdit={(product) => {
                    setEditingStoreProduct(product);
                    setIsCatalogModalOpen(true);
                }}
                onAddNew={() => {
                    setEditingStoreProduct({
                        id: Date.now(),
                        name: '',
                        category: '',
                        price: 0,
                        description: '',
                        stock: 0,
                        features: [],
                        images: [],
                        image: '',
                    });
                    setIsCatalogModalOpen(true);
                }}
                onDelete={async (id) => {
                    try {
                        const publicQuery = query(collection(modularDb, 'products_public'), where('id', '==', id), limit(1));
                        const publicSnap = await getDocs(publicQuery);
                        if (!publicSnap.empty) {
                            await deleteDoc(publicSnap.docs[0].ref);
                        }
                        setPublicProductsList(prev => prev.filter(p => p.id !== id));
                    } catch (error) {
                        console.error("Erro ao apagar produto público:", error);
                        alert("Erro ao apagar produto.");
                    }
                }}
            />
        )}
        {activeTab === 'inventory' && (
            <InventoryTab 
                products={activeProducts} 
                catalogProducts={publicProductsList}
                pendingOrders={pendingOrders}
                reservations={reservations}
                stats={stats} 
                onlineUsersCount={onlineUsers.length} 
                stockAlerts={stockAlerts} 
                onEdit={handleEdit} 
                onEditProduct={(inventoryItem) => {
                    const prod = publicProductsList.find(p => p.id === inventoryItem.publicProductId);
                    if (prod) {
                        setEditingStoreProduct(prod);
                        setIsCatalogModalOpen(true);
                    } else {
                        alert('Este lote não está associado a um produto do catálogo. Associe-o primeiro editando o lote.');
                    }
                }}
                onCreateVariant={handleCreateVariant} 
                onDeleteGroup={handleDeleteGroup} 
                onSale={openSaleModal} 
                onDelete={handleDelete} 
                onSyncStock={handleSyncPublicStock} 
                isSyncingStock={isSyncingStock} 
                onOpenScanner={(mode) => { setScannerMode(mode); setIsScannerOpen(true); }} 
                onOpenCalculator={() => setIsCalculatorOpen(true)} 
                onAddNew={handleAddNew} 
                onOpenInvestedModal={handleOpenInvestedModal} 
                onOpenRevenueModal={handleOpenRevenueModal} 
                onOpenProfitModal={handleOpenProfitModal} 
                onOpenCashbackManager={handleOpenCashbackManager} 
                onOpenOnlineDetails={() => setIsAnalyticsModalOpen(true)} 
                onOpenStockAlerts={(p) => checkAndProcessStockAlerts(p.publicProductId || null, p.name, 999)} 
                copyToClipboard={copyToClipboard} 
                searchTerm={inventorySearchTerm} 
                onSearchChange={setInventorySearchTerm}

            />
        )}


        
        {activeTab === 'orders' && (
            <OrdersTab 
                orders={allOrders} 
                inventoryProducts={products} 
                isAdmin={isAdmin} 
                onStatusChange={handleOrderStatusChange} 
                onDeleteOrder={handleDeleteOrder} 
                onViewDetails={setSelectedOrderDetails} 
                onOpenManualOrder={() => setIsManualOrderModalOpen(true)}
                onOpenFulfillment={(order) => {
                    console.log("Opening fulfillment for order:", order.id);
                    setSelectedOrderForFulfillment(order);
                }}
            />
        )}
        
        {activeTab === 'clients' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden animate-fade-in transition-colors">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center"><h3 className="font-bold text-gray-800 dark:text-white">Gestão de Clientes ({filteredClients.length})</h3><div className="relative"><input type="text" placeholder="Pesquisar cliente..." value={clientsSearchTerm} onChange={e => setClientsSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white" /><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/></div></div><div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap"><thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase"><tr><th className="px-6 py-4">Nome</th><th className="px-6 py-4">Email</th><th className="px-6 py-4">Total Gasto</th><th className="px-6 py-4">Nível</th><th className="px-6 py-4">AllPoints</th><th className="px-6 py-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm">{filteredClients.map(client => (<tr key={client.uid} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"><td className="px-6 py-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">{client.name} {client.isGuest && <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-600 text-gray-500 dark:text-gray-300 text-[10px] uppercase font-bold border border-gray-200 dark:border-slate-500">Convidado</span>}</td><td className="px-6 py-4 text-gray-600 dark:text-gray-300">{client.email}</td><td className="px-6 py-4 text-gray-900 dark:text-gray-100">{formatCurrency(client.totalSpent || 0)}</td><td className="px-6 py-4 font-medium text-gray-700 dark:text-gray-300">{client.tier || 'Bronze'}</td><td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">{client.loyaltyPoints || 0}</td><td className="px-6 py-4 text-right"><button onClick={() => setSelectedUserDetails(client)} className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline">Ver Detalhes</button></td></tr>))}</tbody></table></div>
            </div>
        )}

        {/* MARKETING TAB */}
        {activeTab === 'marketing' && (
            <div className="animate-fade-in space-y-8">
                {/* Stats Card */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold flex items-center gap-3"><Megaphone size={32}/> Central de Campanhas</h2>
                        <p className="text-blue-100 max-w-lg">Envie notificações push para todos os seus clientes em segundos. Alcance todos os dispositivos (PC, iPhone, Android) onde o cliente tenha a app instalada.</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 text-center min-w-[200px]">
                        <p className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-1">Alcance Potencial</p>
                        <div className="text-4xl font-black">{allUsers.reduce((acc, u) => acc + (u.deviceTokens?.length || (u.fcmToken ? 1 : 0)), 0)}</div>
                        <p className="text-xs text-blue-200 mt-1">Dispositivos registados</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Formulário de Envio REAL */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2"><Send size={20} className="text-blue-600 dark:text-blue-400"/> Enviar Nova Notificação</h3>
                        
                        <form onSubmit={handleSendPush} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Título da Notificação</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="Ex: Promoção Relâmpago ⚡️" 
                                    value={pushForm.title}
                                    onChange={e => setPushForm({...pushForm, title: e.target.value})}
                                    className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Mensagem</label>
                                <textarea 
                                    required 
                                    rows={3}
                                    placeholder="Ex: Descontos até 50% em TV Boxes só hoje!" 
                                    value={pushForm.body}
                                    onChange={e => setPushForm({...pushForm, body: e.target.value})}
                                    className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-200 dark:border-slate-600">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="target" 
                                        value="all" 
                                        checked={pushForm.target === 'all'} 
                                        onChange={() => setPushForm({...pushForm, target: 'all'})}
                                        className="w-5 h-5 text-blue-600"
                                    />
                                    <div>
                                        <span className="font-bold text-gray-900 dark:text-white block">Enviar para TODOS</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Alcança todos os utilizadores com notificações ativas.</span>
                                    </div>
                                </label>
                            </div>

                            {pushResult && (
                                <div className={`p-4 rounded-xl flex items-start gap-3 ${pushResult.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                                    {pushResult.success ? <CheckCircle size={20} className="mt-0.5"/> : <AlertCircle size={20} className="mt-0.5"/>}
                                    <p className="text-sm font-medium">{pushResult.msg}</p>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={isSendingPush || !pushForm.title || !pushForm.body}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isSendingPush ? <Loader2 className="animate-spin" size={20} /> : <><Smartphone size={20}/> Enviar Agora</>}
                            </button>
                        </form>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-800">
                            <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-4 flex items-center gap-2"><Info size={18}/> Como funciona?</h4>
                            <p className="text-sm text-indigo-800 dark:text-indigo-400 leading-relaxed mb-4">
                                Esta funcionalidade usa uma API segura para comunicar com o Firebase. Quando clica em enviar:
                            </p>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-indigo-800 dark:text-indigo-400">
                                <li>O sistema recolhe todos os tokens de todos os utilizadores (PC, Android, iPhone).</li>
                                <li>Remove duplicados para não enviar 2x para o mesmo aparelho.</li>
                                <li>Envia a mensagem instantaneamente.</li>
                            </ol>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700">
                            <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Sparkles size={18} className="text-yellow-500"/> Dicas de Conversão</h4>
                            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                                <li className="flex gap-2"><CheckCircle size={16} className="text-green-500 shrink-0"/> <strong>Seja breve:</strong> Títulos curtos funcionam melhor.</li>
                                <li className="flex gap-2"><CheckCircle size={16} className="text-green-500 shrink-0"/> <strong>Use Emojis:</strong> Aumentam a taxa de abertura. 🚀</li>
                                <li className="flex gap-2"><CheckCircle size={16} className="text-green-500 shrink-0"/> <strong>Call to Action:</strong> Diga o que fazer (ex: "Toque para ver").</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Coupons, Support Tabs) ... */}

        {activeTab === 'coupons' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                {/* Create Coupon Card */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 h-fit space-y-6 transition-colors">
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Plus size={20} className="text-green-600 dark:text-green-400" /> Novo Cupão</h3>
                        <form onSubmit={handleAddCoupon} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Código</label>
                                <input type="text" required value={newCoupon.code} onChange={e => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded uppercase font-bold tracking-wider bg-white dark:bg-slate-900 text-gray-900 dark:text-white" placeholder="NATAL20" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo</label>
                                    <select value={newCoupon.type} onChange={e => setNewCoupon({...newCoupon, type: e.target.value as any})} className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
                                        <option value="PERCENTAGE">Percentagem (%)</option>
                                        <option value="FIXED">Valor Fixo (€)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Valor</label>
                                    <input type="number" required min="1" value={newCoupon.value} onChange={e => setNewCoupon({...newCoupon, value: Number(e.target.value)})} className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Produto Específico (Opcional)</label>
                                <select 
                                    className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white" 
                                    value={newCoupon.validProductId || ''} 
                                    onChange={(e) => setNewCoupon({...newCoupon, validProductId: e.target.value ? Number(e.target.value) : undefined})}
                                >
                                    <option value="">-- Válido em Toda a Loja --</option>
                                    {publicProductsList.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Mínimo Compra (€)</label>
                                <input type="number" min="0" value={newCoupon.minPurchase} onChange={e => setNewCoupon({...newCoupon, minPurchase: Number(e.target.value)})} className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-white" />
                            </div>
                            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded transition-colors">Criar Cupão</button>
                        </form>
                    </div>

                    {/* Raio-X */}
                    <div className="pt-6 border-t border-gray-100 dark:border-slate-700 mb-6">
                        <button 
                            onClick={() => setIsXRayModalOpen(true)}
                            className="bg-red-600 text-white w-full py-2 rounded text-xs font-bold hover:bg-red-700"
                        >
                            Raio-X de Encomendas
                        </button>
                    </div>

                    {/* Simple Coupon Calculator */}
                    <div className="pt-6 border-t border-gray-100 dark:border-slate-700">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm mb-3 flex items-center gap-2"><Calculator size={16} /> Calculadora de Promoção</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <input type="number" placeholder="Preço Original" className="p-2 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-900 text-gray-900 dark:text-white" value={couponCalcOriginal} onChange={e => setCouponCalcOriginal(e.target.value)} />
                            <input type="number" placeholder="Preço Final" className="p-2 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-900 text-gray-900 dark:text-white" value={couponCalcTarget} onChange={e => setCouponCalcTarget(e.target.value)} />
                        </div>
                        {couponCalcResult && (
                            <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded text-xs text-blue-800 dark:text-blue-300">
                                Para vender a <strong>{formatCurrency(parseFloat(couponCalcTarget))}</strong>, crie um cupão de:
                                <ul className="list-disc pl-4 mt-1 font-bold">
                                    <li>Valor Fixo: {formatCurrency(couponCalcResult.fixed)}</li>
                                    <li>Percentagem: {couponCalcResult.percent.toFixed(1)}%</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                    {isCouponsLoading ? <p className="text-gray-500 dark:text-gray-400">A carregar...</p> : coupons.map(c => {
                        const productRestriction = c.validProductId ? publicProductsList.find(p => p.id === c.validProductId)?.name : null;
                        return (
                            <div key={c.id} className={`bg-white dark:bg-slate-800 p-4 rounded-xl border flex items-center justify-between transition-colors ${c.isActive ? 'border-gray-200 dark:border-slate-700' : 'border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 opacity-75'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${c.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}><TicketPercent size={24} /></div>
                                    <div>
                                        <h4 className="font-bold text-lg tracking-wider text-gray-900 dark:text-white">{c.code}</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">{c.type === 'PERCENTAGE' ? `${c.value}% Desconto` : `${formatCurrency(c.value)} Desconto`}{c.minPurchase > 0 && ` (Min. ${formatCurrency(c.minPurchase)})`}</p>
                                        {productRestriction && <p className="text-xs text-purple-600 dark:text-purple-400 font-bold mt-0.5">Exclusivo: {productRestriction}</p>}
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Usado {c.usageCount} vezes</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleToggleCoupon(c)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${c.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {c.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{c.isActive ? 'Ativo' : 'Inativo'}
                                    </button>
                                    <button onClick={() => handleDeleteCoupon(c.id)} className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        );
                    })}
                    {coupons.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Não há cupões criados.</p>}
                </div>
            </div>
        )}

        {activeTab === 'reports' && (
            <ReportsTab orders={allOrders} inventoryProducts={activeProducts} />
        )}

        {activeTab === 'imports' && (
            <ImportsTab />
        )}

        {activeTab === 'categories' && (
            <CategoriesTab />
        )}

        {/* ... (Support Tab) ... */}
        {activeTab === 'support' && (
            <div className="space-y-6 animate-fade-in">
                {/* ... (Keep existing support content) ... */}
                <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
                    <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2"><Headphones className="text-indigo-600 dark:text-indigo-400"/> Tickets de Suporte</h3>
                    <div className="flex gap-2">
                        <span className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold border border-red-100">Abertos: {tickets.filter(t => t.status === 'Aberto').length}</span>
                        <span className="bg-yellow-50 text-yellow-600 px-3 py-1 rounded-lg text-xs font-bold border border-yellow-100">Em Análise: {tickets.filter(t => t.status === 'Em Análise').length}</span>
                        <span className="bg-green-50 text-green-600 px-3 py-1 rounded-lg text-xs font-bold border border-green-100">Resolvidos: {tickets.filter(t => t.status === 'Resolvido').length}</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-gray-50 dark:bg-slate-700 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase transition-colors">
                                <tr>
                                    <th className="px-6 py-4">ID</th>
                                    <th className="px-6 py-4">Cliente</th>
                                    <th className="px-6 py-4">Assunto</th>
                                    <th className="px-6 py-4">Categoria</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4">Data</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm transition-colors">
                                {isTicketsLoading ? (<tr><td colSpan={7} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-indigo-500"/></td></tr>) : 
                                tickets.length === 0 ? (<tr><td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">Sem tickets de suporte.</td></tr>) :
                                tickets.map(ticket => (
                                    <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => setSelectedTicket(ticket)}>
                                        <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">{ticket.id}</td>
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-gray-900 dark:text-white">{ticket.customerName}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{ticket.customerEmail}</p>
                                        </td>
                                        <td className="px-6 py-4 truncate max-w-xs text-gray-700 dark:text-gray-300">{ticket.subject}</td>
                                        <td className="px-6 py-4"><span className="bg-gray-100 dark:bg-slate-600 px-2 py-1 rounded text-xs font-medium text-gray-700 dark:text-gray-200">{ticket.category}</span></td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${ticket.status === 'Aberto' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : ticket.status === 'Em Análise' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{new Date(ticket.createdAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline">Ver</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
      </div>
      
      <ProfitCalculatorModal isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
      {isXRayModalOpen && <OrderXRayModal onClose={() => setIsXRayModalOpen(false)} />}
      <ManualOrderModal isOpen={isManualOrderModalOpen} onClose={() => setIsManualOrderModalOpen(false)} publicProducts={publicProductsList} inventoryProducts={products} onConfirm={async (order, deductions) => { 
          try { 
              await setDoc(doc(modularDb, 'orders', order.id), order); 
              // Sync to Supabase
              supabaseSync.saveOrder(order);
              
              for (const ded of deductions) { 
                  const product = products.find(p => p.id === ded.batchId); 
                  if (product) { 
                      const newSold = (product.quantitySold || 0) + ded.quantity; 
                      const status: ProductStatus = newSold >= product.quantityBought ? 'SOLD' : 'PARTIAL'; 
                      await updateProduct(product.id, { quantitySold: newSold, status: status, salesHistory: [...(product.salesHistory || []), ded.saleRecord] }); 
                  } 
              } 
              setIsManualOrderModalOpen(false); 
              alert("Encomenda manual registada com sucesso!"); 
          } catch (error) { 
              console.error("Erro ao criar encomenda manual:", error); 
              alert("Erro ao processar a encomenda."); 
          } 
      }} />
      {selectedOrderForFulfillment && (
          <OrderFulfillmentModal 
              order={selectedOrderForFulfillment}
              inventoryProducts={products}
              onClose={() => setSelectedOrderForFulfillment(null)}
              onSuccess={() => {
                  setSelectedOrderForFulfillment(null);
                  alert("Encomenda expedida com sucesso!");
              }}
          />
      )}
      <OrderDetailsModal order={selectedOrderDetails} inventoryProducts={products} onClose={() => setSelectedOrderDetails(null)} onUpdateOrder={(id, u) => setAllOrders(prev => prev.map(o => o.id === id ? {...o, ...u} : o))} onUpdateTracking={handleUpdateTracking} onCopy={handleCopy} isAdmin={isAdmin} />
      
      {/* Catalog Modal */}
      <CatalogModal 
        isOpen={isCatalogModalOpen} 
        onClose={() => setIsCatalogModalOpen(false)} 
        product={editingStoreProduct} 
        onSave={async (updatedProduct) => {
          try {
            const cleanProduct = JSON.parse(JSON.stringify(updatedProduct));
            const id = Number(cleanProduct.id);
            // Ensure id is stored in the document data, as it's required for queries and loading
            cleanProduct.id = id;
            await setDoc(doc(modularDb, 'products_public', id.toString()), cleanProduct, { merge: true });
            
            // Sync to Supabase
            supabaseSync.saveProduct(cleanProduct);

            // Sync down to Inventory so they are synchronized perfectly
            await syncInventoryFromPublicProduct(id);

            setPublicProductsList(prev => {
              const exists = prev.find(p => p.id === id);
              if (exists) return prev.map(p => p.id === id ? { ...updatedProduct, id } : p);
              return [...prev, { ...updatedProduct, id }];
            });
            setIsCatalogModalOpen(false);
          } catch (error) {
            console.error("Erro ao guardar produto no catálogo:", error);
            alert("Erro ao guardar produto.");
          }
        }} 
      />

      {isModalOpen && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"><div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transition-colors"><div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10 transition-colors"><h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">{editingId ? <Edit2 size={20} /> : <Plus size={20} />} {editingId ? 'Editar Lote / Produto' : 'Novo Lote de Stock'}</h2><button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400"><X size={24}/></button></div><div className="p-6"><form onSubmit={handleProductSubmit} className="space-y-6">        <div className="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-xl border border-blue-100 dark:border-blue-800/30">
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase mb-4 flex items-center gap-2">
                <LinkIcon size={16} /> Passo 1: Ligar a Produto da Loja (Opcional)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Produto da Loja</label>
                    <select 
                        className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        value={formData.publicProductId} 
                        onChange={handlePublicProductSelect}
                    >
                        <option value="">-- Nenhum (Apenas Backoffice) --</option>
                        {publicProductsList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Ao selecionar, o nome e categoria são preenchidos automaticamente.</p>
                </div>
                
                {selectedPublicProductVariants.length > 0 && (
                    <div className="animate-fade-in-down">
                        <label className="block text-xs font-bold text-gray-900 dark:text-white uppercase mb-1 bg-yellow-100 dark:bg-yellow-900/40 w-fit px-1 rounded">Passo 2: Escolha a Variante</label>
                        <select 
                            className="w-full p-3 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none bg-white dark:bg-slate-800 font-bold text-gray-900 dark:text-white"
                            value={formData.variant} 
                            onChange={(e) => setFormData({...formData, variant: e.target.value})}
                            required
                        >
                            <option value="">-- Selecione uma Opção --</option>
                            {selectedPublicProductVariants.map((v, idx) => <option key={idx} value={v.name}>{v.name}</option>)}
                        </select>
                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1 font-medium">⚠ Obrigatório: Este produto tem várias opções.</p>
                    </div>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800/30">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase flex items-center gap-2">
                        <LinkIcon size={12}/> Ligação Manual (Avançado)
                    </label>
                    <button type="button" onClick={() => setIsPublicIdEditable(!isPublicIdEditable)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        {isPublicIdEditable ? <Unlock size={10}/> : <Lock size={10}/>} {isPublicIdEditable ? 'Bloquear' : 'Editar ID'}
                    </button>
                </div>
                <div className="flex gap-2 items-center">
                    <input 
                        type="text" 
                        value={formData.publicProductId} 
                        onChange={(e) => setFormData({...formData, publicProductId: e.target.value})} 
                        disabled={!isPublicIdEditable}
                        placeholder="ID numérico do produto público"
                        className={`w-full p-2 border rounded-lg text-sm font-mono ${isPublicIdEditable ? 'bg-white dark:bg-slate-800 border-blue-300 dark:border-blue-700 text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-700'}`}
                    />
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 w-full">
                        Para agrupar variantes (ex: cores), use o mesmo ID Público em todos.
                    </div>
                </div>
            </div>
        </div> {!formData.publicProductId && (<div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 space-y-4"><div>
      
      <div className="flex justify-between items-center mb-1">
          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2"><AlignLeft size={16} /> Descrição Completa</h4>
          <button 
            type="button" 
            onClick={handleGenerateDescription}
            disabled={isGeneratingContent}
            className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-100 transition-colors"
          >
              {isGeneratingContent ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>} Gerar com IA
          </button>
      </div>
      
      <textarea rows={4} className="w-full p-3 border border-gray-300 rounded-lg text-sm" placeholder="Descreva o produto com detalhes..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}/></div><div><h4 className="font-bold text-gray-800 text-sm flex items-center gap-2 mb-2"><ImageIcon size={16} /> Galeria de Imagens</h4>{formData.images.length > 0 && (<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">{formData.images.map((img, idx) => (<div key={idx} className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col"><div className="aspect-square relative"><img src={img} alt={`Img ${idx}`} className="w-full h-full object-contain p-1" /><div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 rounded">{idx + 1}</div></div><div className="flex border-t border-gray-100 divide-x divide-gray-100"><button type="button" disabled={idx === 0} onClick={() => handleMoveImage(idx, 'left')} className="flex-1 p-1.5 hover:bg-gray-100 disabled:opacity-30 flex justify-center"><ArrowLeft size={14} /></button><button type="button" onClick={() => handleRemoveImage(idx)} className="flex-1 p-1.5 hover:bg-red-50 text-red-500 flex justify-center"><Trash2 size={14} /></button><button type="button" disabled={idx === formData.images.length - 1} onClick={() => handleMoveImage(idx, 'right')} className="flex-1 p-1.5 hover:bg-gray-100 disabled:opacity-30 flex justify-center"><ArrowRightIcon size={14} /></button></div></div>))}</div>)}    <div className="flex gap-2">
      <div className="relative flex-1">
        <input 
          type="url" 
          placeholder="Cole o link da imagem (ex: imgur.com/...)" 
          className="w-full p-3 border border-gray-300 rounded-lg text-sm pr-20" 
          value={formData.newImageUrl} 
          onChange={e => setFormData({...formData, newImageUrl: e.target.value})} 
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()} 
          disabled={isUploading} 
          className="absolute right-1 top-1 bottom-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 rounded-md text-xs font-bold flex items-center gap-1 transition-colors" 
          title="Upload do PC"
        >
          {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          <span>Upload</span>
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange}/>
      </div>
      <button 
        type="button" 
        onClick={handleAddImage} 
        disabled={isUploading || !formData.newImageUrl?.trim()}
        className={`px-4 rounded-lg font-bold transition-colors ${isUploading || !formData.newImageUrl?.trim() ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
      >
        Adicionar Link
      </button>
    </div>
    <p className="text-[10px] text-gray-400 mt-1 italic">* O upload de ficheiros é automático após a seleção.</p>
    {isUploading && uploadProgress !== null && (
        <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <p className="text-xs text-center text-gray-500 mt-1">A carregar... {Math.round(uploadProgress)}%</p>
        </div>
    )}
</div>

<div>
    <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2 mb-2"><ListPlus size={16} /> Destaques / Características Principais</h4>
    {formData.features.length > 0 && (
        <div className="space-y-2 mb-3">
            {formData.features.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded border border-gray-200 dark:border-slate-700 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"></div>
                    <span className="flex-1 text-gray-700 dark:text-gray-300">{feat}</span>
                    <button type="button" onClick={() => handleRemoveFeature(idx)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
            ))}
        </div>
    )}
    <div className="flex gap-2">
        <input type="text" placeholder="Ex: Bateria de 24h, WiFi 6..." className="flex-1 p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.newFeature} onChange={e => setFormData({...formData, newFeature: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFeature())} />
        <button type="button" onClick={handleAddFeature} className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-4 rounded-lg font-bold transition-colors">+ Item</button>
    </div>
</div>
<div className="mt-4">
    <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2 mb-2"><Settings size={16} /> Especificações Técnicas (Comparador)</h4>
    {formData.specs && Object.keys(formData.specs).length > 0 && (
        <div className="space-y-2 mb-3">
            {Object.entries(formData.specs).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded border border-gray-200 dark:border-slate-700 text-sm">
                    <span className="font-bold text-gray-600 dark:text-gray-400">{key}:</span>
                    <span className="flex-1 text-gray-800 dark:text-gray-300">{value.toString()}</span>
                    <button type="button" onClick={() => handleRemoveSpec(key)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
            ))}
        </div>
    )}
    <div className="flex gap-2">
        <input type="text" placeholder="Característica (Ex: RAM)" className="w-1/3 p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.newSpecKey} onChange={e => setFormData({...formData, newSpecKey: e.target.value})} />
        <input type="text" placeholder="Valor (Ex: 8GB)" className="flex-1 p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.newSpecValue} onChange={e => setFormData({...formData, newSpecValue: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpec())} />
        <button type="button" onClick={handleAddSpec} className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-800 dark:text-white px-4 rounded-lg font-bold transition-colors">+</button>
    </div>
</div>
</div>
)}

<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nome do Lote</label>
        <input required type="text" className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
    </div>
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Categoria</label>
        <select className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
            <option value="" disabled>Selecione uma categoria</option>
            {storeCategories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
        </select>
    </div>
</div> 

<div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
    <div className="md:col-span-2">
        <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2"><Globe size={16} /> Rastreabilidade do Fornecedor</h4>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-3">Preencha para saber a origem deste produto em caso de garantia.</p>
    </div>
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Nome Fornecedor (Ex: Temu)</label>
        <div className="space-y-2">
            <input 
                type="text" 
                placeholder="Temu, AliExpress, Amazon..." 
                className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                value={formData.supplierName} 
                onChange={e => setFormData({...formData, supplierName: e.target.value})} 
            />
            <div className="flex flex-wrap gap-1">
                {['Temu', 'AliExpress', 'Alibaba', 'Amazon', 'Vinted', 'eBay', 'Local'].map(s => (
                    <button 
                        key={s} 
                        type="button" 
                        onClick={() => setFormData({...formData, supplierName: s})}
                        className="text-[10px] px-2 py-0.5 rounded border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400 transition-colors"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
    </div>
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">ID Encomenda Origem</label>
        <input type="text" placeholder="Ex: PO-2023-9999" className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.supplierOrderId} onChange={e => setFormData({...formData, supplierOrderId: e.target.value})} />
    </div>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Data Compra</label>
        <input required type="date" className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.purchaseDate} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} />
    </div>
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Qtd. Comprada</label>
        <input required type="number" min="1" className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.quantityBought} onChange={e => setFormData({...formData, quantityBought: e.target.value})} />
    </div>
    <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Preço Compra (Unitário)</label>
        <div className="relative">
            <span className="absolute left-3 top-3 text-gray-400">€</span>
            <input required type="number" step="0.01" className="w-full pl-8 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.purchasePrice} onChange={e => setFormData({...formData, purchasePrice: e.target.value})} />
        </div>
    </div>
</div>
      <div className="border-t pt-4 border-gray-100 dark:border-slate-800">
          <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2 mb-3">
              <Wallet size={16} className="text-yellow-600"/> Gestão de Cashback
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Valor Total Cashback (Lote)</label>
                  <div className="relative">
                      <span className="absolute left-3 top-3 text-gray-400">€</span>
                      <input 
                          type="number" 
                          step="0.01" 
                          className="w-full pl-8 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                          value={formData.cashbackValue} 
                          onChange={e => setFormData({...formData, cashbackValue: e.target.value})} 
                      />
                  </div>
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Estado</label>
                  <select 
                      className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      value={formData.cashbackStatus}
                      onChange={e => setFormData({...formData, cashbackStatus: e.target.value as CashbackStatus})}
                  >
                      <option value="NONE">Nenhum</option>
                      <option value="PENDING">Pendente</option>
                      <option value="RECEIVED">Recebido</option>
                  </select>
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Plataforma (Ex: Temu, Rakuten)</label>
                  <input 
                      type="text" 
                      className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                      value={formData.cashbackPlatform} 
                      onChange={e => setFormData({...formData, cashbackPlatform: e.target.value})} 
                      placeholder="Ex: Temu, AliExpress..."
                  />
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Conta / Email utilizado</label>
                  <input 
                      type="text" 
                      className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                      value={formData.cashbackAccount} 
                      onChange={e => setFormData({...formData, cashbackAccount: e.target.value})} 
                      placeholder="Ex: conta1@gmail.com"
                  />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Previsão de Recebimento</label>
                  <input 
                      type="date" 
                      className="w-full p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                      value={formData.cashbackExpectedDate} 
                      onChange={e => setFormData({...formData, cashbackExpectedDate: e.target.value})} 
                  />
              </div>
          </div>
      </div>
      {/* SEÇÃO DE PROMOÇÕES (NOVA) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6 border-gray-100">
          <div>
              <label className="block text-xs font-bold text-green-700 uppercase mb-1 bg-green-50 w-fit px-1 rounded">Preço Venda (Loja)</label>
              <div className="relative"><span className="absolute left-3 top-3 text-green-600 font-bold">€</span><input type="number" step="0.01" className="w-full pl-8 p-3 border-2 border-green-400 rounded-lg font-bold text-green-800" value={formData.salePrice} onChange={e => setFormData({...formData, salePrice: e.target.value})} placeholder="Valor Final" /></div>
              <p className="text-[10px] text-gray-500 mt-1">Este é o preço que aparecerá no site.</p>
          </div>
          <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço Original (Riscado)</label>
              <div className="relative"><span className="absolute left-3 top-3 text-gray-400">€</span><input type="number" step="0.01" className="w-full pl-8 p-3 border border-gray-300 rounded-lg text-gray-500" value={formData.originalPrice} onChange={e => setFormData({...formData, originalPrice: e.target.value})} placeholder="Ex: 49.90" /></div>
              <p className="text-[10px] text-gray-500 mt-1">Se preenchido, aparecerá riscado ao lado do preço de venda.</p>
          </div>
          <div className="md:col-span-2">
              <label className="block text-xs font-bold text-red-500 uppercase mb-1 flex items-center gap-1"><Timer size={14}/> Fim da Promoção (Countdown)</label>
              <input type="datetime-local" className="w-full p-3 border border-gray-300 rounded-lg" value={formData.promoEndsAt} onChange={e => setFormData({...formData, promoEndsAt: e.target.value})} />
              <p className="text-[10px] text-gray-500 mt-1">Define uma data para mostrar um contador decrescente na página do produto.</p>
          </div>
      </div>
      {/* (Fim Seção Promoções) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-slate-800">
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Preço Alvo (Estimado)</label>
              <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400">€</span>
                  <input type="number" step="0.01" className="w-full pl-8 p-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800" value={formData.targetSalePrice} onChange={e => setFormData({...formData, targetSalePrice: e.target.value})} />
              </div>
          </div>
      </div>

      <div className="border-t pt-4 border-gray-100 dark:border-slate-800">
          <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2 mb-3">
              <Scale size={16} /> Logística & Peso
          </h4>
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Peso Unitário (kg)</label>
              <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-400 text-xs font-bold">KG</span>
                  <input type="number" step="0.001" className="w-full pl-10 p-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} placeholder="Ex: 0.350" />
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Essencial para calcular portes de envio automáticos no futuro.</p>
          </div>
      </div>
      <div className="border-t pt-4 border-gray-100 dark:border-slate-800">
          <h4 className="font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2 mb-3">
               <ScanBarcode size={16} /> Gestão de Unidades (S/N)
          </h4>
          <div className="flex gap-2 mb-3">
               <button type="button" onClick={() => { setScannerMode('add_unit'); setIsScannerOpen(true); }} className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 p-3 rounded-lg text-xs font-bold flex items-center gap-2">
                   <Camera size={16} /> Escanear S/N
               </button>
               <div className="flex gap-1 items-center">
                   <input type="number" min="1" value={generateQty} onChange={(e) => setGenerateQty(parseInt(e.target.value) || 1)} className="w-16 p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-xs" />
                   <button type="button" onClick={handleGenerateCodes} className="bg-indigo-600 text-white hover:bg-indigo-700 p-3 rounded-lg text-xs font-bold flex items-center gap-2">
                       <Zap size={16} /> Gerar Manual
                   </button>
               </div>
               <button type="button" onClick={handlePrintLabels} disabled={generatedCodes.length === 0} className="bg-blue-600 text-white hover:bg-blue-700 p-3 rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">
                   <Printer size={16} /> Imprimir Etiquetas ({generatedCodes.length})
               </button>
          </div>
          <div className="flex flex-wrap gap-2">
               {modalUnits.map((unit, idx) => (
                   <div key={idx} className="bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded text-xs font-mono flex items-center gap-2">
                       {unit.id} <button type="button" onClick={() => setModalUnits(prev => prev.filter(u => u.id !== unit.id))} className="text-red-500 hover:text-red-700">X</button>
                   </div>
               ))}
          </div>
      </div>

      {editingId && (() => {
          const p = products.find(prod => prod.id === editingId);
          let history: any[] = [];
          if (p?.salesHistory && Array.isArray(p.salesHistory)) {
              history = p.salesHistory.map((s: any) => ({
                  id: s.id,
                  date: s.date,
                  quantity: s.quantity,
                  unitPrice: s.unitPrice,
                  isOnline: false,
                  source: 'Venda Manual / Baixa'
              }));
          }
          if (p?.publicProductId) {
              allOrders.forEach(order => {
                  if (['Cancelado', 'Reclamação', 'Pendente'].includes(order.status)) return;
                  const relevantItems = order.items.filter((item) => {
                      if (typeof item === 'string') return false;
                      const orderItem = item as OrderItem;
                      
                      const isSameProduct = orderItem.productId?.toString() === p.publicProductId?.toString() && 
                             (!p.variant || orderItem.selectedVariant === p.variant);

                      if (!isSameProduct) return false;

                      // Strict batch checking using Serial Numbers IF the batch has units
                      if (p.units && p.units.length > 0) {
                          if (!orderItem.serialNumbers || orderItem.serialNumbers.length === 0) return false;
                          const batchUnitIds = p.units.map((u: any) => u.id);
                          const intersect = orderItem.serialNumbers.filter((sn: string) => batchUnitIds.includes(sn));
                          return intersect.length > 0;
                      }

                      return true;
                  });
                  if (relevantItems.length > 0) {
                      // If SNs match, the quantity is the number of matched SNs!
                      let quantity = 0;
                      if (p.units && p.units.length > 0) {
                          const batchUnitIds = p.units.map((u: any) => u.id);
                          relevantItems.forEach((item: any) => {
                              if (item.serialNumbers) {
                                  quantity += item.serialNumbers.filter((sn: string) => batchUnitIds.includes(sn)).length;
                              }
                          });
                      } else {
                          quantity = relevantItems.reduce((sum: number, item: any) => sum + ((item as OrderItem).quantity || 1), 0);
                      }
                      
                      const unitPrice = (relevantItems[0] as OrderItem).price || 0;
                      history.push({
                          id: order.id,
                          date: order.date.split('T')[0],
                          customerName: order.shippingInfo?.name || order.shippingInfo?.email?.split('@')[0] || 'Cliente',
                          quantity,
                          unitPrice,
                          isOnline: true,
                          orderStatus: order.status,
                          source: `Online (${order.id.slice(-5)})`
                      });
                  }
              });
          }
          history.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
              <div className="border-t pt-6 border-gray-100 dark:border-slate-800">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><History size={20} /> Histórico de Vendas deste Lote</h3>
                  {history.length > 0 ? (
                      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-100 dark:bg-slate-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                                  <tr>
                                      <th className="px-4 py-2">Data</th>
                                      <th className="px-4 py-2">Origem/Cliente</th>
                                      <th className="px-4 py-2 text-center">Qtd</th>
                                      <th className="px-4 py-2">Valor</th>
                                      <th className="px-4 py-2 text-right">Ação</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                  {history.map((sale, idx) => (
                                      <tr key={`${sale.id}-${idx}`} className="text-gray-700 dark:text-gray-300">
                                          <td className="px-4 py-2 whitespace-nowrap">{sale.date}</td>
                                          <td className="px-4 py-2">
                                              <div className="text-xs font-medium">{sale.source}</div>
                                              {sale.customerName && <div className="text-[10px] text-gray-500 line-clamp-1">{sale.customerName}</div>}
                                          </td>
                                          <td className="px-4 py-2 font-bold text-center">{sale.quantity}</td>
                                          <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(sale.unitPrice * sale.quantity)}</td>
                                          <td className="px-4 py-2 text-right">
                                              <div className="flex items-center justify-end gap-2 mb-1">
                                                  {sale.isOnline && (
                                                      <button type="button" onClick={(e) => {
                                                          e.preventDefault();
                                                          const ord = allOrders.find(o => o.id === sale.id);
                                                          if (ord) setSelectedOrderDetails(ord);
                                                      }} className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2 py-1 bg-blue-50 text-center hover:bg-blue-100 rounded transition-colors">
                                                          Ver
                                                      </button>
                                                  )}
                                                  <button type="button" onClick={() => handleDeleteSale(sale.id, sale.isOnline)} className="text-red-500 hover:text-red-700 text-xs font-bold border border-red-200 dark:border-red-900/30 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                                      {sale.isOnline ? 'Anular Envio' : 'Anular'}
                                                  </button>
                                              </div>
                                              {sale.isOnline && (
                                                  <div className="text-[10px] text-gray-400 font-medium">{sale.orderStatus}</div>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  ) : (
                      <p className="text-gray-500 dark:text-gray-400 text-sm italic">Nenhuma venda registada para este lote ainda.</p>
                  )}
              </div>
          );
      })()}

      <div className="flex gap-3 pt-4 sticky bottom-0 bg-white dark:bg-slate-900 z-10 border-t border-gray-100 dark:border-slate-800 transition-colors">
          <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow-lg transition-colors flex items-center justify-center gap-2">
              <Save size={20} /> Guardar Lote
          </button>
      </div>
  </form>
</div></div></div>)}
      {/* Sale Modal */}
      {isSaleModalOpen && selectedProductForSale && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"><div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto transition-colors"><div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 transition-colors"><h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><DollarSign size={20} className="text-green-600 dark:text-green-400"/> Registar Venda / Baixa</h3><button onClick={() => setIsSaleModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={24}/></button></div><form onSubmit={handleSaleSubmit} className="p-6 space-y-6"><div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700"><p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Produto</p><p className="font-bold text-gray-900 dark:text-white">{selectedProductForSale.name}</p><p className="text-xs text-blue-600 dark:text-blue-400">{selectedProductForSale.variant}</p></div><div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Passo 1: Encomenda Online (Obrigatório)</label><select required value={linkedOrderId} onChange={(e) => setLinkedOrderId(e.target.value)} className={`w-full p-2 border rounded-lg focus:ring-2 outline-none transition-colors dark:bg-slate-800 dark:text-white ${orderMismatchWarning ? 'border-red-300 focus:ring-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300 dark:border-slate-600 focus:ring-green-500'}`}><option value="">-- Selecione uma encomenda --</option>{pendingOrders.map(o => (<option key={o.id} value={o.id}>{o.id} - {o.shippingInfo?.name} ({formatCurrency(o.total)})</option>))}</select></div>{orderMismatchWarning && (<div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-400 p-4 rounded animate-shake flex items-start gap-2"><ShieldAlert size={20} className="shrink-0 mt-0.5" /><div><p className="font-bold text-sm">PRODUTO ERRADO!</p><p className="text-xs">{orderMismatchWarning}</p></div></div>)}{linkedOrderId && !orderMismatchWarning && (<div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30 p-4 animate-fade-in-down space-y-4"><h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase flex items-center gap-2 border-b border-blue-200 dark:border-blue-800/30 pb-2"><FileText size={14}/> Conferência de Valores</h4><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Preço Venda (Real)</label><input type="number" step="0.01" className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-sm font-bold text-gray-800 dark:text-white" value={saleForm.unitPrice} onChange={e => setSaleForm({...saleForm, unitPrice: e.target.value})}/></div><div><label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Custo Pago à Transportadora</label><input type="number" step="0.01" placeholder="Ex: 3.50" className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-white" value={saleForm.shippingCost} onChange={e => setSaleForm({...saleForm, shippingCost: e.target.value})}/></div></div><div className="border-t border-blue-200 dark:border-blue-800/30 pt-4"><h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase flex items-center gap-2 mb-3"><ShieldCheck size={14}/> Verificação de Segurança</h4><div className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3 ${securityCheckPassed ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>{securityCheckPassed ? (<><CheckCircle size={32} className="text-green-600 dark:text-green-400"/><div className="text-center"><p className="font-bold text-green-800 dark:text-green-300">Produto Confirmado!</p><p className="text-xs text-green-700 dark:text-green-400">Pode finalizar a venda.</p></div></>) : (<><div className="w-full flex gap-2"><button type="button" onClick={() => { setScannerMode('verify_product'); setIsScannerOpen(true); }} className="bg-gray-800 dark:bg-slate-700 text-white p-2 rounded-lg hover:bg-black dark:hover:bg-slate-600 transition-colors"><Camera size={20}/></button><input type="text" placeholder="Escanear produto para libertar..." className="flex-1 p-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-center font-mono uppercase focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 text-gray-900 dark:text-white" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleVerifyProduct((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}/></div><p className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1"><Lock size={12}/> Venda Bloqueada: Confirme o produto físico.</p></>)}</div></div></div>)}{selectedProductForSale.units && selectedProductForSale.units.length > 0 ? (<div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Selecionar Unidades (S/N) a vender</label><div className="flex gap-2 mb-2"><button type="button" onClick={() => { setScannerMode('sell_unit'); setIsScannerOpen(true); }} className="bg-gray-200 dark:bg-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-white"><Camera size={14}/> Escanear S/N</button><select value={manualUnitSelect} onChange={(e) => { if(e.target.value) handleSelectUnitForSale(e.target.value); setManualUnitSelect(''); }} className="flex-1 p-2 border border-gray-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-white"><option value="">-- Selecionar Manualmente --</option>{selectedProductForSale.units.filter(u => u.status === 'AVAILABLE' && !selectedUnitsForSale.includes(u.id)).map(u => (<option key={u.id} value={u.id}>{u.id}</option>))}</select></div><div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">{selectedUnitsForSale.map(sn => (<div key={sn} className="bg-white dark:bg-slate-700 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-mono px-2 py-1 rounded flex items-center gap-1 shadow-sm">{sn} <button type="button" onClick={() => setSelectedUnitsForSale(prev => prev.filter(s => s !== sn))} className="text-red-400 hover:text-red-600"><X size={12}/></button></div>))}{selectedUnitsForSale.length === 0 && <span className="text-gray-400 text-xs italic">Nenhuma unidade selecionada.</span>}</div><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Quantidade será calculada com base nas unidades selecionadas.</p></div>) : (<div><label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Quantidade</label><input type="number" min="1" max={selectedProductForSale.quantityBought - selectedProductForSale.quantitySold} required value={saleForm.quantity} onChange={(e) => setSaleForm({...saleForm, quantity: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>)}<button type="submit" disabled={!!orderMismatchWarning || !securityCheckPassed} className={`w-full font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors ${orderMismatchWarning || !securityCheckPassed ? 'bg-gray-400 dark:bg-slate-600 cursor-not-allowed text-gray-200 dark:text-gray-400' : 'bg-green-600 hover:bg-green-700 text-white'}`}>{!securityCheckPassed ? <Lock size={18}/> : <CheckCircle size={18}/>} {orderMismatchWarning ? 'Bloqueado: Produto Errado' : !securityCheckPassed ? 'Bloqueado: Verificação Pendente' : 'Confirmar Venda'}</button></form></div></div>)}
      {detailsModalData && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"><div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col transition-colors"><div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 transition-colors"><h3 className="text-xl font-bold text-gray-900 dark:text-white">{detailsModalData.title}</h3><button onClick={() => setDetailsModalData(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400 transition-colors"><X size={24}/></button></div><div className="flex-1 overflow-y-auto p-0"><table className="w-full text-left text-sm"><thead className="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-500 dark:text-gray-400 sticky top-0 transition-colors"><tr>{detailsModalData.columns.map((col, idx) => <th key={idx} className="px-6 py-3">{col.header}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-slate-800">{detailsModalData.data.map((item, rowIdx) => (<tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-gray-300">{detailsModalData.columns.map((col, colIdx) => (<td key={colIdx} className="px-6 py-3">{typeof col.accessor === 'function' ? col.accessor(item) : item[col.accessor]}</td>))}</tr>))}</tbody></table></div><div className="p-6 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 rounded-b-2xl flex justify-between items-center transition-colors"><span className="font-bold text-gray-500 dark:text-gray-400">TOTAL</span><span className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(detailsModalData.total)}</span></div></div></div>)}
      {isScannerOpen && (<BarcodeScanner mode={(scannerMode === 'add_unit' || scannerMode === 'sell_unit' || scannerMode === 'verify_product') ? 'serial' : 'product'} onClose={() => setIsScannerOpen(false)} onCodeSubmit={(code) => { if (scannerMode === 'add_unit') { handleAddUnit(code); setIsScannerOpen(false); } else if (scannerMode === 'sell_unit') { handleSelectUnitForSale(code); setIsScannerOpen(false); } else if (scannerMode === 'search') { setInventorySearchTerm(code); setIsScannerOpen(false); } else if (scannerMode === 'verify_product') { handleVerifyProduct(code); setIsScannerOpen(false); }}} />)}
      
      {/* NOTIFICATION MODAL UPDATED */}
      {notificationModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transition-colors">
                <div className="bg-green-600 p-6 text-white flex justify-between items-center">
                    <h3 className="font-bold text-xl flex items-center gap-2"><Mail size={24}/> Notificar Clientes</h3>
                    <button onClick={() => setNotificationModalData(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={24}/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 transition-colors">
                        <div className="bg-white dark:bg-blue-800 p-2 rounded-full text-blue-600 dark:text-blue-300 shadow-sm"><Users size={20}/></div>
                        <div>
                            <p className="text-blue-900 dark:text-blue-300 font-bold">Interesse Detetado</p>
                            <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">Existem <strong>{notificationModalData.alertsToDelete.length} emails</strong> na lista de espera. Destes, <strong>{notificationModalData.targetUserIds.length}</strong> têm a app instalada e podem receber notificação Push.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase flex items-center gap-2"><Smartphone size={16}/> Opção 1: Notificação Push (Recomendado)</h4>
                        <button 
                            onClick={handleSendPushToWaitingList}
                            disabled={isSendingPush || notificationModalData.targetUserIds.length === 0}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSendingPush ? <Loader2 className="animate-spin" size={20}/> : <Send size={18} />}
                            {notificationModalData.targetUserIds.length > 0 
                                ? `Enviar para ${notificationModalData.targetUserIds.length} Clientes` 
                                : 'Nenhum cliente com app instalada'}
                        </button>
                    </div>

                    <div className="border-t border-gray-100 dark:border-slate-800 pt-4 space-y-3">
                        <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase flex items-center gap-2"><Mail size={16}/> Opção 2: Email Manual (Backup)</h4>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-3 rounded text-xs text-yellow-800 dark:text-yellow-300 mb-2 transition-colors">Copie os dados abaixo e envie do seu email.</div>
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Emails (BCC)</label><div className="flex gap-2"><input readOnly value={notificationModalData.bcc} className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded text-xs text-gray-900 dark:text-white" /><button onClick={() => handleCopyToClipboard(notificationModalData.bcc, 'emails')} className="bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 p-2 rounded text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors">{copySuccess === 'emails' ? 'Copiado!' : 'Copiar'}</button></div></div>
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Assunto</label><div className="flex gap-2"><input readOnly value={notificationModalData.subject} className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded text-xs text-gray-900 dark:text-white" /><button onClick={() => handleCopyToClipboard(notificationModalData.subject, 'subject')} className="bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 p-2 rounded text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors">{copySuccess === 'subject' ? 'Copiado!' : 'Copiar'}</button></div></div>
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Mensagem</label><div className="flex gap-2 items-start"><textarea readOnly value={notificationModalData.body} className="w-full h-24 p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded text-xs resize-none text-gray-900 dark:text-white" /><button onClick={() => handleCopyToClipboard(notificationModalData.body, 'body')} className="bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 p-2 rounded text-gray-700 dark:text-gray-300 font-bold text-xs h-full transition-colors">{copySuccess === 'body' ? 'Copiado!' : 'Copiar'}</button></div></div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
                        <button onClick={() => setNotificationModalData(null)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancelar</button>
                        <button onClick={handleClearSentAlerts} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md flex items-center gap-2 transition-colors"><CheckCircle size={18} /> Limpar Lista de Espera</button>
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {isCashbackManagerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transition-colors">
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><Wallet size={20} className="text-yellow-600 dark:text-yellow-400"/> Gestor Financeiro de Cashback</h3>
                    <button onClick={() => setIsCashbackManagerOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400 transition-colors"><X size={24}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-slate-950 transition-colors">
                    <div className="flex gap-2 mb-6">
                        <button onClick={() => setCashbackManagerFilter('PENDING')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${cashbackManagerFilter === 'PENDING' ? 'bg-yellow-500 text-white shadow' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700'}`}>A Receber</button>
                        <button onClick={() => setCashbackManagerFilter('ALL')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${cashbackManagerFilter === 'ALL' ? 'bg-gray-800 dark:bg-slate-700 text-white shadow' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700'}`}>Histórico Completo</button>
                    </div>
                    <div className="space-y-4">
                        {(Object.entries(groupedCashback) as [string, { total: number, items: InventoryProduct[] }][]).map(([account, data]) => {
                            const isExpanded = expandedCashbackAccounts.includes(account);
                            return (
                                <div key={account} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm transition-colors">
                                    <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => toggleCashbackAccount(account)}>
                                        <div className="flex items-center gap-4">
                                            <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-full text-blue-600 dark:text-blue-400"><AtSign size={20} /></div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 dark:text-white">{account}</h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{data.items[0]?.cashbackPlatform || 'Plataforma Desconhecida'} • {data.items.length} itens</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.total)}</span>
                                            {isExpanded ? <ChevronDown size={20} className="text-gray-400"/> : <ChevronRight size={20} className="text-gray-400"/>}
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/50 p-4 transition-colors">
                                            <table className="w-full text-left text-sm mb-4">
                                                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-slate-800">
                                                    <tr>
                                                        <th className="p-2 rounded-l">Produto</th>
                                                        <th className="p-2">Data Compra</th>
                                                        <th className="p-2">Previsão</th>
                                                        <th className="p-2">Valor</th>
                                                        <th className="p-2 rounded-r">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                                                    {data.items.map(item => (
                                                        <tr key={item.id} className="hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors">
                                                            <td className="py-2 pr-2 font-medium text-gray-900 dark:text-white">{item.name} <span className="text-xs text-gray-500 dark:text-gray-400 block">{item.variant}</span></td>
                                                            <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">{new Date(item.purchaseDate).toLocaleDateString()}</td>
                                                            <td className="py-2 text-gray-500 dark:text-gray-400 text-xs font-bold">{item.cashbackExpectedDate ? new Date(item.cashbackExpectedDate).toLocaleDateString() : '-'}</td>
                                                            <td className="py-2 font-bold text-gray-900 dark:text-white">{formatCurrency(item.cashbackValue)}</td>
                                                            <td className="py-2">
                                                                <span className={`text-[10px] px-2 py-1 rounded font-bold ${item.cashbackStatus === 'RECEIVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'}`}>
                                                                    {item.cashbackStatus === 'RECEIVED' ? 'Recebido' : 'Pendente'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {cashbackManagerFilter === 'PENDING' && (
                                                <div className="flex justify-end">
                                                    <button onClick={() => handleMarkBatchReceived(data.items)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-md transition-colors">
                                                        <CheckCircle size={16}/> Marcar {formatCurrency(data.total)} como Recebido
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {Object.keys(groupedCashback).length === 0 && <div className="text-center py-12 text-gray-500 dark:text-gray-400">Nenhum registo de cashback encontrado.</div>}
                    </div>
                </div>
            </div>
        </div>
      )}
      
      {selectedTicket && user && (
          <SupportTicketModal 
              ticket={selectedTicket} 
              user={user} 
              variant="admin"
              onClose={() => setSelectedTicket(null)} 
          />
      )}

      <AnalyticsModal isOpen={isAnalyticsModalOpen} onClose={() => setIsAnalyticsModalOpen(false)} />



      {selectedUserDetails && (
        <ClientDetailsModal 
            user={selectedUserDetails}
            orders={allOrders}
            onClose={() => setSelectedUserDetails(null)}
            onUpdateUser={async (userId, data) => {
                try {
                    await updateDoc(doc(modularDb, 'users', userId), data as any);
                    const updatedUser = selectedUserDetails ? { ...selectedUserDetails, ...data } : null;
                    if (updatedUser) supabaseSync.saveUser(updatedUser as any);
                    
                    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...data } : u));
                    setSelectedUserDetails(prev => prev ? { ...prev, ...data } : null);
                    alert("Guardado com sucesso!");
                } catch(e) {
                    console.error(e);
                    alert("Erro ao guardar.");
                }
            }}
        />
      )}
      </div>
      </div>
      </div>
  );
};

export default Dashboard;
