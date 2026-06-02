
import React, { useState, useMemo, useEffect, Suspense, lazy, Component, ErrorInfo, ReactNode } from 'react';

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null, errorInfo: ErrorInfo | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fee', color: '#900', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo?.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Smartphone, Landmark, Banknote, Search, Loader2, Sun, Moon, Bell, X } from 'lucide-react';

import Header from './components/Header';
import CartDrawer from './components/CartDrawer';
import MobileMenu from './components/MobileMenu'; 
import AIChat from './components/AIChat';
import Home from './components/Home';
import ProductDetails from './components/ProductDetails';
import About from './components/About';
import Contact from './components/Contact';
import Terms from './components/Terms';
import Privacy from './components/Privacy';
import FAQ from './components/FAQ';
import Returns from './components/Returns';
import OrderTracker from './components/OrderTracker'; 
import LoginModal from './components/LoginModal';
import ResetPasswordModal from './components/ResetPasswordModal'; 
import ClientArea from './components/ClientArea';
import InstallPrompt from './components/InstallPrompt';
import LuckyWheel from './components/LuckyWheel';
import ProductComparator from './components/ProductComparator';
import { ADMIN_EMAILS, STORE_NAME, LOYALTY_TIERS, LOGO_URL, INITIAL_PRODUCTS } from './constants';
import { Product, CartItem, User, Order, Review, ProductVariant, UserTier, PointHistory, OrderItem } from './types';
import {   auth, db, messaging , modularDb } from './services/firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction, arrayUnion, collection, query, where, getDocs, onSnapshot, serverTimestamp, deleteDoc, or } from 'firebase/firestore';

import { useStock } from './hooks/useStock'; 
import { usePublicProducts } from './hooks/usePublicProducts';
import { useStockReservations } from './hooks/useStockReservations';
import { usePendingOrders } from './hooks/usePendingOrders';
import { notifyNewOrder } from './services/telegramNotifier';
import { supabaseSync } from './services/supabaseSync';
import LoyaltyPage from './components/LoyaltyPage';
import { trackVisit } from './services/analyticsService';
import { reserveStock, finalizeOrder } from './services/api';

// LAZY LOADING DO DASHBOARD
// O código do Dashboard (gráficos, tabelas grandes, scanners) só é baixado se o utilizador for admin e clicar na rota.
const Dashboard = lazy(() => import('./components/Dashboard'));

