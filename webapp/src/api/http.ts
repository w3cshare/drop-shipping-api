/**
 * HTTP 客户端 + 业务 API
 *
 * 支持两种鉴权模式：
 * 1. embedded:  Authorization: Bearer <app-bridge-session-token>
 * 2. standalone: Authorization: Bearer <backend-jwt-token>
 *
 * 鉴权 token 由 bridge.ts 统一提供，本文件不关心来源
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { getAuthToken, getCurrentShop, clearAuth } from '@/shopify/bridge';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：自动注入 Authorization header + shop 参数
http.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const token = await getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }

    const shop = getCurrentShop();
    if (shop) {
      // GET 请求：自动追加 ?shop=xxx
      if (!config.method || config.method.toUpperCase() === 'GET') {
        config.params = config.params || {};
        if (!config.params.shop) {
          config.params.shop = shop;
        }
      } else if (config.data && typeof config.data === 'object' && !Array.isArray(config.data)) {
        // 对于非 GET 请求，如果请求体是一个对象，也自动附加 shop（但不覆盖已存在的字段）
        if (!('shop' in config.data)) {
          config.data.shop = shop;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

/** 轻量 Toast：避免引入 Element Plus，保持项目简洁 */
function showToast(message: string, type: 'error' | 'info' = 'error') {
  // 只去重错误提示（1 秒内相同消息不重复显示）
  const key = `${type}:${message}`;
  const now = Date.now();
  if ((showToast as any)._last === key && now - (showToast as any)._time < 1000) return;
  (showToast as any)._last = key;
  (showToast as any)._time = now;

  const id = `app-toast-${Date.now()}`;
  const el = document.createElement('div');
  el.id = id;
  el.textContent = message;
  el.style.cssText = [
    'position:fixed',
    'top:20px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:' + (type === 'error' ? '#d72c0d' : '#008060'),
    'color:#fff',
    'padding:10px 20px',
    'border-radius:6px',
    'font-size:13px',
    'z-index:9999',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    'opacity:0',
    'transition:opacity .2s ease',
    'max-width:80%',
    'text-align:center',
  ].join(';');
  document.body.appendChild(el);

  // 触发过渡
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

// 响应拦截器：统一处理 401 + 提取业务错误信息
http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<any>) => {
    const status = error.response?.status;
    const data = error.response?.data;

    // 401：token 失效，清理并跳登录
    if (status === 401) {
      clearAuth();
      const onLogin =
        typeof location !== 'undefined' && location.pathname.startsWith('/login');
      if (!onLogin) {
        // 登录页不会重定向；其他页面跳登录并携带 redirect
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?redirect=${redirect}`;
      }
    }

    // 把后端返回的错误信息提取出来，方便上层统一展示
    const message =
      (data && (data.message || data.error)) ||
      error.message ||
      '请求失败';
    const normalized = new Error(message) as Error & { status?: number; data?: any };
    normalized.status = status;
    normalized.data = data;

    // 全局错误提示（除了 401 已跳登录外）
    if (status !== 401) {
      showToast(message);
    }

    return Promise.reject(normalized);
  },
);

/**
 * 通用响应解包：后端通常返回 { success, data, message }
 * 调用方直接拿到 data；若失败抛错（错误信息已在拦截器里提取）
 */
export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request(config);
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    if (!body.success) {
      const err = new Error(body.message || '请求失败');
      return Promise.reject(err) as any;
    }
    return body.data as T;
  }
  return body as T;
}

// ====================== 业务 API 快捷方法 ======================

/** 后端 me 接口返回的 User 数据结构（与 UserResponseDto 对齐） */
export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'banned';
  shop: string | null;
  shops?: ShopInfo[];
  createdTime: string;
  lastLoginTime: string | null;
}

/** 店铺信息（与 ShopInfoDto 对齐） */
export interface ShopInfo {
  shop: string;
  name: string | null;
  email: string | null;
  domain: string | null;
  currency_code: string | null;
  timezone: string | null;
  country_code: string | null;
  scope: string | null;
  role: 'owner' | 'staff' | 'viewer' | string;
}

// -------- 独立应用：登录 / 注册 / 当前用户 --------
export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; tokenType: string; expiresIn: number; user: UserInfo }>({
      method: 'POST',
      url: '/user/auth/login',
      data: { username, password },
    }),
  register: (payload: { username: string; password: string; email?: string; shop?: string }) =>
    request<{ user: UserInfo }>({
      method: 'POST',
      url: '/user/auth/register',
      data: payload,
    }),
  /** 与 /api/admin/users/me 对齐：返回用户信息（含 shops 列表） */
  me: () =>
    request<UserInfo>({
      method: 'GET',
      url: '/api/admin/users/me',
    }),
};

// 向后兼容：之前在 Login.vue 等用的是 userAuthApi
export { authApi as userAuthApi };

// -------- 订单：数据库直读（已 JOIN 店铺信息 + 分页） --------
export interface OrderItemDto {
  id: number;
  order_id: string;
  name: string;
  shop: string;
  shop_name?: string | null;
  shop_email?: string | null;
  shop_domain?: string | null;
  shop_currency?: string | null;
  status: string;
  order_status_url?: string;
  source_name?: string;
  customer?: any;
  financial_status?: string;
  fulfillment_status?: string;
  total_price_set?: any;
  subtotal_price_set?: any;
  shipping_price_set?: any;
  total_tax_set?: any;
  total_refunded_set?: any;
  refunded?: boolean;
  payment_gateway_names?: string[];
  line_items?: any[] | null;
  shipping_address?: any;
  billing_address?: any;
  type?: string;
  created_at?: string | null;
  updated_at?: string | null;
  db_created_at?: string | null;
  db_updated_at?: string | null;
}

export interface PaginatedOrders {
  data: OrderItemDto[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// -------- 商品：数据库直读（已 JOIN 店铺信息 + 分页） --------
export interface ProductItemDto {
  id: number;
  product_id: string;
  title: string;
  shop: string;
  shop_name?: string | null;
  shop_email?: string | null;
  shop_domain?: string | null;
  shop_currency?: string | null;
  handle?: string;
  description?: string;
  vendor?: string;
  product_type?: string;
  status?: string;
  tags?: string[];
  images?: any[] | null;
  variants?: any[] | null;
  options?: any[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  db_created_at?: string | null;
  db_updated_at?: string | null;
}

export interface PaginatedProducts {
  data: ProductItemDto[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export const adminApi = {
  login: authApi.login,
  register: authApi.register,
  me: authApi.me,

  /** 订单列表（分页 + 过滤 + 店铺信息） */
  orders: (params: {
    page?: number;
    page_size?: number;
    status?: string;
    keyword?: string;
    financial_status?: string;
    fulfillment_status?: string;
  }) =>
    request<PaginatedOrders>({
      method: 'GET',
      url: '/api/admin/orders',
      params,
    }),

  /** 订单详情 */
  orderDetail: (id: string) =>
    request<OrderItemDto>({
      method: 'GET',
      url: `/api/admin/orders/${id}`,
    }),

  /** 商品列表（分页 + 过滤 + 店铺信息） */
  products: (params: {
    page?: number;
    page_size?: number;
    status?: string;
    vendor?: string;
    product_type?: string;
    keyword?: string;
  }) =>
    request<PaginatedProducts>({
      method: 'GET',
      url: '/api/admin/products',
      params,
    }),

  /** 商品详情 */
  productDetail: (id: string) =>
    request<ProductItemDto>({
      method: 'GET',
      url: `/api/admin/products/${id}`,
    }),
};

// -------- Shopify REST API：产品 / 订单 / 店铺信息（原始 REST 接口） --------
export const shopApi = {
  info: (shop?: string) =>
    request<{ id: string; name: string; email: string; domain: string; myshopifyDomain: string; [k: string]: any }>({
      method: 'GET',
      url: '/api2/shopify/shop',
      params: shop ? { shop } : undefined,
    }),
  products: (shop?: string, limit?: number) =>
    request<any>({
      method: 'GET',
      url: '/api2/shopify/products',
      params: shop || limit ? { shop, limit } : undefined,
    }),
  orders: (shop?: string, limit?: number) =>
    request<any>({
      method: 'GET',
      url: '/api2/shopify/orders',
      params: shop || limit ? { shop, limit } : undefined,
    }),
  customers: (shop?: string, limit?: number) =>
    request<any>({
      method: 'GET',
      url: '/api2/shopify/customers',
      params: shop || limit ? { shop, limit } : undefined,
    }),
};

export default http;
