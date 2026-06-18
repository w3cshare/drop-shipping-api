/**
 * 用户状态 store（Pinia）
 *
 * 只在 "独立应用" 模式下使用。
 * - 登录 / 登出 / 获取当前用户信息
 * - 维护：当前用户（user）、可管理的店铺列表（shops）、当前店铺（currentShop）
 *
 * 字段契约与后端保持一致：
 *   /api/admin/users/me  -> { success: true, data: UserResponseDto }
 *   UserResponseDto 包含 shops 字段（ShopInfoDto 数组）
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { adminApi, UserInfo, ShopInfo } from '@/api/http';
import { saveStandaloneAuth, clearAuth, setCurrentShop, getCurrentShop } from '@/shopify/bridge';

export const useUserStore = defineStore('user', () => {
  const user = ref<UserInfo | null>(null);
  const shops = ref<ShopInfo[]>([]);
  const currentShop = ref<ShopInfo | null>(null);
  const loading = ref(false);
  const initialized = ref(false);

  const isLoggedIn = computed(() => !!user.value);
  const hasMultipleShops = computed(() => shops.value.length > 1);

  /** 登录（并自动拉取当前用户信息） */
  async function login(username: string, password: string, redirect?: string) {
    loading.value = true;
    try {
      const loginResp = await adminApi.login(username, password);

      // 保存 JWT（独立应用模式下用 localStorage 保存）
      saveStandaloneAuth(loginResp.token, loginResp.user?.shop);

      // 拉取当前用户（含可管理店铺列表）
      // /api/admin/users/me 返回的 data 直接是 UserResponseDto（不是 { user }）
      const meResp = await adminApi.me();
      user.value = meResp;
      shops.value = meResp.shops || [];
      applyCurrentShop();

      return { redirect: redirect || '/dashboard' };
    } finally {
      loading.value = false;
    }
  }

  /** 注册（注册成功后不自动登录，提示去登录页） */
  async function register(payload: {
    username: string;
    password: string;
    email?: string;
    shop?: string;
  }) {
    return await adminApi.register(payload);
  }

  /** 初始化 / 页面刷新后恢复状态 */
  async function bootstrap(): Promise<boolean> {
    // 只有独立模式且已有 token 才尝试拉用户
    if (!localStorage.getItem('user_token')) return false;

    loading.value = true;
    try {
      const meResp = await adminApi.me();
      user.value = meResp;
      shops.value = meResp.shops || [];
      applyCurrentShop();
      initialized.value = true;
      return true;
    } catch (e) {
      // token 过期 / 无效 → 清理
      logout(false);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** 根据 localStorage 或 shops 列表确定当前店铺 */
  function applyCurrentShop() {
    const saved = getCurrentShop();
    if (saved) {
      const match = shops.value.find((s) => s.shop === saved);
      currentShop.value = match || null;
    }
    if (!currentShop.value && shops.value.length > 0) {
      currentShop.value = shops.value[0];
      setCurrentShop(shops.value[0].shop);
    }
  }

  /** 切换当前店铺 */
  function switchShop(shopDomain: string) {
    const match = shops.value.find((s) => s.shop === shopDomain);
    if (!match) return false;
    currentShop.value = match;
    setCurrentShop(match.shop);
    return true;
  }

  /** 登出 */
  function logout(redirect = true) {
    user.value = null;
    shops.value = [];
    currentShop.value = null;
    initialized.value = false;
    clearAuth();
    if (redirect) {
      window.location.href = '/login';
    }
  }

  return {
    user,
    shops,
    currentShop,
    loading,
    initialized,
    isLoggedIn,
    hasMultipleShops,
    login,
    register,
    bootstrap,
    switchShop,
    logout,
  };
});
