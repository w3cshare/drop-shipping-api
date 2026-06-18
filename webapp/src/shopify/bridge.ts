/**
 * Shopify App Bridge 核心模块 + 独立应用鉴权辅助
 *
 * 负责：
 * 1. 初始化 App Bridge（应用内模式）
 * 2. 生成 session token（JWT）用于后端鉴权
 * 3. 统一的 localStorage 登录态 / 当前店铺管理
 *
 * 设计目标：与 Vue/React 等框架无关，纯 TS 模块，可复用到任何前端
 */

import { createApp, ClientApplication } from '@shopify/app-bridge';
import { getSessionToken } from '@shopify/app-bridge-utils';

const LS_TOKEN = 'user_token';
const LS_SHOP = 'current_shop';

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

/** 获取当前 App Bridge 实例 */
export function getAppBridge(): ClientApplication<any> | null {
  return app;
}

/**
 * 获取授权 token
 * - 应用内模式：App Bridge session token
 * - 独立模式：从 localStorage 读取 JWT
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

  return localStorage.getItem(LS_TOKEN);
}

/**
 * 从当前上下文（URL / 缓存）获取 shop 域名
 */
export function getCurrentShop(): string | null {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('shop');
  if (fromQuery) return fromQuery;

  const stored = localStorage.getItem(LS_SHOP);
  if (stored) return stored;

  return null;
}

/**
 * 设置当前激活的店铺（会持久化到 localStorage）
 */
export function setCurrentShop(shop: string): void {
  if (!shop) return;
  localStorage.setItem(LS_SHOP, shop);
}

/**
 * 独立应用模式：保存登录态
 */
export function saveStandaloneAuth(token: string, shop?: string): void {
  localStorage.setItem(LS_TOKEN, token);
  if (shop) localStorage.setItem(LS_SHOP, shop);
}

/**
 * 清除所有登录态
 */
export function clearAuth(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_SHOP);
}

/**
 * 独立应用模式：是否已登录（仅依据 token 存在性，不校验有效性）
 */
export function isLoggedInStandalone(): boolean {
  return !!localStorage.getItem(LS_TOKEN);
}

/**
 * 解析 App Bridge JWT / 自定义 JWT 的 payload
 * 返回 shop 域名、用户信息等
 */
export function parseJwtPayload(token: string): Record<string, any> | null {
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
