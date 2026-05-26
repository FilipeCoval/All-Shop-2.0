import { supabase } from './supabaseConfig';
import { Order, Product, User } from '../types';

export const supabaseSync = {
  async saveOrder(order: Order) {
    try {
      const { error } = await supabase
        .from('orders')
        .upsert({
          id: order.id,
          user_id: order.userId || null,
          date: order.date,
          status: order.status,
          total: order.total,
          items: order.items,
          shipping_info: order.shippingInfo,
          payment_info: order.paymentInfo,
          raw_data: order // Backup full object
        });
      if (error) console.error('Supabase Sync Error (Order):', error);
    } catch (e) {
      console.error('Supabase Sync Failed (Order):', e);
    }
  },

  async saveUser(user: User | any) {
    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.uid || user.id,
          name: user.name,
          email: user.email,
          addresses: user.addresses,
          wishlist: user.wishlist,
          tier: user.tier,
          total_spent: user.totalSpent || 0,
          raw_data: user
        });
      if (error) console.error('Supabase Sync Error (User):', error);
    } catch (e) {
      console.error('Supabase Sync Failed (User):', e);
    }
  },

  async saveProduct(product: Product) {
    try {
      const { error } = await supabase
        .from('products')
        .upsert({
          id: product.id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          variants: product.variants,
          is_freebie: product.isFreebie || false,
          raw_data: product
        });
      if (error) console.error('Supabase Sync Error (Product):', error);
    } catch (e) {
      console.error('Supabase Sync Failed (Product):', e);
    }
  }
};
