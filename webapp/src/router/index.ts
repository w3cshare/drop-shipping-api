import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { detectMode, isLoggedInStandalone } from '@/shopify/bridge';

const routes: RouteRecordRaw[] = [
  // 应用内模式：根路径直接进入 Shop 页面（由 App Bridge 鉴权）
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  // 应用内模式：店铺详情（App Bridge 自动鉴权）
  {
    path: '/shop',
    name: 'shop-detail',
    component: () => import('@/views/ShopDetail.vue'),
  },
  // 应用内模式：产品列表
  {
    path: '/products',
    name: 'products',
    component: () => import('@/views/ProductList.vue'),
  },
  // 应用内模式：订单列表
  {
    path: '/orders',
    name: 'orders',
    component: () => import('@/views/OrderList.vue'),
  },

  // 独立应用：登录
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/StandaloneLogin.vue'),
  },

  // 独立应用：注册
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/StandaloneRegister.vue'),
  },

  // 独立应用：仪表盘
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/StandaloneDashboard.vue'),
    meta: { requiresStandaloneAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：独立应用模式下，部分页面需要登录
router.beforeEach((to) => {
  const mode = detectMode();

  if (to.meta.requiresStandaloneAuth && mode === 'standalone') {
    if (!isLoggedInStandalone()) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }

  // 如果访问首页，根据模式自动分发
  if (to.path === '/' && mode === 'standalone' && isLoggedInStandalone()) {
    return { path: '/dashboard' };
  }
  if (to.path === '/' && mode === 'embedded') {
    return { path: '/shop' };
  }

  return true;
});

export default router;
