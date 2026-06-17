/**
 * HTTP 客户端
 *
 * 支持两种鉴权模式：
 * 1. embedded: Authorization: Bearer <app-bridge-session-token>
 * 2. standalone: Authorization: Bearer <backend-jwt-token>
 *
 * 鉴权 token 由 bridge.ts 统一提供，本文件不关心来源
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
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

// 请求拦截器：自动注入 Authorization header
http.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const token = await getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // 自动注入 shop 参数（独立模式常用，应用内模式 Guard 已能从 JWT 解析出 shop）
    const shop = getCurrentShop();
    if (shop) {
      // GET 请求：自动追加到 query
      if (config.method === 'get' || !config.method || config.method === 'GET') {
        config.params = config.params || {};
        if (!config.params.shop) {
          config.params.shop = shop;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：统一处理 401
http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/**
 * 通用响应解包：后端通常返回 { success, data, message }
 * 调用方直接拿到 data；若失败抛错
 */
export async function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request(config);
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success) return body.data as T;
    throw new Error(body.message || '请求失败');
  }
  return body as T;
}

export default http;

// ============ 业务 API 快捷方法 ============

// 独立应用：登录 / 注册
export const userAuthApi = {
  login: (username: string, password: string) =>
    request<{ token: string; tokenType: string; expiresIn: number; user: any }>({
      method: 'POST',
      url: '/user/auth/login',
      data: { username, password },
    }),
  register: (username: string, password: string, shop?: string, email?: string) =>
    request<{ user: any }>({
      method: 'POST',
      url: '/user/auth/register',
      data: { username, password, shop, email },
    }),
  me: () =>
    request<{ user: any }>({
      method: 'GET',
      url: '/user/auth/me',
    }),
};

// 店铺 API（应用内 + 独立应用共用）
// 使用 REST 路径 /api2/shopify/* ，也兼容 GraphQL 路径 /api/shopify/*
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

// 授权状态查询
export const authStatusApi = {
  check: (shop: string) =>
    http.get('/auth/status', { params: { shop } }).then((r) => r.data),
};
