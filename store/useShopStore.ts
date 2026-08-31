/**
 * Shop marketplace state store.
 * Handles shops, products, orders, and RFQs.
 * Does NOT extend useRiderStore or useDriverStore (module isolation).
 */
import { create } from "zustand";

export interface Shop {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  is_verified: boolean;
  created_at: string;
}

export interface ShopProduct {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price_bdt: number;
  stock: number;
  image_urls: string[];
  category: string | null;
  is_active: boolean;
  is_rfq: boolean;
}

export interface ShopOrder {
  id: string;
  shop_id: string;
  status: string;
  subtotal_bdt: number;
  delivery_fee_bdt: number | null;
  total_bdt: number;
  fulfillment: string;
  created_at: string;
}

export interface ShopOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_bdt: number;
  line_total_bdt: number;
  product_name: string | null;
}

export interface ShopRfq {
  id: string;
  shop_id: string;
  title: string;
  description: string | null;
  status: string;
  quoted_price_bdt: number | null;
  quoted_notes: string | null;
  expires_at: string;
  created_at: string;
}

export interface ShopCartItem {
  product_id: string;
  name: string;
  price_bdt: number;
  quantity: number;
}

interface ShopState {
  // Shop listing
  shops: Shop[];
  shopsLoading: boolean;
  shopsPage: number;

  // Selected shop
  selectedShop: Shop | null;
  selectedProducts: ShopProduct[];
  selectedOrders: ShopOrder[];
  selectedRfqs: ShopRfq[];

  // Cart (for current order flow)
  cart: ShopCartItem[];
  cartFulfillment: "delivery" | "pickup";
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;

  // Loading states
  ordersLoading: boolean;

  // Actions
  setShops: (shops: Shop[]) => void;
  setShopsLoading: (loading: boolean) => void;
  setShopsPage: (page: number) => void;
  setSelectedShop: (shop: Shop | null) => void;
  setSelectedProducts: (products: ShopProduct[]) => void;
  setSelectedOrders: (orders: ShopOrder[]) => void;
  setSelectedRfqs: (rfqs: ShopRfq[]) => void;
  setOrdersLoading: (loading: boolean) => void;

  addToCart: (product: ShopProduct, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setCartFulfillment: (f: "delivery" | "pickup") => void;
  setDeliveryAddress: (addr: string | null, lat?: number | null, lng?: number | null) => void;

  reset: () => void;
}

const INITIAL_STATE = {
  shops: [],
  shopsLoading: false,
  shopsPage: 1,
  selectedShop: null,
  selectedProducts: [],
  selectedOrders: [],
  selectedRfqs: [],
  cart: [],
  cartFulfillment: "delivery" as const,
  deliveryAddress: null,
  deliveryLat: null,
  deliveryLng: null,
  ordersLoading: false,
};

export const useShopStore = create<ShopState>((set, get) => ({
  ...INITIAL_STATE,

  setShops: (shops) => set({ shops }),
  setShopsLoading: (shopsLoading) => set({ shopsLoading }),
  setShopsPage: (shopsPage) => set({ shopsPage }),
  setSelectedShop: (selectedShop) => set({ selectedShop }),
  setSelectedProducts: (selectedProducts) => set({ selectedProducts }),
  setSelectedOrders: (selectedOrders) => set({ selectedOrders }),
  setSelectedRfqs: (selectedRfqs) => set({ selectedRfqs }),
  setOrdersLoading: (ordersLoading) => set({ ordersLoading }),

  addToCart: (product, quantity = 1) => {
    const cart = [...get().cart];
    const existing = cart.find((i) => i.product_id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        product_id: product.id,
        name: product.name,
        price_bdt: product.price_bdt,
        quantity,
      });
    }
    set({ cart });
  },

  removeFromCart: (productId) => {
    set({ cart: get().cart.filter((i) => i.product_id !== productId) });
  },

  updateCartQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    const cart = get().cart.map((i) =>
      i.product_id === productId ? { ...i, quantity } : i,
    );
    set({ cart });
  },

  clearCart: () => set({ cart: [] }),

  setCartFulfillment: (cartFulfillment) => set({ cartFulfillment }),

  setDeliveryAddress: (addr, lat, lng) =>
    set({ deliveryAddress: addr, deliveryLat: lat ?? null, deliveryLng: lng ?? null }),

  reset: () => set(INITIAL_STATE),
}));
