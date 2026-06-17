<template>
  <div>
    <div class="card">
      <h2>仪表盘</h2>
      <p class="muted" v-if="currentUser">欢迎回来，<strong>{{ currentUser.username }}</strong></p>

      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-num">{{ productCount }}</div>
          <div class="stat-label">产品数</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">{{ orderCount }}</div>
          <div class="stat-label">订单数</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">{{ customerCount }}</div>
          <div class="stat-label">客户数</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>当前店铺</h3>
      <p class="muted" v-if="!shop">未绑定店铺，请在 <a href="/register" style="color:#008060;">注册时填写店铺域名</a></p>
      <div v-else>
        <div class="info-row"><span class="info-key">名称</span><span class="info-val">{{ shop.name }}</span></div>
        <div class="info-row"><span class="info-key">域名</span><span class="info-val">{{ shop.myshopifyDomain }}</span></div>
        <div class="info-row"><span class="info-key">邮箱</span><span class="info-val">{{ shop.email }}</span></div>
        <div style="margin-top: 16px; display: flex; gap: 12px;">
          <router-link class="btn" to="/shop">查看店铺详情</router-link>
          <router-link class="btn btn-secondary" to="/products">产品管理</router-link>
          <router-link class="btn btn-secondary" to="/orders">订单管理</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { shopApi, userAuthApi } from '@/api/http';

const currentUser = ref<any>(null);
const shop = ref<any>(null);
const productCount = ref(0);
const orderCount = ref(0);
const customerCount = ref(0);

onMounted(async () => {
  try {
    const [userResp, shopResp] = await Promise.all([
      userAuthApi.me(),
      shopApi.info(),
    ]);
    currentUser.value = userResp.user;
    shop.value = shopResp;

    const [products, orders, customers] = await Promise.allSettled([
      shopApi.products(undefined, 1),
      shopApi.orders(undefined, 1),
      shopApi.customers(undefined, 1),
    ]);
    if (products.status === 'fulfilled') {
      const c = (products.value as any)?.count ?? 0;
      productCount.value = c;
    }
    if (orders.status === 'fulfilled') {
      const c = (orders.value as any)?.count ?? 0;
      orderCount.value = c;
    }
    if (customers.status === 'fulfilled') {
      const c = (customers.value as any)?.count ?? 0;
      customerCount.value = c;
    }
  } catch (e) {
    console.error('加载仪表盘数据失败:', e);
  }
});
</script>

<style scoped>
.muted { color: #8a8a8a; font-size: 14px; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
.stat-item { background: #f6f6f7; border-radius: 8px; padding: 20px; text-align: center; }
.stat-num { font-size: 28px; font-weight: 700; color: #008060; }
.stat-label { font-size: 13px; color: #6d7175; margin-top: 6px; }
.info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f1f1f1; font-size: 14px; }
.info-row:last-child { border-bottom: none; }
.info-key { flex: 0 0 120px; color: #6d7175; }
.info-val { flex: 1; font-weight: 500; }
.btn { padding: 8px 16px; background: #008060; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-block; }
.btn:hover { background: #006e51; }
.btn-secondary { background: #fff; color: #212326; border: 1px solid #d9d9d9; }
.btn-secondary:hover { background: #f0f0f0; }
</style>
