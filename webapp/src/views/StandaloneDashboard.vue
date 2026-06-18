<template>
  <div class="dashboard">
    <!-- 顶部：欢迎 + 当前店铺 -->
    <div class="welcome-row">
      <div>
        <h1>你好，{{ userStore.user?.username }} 👋</h1>
        <p class="muted">欢迎回到 Shopify App 管理后台</p>
      </div>
      <div class="active-shop-card">
        <div class="active-shop-label">当前管理店铺</div>
        <div class="active-shop-name">
          {{ userStore.currentShop?.name || userStore.currentShop?.shop || '未绑定' }}
        </div>
        <div class="active-shop-domain">{{ userStore.currentShop?.shop || '—' }}</div>
        <div class="active-shop-meta">
          <span v-if="userStore.currentShop?.country_code">
            <span class="dot">{{ flag(userStore.currentShop.country_code) }}</span>
            {{ userStore.currentShop.country_code }}
          </span>
          <span v-if="userStore.currentShop?.currency_code">
            <span class="dot">💱</span>
            {{ userStore.currentShop.currency_code }}
          </span>
          <span v-if="userStore.currentShop?.timezone">
            <span class="dot">🕐</span>
            {{ userStore.currentShop.timezone }}
          </span>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon">🏪</div>
        <div class="stat-value">{{ userStore.shops.length }}</div>
        <div class="stat-label">可管理店铺</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-value" v-if="orderCount !== null">{{ orderCount }}</div>
        <div class="stat-value muted" v-else>—</div>
        <div class="stat-label">订单数（当前店铺）</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🛍️</div>
        <div class="stat-value" v-if="productCount !== null">{{ productCount }}</div>
        <div class="stat-value muted" v-else>—</div>
        <div class="stat-label">商品数（当前店铺）</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👤</div>
        <div class="stat-value">{{ userStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</div>
        <div class="stat-label">账号角色</div>
      </div>
    </div>

    <!-- 我的店铺列表 -->
    <div class="panel">
      <div class="panel-header">
        <h2>我的店铺</h2>
        <span class="muted">共 {{ userStore.shops.length }} 个店铺</span>
      </div>

      <div v-if="!userStore.shops.length" class="empty-state">
        <div class="empty-icon">🏪</div>
        <div class="empty-title">暂无店铺</div>
        <div class="empty-desc">
          您还没有绑定店铺。注册时可以填入店铺域名，或通过管理员绑定。
        </div>
      </div>

      <div v-else class="shop-grid">
        <div
          v-for="s in userStore.shops"
          :key="s.shop"
          class="shop-card"
          :class="{ active: userStore.currentShop?.shop === s.shop }"
        >
          <div class="shop-card-header">
            <div class="shop-card-title">{{ s.name || s.shop }}</div>
            <span v-if="s.role" class="role-pill" :class="s.role">{{ roleLabel(s.role) }}</span>
          </div>
          <div class="shop-card-domain">{{ s.shop }}</div>
          <div class="shop-card-meta">
            <span v-if="s.currency_code">货币：{{ s.currency_code }}</span>
            <span v-if="s.country_code">国家：{{ s.country_code }}</span>
            <span v-if="s.email">邮箱：{{ s.email }}</span>
          </div>
          <div class="shop-card-actions">
            <button
              class="btn btn-secondary"
              :disabled="userStore.currentShop?.shop === s.shop"
              @click="switchTo(s.shop)"
            >
              {{ userStore.currentShop?.shop === s.shop ? '当前店铺' : '切换到此店铺' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="globalError" class="error-banner">{{ globalError }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { adminApi } from '@/api/http';

const userStore = useUserStore();

const orderCount = ref<number | null>(null);
const productCount = ref<number | null>(null);
const globalError = ref('');

function roleLabel(role: string) {
  switch (role) {
    case 'owner': return '所有者';
    case 'staff': return '员工';
    case 'viewer': return '访客';
    default: return role;
  }
}

function flag(country: string): string {
  const map: Record<string, string> = {
    CN: '🇨🇳', US: '🇺🇸', JP: '🇯🇵', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷',
    CA: '🇨🇦', AU: '🇦🇺', KR: '🇰🇷', SG: '🇸🇬', HK: '🇭🇰', TW: '🇹🇼',
  };
  return map[country?.toUpperCase() || ''] || '🌍';
}

async function switchTo(shop: string) {
  userStore.switchShop(shop);
  await loadCounts();
}

async function loadCounts() {
  if (!userStore.currentShop?.shop) return;
  globalError.value = '';
  try {
    const [orders, products] = await Promise.all([
      adminApi.orders({ page: 1, page_size: 1 }).catch(() => null),
      adminApi.products({ page: 1, page_size: 1 }).catch(() => null),
    ]);
    orderCount.value = orders?.pagination?.total ?? null;
    productCount.value = products?.pagination?.total ?? null;
  } catch (e: any) {
    globalError.value = e?.message || '加载统计信息失败';
  }
}

onMounted(async () => {
  await userStore.bootstrap();
  await loadCounts();
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard h1 {
  font-size: 22px;
  margin: 0 0 4px;
  color: #212326;
}

.muted {
  color: #8a8a8a;
  font-size: 14px;
  margin: 0;
}

.welcome-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.active-shop-card {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 12px;
  padding: 18px 22px;
  min-width: 280px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.active-shop-label {
  font-size: 12px;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.active-shop-name {
  font-size: 18px;
  font-weight: 600;
  color: #212326;
  margin: 4px 0;
}

.active-shop-domain {
  font-size: 13px;
  color: #5c5f62;
}

.active-shop-meta {
  display: flex;
  gap: 14px;
  margin-top: 10px;
  font-size: 12px;
  color: #5c5f62;
}

.dot {
  margin-right: 4px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 12px;
  padding: 20px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.stat-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.stat-icon {
  font-size: 20px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #212326;
  line-height: 1.1;
}

.stat-value.muted {
  color: #b6babd;
}

.stat-label {
  font-size: 13px;
  color: #8a8a8a;
  margin-top: 6px;
}

.panel {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 12px;
  padding: 20px 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 18px;
}

.panel-header h2 {
  margin: 0;
  font-size: 16px;
  color: #212326;
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.shop-card {
  background: #fafafa;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.15s, background 0.15s;
}

.shop-card.active {
  border-color: #008060;
  background: #e8f5f0;
}

.shop-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.shop-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #212326;
}

.role-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  background: #e8f5f0;
  color: #008060;
  white-space: nowrap;
}

.role-pill.staff {
  background: #fff3d6;
  color: #8a6800;
}

.role-pill.viewer {
  background: #f1f1f1;
  color: #5c5f62;
}

.shop-card-domain {
  font-size: 12px;
  color: #8a8a8a;
  margin: 4px 0 8px;
}

.shop-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #5c5f62;
  margin-bottom: 12px;
}

.shop-card-actions {
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 8px 14px;
  background: #008060;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.btn:hover:not(:disabled) {
  background: #006e51;
}

.btn:disabled {
  background: #e1e3e5;
  color: #8a8a8a;
  cursor: default;
}

.btn-secondary {
  background: transparent;
  color: #212326;
  border: 1px solid #d9d9d9;
}

.btn-secondary:hover:not(:disabled) {
  background: #f6f6f7;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #212326;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: #8a8a8a;
}

.error-banner {
  background: #fff1ed;
  color: #d72c0d;
  border: 1px solid #f7c8bd;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
  .welcome-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .active-shop-card {
    width: 100%;
    box-sizing: border-box;
  }
}
</style>
