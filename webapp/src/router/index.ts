import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { detectMode, isLoggedInStandalone } from '@/shopify/bridge';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  // ================= 独立应用：登录 / 注册 =================
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/StandaloneLogin.vue'),
    meta: { standalone: true, public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/StandaloneRegister.vue'),
    meta: { standalone: true, public: true },
  },

  // ================= 独立应用：仪表盘 / 订单 / 商品 =================
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/StandaloneDashboard.vue'),
    meta: { standalone: true, requiresAuth: true, title: '仪表盘' },
  },
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/views/OrderList.vue'),
    meta: { standalone: true, requiresAuth: true, title: '订单管理' },
  },
  {
    path: '/products',
    name: 'products',
    component: () => import('@/views/ProductList.vue'),
    meta: { standalone: true, requiresAuth: true, title: '商品管理' },
  },
  {
    path: '/shop',
    name: 'shop-detail',
    component: () => import('@/views/ShopDetail.vue'),
    meta: { standalone: true, requiresAuth: true, title: '店铺详情' },
  },

  // ================= 根路径：按模式自动分发 =================
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 全局路由守卫
 *
 * - 独立应用 + 鉴权保护页面：未登录 → 跳 /login（保留 redirect）
 * - 访问根路径 / 时：embedded 模式下跳 shop；standalone 模式下跳 dashboard
 */
router.beforeEach(async (to, _from, next) => {
  const mode = detectMode();

  // 登录 / 注册：无需鉴权，但如果已登录并访问登录页，自动跳 dashboard
  if (to.path === '/login' || to.path === '/register') {
    if (mode === 'standalone' && isLoggedInStandalone()) {
      return next('/dashboard');
    }
    return next();
  }

  // 鉴权保护：独立应用 + requiresAuth
  if (mode === 'standalone' && to.meta.requiresAuth) {
    if (!isLoggedInStandalone()) {
      return next({ path: '/login', query: { redirect: to.fullPath } });
    }
    // 已登录但 user store 还没数据 → 尝试 bootstrap
    const userStore = useUserStore();
    if (!userStore.user) {
      try {
        await userStore.bootstrap();
        if (!userStore.user) {
          userStore.logout(false);
          return next({ path: '/login', query: { redirect: to.fullPath } });
        }
      } catch (e) {
        userStore.logout(false);
        return next({ path: '/login', query: { redirect: to.fullPath } });
      }
    }
  }

  // 访问根路径：按模式自动分发
  if (to.path === '/') {
    if (mode === 'embedded') return next('/shop');
    if (mode === 'standalone' && isLoggedInStandalone()) return next('/dashboard');
    if (mode === 'standalone') return next('/login');
  }

  next();
});

export default router;
