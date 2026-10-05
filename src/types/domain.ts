export interface ProductVariant {
  name: string;
  price: number;
  image?: string;
  stock?: number;
}
export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  images?: string[];
  description: string;
  stock: number;
  variants?: ProductVariant[];
  variantLabel?: string;
  features?: string[];
  badges?: string[];
  comingSoon?: boolean;
  isPrivate?: boolean;
  maxQuantityPerOrder?: number;
}

export interface ProductReview {
  id: string;
  productId: number;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  images?: string[];
}

export interface CartItem {
  key: string;
  productId: number;
  name: string;
  image: string;
  price: number;
  quantity: number;
  variantName?: string;
  availableStock: number;
  maxQuantityPerOrder?: number;
}
