<template>
  <div>
    <div class="card">
      <h2>订单列表</h2>
      <p v-if="loading" class="muted">加载中...</p>
      <p v-else-if="list.length === 0" class="muted">暂无订单</p>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>财务状态</th>
            <th>商品数</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td><strong>{{ item.name || item.id?.slice(-8) }}</strong></td>
            <td>
              <span class="status status-fin">{{ item.financialStatus || item.displayFinancialStatus || '-' }}</span>
            </td>
            <td>{{ item.totalLineItems || item.lineItems?.edges?.length || 0 }}</td>
            <td class="muted">{{ formatTime(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { shopApi } from '@/api/http';

const loading = ref(true);
const list = ref<any[]>([]);

onMounted(async () => {
  try {
    const data = await shopApi.orders(undefined, 20);
    if (Array.isArray(data)) {
      list.value = data;
    } else if (data?.orders?.edges) {
      list.value = data.orders.edges.map((e: any) => e.node);
    } else if (Array.isArray(data?.orders)) {
      list.value = data.orders;
    } else {
      list.value = [];
    }
  } catch (e) {
    console.error('加载订单失败:', e);
  } finally {
    loading.value = false;
  }
});

function formatTime(t: string | undefined): string {
  if (!t) return '-';
  try { return new Date(t).toLocaleString('zh-CN'); } catch { return t; }
}
</script>

<style scoped>
.muted { color: #8a8a8a; font-size: 14px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.data-table th, .data-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f1f1f1; }
.data-table th { background: #fafafa; font-weight: 600; color: #454545; font-size: 13px; }
.status-fin { padding: 2px 10px; border-radius: 12px; font-size: 12px; background: #e8f5f1; color: #008060; }
</style>
