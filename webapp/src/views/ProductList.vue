<template>
  <div>
    <div class="card">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px;">
        <h2 style="margin:0;">产品列表</h2>
        <div>共 {{ list.length }} 个</div>
      </div>

      <p v-if="loading" class="muted">加载中...</p>
      <p v-else-if="list.length === 0" class="muted">暂无产品</p>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>产品名称</th>
            <th>供应商</th>
            <th>状态</th>
            <th>库存</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in list" :key="item.id">
            <td><strong>{{ item.title }}</strong></td>
            <td>{{ item.vendor || '-' }}</td>
            <td>
              <span :class="'status status-' + (item.status || '').toLowerCase()">
                {{ item.status || '-' }}
              </span>
            </td>
            <td>{{ item.variants?.edges?.[0]?.node?.inventoryQuantity ?? '-' }}</td>
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
    const data = await shopApi.products(undefined, 20);
    // 兼容两种路径：REST 返回 {api, products: []}，GraphQL 返回 {products: {edges: [...]}}
    if (Array.isArray(data)) {
      list.value = data;
    } else if (data?.products?.edges) {
      list.value = data.products.edges.map((e: any) => e.node);
    } else if (Array.isArray(data?.products)) {
      list.value = data.products;
    } else if (data?.products) {
      // REST 包装形式
      list.value = data.products;
    } else {
      list.value = [];
    }
  } catch (e) {
    console.error('加载产品失败:', e);
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
.data-table tr:hover { background: #fafafa; }
.status { padding: 2px 10px; border-radius: 12px; font-size: 12px; display: inline-block; }
.status-active { background: #e8f5f1; color: #008060; }
.status-draft { background: #fff7ed; color: #b86a00; }
.status-archived { background: #f1f1f1; color: #6d7175; }
</style>