const App: React.FC = () => {

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false); 
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);
  
  // Comparator State
  const [compareList, setCompareList] = useState<number[]>([]);
  const [isComparatorOpen, setIsComparatorOpen] = useState(false);

  // Notification Foreground State
  const [incomingNotification, setIncomingNotification] = useState<any>(null);

  // DARK MODE STATE
  const [isDarkMode, setIsDarkMode] = useState(() => {
      try {
          const saved = localStorage.getItem('theme');
          return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
      } catch {
          return false;
      }
  });

  useEffect(() => {
      if (isDarkMode) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
      }
  }, [isDarkMode]);

  useEffect(() => {
    trackVisit();
    
    // Registrar o Service Worker para Push Notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(registration => {
          console.log('SW registration successful:', registration.scope);
        })
        .catch(err => {
          console.error('SW registration failed:', err);
        });
    }

    // Lucky Wheel Logic
    /* 
    const hasSpun = localStorage.getItem('lucky_wheel_spun');
    if (!hasSpun) {
        const timer = setTimeout(() => setShowLuckyWheel(true), 3000); // Show after 3s
        return () => clearTimeout(timer);
    }
    */
  }, []);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [wishlist, setWishlist] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [resetCode, setResetCode] = useState<string | null>(null); 
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [processingProductIds, setProcessingProductIds] = useState<number[]>([]); // Loading local por produto
  
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    const userEmail = user.email.trim().toLowerCase();
    return ADMIN_EMAILS.some(adminEmail => adminEmail.trim().toLowerCase() === userEmail);
  }, [user]);

  // --- LÓGICA DE STOCK ---
  const { getStockForProduct: getAdminStock, loading: stockLoading } = useStock(isAdmin);
  const { products: dbProducts, loading: productsLoading } = usePublicProducts();
  const { reservations } = useStockReservations(); 
  const { pendingOrders } = usePendingOrders(isAdmin); 

  const sessionId = useMemo(() => {
    let id = sessionStorage.getItem('session_id');
    if (!id) {
        id = 'sess_' + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('session_id', id);
    }
    return id;
  }, []);

  const getStockForProduct = (productId: number, variantName?: string): number => {
    const product = dbProducts.find(p => p.id === productId);
    
    let availableStock = product?.stock ?? 0;
    
    if (variantName && product?.variants) {
        const variant = product.variants.find(v => v.name === variantName);
        if (variant && variant.stock !== undefined) {
            availableStock = variant.stock;
        }
    } else if (!variantName && product?.variants && product.variants.length > 0) {
        availableStock = product.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
    }
    
    // 1. Subtrair Reservas Temporárias (Carrinhos ativos)
    // Se for stock de variante, filtra reservas da variante. Senão filtra do produto inteiro.
    const now = Date.now();
    const reservedQuantity = reservations
        .filter(r => r.productId === productId && (!variantName || r.variantName === variantName) && r.expiresAt > now)
        .reduce((sum, r) => sum + r.quantity, 0);

    // 2. Subtrair Encomendas Pendentes (Ainda não processadas no inventário físico)
    // REMOVIDO: Agora o stock já é decrementado no checkout atomicamente.
    let pendingInOrders = 0;

    const result = Math.max(0, availableStock - reservedQuantity - pendingInOrders);
    
    return result;
  };

  // --- REDIRECT LOGIC FOR SHARED LINKS ---
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/p/') || path.startsWith('/product/')) {
        const id = path.split('/').pop();
        if (id && !isNaN(Number(id))) {
            window.history.replaceState(null, '', '/');
            window.location.hash = `#product/${id}`;
            setRoute(`#product/${id}`);
        }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if (mode === 'resetPassword' && oobCode) setResetCode(oobCode);
  }, []);

  useEffect(() => {
    const originalTitle = document.title;
    const handleBlur = () => { document.title = STORE_NAME + " - Volte aqui! 🛒"; };
    const handleFocus = () => { 
        if (!window.location.hash.startsWith('#product/')) {
            document.title = originalTitle; 
        }
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // --- FOREGROUND NOTIFICATION LISTENER ---
  useEffect(() => {
      if (messaging) {
          const unsubscribe = messaging.onMessage((payload: any) => {
              console.log('Mensagem recebida em primeiro plano: ', payload);
              setIncomingNotification({
                  title: payload.notification?.title || 'Nova Mensagem',
                  body: payload.notification?.body || '',
                  image: payload.notification?.image || LOGO_URL
              });
              // Tocar som suave
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
              audio.volume = 0.5;
              audio.play().catch(() => {});

              // Auto-fechar após 8 segundos
              setTimeout(() => setIncomingNotification(null), 8000);
          });
          return () => {
              // Unsubscribe function logic usually handled by Firebase internal cleanup
          };
      }
  }, []);

  useEffect(() => {
    if (route.includes('dashboard')) return;
    const updatePresence = async () => {
        if (!sessionId) return;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        await setDoc(doc(modularDb, 'online_users', sessionId), {
            lastActive: Date.now(),
            page: route,
            userName: user ? user.name : 'Visitante',
            device: isMobile ? 'Mobile' : 'Desktop',
            userId: user?.uid || null
        }).catch(err => {
            console.debug("Presence sync failed:", err);
        });
    };
    updatePresence();
    const interval = setInterval(updatePresence, 20000);
    return () => clearInterval(interval);
  }, [route, user, sessionId]);

  useEffect(() => {
    const loadReviews = async () => {
        try {
            const snapshot = await getDocs(collection(modularDb, 'reviews'));
            const loadedReviews: Review[] = [];
            snapshot.forEach(doc => { loadedReviews.push(doc.data() as Review); });
            loadedReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setReviews(loadedReviews);
        } catch (error) { 
            console.debug("Reviews access restricted."); 
        }
    };
    loadReviews();

    const handleHashChange = () => {
      setRoute(window.location.hash || '#/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', handleHashChange);
    
    let userUnsubscribe = () => {};
    let ordersUnsubscribe = () => {};

    let authTimeout: NodeJS.Timeout;
    authTimeout = setTimeout(() => {
        if (authLoading) {
            console.warn("Timeout na autenticação Firebase.");
            setUser(null);
            setAuthLoading(false);
        }
    }, 5000);

    const authUnsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        clearTimeout(authTimeout);
        userUnsubscribe();
        ordersUnsubscribe();

        if (firebaseUser && firebaseUser.email) {
            setAuthLoading(true);
            try {
                const userDocRef = doc(modularDb, "users", firebaseUser.uid);
                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists()) {
                    const basicUser: User = { uid: firebaseUser.uid, name: firebaseUser.displayName || 'Cliente', email: firebaseUser.email, addresses: [], wishlist: [], totalSpent: 0, tier: 'Bronze', loyaltyPoints: 0, pointsHistory: [] };
                    await setDoc(userDocRef, basicUser);
                }
                const [userOrdersSnap, guestOrdersSnap] = await Promise.all([
                    getDocs(query(collection(modularDb, "orders"), where("userId", "==", firebaseUser.uid))),
                    getDocs(query(collection(modularDb, 'orders'), where('shippingInfo.email', '==', firebaseUser.email.toLowerCase()), where('userId', '==', null)))
                ]);
                const allUserOrders: Order[] = [];
                const orderIds = new Set<string>();
                userOrdersSnap.forEach(doc => { if (!orderIds.has(doc.id)) { allUserOrders.push({ id: doc.id, ...doc.data() } as Order); orderIds.add(doc.id); }});
                guestOrdersSnap.forEach(doc => { if (!orderIds.has(doc.id)) { allUserOrders.push({ id: doc.id, ...doc.data() } as Order); orderIds.add(doc.id); }});
                const freshUserDoc = await getDoc(userDocRef);
                if (freshUserDoc.exists()) {
                    const userData = freshUserDoc.data() as User;
                    const historicalTotalSpent = allUserOrders.filter(o => o.status !== 'Cancelado').reduce((sum, order) => sum + (order.total || 0), 0);
                    let correctTier: UserTier = 'Bronze';
                    if (historicalTotalSpent >= LOYALTY_TIERS.GOLD.threshold) correctTier = 'Ouro';
                    else if (historicalTotalSpent >= LOYALTY_TIERS.SILVER.threshold) correctTier = 'Prata';
                    
                    const tierMap: Record<UserTier, keyof typeof LOYALTY_TIERS> = { 'Bronze': 'BRONZE', 'Prata': 'SILVER', 'Ouro': 'GOLD' };
                    const ordersToAwardPoints = allUserOrders.filter(o => o.status === 'Entregue' && !o.pointsAwarded);
                    let missingPoints = 0;
                    const newHistoryItems: PointHistory[] = [];
                    if (ordersToAwardPoints.length > 0) {
                        const multiplier = LOYALTY_TIERS[tierMap[correctTier]].multiplier;
                        ordersToAwardPoints.forEach(o => {
                            const pointsForThisOrder = Math.floor((o.total || 0) * multiplier);
                            if (pointsForThisOrder > 0) {
                                missingPoints += pointsForThisOrder;
                                newHistoryItems.push({ id: `sync-${o.id}`, date: new Date().toISOString(), amount: pointsForThisOrder, reason: `Compra #${o.id.slice(-6)} (Sinc. Nível ${correctTier})`, orderId: o.id });
                            }
                        });
                    }
                    const ordersToMigrate = guestOrdersSnap.docs;
                    const needsUpdate = ( (userData.totalSpent || 0).toFixed(2) !== historicalTotalSpent.toFixed(2) || (userData.tier || 'Bronze') !== correctTier || missingPoints > 0 || ordersToMigrate.length > 0 );
                    if (needsUpdate) {
                        const batch = writeBatch(modularDb);
                        const userUpdateData: any = {};
                        if ((userData.totalSpent || 0).toFixed(2) !== historicalTotalSpent.toFixed(2)) userUpdateData.totalSpent = historicalTotalSpent;
                        if ((userData.tier || 'Bronze') !== correctTier) userUpdateData.tier = correctTier;
                        if (missingPoints > 0) {
                            userUpdateData.loyaltyPoints = (userData.loyaltyPoints || 0) + missingPoints;
                            userUpdateData.pointsHistory = [...newHistoryItems, ...(userData.pointsHistory || [])];
                        }
                        if (Object.keys(userUpdateData).length > 0) batch.update(userDocRef, userUpdateData);
                        
                        // FIX: Marcar encomendas como processadas para não atribuir pontos infinitamente
                        ordersToAwardPoints.forEach(o => {
                            const orderRef = doc(modularDb, 'orders', o.id);
                            batch.update(orderRef, { pointsAwarded: true });
                        });

                        ordersToMigrate.forEach(docSnap => batch.update(docSnap.ref, { userId: firebaseUser.uid }));
                        await batch.commit();
                    }
                }
                
                userUnsubscribe = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const userData = docSnap.data() as User;
                        setUser(userData);
                        if (userData.wishlist) {
                            setWishlist(userData.wishlist);
                            localStorage.setItem('wishlist', JSON.stringify(userData.wishlist));
                        }
                    }
                }, (error) => {
                    console.error("Erro ao escutar dados do utilizador:", error);
                });
                
                const handleOrdersUpdate = (snap: any, type: 'uid' | 'email') => {
                    const fetched = snap.docs.map((doc: any) => ({id: doc.id, ...doc.data() } as Order));
                    setOrders(prev => {
                        const newOrders = [...prev];
                        // Remove old orders of this type (this is purely for syncing from streams)
                        // Actually, it's safer to just maintain two lists.
                        return newOrders; // Too complex for a single state if not careful.
                    });
                };

                let ordersById: Order[] = [];
                let ordersByEmail: Order[] = [];

                const updateCombinedOrders = () => {
                    const combined = [...ordersById, ...ordersByEmail];
                    const unique = Array.from(new Map(combined.map(o => [o.id, o])).values());
                    unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setOrders(unique);
                };

                const unsubUid = onSnapshot(query(collection(modularDb, "orders"), where("userId", "==", firebaseUser.uid)), (snap) => {
                    ordersById = snap.docs.map(doc => ({id: doc.id, ...doc.data() } as Order));
                    updateCombinedOrders();
                }, (error) => console.error("Erro UID:", error));

                let unsubEmail = () => {};
                if (firebaseUser.email) {
                    unsubEmail = onSnapshot(query(collection(modularDb, "orders"), where("shippingInfo.email", "==", firebaseUser.email)), (snap) => {
                        ordersByEmail = snap.docs.map(doc => ({id: doc.id, ...doc.data() } as Order));
                        updateCombinedOrders();
                    }, (error) => console.error("Erro Email:", error));
                }

                ordersUnsubscribe = () => {
                    unsubUid();
                    unsubEmail();
                };

            } catch (error) {
                console.error("Erro crítico durante a autenticação/sincronização do utilizador:", error);
                const fallbackUser: User = { uid: firebaseUser.uid, name: firebaseUser.displayName || 'Cliente', email: firebaseUser.email, addresses: [], wishlist: [] };
                setUser(fallbackUser);
            } finally {
                setAuthLoading(false);
            }
        } else {
            setUser(null);
            setOrders([]);
            setAuthLoading(false);
        }
    });

    return () => {
        authUnsubscribe();
        userUnsubscribe();
        ordersUnsubscribe();
        window.removeEventListener('hashchange', handleHashChange);
    };
  }, [sessionId]);

  const toggleWishlist = async (productId: number) => {
    let newWishlist = wishlist.includes(productId) ? wishlist.filter(id => id !== productId) : [...wishlist, productId];
    setWishlist(newWishlist);
    localStorage.setItem('wishlist', JSON.stringify(newWishlist));
    if (user?.uid) {
        try { 
            await updateDoc(doc(modularDb, "users", user.uid), { wishlist: newWishlist }); 
            supabaseSync.saveUser({ ...user, wishlist: newWishlist });
        }
        catch (error) { console.debug("Wishlist update restricted."); }
    }
  };

  const toggleCompare = (productId: number) => {
      setCompareList(prev => {
          if (prev.includes(productId)) return prev.filter(id => id !== productId);
          if (prev.length >= 3) {
              alert("Pode comparar no máximo 3 produtos.");
              return prev;
          }
          return [...prev, productId];
      });
  };

  const updateReservationInFirebase = async (productId: number, variantName: string | undefined | null, newQuantity: number): Promise<boolean> => {
      // In prod mode, we call our backend API instead of direct Firestore writes
      try {
          // Note: Variant name mapping might need adjustment based on how it's stored.
          // Assuming product.variants[vIndex].name matches variantName.
          
          await reserveStock(productId.toString(), newQuantity, localStorage.getItem('guestToken') || undefined);
          return true;
      } catch (e: any) {
          console.error("Erro na reserva de stock:", e);
          alert(e.message || "Erro ao reservar stock.");
          return false;
      }
  };

  const addToCart = async (product: Product, variant?: ProductVariant) => {
    if (processingProductIds.includes(product.id)) return;
    setProcessingProductIds(prev => [...prev, product.id]);
    
    try {
        const cartItemId = variant?.name ? `${product.id}-${variant.name}` : `${product.id}`;
        const existingItem = cartItems.find(item => item.cartItemId === cartItemId);
        if (product.isFreebie && existingItem) {
             alert("Esta oferta já está no carrinho.");
             setProcessingProductIds(prev => prev.filter(id => id !== product.id));
             return;
        }
        const newQty = existingItem ? existingItem.quantity + 1 : 1;

        if (product.maxQuantityPerOrder && newQty > product.maxQuantityPerOrder) {
            alert(`Pode adicionar no máximo ${product.maxQuantityPerOrder} unidade(s) deste produto por encomenda.`);
            setProcessingProductIds(prev => prev.filter(id => id !== product.id));
            return;
        }

        const success = await updateReservationInFirebase(product.id, variant?.name, newQty);
        if (!success) return;

        const reservedUntil = !isAdmin ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : undefined;

        // Check if promo ended
        const promoEnded = product.promoEndsAt ? new Date(product.promoEndsAt) <= new Date() : false;
        let finalPrice = variant?.price ?? product.price;
        
        // Se for um produto de oferta, o preço é zero
        if (product.isFreebie) {
            finalPrice = 0;
        }

        // If promo ended and no variant selected (or variant price logic is handled elsewhere), revert to original
        if (promoEnded && !variant && product.originalPrice) {
            finalPrice = product.originalPrice;
        }

        setCartItems(prev => {
          const existing = prev.find(item => item.cartItemId === cartItemId);
          if (existing) {
            return prev.map(item => {
                if (item.cartItemId === cartItemId) {
                    return { ...item, quantity: newQty, reservedUntil: item.reservedUntil || reservedUntil };
                }
                return item;
            });
          }
          return [...prev, { ...product, price: finalPrice, maxQuantityPerOrder: product.maxQuantityPerOrder, image: variant?.image || product.image, selectedVariant: variant?.name, cartItemId, quantity: 1, reservedUntil }];
        });
        setIsCartOpen(true);
    } catch (err) {
        console.error("Erro inesperado no carrinho:", err);
    } finally {
        setProcessingProductIds(prev => prev.filter(id => id !== product.id));
    }
  };

  const removeFromCart = async (cartItemId: string) => {
    const item = cartItems.find(i => i.cartItemId === cartItemId);
    setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    if (item) {
        updateReservationInFirebase(item.id, item.selectedVariant, 0);
    }
  };

  const updateQuantity = async (cartItemId: string, delta: number) => {
    const itemToUpdate = cartItems.find(i => i.cartItemId === cartItemId);
    if (!itemToUpdate) return;
    const newQty = itemToUpdate.quantity + delta;

    if (itemToUpdate.maxQuantityPerOrder && newQty > itemToUpdate.maxQuantityPerOrder) {
        alert(`Pode adicionar no máximo ${itemToUpdate.maxQuantityPerOrder} unidade(s) deste produto por encomenda.`);
        return;
    }

    if (newQty < itemToUpdate.quantity) {
        setCartItems(prev => {
            if (newQty < 1) return prev.filter(i => i.cartItemId !== cartItemId);
            return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item);
        });
        updateReservationInFirebase(itemToUpdate.id, itemToUpdate.selectedVariant, newQty);
        return;
    }
    
    // Prevent increasing quantity for free items
    if (itemToUpdate.price === 0) {
        alert("A oferta é de apenas 1 unidade.");
        return;
    }

    const success = await updateReservationInFirebase(itemToUpdate.id, itemToUpdate.selectedVariant, newQty);
    if (!success) return;

    setCartItems(prev =>
        prev.map(item =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: newQty }
            : item
        )
    );
  };

  const handleUpdateUser = async (updatedData: Partial<User>) => {
    if (user?.uid) {
        // FIX 1: OPTIMISTIC UI UPDATE
        // Atualiza o estado local IMEDIATAMENTE para a interface reagir
        const updatedUser = user ? { ...user, ...updatedData } : null;
        setUser(updatedUser);

        // FIX 2: Sanitizar dados antes de enviar ao Firebase
        const cleanData = JSON.parse(JSON.stringify(updatedData));
        
        await updateDoc(doc(modularDb, "users", user.uid), cleanData)
            .catch(err => {
                console.error("Update failed, rolling back UI:", err);
            });
        
        // Supabase Backup Sync
        if (updatedUser) {
            supabaseSync.saveUser(updatedUser);
        }
    }
  };

  const handleLogout = async () => {
    try { await auth.signOut(); setUser(null); window.location.hash = '/'; }
    catch (error) { console.error("Logout error", error); }
  };

  const handleCheckout = async (newOrder: Order, isAutoSave: boolean = false): Promise<boolean> => {
      try {
          // Garantir que o ID não contém '#' que atua como fragmento de URL
          if (newOrder.id && typeof newOrder.id === 'string') {
              newOrder.id = newOrder.id.trim().replace(/^#+/, '');
          }
          // Limpar dados para evitar erros de 'undefined' no Firebase
          const cleanOrder = JSON.parse(JSON.stringify(newOrder));
          console.log("DEBUG handleCheckout cleanOrder:", cleanOrder, "User UID from app state:", user?.uid);
          cleanOrder.stockDeducted = true; // Indica que o stock público já foi deduzido na altura da compra
          
          // Using backend finalizeOrder instead of /api/checkout
          await finalizeOrder(
              cleanOrder.items,
              localStorage.getItem('guestToken') || '',
              cleanOrder.shippingInfo,
              cleanOrder.id // idempotencyKey
          );

          console.info("Order processed successfully via finalizeOrder");
          
          const alreadyExists = false;

          // 4. Limpar reservas do carrinho (fora da transação principal para não bloquear se falhar)
          try {
              const reservationQuery = await getDocs(query(collection(modularDb, 'stock_reservations'), where('sessionId', '==', sessionId)));
              if (!reservationQuery.empty) {
                  const batch = writeBatch(modularDb);
                  reservationQuery.forEach(docSnap => batch.delete(doc(modularDb, 'stock_reservations', docSnap.id)));
                  await batch.commit();
              }
              
              // Removed logic that tries to call the backend API. 
              // Stock is already updated via transaction on lines 646-649.
          } catch (resErr) {
              console.error("Erro ao limpar reservas:", resErr);
          }

          setOrders(prev => {
              const exists = prev.some(o => o.id === newOrder.id);
              if (exists) {
                  return prev.map(o => o.id === newOrder.id ? newOrder : o);
              }
              return [newOrder, ...prev];
          });
          
          if (!isAutoSave) {
              setCartItems([]);
              
              (async () => {
                  try {
                      await notifyNewOrder(newOrder, user ? user.name : newOrder.shippingInfo.name);
                      
                      // Supabase Backup Sync
                      supabaseSync.saveOrder(newOrder);

                      // Sync products whose stock was updated
                      await Promise.all(newOrder.items.map(async (item: any) => {
                          try {
                              const productDoc = await getDoc(doc(modularDb, 'products_public', item.productId.toString()));
                              if (productDoc.exists()) {
                                  supabaseSync.saveProduct({ id: item.productId, ...productDoc.data() } as Product);
                              }
                          } catch (e) {
                              console.error("Erro ao sincronizar produto pós-checkout:", e);
                          }
                      }));

                      // Notificar Admins via Push (Nova Funcionalidade)
                      await fetch('/api/send-push', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              target: 'admins',
                              title: 'Nova Encomenda! 💰',
                              body: `Pedido ${newOrder.id} de ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(newOrder.total)} recebido de ${newOrder.shippingInfo.name}.`,
                              link: 'https://www.all-shop.net/#dashboard'
                          })
                      });
                  } catch (err) {
                      console.error("Post-checkout background tasks failed:", err);
                  }
              })();
          }
          
          if (user?.uid && !alreadyExists) {
            const userRef = doc(modularDb, "users", user.uid);
            await runTransaction(modularDb, async (transaction) => {
              const userDoc = await transaction.get(userRef);
              if (!userDoc.exists()) return;
              const userData = userDoc.data() as User;
              const newTotalSpent = (userData.totalSpent || 0) + newOrder.total;
              let newTier: UserTier = userData.tier || 'Bronze';
              if (newTotalSpent >= LOYALTY_TIERS.GOLD.threshold) newTier = 'Ouro';
              else if (newTotalSpent >= LOYALTY_TIERS.SILVER.threshold) newTier = 'Prata';
              transaction.update(userRef, { totalSpent: newTotalSpent, tier: newTier });
            });
          }
          return true;
      } catch (e: any) {
          console.error("Erro CRÍTICO no checkout:", e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          if (errorMessage.includes("stock suficiente") || errorMessage.includes("não encontrado")) {
              alert(errorMessage);
          } else {
              alert("Ocorreu um erro ao guardar a sua encomenda. Por favor, tente novamente ou contacte o suporte se o erro persistir.");
          }
          return false;
      }
  };

  const handleAddReview = async (newReview: Review) => {
      setReviews(prev => [newReview, ...prev]);
      try { await setDoc(doc(modularDb, "reviews", newReview.id), newReview); }
      catch (e) { console.error("Erro review:", e); }
  };

  const cartTotal = useMemo(() => cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((acc, item) => acc + item.quantity, 0), [cartItems]);

  const handleSearchChange = (term: string) => {
      setSearchTerm(term);
      if (term && route !== '#/') window.location.hash = '/';
      if (term) setTimeout(() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleResetHome = () => {
    setSearchTerm('');
    setSelectedCategory('Todas');
    window.location.hash = '/';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    // --- PROTEÇÃO DO DASHBOARD (Lazy Loaded) ---
    if (route === '#dashboard') {
        if (!isAdmin && !authLoading) {
            // Se não for admin e já carregou, redireciona.
            window.location.hash = '/';
            return null;
        }
        return (
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                    <Loader2 size={48} className="animate-spin text-primary"/>
                    <p className="text-gray-500 font-medium">A carregar Painel de Administração...</p>
                </div>
            }>
                <Dashboard user={user} isAdmin={isAdmin} />
            </Suspense>
        );
    }
    
    if (route === '#account') {
      if (!user) { setTimeout(() => { window.location.hash = '/'; setIsLoginOpen(true); }, 0); return null; }
      return <ClientArea user={user} orders={orders} onLogout={handleLogout} onUpdateUser={handleUpdateUser} wishlist={wishlist} onToggleWishlist={toggleWishlist} onAddToCart={addToCart} publicProducts={dbProducts} onOpenSupportChat={() => setIsAIChatOpen(true)} onCheckout={handleCheckout} />;
    }
    if (route.startsWith('#product/')) {
        const id = parseInt(route.split('/')[1]);
        const product = dbProducts.find(p => p.id === id);
        // Passar onUpdateUser para ProductDetails para atualizar pontos de partilha
        if (product) return <ProductDetails product={product} allProducts={dbProducts} onAddToCart={addToCart} reviews={reviews} onAddReview={handleAddReview} currentUser={user} getStock={getStockForProduct} wishlist={wishlist} onToggleWishlist={toggleWishlist} isProcessing={processingProductIds.includes(product.id)} onUpdateUser={handleUpdateUser} orders={orders} />;
    }
    switch (route) {
        case '#about': return <About />;
        case '#contact': return <Contact />;
        case '#terms': return <Terms />;
        case '#privacy': return <Privacy />;
        case '#faq': return <FAQ />;
        case '#returns': return <Returns />;
        case '#tracking': return <OrderTracker />; 
        case '#allpoints': return <LoyaltyPage user={user} onUpdateUser={handleUpdateUser} onOpenLogin={() => setIsLoginOpen(true)} />; // NOVA ROTA
        default: return <Home products={dbProducts} onAddToCart={addToCart} getStock={getStockForProduct} wishlist={wishlist} onToggleWishlist={toggleWishlist} searchTerm={searchTerm} selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} processingProductIds={processingProductIds} compareList={compareList} onToggleCompare={toggleCompare} onOpenComparator={() => setIsComparatorOpen(true)} />;
    }
  };

  if (authLoading || productsLoading || (isAdmin && stockLoading)) {
      return (
          <div className="fixed inset-0 bg-white dark:bg-[#020617] flex flex-col items-center justify-center gap-4">
              <img src={LOGO_URL} alt={STORE_NAME} className="w-48 h-auto animate-pulse" />
              <Loader2 className="animate-spin text-primary" size={32} />
          </div>
      );
  }

  return (
    <div className="flex flex-col min-h-screen font-sans text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-[#020617] transition-colors duration-300">
      {/* NOTIFICATION TOAST (FOREGROUND) */}
      {incomingNotification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-blue-100 dark:border-slate-700 animate-slide-in p-4 flex gap-4 cursor-pointer" onClick={() => setIncomingNotification(null)}>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                  <Bell className="text-primary dark:text-blue-300" size={24} />
              </div>
              <div className="flex-1">
                  <h4 className="font-bold text-gray-900 dark:text-white text-sm">{incomingNotification.title}</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{incomingNotification.body}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setIncomingNotification(null); }} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
              </button>
          </div>
      )}

      <Header 
        cartCount={cartCount} 
        onOpenCart={() => setIsCartOpen(true)} 
        onOpenMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
        user={user} 
        onOpenLogin={() => setIsLoginOpen(true)} 
        onLogout={handleLogout} 
        searchTerm={searchTerm} 
        onSearchChange={handleSearchChange} 
        onResetHome={handleResetHome}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        products={dbProducts}
      />
      
      {/* MENU MOBILE PROFISSIONAL (OVERLAY) */}
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)}
        user={user}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        onResetHome={handleResetHome}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        products={dbProducts}
      />

      <main className="flex-grow w-full flex flex-col">{renderContent()}</main>
      
      <InstallPrompt /> 

      <footer className="bg-gray-900 text-gray-400 py-12 border-t border-gray-800 mt-auto pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 text-center md:text-left">
            <div className="flex flex-col items-center md:items-start"><div className="flex items-center gap-2 mb-4">{LOGO_URL ? <img src={LOGO_URL} alt={STORE_NAME} className="h-10 invert brightness-0" /> : <h3 className="text-xl font-bold text-white">{STORE_NAME}</h3>}</div><p className="text-sm max-w-[200px]">A sua loja de confiança para os melhores gadgets e eletrônicos do mercado nacional.</p></div>
            <div><h4 className="text-white font-bold mb-4">Links Úteis</h4><ul className="space-y-2 text-sm"><li><a href="#about" onClick={(e) => {e.preventDefault(); window.location.hash = 'about';}} className="hover:text-primary">Sobre Nós</a></li><li><a href="#terms" onClick={(e) => {e.preventDefault(); window.location.hash = 'terms';}} className="hover:text-primary">Termos</a></li><li><a href="#privacy" onClick={(e) => {e.preventDefault(); window.location.hash = 'privacy';}} className="hover:text-primary">Privacidade</a></li></ul></div>
            <div><h4 className="text-white font-bold mb-4">Atendimento</h4><ul className="space-y-2 text-sm"><li><a href="#contact" onClick={(e) => {e.preventDefault(); window.location.hash = 'contact';}} className="hover:text-primary">Fale Conosco</a></li>
            {/* LINK CORRIGIDO AQUI: Removido text-white e font-bold */}
            <li><a href="#tracking" onClick={(e) => {e.preventDefault(); window.location.hash = 'tracking';}} className="hover:text-primary">Rastrear Encomenda</a></li>
            <li><a href="#returns" onClick={(e) => {e.preventDefault(); window.location.hash = 'returns';}} className="hover:text-primary">Garantia</a></li><li><a href="#faq" onClick={(e) => {e.preventDefault(); window.location.hash = 'faq';}} className="hover:text-primary">Dúvidas</a></li></ul></div>
            <div className="flex flex-col items-center md:items-start">
                <h4 className="text-white font-bold mb-4">Pagamento Seguro</h4>
                <div className="flex gap-2 items-center flex-wrap justify-center md:justify-start">
                    {/* Payment Icons */}
                    <div className="bg-white p-0.5 rounded h-8 w-12 flex items-center justify-center shadow-sm"><img src="https://gestplus.pt/imgs/mbway.png" alt="MBWay" className="h-full w-full object-contain" /></div>
                    <div className="bg-white p-0.5 rounded h-8 w-12 flex items-center justify-center shadow-sm"><img src="https://tse2.mm.bing.net/th/id/OIP.pnNR_ET5AlZNDtMd2n1m5wHaHa?cb=ucfimg2&ucfimg=1&rs=1&pid=ImgDetMain&o=7&rm=3" alt="Multibanco" className="h-full w-full object-contain" /></div>
                    <div className="bg-white p-0.5 rounded h-8 w-12 flex items-center justify-center shadow-sm"><img src="https://tse1.mm.bing.net/th/id/OIP.ygZGQKeZ0aBwHS7e7wbJVgHaDA?cb=ucfimg2&ucfimg=1&rs=1&pid=ImgDetMain&o=7&rm=3" alt="Visa" className="h-full w-full object-contain" /></div>
                    <div className="bg-white p-0.5 rounded h-8 w-12 flex items-center justify-center shadow-sm"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png" alt="Mastercard" className="h-full w-full object-contain" /></div>
                    <div className="bg-white p-0.5 rounded h-8 w-12 flex items-center justify-center shadow-sm"><img src="https://www.oservidor.pt/img/s/166.jpg" alt="Cobrança" className="h-full w-full object-contain" /></div>
                </div>
            </div>
        </div>
        <div className="container mx-auto px-4 mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-center md:justify-between items-center text-[10px] relative">
            <span className="opacity-50">&copy; {new Date().getFullYear()} Allshop Store.</span>
            
            {isAdmin && (
                <div className="md:absolute md:left-1/2 md:-translate-x-1/2 mt-2 md:mt-0">
                    <a 
                        href="#dashboard" 
                        onClick={(e) => { e.preventDefault(); window.location.hash = 'dashboard'; }} 
                        className="px-4 py-2 bg-gray-800 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-all font-bold shadow-md"
                    >
                        Painel Admin
                    </a>
                </div>
            )}
        </div>
      </footer>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cartItems={cartItems} onRemoveItem={removeFromCart} onUpdateQuantity={updateQuantity} total={cartTotal} onCheckout={handleCheckout} user={user} onOpenLogin={() => { setIsCartOpen(false); setIsLoginOpen(true); }} onAddFreebie={addToCart} publicProducts={dbProducts} />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLogin={(u) => { setUser(u); setIsLoginOpen(false); }} />
      <LuckyWheel isOpen={showLuckyWheel} onClose={() => setShowLuckyWheel(false)} user={user} onUpdateUser={handleUpdateUser} />
      
      <ProductComparator 
          isOpen={isComparatorOpen} 
          onClose={() => setIsComparatorOpen(false)} 
          products={dbProducts.filter(p => compareList.includes(p.id))} 
          onAddToCart={(p) => { addToCart(p); setIsComparatorOpen(false); }}
          onRemoveProduct={(id) => setCompareList(prev => prev.filter(pId => pId !== id))}
      />

      {resetCode && <ResetPasswordModal oobCode={resetCode} onClose={() => setResetCode(null)} />}
      {route !== '#dashboard' && (
        <AIChat products={dbProducts} isOpen={isAIChatOpen} onToggle={setIsAIChatOpen} userOrders={orders} />
      )}
    </div>
  );
};

export default App;
