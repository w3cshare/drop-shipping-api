<template>
  <div class="orders-page">
    <div class="page-header">
      <h1>订单管理</h1>
      <p class="muted">显示当前店铺下的所有订单（数据库直读）</p>
    </div>

    <!-- 过滤与搜索 -->
    <div class="filter-panel">
      <input
        v-model="filters.keyword"
        type="text"
        placeholder="按订单号/名称搜索..."
        @keyup.enter="onSearch"
        class="input"
      />
      <select v-model="filters.status" @change="onSearch" class="select">
        <option value="">所有状态</option>
        <option value="open">open</option>
        <option value="closed">closed</option>
        <option value="cancelled">cancelled</option>
      </select>
      <select
        v-model="filters.financial_status"
        @change="onSearch"
        class="select"
      >
        <option value="">财务状态</option>
        <option value="paid">paid</option>
        <option value="pending">pending</option>
        <option value="refunded">refunded</option>
      </select>
      <select
        v-model="filters.fulfillment_status"
        @change="onSearch"
        class="select"
      >
        <option value="">履约状态</option>
        <option value="fulfilled">fulfilled</option>
        <option value="partial">partial</option>
        <option value="unfulfilled">unfulfilled</option>
      </select>
      <button class="btn-secondary" @click="onReset">重置</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-row">
      <span class="spinner"></span>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!list.length" class="empty-state">
      <div class="empty-icon">📦</div>
      <div class="empty-title">暂无订单</div>
      <div class="empty-desc">当前店铺没有订单，或您需要先切换到其他店铺。</div>
    </div>

    <!-- 订单列表 -->
    <template v-else>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>财务状态</th>
              <th>履约状态</th>
              <th>货币</th>
              <th>店铺</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>
                <strong>{{ item.name || item.order_id }}</strong>
              </td>
              <td>
                <span class="status-tag status-fin">
                  {{ item.financial_status || '-' }}
                </span>
              </td>
              <td>
                <span class="status-tag status-full">
                  {{ item.fulfillment_status || '-' }}
                </span>
              </td>
              <td>{{ item.shop_currency || '-' }}</td>
              <td class="muted">
                {{ item.shop_name || item.shop }}
              </td>
              <td class="muted">{{ formatTime(item.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div v-if="pagination.total_pages > 1" class="pagination">
        <button
          class="page-btn"
          :disabled="!pagination.has_prev"
          @click="onPageChange(pagination.page - 1)"
        >
          ← 上一页
        </button>
        <span class="page-info">
          第 {{ pagination.page }} / {{ pagination.total_pages }} 页 · 共
          {{ pagination.total }} 条
        </span>
        <button
          class="page-btn"
          :disabled="!pagination.has_next"
          @click="onPageChange(pagination.page + 1)"
        >
          下一页 →
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { adminApi, OrderItemDto } from '@/api/http';

const loading = ref(false);
const list = ref<OrderItemDto[]>([]);
const pagination = ref({
  page: 1,
  page_size: 20,
  total: 0,
  total_pages: 1,
  has_next: false,
  has_prev: false,
});

const filters = reactive({
  keyword: '',
  status: '',
  financial_status: '',
  fulfillment_status: '',
});

async function loadOrders() {
  loading.value = true;
  try {
    const result = await adminApi.orders({
      page: pagination.value.page,
      page_size: pagination.value.page_size,
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
      financial_status: filters.financial_status || undefined,
      fulfillment_status: filters.fulfillment_status || undefined,
    });
    list.value = result.data;
    pagination.value = result.pagination;
  } catch (e: any) {
    // 错误信息由 http 拦截器统一提示
    list.value = [];
  } finally {
    loading.value = false;
  }
}

function onPageChange(page: number) {
  pagination.value.page = page;
  loadOrders();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onSearch() {
  pagination.value.page = 1;
  loadOrders();
}

function onReset() {
  filters.keyword = '';
  filters.status = '';
  filters.financial_status = '';
  filters.fulfillment_status = '';
  pagination.value.page = 1;
  loadOrders();
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '-';
  try {
    return new Date(t).toLocaleString('zh-CN');
  } catch {
    return t;
  }
}

onMounted(() => loadOrders());
</script>

<style scoped>
.orders-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 20px 24px;
}

.page-header h1 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #212326;
}

.muted {
  color: #8a8a8a;
  font-size: 13px;
}

.filter-panel {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.input,
.select {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  background: #fff;
  color: #212326;
}

.input {
  flex: 1 1 220px;
  min-width: 180px;
}

.input:focus,
.select:focus {
  border-color: #008060;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  background: transparent;
  color: #5c5f62;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.btn-secondary:hover {
  background: #f1f1f1;
}

.loading-row {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 14px;
  color: #5c5f62;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid #e1e3e5;
  border-top-color: #008060;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 60px 20px;
  text-align: center;
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

.table-wrap {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #f1f1f1;
}

.data-table th {
  background: #fafafa;
  font-weight: 600;
  color: #454545;
  font-size: 13px;
}

.data-table tbody tr:hover {
  background: #fafafa;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.status-tag.status-fin {
  background: #e8f5f1;
  color: #008060;
}

.status-tag.status-full {
  background: #fff3d6;
  color: #8a6800;
}

.pagination {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #5c5f62;
}

.page-btn {
  padding: 8px 14px;
  border: 1px solid #d9d9d9;
  background: transparent;
  color: #212326;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, border-color 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: #f1f1f1;
  border-color: #008060;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: #5c5f62;
}
</style>
