/**
 * Shopify App Bridge 核心模块
 *
 * 负责：
 * 1. 初始化 App Bridge（应用内模式）
 * 2. 生成 session token（JWT）用于后端鉴权
 * 3. 提供与 Shopify Admin 交互的通用方法（Toast、Modal、重定向）
 *
 * 设计目标：与 Vue/React 等框架无关，纯 TS 模块，可复用到任何前端
 */

import { createApp, ClientApplication } from '@shopify/app-bridge';
import { getSessionToken } from '@shopify/app-bridge-utils';

let app: ClientApplication<any> | null = null;
let appMode: 'embedded' | 'standalone' | null = null;

/**
 * 检测当前运行模式
 * - embedded: 运行在 Shopify Admin iframe 内
 * - standalone: 独立应用（商家自有后台）
 */
export function detectMode(): 'embedded' | 'standalone' {
  if (appMode) return appMode;

  const params = new URLSearchParams(location.search);
  const hasHost = !!params.get('host');
  const hasShop = !!params.get('shop');
  const inIframe = window.self !== window.top;

  if (hasHost && hasShop && inIframe) {
    appMode = 'embedded';
  } else {
    appMode = 'standalone';
  }

  return appMode;
}

/**
 * 初始化 App Bridge（应用内模式）
 * 需在页面启动时调用一次
 */
export function initAppBridge(apiKey: string, host?: string): ClientApplication<any> | null {
  const mode = detectMode();
  if (mode !== 'embedded') {
    app = null;
    return null;
  }

  const actualHost = host || new URLSearchParams(location.search).get('host') || '';
  if (!apiKey || !actualHost) {
    console.warn('[AppBridge] 缺少 apiKey 或 host，无法初始化');
    return null;
  }

  try {
    app = createApp({
      apiKey,
      host: actualHost,
    });
    console.log('[AppBridge] 已初始化');
    return app;
  } catch (e) {
    console.error('[AppBridge] 初始化失败:', e);
    return null;
  }
}

/**
 * 获取当前 App Bridge 实例
 */
export function getAppBridge(): ClientApplication<any> | null {
  return app;
}

/**
 * 获取 session token
 * - 应用内模式：调用 App Bridge 的 getSessionToken（短期 JWT，自动刷新）
 * - 独立模式：返回存储的自定义 JWT
 */
export async function getAuthToken(): Promise<string | null> {
  const mode = detectMode();

  if (mode === 'embedded') {
    if (!app) {
      console.warn('[AppBridge] 未初始化，无法获取 session token');
      return null;
    }
    try {
      return await getSessionToken(app as any);
    } catch (e) {
      console.error('[AppBridge] 获取 session token 失败:', e);
      return null;
    }
  }

  // 独立模式：从 localStorage 读取自定义 JWT
  return localStorage.getItem('user_token');
}

/**
 * 解析 App Bridge JWT 的 payload
 * 返回 shop 域名、用户信息等
 */
export function parseAppBridgeToken(token: string): {
  dest?: string;
  sub?: string;
  shop?: string;
  exp?: number;
  iat?: number;
  [key: string]: any;
} | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      decodeURIComponent(
        atob(parts[1])
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    );
    return {
      ...payload,
      shop: payload.dest ? payload.dest.replace(/^https?:\/\//, '').replace(/\/$/, '') : undefined,
    };
  } catch (e) {
    return null;
  }
}

/**
 * 从当前上下文（URL/AppBridge token）中获取 shop 域名
 */
export function getCurrentShop(): string | null {
  const params = new URLSearchParams(location.search);
  if (params.get('shop')) return params.get('shop');

  const stored = localStorage.getItem('current_shop');
  if (stored) return stored;

  return null;
}

/**
 * 独立模式：保存登录态
 */
export function saveStandaloneAuth(token: string, shop?: string): void {
  localStorage.setItem('user_token', token);
  if (shop) localStorage.setItem('current_shop', shop);
}

/**
 * 清除所有登录态
 */
export function clearAuth(): void {
  localStorage.removeItem('user_token');
  localStorage.removeItem('current_shop');
}

/**
 * 独立模式：是否已登录
 */
export function isLoggedInStandalone(): boolean {
  return !!localStorage.getItem('user_token');
}
