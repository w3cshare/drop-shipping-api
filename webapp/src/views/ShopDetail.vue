<template>
  <div>
    <div class="card">
      <h2>店铺详情</h2>
      <p v-if="loading" class="muted">加载中...</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <template v-else-if="shop">
        <div class="info-grid">
          <div class="info-row">
            <span class="info-key">店铺名称</span>
            <span class="info-val">{{ shop.name }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">Shopify 域名</span>
            <span class="info-val">{{ shop.myshopifyDomain }}</span>
          </div>
          <div class="info-row" v-if="shop.domain">
            <span class="info-key">主域名</span>
            <span class="info-val">{{ shop.domain }}</span>
          </div>
          <div class="info-row" v-if="shop.email">
            <span class="info-key">联系邮箱</span>
            <span class="info-val">{{ shop.email }}</span>
          </div>
          <div class="info-row" v-if="shop.currencyCode || shop.currency">
            <span class="info-key">货币</span>
            <span class="info-val">{{ shop.currencyCode || shop.currency }}</span>
          </div>
          <div class="info-row" v-if="shop.ianaTimezone || shop.timezone">
            <span class="info-key">时区</span>
            <span class="info-val">{{ shop.ianaTimezone || shop.timezone }}</span>
          </div>
          <div class="info-row" v-if="shop.city || shop.province || shop.country">
            <span class="info-key">地区</span>
            <span class="info-val">{{ [shop.city, shop.province, shop.country].filter(Boolean).join(', ') }}</span>
          </div>
          <div class="info-row" v-if="shop.id">
            <span class="info-key">ID</span>
            <span class="info-val">{{ shop.id }}</span>
          </div>
        </div>
      </template>
    </div>

    <div class="card" v-if="shop">
      <h3>数据概览</h3>
      <div class="stat-grid">
        <div class="stat-item" @click="goto('/products')">
          <div class="stat-num">{{ productCount }}</div>
          <div class="stat-label">产品数</div>
        </div>
        <div class="stat-item" @click="goto('/orders')">
          <div class="stat-num">{{ orderCount }}</div>
          <div class="stat-label">订单数</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">{{ customerCount }}</div>
          <div class="stat-label">客户数</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { shopApi } from '@/api/http';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const shop = ref<any>(null);
const productCount = ref(0);
const orderCount = ref(0);
const customerCount = ref(0);

onMounted(async () => {
  try {
    // 获取店铺信息
    const info = await shopApi.info();
    shop.value = info;

    // 获取数据概览（并行请求）
    try {
      const [products, orders, customers] = await Promise.allSettled([
        shopApi.products(undefined, 1),
        shopApi.orders(undefined, 1),
        shopApi.customers(undefined, 1),
      ]);
      if (products.status === 'fulfilled') {
        const count = (products.value as any)?.count ?? 0;
        productCount.value = count;
      }
      if (orders.status === 'fulfilled') {
        const count = (orders.value as any)?.count ?? 0;
        orderCount.value = count;
      }
      if (customers.status === 'fulfilled') {
        const count = (customers.value as any)?.count ?? 0;
        customerCount.value = count;
      }
    } catch (e) {
      // 忽略统计加载失败
    }
  } catch (e: any) {
    error.value = e?.message || '加载店铺信息失败';
  } finally {
    loading.value = false;
  }
});

function goto(path: string) {
  router.push(path);
}
</script>

<style scoped>
.muted { color: #8a8a8a; font-size: 14px; }
.error { color: #d72c0d; font-size: 14px; }
.info-grid { display: flex; flex-direction: column; gap: 10px; }
.info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f1f1f1; font-size: 14px; }
.info-row:last-child { border-bottom: none; }
.info-key { flex: 0 0 120px; color: #6d7175; }
.info-val { flex: 1; color: #212326; font-weight: 500; }

.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat-item { background: #f6f6f7; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; transition: background 0.2s; }
.stat-item:hover { background: #e8f5f1; }
.stat-num { font-size: 28px; font-weight: 700; color: #008060; }
.stat-label { font-size: 13px; color: #6d7175; margin-top: 6px; }
</style>
