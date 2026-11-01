
import React, { useState, useEffect, useMemo } from 'react';
import { Product, Review, User, ProductVariant, PointHistory, Order } from '../types';
import { 
    ShoppingCart, ArrowLeft, Check, Share2, ShieldCheck,
    Truck, AlertTriangle, Heart, Info, X, Mail, Loader2,
    CheckCircle, Coins, Timer, Star, ZoomIn, PackageCheck,
    RotateCcw, Tag, ChevronLeft, ChevronRight
} from 'lucide-react';
import ReviewSection from './ReviewSection';
import { STORE_NAME, PUBLIC_URL, SHARE_URL } from '../constants';
import { modularDb } from '../services/firebaseConfig';
import { doc, updateDoc, increment, arrayUnion, collection, addDoc } from 'firebase/firestore';
import { effectiveProductAvailability } from '../src/domain/productAvailability';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
}).format(value);

const CountdownTimer: React.FC<{ targetDate: string }> = ({ targetDate }) => {
    const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const difference = +new Date(targetDate) - +new Date();
            
            if (difference > 0) {
                setTimeLeft({
                    hours: Math.floor((difference / (1000 * 60 * 60))),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60),
                });
                setIsExpired(false);
            } else {
                setIsExpired(true);
            }
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [targetDate]);

    if (isExpired) return null;

    return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between text-red-700 animate-fade-in my-4">
            <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wider">
                <Timer size={18} className="animate-pulse"/> A Promoção termina em:
            </div>
            <div className="flex gap-2 font-mono font-bold text-lg">
                <div className="bg-white px-2 rounded border border-red-100 shadow-sm">{String(timeLeft.hours).padStart(2, '0')}h</div>
                <span>:</span>
                <div className="bg-white px-2 rounded border border-red-100 shadow-sm">{String(timeLeft.minutes).padStart(2, '0')}m</div>
                <span>:</span>
                <div className="bg-white px-2 rounded border border-red-100 shadow-sm">{String(timeLeft.seconds).padStart(2, '0')}s</div>
            </div>
        </div>
    );
};

