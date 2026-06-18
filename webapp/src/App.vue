<template>
  <div class="app-root">
    <!-- 顶部导航（仅独立应用模式显示） -->
    <header v-if="mode === 'standalone' && userStore.user" class="navbar">
      <div class="nav-inner">
        <router-link to="/dashboard" class="nav-brand">
          <span class="brand-logo">SA</span>
          <span class="brand-text">Shopify App · 商家管理后台</span>
        </router-link>

        <nav class="nav-links">
          <router-link to="/dashboard" class="nav-link" active-class="active">
            <span>仪表盘</span>
          </router-link>
          <router-link to="/orders" class="nav-link" active-class="active">
            <span>订单</span>
          </router-link>
          <router-link to="/products" class="nav-link" active-class="active">
            <span>商品</span>
          </router-link>
          <router-link to="/shop" class="nav-link" active-class="active">
            <span>店铺</span>
          </router-link>
        </nav>

        <div class="nav-right">
          <!-- 店铺切换 -->
          <div
            v-if="userStore.shops.length > 0"
            class="shop-switcher"
            @click.stop="shopMenuOpen = !shopMenuOpen; userMenuOpen = false"
          >
            <div class="shop-current">
              <div class="shop-name">{{ currentShopName }}</div>
              <div class="shop-domain">{{ userStore.currentShop?.shop || '未绑定' }}</div>
            </div>
            <div v-if="shopMenuOpen" class="shop-menu">
              <div class="shop-menu-title">切换店铺</div>
              <div
                v-for="s in userStore.shops"
                :key="s.shop"
                class="shop-menu-item"
                :class="{ active: userStore.currentShop?.shop === s.shop }"
                @click.stop="onSwitchShop(s.shop)"
              >
                <div class="shop-menu-item-name">{{ s.name || s.shop }}</div>
                <div class="shop-menu-item-domain">{{ s.shop }}</div>
              </div>
            </div>
          </div>
          <div v-else class="shop-empty">
            <span>尚未绑定店铺</span>
          </div>

          <!-- 用户下拉 -->
          <div
            class="user-switcher"
            @click.stop="userMenuOpen = !userMenuOpen; shopMenuOpen = false"
          >
            <button class="user-button" :class="{ active: userMenuOpen }">
              <div class="avatar">{{ avatarLetter }}</div>
              <div class="user-meta">
                <div class="user-name">{{ userStore.user?.username }}</div>
                <div class="user-role">
                  {{ userStore.user?.role === 'admin' ? '管理员' : '普通用户' }}
                </div>
              </div>
              <span class="chevron">▾</span>
            </button>
            <div v-if="userMenuOpen" class="user-menu">
              <div class="user-menu-row">
                <span class="label">用户名</span>
                <span class="value">{{ userStore.user?.username }}</span>
              </div>
              <div class="user-menu-row">
                <span class="label">邮箱</span>
                <span class="value">{{ userStore.user?.email || '—' }}</span>
              </div>
              <div class="user-menu-row">
                <span class="label">角色</span>
                <span class="value">
                  {{ userStore.user?.role === 'admin' ? '管理员' : '普通用户' }}
                </span>
              </div>
              <div class="user-menu-divider"></div>
              <button class="user-menu-logout" @click.stop="onLogout">
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- 主体内容 -->
    <main class="app-main" :class="{ 'has-nav': mode === 'standalone' && userStore.user }">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { detectMode } from '@/shopify/bridge';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const mode = detectMode();

const shopMenuOpen = ref(false);
const userMenuOpen = ref(false);

const currentShopName = computed(() => {
  return userStore.currentShop?.name || userStore.currentShop?.shop || '未绑定';
});

const avatarLetter = computed(() => {
  const n = userStore.user?.username || 'U';
  return n.charAt(0).toUpperCase();
});

function onSwitchShop(shop: string) {
  userStore.switchShop(shop);
  shopMenuOpen.value = false;
  // 切换后刷新当前页：简单地再导航到同一个路由
  window.location.reload();
}

function onLogout() {
  userMenuOpen.value = false;
  userStore.logout(true);
}

// 点击外部关闭下拉
function onDocumentClick(e: Event) {
  const target = e.target as HTMLElement;
  if (!target.closest('.shop-switcher')) shopMenuOpen.value = false;
  if (!target.closest('.user-switcher')) userMenuOpen.value = false;
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    shopMenuOpen.value = false;
    userMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onEsc);
});
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  background: #f6f6f7;
}

.navbar {
  background: #ffffff;
  border-bottom: 1px solid #e1e3e5;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #212326;
  font-weight: 600;
}

.brand-logo {
  background: #008060;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 8px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.brand-text {
  font-size: 14px;
  color: #212326;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.nav-link {
  padding: 8px 14px;
  border-radius: 6px;
  color: #5c5f62;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.nav-link:hover {
  background: #f1f1f1;
  color: #212326;
}

.nav-link.active {
  background: #e8f5f0;
  color: #008060;
  font-weight: 500;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.shop-switcher {
  position: relative;
  text-align: right;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.shop-switcher:hover {
  background: #f1f1f1;
}

.shop-current {
  min-width: 140px;
}

.shop-name {
  font-size: 13px;
  font-weight: 600;
  color: #212326;
}

.shop-domain {
  font-size: 12px;
  color: #8a8a8a;
}

.shop-empty {
  font-size: 12px;
  color: #8a8a8a;
  padding: 6px 10px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
}

.shop-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  min-width: 220px;
  padding: 8px 0;
  z-index: 200;
}

.shop-menu-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #8a8a8a;
  padding: 4px 16px 8px;
  letter-spacing: 0.5px;
}

.shop-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.shop-menu-item:hover {
  background: #f6f6f7;
}

.shop-menu-item.active {
  background: #e8f5f0;
}

.shop-menu-item-name {
  font-size: 13px;
  color: #212326;
  font-weight: 500;
}

.shop-menu-item-domain {
  font-size: 12px;
  color: #8a8a8a;
  margin-top: 2px;
}

.user-switcher {
  position: relative;
}

.user-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  padding: 4px 8px 4px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.user-button:hover {
  background: #f6f6f7;
  border-color: #e1e3e5;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #008060;
  color: #fff;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-meta {
  text-align: left;
  line-height: 1.2;
}

.user-name {
  font-size: 13px;
  color: #212326;
  font-weight: 500;
}

.user-role {
  font-size: 11px;
  color: #8a8a8a;
}

.chevron {
  font-size: 10px;
  color: #8a8a8a;
  margin-left: 4px;
}

.user-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  min-width: 240px;
  padding: 8px 0;
  z-index: 200;
}

.user-menu-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  font-size: 13px;
}

.label {
  color: #8a8a8a;
}

.value {
  color: #212326;
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-divider {
  height: 1px;
  background: #e1e3e5;
  margin: 6px 0;
}

.user-menu-logout {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: #d72c0d;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.15s;
}

.user-menu-logout:hover {
  background: #fff1ed;
}

.app-main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
}

.app-main.has-nav {
  padding-top: 24px;
}

@media (max-width: 800px) {
  .nav-inner {
    padding: 0 16px;
    gap: 12px;
  }
  .brand-text {
    display: none;
  }
  .nav-link {
    padding: 8px 10px;
    font-size: 13px;
  }
  .shop-current {
    min-width: 80px;
  }
  .user-meta {
    display: none;
  }
}
</style>