interface ProductDetailsProps {
  product: Product;
  allProducts: Product[];
  onAddToCart: (product: Product, variant?: ProductVariant) => void;
  reviews: Review[];
  onAddReview: (review: Review) => void;
  currentUser: User | null;
  getStock: (productId: number, variant?: string) => number;
  wishlist: number[];
  onToggleWishlist: (id: number) => void;
  isProcessing?: boolean;
  onUpdateUser?: (user: Partial<User>) => void; // Nova Prop
  orders?: Order[]; // Nova Prop: Histórico de encomendas para validar compra
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ 
  product, allProducts, onAddToCart, reviews, onAddReview, currentUser, getStock, wishlist, onToggleWishlist, isProcessing = false, onUpdateUser, orders = []
}) => {
  const [selectedImage, setSelectedImage] = useState<string>(product.image);
  const [selectedVariantName, setSelectedVariantName] = useState<string | undefined>();
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied' | 'shared' | 'points_earned'>('idle');
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);

  const [alertEmail, setAlertEmail] = useState(currentUser?.email || '');
  const [alertStatus, setAlertStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  // Verifica se o utilizador comprou este produto
  const hasPurchased = useMemo(() => {
      if (!currentUser) return false;
      return orders.some(order => 
          (order.status === 'Entregue' || order.status === 'Enviado' || order.status === 'Levantamento em Loja') &&
          order.items.some(item => {
              if (typeof item === 'string') return false; // Ignora itens antigos (strings)
              return item.productId === product.id;
          })
      );
  }, [orders, product.id, currentUser]);

  useEffect(() => {
    // Não seleciona nenhuma variante por defeito, forçando o utilizador a escolher.
    setSelectedVariantName(undefined);
    setSelectedImage(product.image);
    setIsImageZoomOpen(false);
    setAlertStatus('idle');
    setAlertEmail(currentUser?.email || '');
    window.scrollTo(0, 0);
    document.title = `${product.name} | ${STORE_NAME}`;
    
    return () => {
        document.title = STORE_NAME;
    };
  }, [product, currentUser]);

  const uniqueImages = useMemo(() => {
    const imgs = new Set<string>();
    if (product.image) imgs.add(product.image);
    if (product.images) product.images.forEach(img => imgs.add(img));
    if (product.variants) product.variants.forEach(v => {
        if (v.image) imgs.add(v.image);
    });
    return Array.from(imgs);
  }, [product]);

  const selectedVariant = product.variants?.find(v => v.name === selectedVariantName);
  
  const promoEnded = product.promoEndsAt ? new Date(product.promoEndsAt) <= new Date() : false;

  // Se a promoção acabou, reverte para o preço original (se existir e não for variante específica)
  // Nota: Variantes não têm originalPrice no modelo atual, logo mantêm o preço da DB.
  let currentPrice = selectedVariant?.price ?? product.price;
  if (promoEnded && !selectedVariant && product.originalPrice) {
      currentPrice = product.originalPrice;
  }

  const currentStock = getStock(product.id, selectedVariantName);
  
  const hasVariants = product.variants && product.variants.length > 0;
  const isVariantSelected = !!selectedVariantName;
  
  const availability = effectiveProductAvailability(product, currentStock);
  const isComingSoon = availability === 'COMING_SOON';
  const isOutOfStock = availability === 'OUT_OF_STOCK';
  const isUnavailable = availability !== 'AVAILABLE';
  const isLowStock = currentStock > 0 && currentStock <= 3 && currentStock !== 999 && availability === 'AVAILABLE';
  const isFavorite = wishlist.includes(product.id);
  
  // Só mostra promoção se NÃO tiver acabado
  const showPromo = Boolean(!promoEnded && product.originalPrice && product.originalPrice > currentPrice);
  const currentReviews = (reviews || []).filter(r => r.productId === product.id);
  const averageRating = currentReviews.length
    ? currentReviews.reduce((total, review) => total + review.rating, 0) / currentReviews.length
    : 0;
  const discountPercentage = showPromo && product.originalPrice
    ? Math.round((1 - currentPrice / product.originalPrice) * 100)
    : 0;
  const featureList = product.features || [];
  const specEntries = Object.entries(product.specs || {});
  const shippingIsFree = currentPrice > 50;
  const selectedImageIndex = Math.max(0, uniqueImages.indexOf(selectedImage));

  const relatedProducts = (allProducts || [])
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleVariantChange = (variant: ProductVariant) => {
      setSelectedVariantName(variant.name);
      if (variant.image) setSelectedImage(variant.image);
  };

  const showAdjacentImage = (direction: -1 | 1) => {
      if (uniqueImages.length < 2) return;
      const nextIndex = (selectedImageIndex + direction + uniqueImages.length) % uniqueImages.length;
      setSelectedImage(uniqueImages[nextIndex]);
  };

  const handleAddToCart = () => {
      if (isUnavailable || (hasVariants && !isVariantSelected) || isProcessing) return;
      if (selectedVariant) onAddToCart(product, selectedVariant);
      else onAddToCart(product);
  };

  const awardSharePoints = async () => {
      if (!currentUser) return;
      const today = new Date().toISOString().split('T')[0];
      
      // Verifica se já partilhou hoje
      if (currentUser.lastShareDate && currentUser.lastShareDate.startsWith(today)) {
          return; // Já ganhou pontos hoje
      }

      try {
          const points = 5;
          const newHistoryItem: PointHistory = {
              id: `share-${Date.now()}`,
              date: new Date().toISOString(),
              amount: points,
              reason: 'Partilha de Produto Diária'
          };

          // 1. Atualizar UI imediatamente (Optimistic Update)
          if (onUpdateUser) {
              onUpdateUser({
                  loyaltyPoints: (currentUser.loyaltyPoints || 0) + points,
                  lastShareDate: new Date().toISOString(),
                  pointsHistory: [...(currentUser.pointsHistory || []), newHistoryItem]
              });
          }

          // 2. Gravar no Firebase
          await updateDoc(doc(modularDb, 'users', currentUser.uid), {
              loyaltyPoints: increment(points),
              pointsHistory: arrayUnion(newHistoryItem),
              lastShareDate: new Date().toISOString()
          });
          
          setShareFeedback('points_earned');
          setTimeout(() => setShareFeedback('idle'), 4000);
      } catch (e) {
          console.error("Erro ao atribuir pontos de partilha:", e);
      }
  };

  const handleShare = async () => {
    // Usar SHARE_URL para o link de partilha
    const shareUrl = `${SHARE_URL}/product/${product.id}`;
    
    const shareData: ShareData = {
      title: product.name,
      text: `Olha o que encontrei na ${STORE_NAME} por apenas ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(currentPrice)}!`,
      url: shareUrl, 
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        if (shareFeedback !== 'points_earned') setShareFeedback('shared');
        awardSharePoints();
      } else {
        throw new Error("Web Share API unavailable");
      }
    } catch (err) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (shareFeedback !== 'points_earned') setShareFeedback('copied');
        awardSharePoints();
      } catch (clipboardErr) {
        console.warn("Share fallback failed", clipboardErr);
        prompt("Copie o link:", shareUrl);
      }
    }

    if (shareFeedback !== 'points_earned') {
        setTimeout(() => setShareFeedback('idle'), 3000);
    }
  };

  const handleStockAlertSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!alertEmail) return;
      setAlertStatus('loading');
      try {
          await addDoc(collection(modularDb, 'stock_alerts'), {
              email: alertEmail,
              productId: product.id,
              productName: product.name,
              variantName: selectedVariantName || null,
              date: new Date().toISOString()
          });
          setAlertStatus('success');
      } catch (error) {
          console.error("Erro ao subscrever alerta de stock:", error);
          setAlertStatus('idle'); // Permite tentar de novo
      }
  };

  // --- JSON-LD STRUCTURED DATA FOR GOOGLE SEARCH ---
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": selectedImage,
    "description": product.description || "Compre na All-Shop com stock nacional e garantia de entrega rápida.",
    "brand": {
      "@type": "Brand",
      "name": "All-Shop"
    },
    ...((currentReviews && currentReviews.length > 0) ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": String((currentReviews.reduce((acc, r) => acc + r.rating, 0) / currentReviews.length).toFixed(1)),
        "reviewCount": String(currentReviews.length)
      }
    } : {}),
    "offers": {
      "@type": "Offer",
      "url": `${PUBLIC_URL}/p/${product.id}`,
      "priceCurrency": "EUR",
      "price": String(currentPrice),
      "itemCondition": "https://schema.org/NewCondition",
      "availability": isUnavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": {
          "@type": "MonetaryAmount",
          "value": currentPrice > 50 ? "0.00" : "4.99",
          "currency": "EUR"
        },
        "shippingDestination": {
            "@type": "DefinedRegion",
            "addressCountry": "PT"
        },
        "deliveryTime": {
            "@type": "ShippingDeliveryTime",
            "handlingTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 1, "unitCode": "d" },
            "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "d" }
        }
      }
    }
  };

  const buyButtonLabel = isUnavailable
    ? (isComingSoon ? 'Brevemente disponível' : 'Indisponível')
    : (hasVariants && !isVariantSelected)
      ? 'Escolha uma opção'
      : 'Adicionar ao carrinho';

  const buyButtonDisabled = isUnavailable || (hasVariants && !isVariantSelected) || isProcessing;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 animate-fade-in transition-colors duration-300 pb-28 md:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="container mx-auto max-w-7xl px-4 py-5 md:py-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <a
            href="#/"
            onClick={(event) => { event.preventDefault(); window.location.hash = '/'; }}
            className="inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
          >
            <ArrowLeft size={18} /> Voltar à loja
          </a>
          <span className="hidden items-center gap-2 text-xs font-semibold text-slate-400 sm:flex dark:text-slate-500">
            <ShieldCheck size={16} /> Compra protegida
          </span>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,.92fr)] lg:gap-12">
          <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_22px_60px_-38px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setIsImageZoomOpen(true)}
                className="group absolute inset-0 z-10 cursor-zoom-in"
                aria-label="Ampliar fotografia do produto"
              >
                <img
                  src={selectedImage}
                  alt={product.name}
                  className={`h-full w-full object-contain p-6 transition duration-500 group-hover:scale-[1.035] sm:p-10 ${isUnavailable ? 'grayscale-[35%] opacity-70' : ''}`}
                />
              </button>

              <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[70%] flex-wrap gap-2 sm:left-6 sm:top-6">
                {showPromo && (
                  <span className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-lg">-{discountPercentage}%</span>
                )}
                {(product.badges || []).map(badge => (
                  <span key={badge} className="rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-slate-950">
                    {badge}
                  </span>
                ))}
                {product.isFreebie && (
                  <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-lg">ELEGÍVEL COMO OFERTA</span>
                )}
              </div>

              <div className="absolute right-4 top-4 z-30 flex flex-col gap-2 sm:right-6 sm:top-6">
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product.id)}
                  className="rounded-full border border-white/70 bg-white/90 p-3 text-slate-500 shadow-lg backdrop-blur transition hover:scale-105 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900/90"
                  aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <Heart size={22} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsImageZoomOpen(true)}
                  className="rounded-full border border-white/70 bg-white/90 p-3 text-slate-500 shadow-lg backdrop-blur transition hover:scale-105 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900/90"
                  aria-label="Ampliar fotografia"
                >
                  <ZoomIn size={22} />
                </button>
              </div>

              {uniqueImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => showAdjacentImage(-1)}
                    className="absolute left-4 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-slate-700 shadow-lg backdrop-blur transition hover:scale-105 dark:bg-slate-900/90 dark:text-white"
                    aria-label="Fotografia anterior"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => showAdjacentImage(1)}
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-slate-700 shadow-lg backdrop-blur transition hover:scale-105 dark:bg-slate-900/90 dark:text-white"
                    aria-label="Fotografia seguinte"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}

              {isOutOfStock && (
                <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center">
                  <span className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-extrabold tracking-widest text-white shadow-xl">ESGOTADO</span>
                </div>
              )}
              {isComingSoon && (
                <div className="pointer-events-none absolute inset-x-0 bottom-7 z-20 flex justify-center">
                  <span className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-extrabold tracking-widest text-white shadow-xl">EM BREVE</span>
                </div>
              )}
              {uniqueImages.length > 1 && (
                <span className="absolute bottom-5 right-5 z-20 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-bold text-white backdrop-blur">
                  {selectedImageIndex + 1} / {uniqueImages.length}
                </span>
              )}
            </div>

            {uniqueImages.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide">
                {uniqueImages.map((image, index) => (
                  <button
                    type="button"
                    key={`${image}-${index}`}
                    onClick={() => setSelectedImage(image)}
                    className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-2 bg-white p-1.5 transition-all dark:bg-slate-900 sm:h-24 sm:w-24 ${selectedImage === image ? 'border-orange-500 shadow-md ring-4 ring-orange-500/10' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}
                    aria-label={`Ver fotografia ${index + 1}`}
                  >
                    <img src={image} alt={`${product.name}, fotografia ${index + 1}`} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.5)] dark:border-slate-700 dark:bg-slate-900 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">{product.category}</p>
                  <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">{product.name}</h1>
                  <button type="button" onClick={() => document.getElementById('avaliacoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-orange-600 dark:text-slate-400">
                    <span className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} size={17} className={star <= Math.round(averageRating) ? 'fill-current' : 'text-slate-300 dark:text-slate-600'} />
                      ))}
                    </span>
                    <span className="font-semibold">{currentReviews.length ? `${averageRating.toFixed(1)} · ${currentReviews.length} ${currentReviews.length === 1 ? 'avaliação' : 'avaliações'}` : 'Ainda sem avaliações'}</span>
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={handleShare}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all ${shareFeedback === 'idle' ? 'bg-slate-100 text-slate-500 hover:bg-orange-50 hover:text-orange-600 dark:bg-slate-800' : shareFeedback === 'points_earned' ? 'animate-bounce bg-amber-100 text-amber-600' : shareFeedback === 'copied' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}
                    title={shareFeedback === 'copied' ? 'Link copiado' : 'Partilhar produto'}
                    aria-label="Partilhar produto"
                  >
                    {shareFeedback === 'idle' ? <Share2 size={21} /> : shareFeedback === 'points_earned' ? <Coins size={21} /> : <Check size={21} />}
                    {currentUser && (!currentUser.lastShareDate || !currentUser.lastShareDate.startsWith(new Date().toISOString().split('T')[0])) && shareFeedback === 'idle' && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">+5</span>
                    )}
                  </button>
                  {shareFeedback === 'points_earned' && <span className="mt-1 text-[10px] font-bold text-amber-600">+5 pontos</span>}
                </div>
              </div>

              {product.promoEndsAt && !promoEnded && <CountdownTimer targetDate={product.promoEndsAt} />}

              <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/80">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className={`text-4xl font-black tracking-tight ${showPromo ? 'text-red-600' : 'text-slate-950 dark:text-white'}`}>{formatCurrency(currentPrice)}</span>
                  {showPromo && product.originalPrice && (
                    <span className="mb-1 text-lg font-semibold text-slate-400 line-through">{formatCurrency(product.originalPrice)}</span>
                  )}
                  {showPromo && <span className="mb-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-extrabold text-red-700 dark:bg-red-950 dark:text-red-300">Poupe {formatCurrency(product.originalPrice! - currentPrice)}</span>}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">IVA incluído. Custos de envio calculados antes do pagamento.</p>
              </div>

              {hasVariants && product.variants && (
                <div id="variant-selector" className="mt-7 scroll-mt-24">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{product.variantLabel || 'Escolha uma opção'}</label>
                    {!isVariantSelected && <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Seleção obrigatória</span>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {product.variants.map(variant => {
                      const variantStock = getStock(product.id, variant.name);
                      const isSoldOut = variantStock <= 0 && variantStock !== 999;
                      const isSelected = selectedVariantName === variant.name;
                      return (
                        <button
                          type="button"
                          key={variant.name}
                          onClick={() => !isSoldOut && handleVariantChange(variant)}
                          disabled={isSoldOut}
                          className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${isSelected ? 'border-orange-500 bg-orange-50 text-orange-950 ring-4 ring-orange-500/10 dark:bg-orange-950/30 dark:text-orange-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'} ${isSoldOut ? 'cursor-not-allowed opacity-45' : ''}`}
                        >
                          <span>
                            <span className="block text-sm font-bold">{variant.name}</span>
                            <span className={`mt-0.5 block text-[11px] font-semibold ${isSoldOut ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{isSoldOut ? 'Esgotado' : variantStock === 999 ? 'Disponível' : `${variantStock} em stock`}</span>
                          </span>
                          <span className="text-sm font-extrabold">{formatCurrency(variant.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-7">
                {isUnavailable ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/25">
                    {alertStatus === 'success' ? (
                      <div className="text-center">
                        <CheckCircle size={30} className="mx-auto mb-2 text-emerald-500" />
                        <h4 className="text-lg font-bold text-emerald-800 dark:text-emerald-300">Inscrição confirmada</h4>
                        <p className="text-sm text-emerald-700 dark:text-emerald-400">Avisaremos <span className="font-semibold">{alertEmail}</span> assim que estiver disponível.</p>
                      </div>
                    ) : (
                      <>
                        <h4 className="flex items-center gap-2 text-lg font-bold text-amber-950 dark:text-amber-200"><Mail size={20} /> {isComingSoon ? 'Seja o primeiro a saber' : 'Avise-me quando chegar'}</h4>
                        <p className="mb-4 mt-1 text-sm text-amber-800 dark:text-amber-300">Receba um aviso por email assim que este produto puder ser comprado.</p>
                        <form onSubmit={handleStockAlertSubmit} className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="email"
                            required
                            value={alertEmail}
                            onChange={event => setAlertEmail(event.target.value)}
                            placeholder="O seu email"
                            className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-white"
                          />
                          <button type="submit" disabled={alertStatus === 'loading'} className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-bold text-white transition hover:bg-amber-700 disabled:opacity-60">
                            {alertStatus === 'loading' ? <Loader2 className="animate-spin" size={17} /> : 'Notificar-me'}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Check size={18} /> Em stock</span>
                    {isLowStock && <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"><AlertTriangle size={16} /> Restam apenas {currentStock}</span>}
                    {product.maxQuantityPerOrder && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><Info size={14} /> Máximo de {product.maxQuantityPerOrder} por encomenda</span>}
                  </div>
                )}
              </div>

              <div id="buy-actions" className="mt-6 scroll-mt-24">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={buyButtonDisabled}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-extrabold shadow-lg transition-all active:scale-[0.99] ${buyButtonDisabled ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700' : 'bg-orange-500 text-white shadow-orange-500/20 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl'}`}
                >
                  {isProcessing ? <><Loader2 size={23} className="animate-spin" /> A processar...</> : <><ShoppingCart size={23} /> {buyButtonLabel}</>}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><Truck size={21} className="shrink-0 text-orange-500" /><div><p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{shippingIsFree ? 'Envio grátis' : 'Envio rápido'}</p><p className="text-[11px] text-slate-500">{shippingIsFree ? 'Nesta compra' : 'Grátis acima de 50 €'}</p></div></div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><PackageCheck size={21} className="shrink-0 text-emerald-500" /><div><p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">Entrega 1–3 dias</p><p className="text-[11px] text-slate-500">Stock em Portugal</p></div></div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><ShieldCheck size={21} className="shrink-0 text-blue-500" /><div><p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">3 anos garantia</p><p className="text-[11px] text-slate-500">Compra protegida</p></div></div>
              </div>
            </div>
          </div>
        </div>

        {(product.description || featureList.length > 0 || specEntries.length > 0) && (
          <section className="mt-12 grid gap-6 lg:grid-cols-[1.05fr_.95fr]" aria-labelledby="product-information-title">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Conheça melhor</p>
              <h2 id="product-information-title" className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Sobre este produto</h2>
              {product.description && <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-600 dark:text-slate-300">{product.description}</p>}
              {featureList.length > 0 && (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {featureList.map((feature, index) => (
                    <li key={`${feature}-${index}`} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300"><Check size={13} strokeWidth={3} /></span>
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Tag size={21} /></span>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">Detalhes</h2>
              </div>
              {specEntries.length > 0 ? (
                <dl className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
                  {specEntries.map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-4 py-3 text-sm">
                      <dt className="font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="text-right font-bold text-slate-900 dark:text-slate-100">{typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-slate-500">Categoria</span><span className="font-bold text-slate-900 dark:text-white">{product.category}</span></div>
                  {product.weight ? <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-slate-500">Peso</span><span className="font-bold text-slate-900 dark:text-white">{product.weight} kg</span></div> : null}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-slate-500">Estado</span><span className="font-bold text-slate-900 dark:text-white">Novo</span></div>
                </div>
              )}
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                <RotateCcw size={20} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-emerald-900 dark:text-emerald-200"><span className="font-bold">Compra sem preocupação.</span> Apoio pós-venda e devoluções de acordo com as condições da loja.</p>
              </div>
            </div>
          </section>
        )}

        <section id="avaliacoes" className="scroll-mt-28">
          <ReviewSection productId={product.id} reviews={reviews} onAddReview={onAddReview} currentUser={currentUser} hasPurchased={hasPurchased} />
        </section>

        {relatedProducts.length > 0 && (
          <section className="mt-16 border-t border-slate-200 pt-12 dark:border-slate-800" aria-labelledby="related-products-title">
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Continue a descobrir</p>
                <h2 id="related-products-title" className="mt-2 text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">Também pode gostar</h2>
              </div>
              <a href="#/" onClick={event => { event.preventDefault(); window.location.hash = '/'; setTimeout(() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hidden text-sm font-bold text-orange-600 hover:text-orange-700 sm:block">Ver todos</a>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {relatedProducts.map(related => {
                const relatedStock = getStock(related.id);
                const relatedAvailability = effectiveProductAvailability(related, relatedStock);
                return (
                  <a href={`#product/${related.id}`} key={related.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:border-orange-200 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-900">
                    <div className="relative aspect-square overflow-hidden bg-slate-50 dark:bg-slate-800">
                      <img src={related.image} alt={related.name} className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
                      <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${relatedAvailability === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700' : relatedAvailability === 'COMING_SOON' ? 'bg-violet-100 text-violet-700' : 'bg-red-100 text-red-700'}`}>{relatedAvailability === 'AVAILABLE' ? 'EM STOCK' : relatedAvailability === 'COMING_SOON' ? 'EM BREVE' : 'ESGOTADO'}</span>
                    </div>
                    <div className="p-4">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400">{related.category}</p>
                      <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-slate-900 transition-colors group-hover:text-orange-600 dark:text-white">{related.name}</h3>
                      <p className="mt-3 text-lg font-black text-slate-950 dark:text-white">{formatCurrency(related.price)}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-12px_40px_-22px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95 md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{selectedVariantName || product.name}</p>
            <p className="text-xl font-black text-slate-950 dark:text-white">{formatCurrency(currentPrice)}</p>
          </div>
          <button type="button" onClick={handleAddToCart} disabled={buyButtonDisabled} className={`flex min-w-[11rem] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold ${buyButtonDisabled ? 'bg-slate-200 text-slate-400 dark:bg-slate-700' : 'bg-orange-500 text-white'}`}>
            {isProcessing ? <Loader2 size={19} className="animate-spin" /> : <ShoppingCart size={19} />}
            {buyButtonLabel}
          </button>
        </div>
      </div>

      {isImageZoomOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Fotografia ampliada do produto" onClick={() => setIsImageZoomOpen(false)}>
          <button type="button" onClick={() => setIsImageZoomOpen(false)} className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 sm:right-7 sm:top-7" aria-label="Fechar fotografia ampliada"><X size={26} /></button>
          {uniqueImages.length > 1 && (
            <>
              <button type="button" onClick={event => { event.stopPropagation(); showAdjacentImage(-1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 sm:left-7" aria-label="Fotografia anterior"><ChevronLeft size={28} /></button>
              <button type="button" onClick={event => { event.stopPropagation(); showAdjacentImage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20 sm:right-7" aria-label="Fotografia seguinte"><ChevronRight size={28} /></button>
            </>
          )}
          <img src={selectedImage} alt={product.name} className="max-h-[88vh] max-w-[90vw] object-contain" onClick={event => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default ProductDetails;
