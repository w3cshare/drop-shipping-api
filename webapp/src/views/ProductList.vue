<template>
  <div class="products-page">
    <div class="page-header">
      <h1>商品管理</h1>
      <p class="muted">显示当前店铺下的所有商品（数据库直读）</p>
    </div>

    <!-- 过滤与搜索 -->
    <div class="filter-panel">
      <input
        v-model="filters.keyword"
        type="text"
        placeholder="按商品名称搜索..."
        @keyup.enter="onSearch"
        class="input"
      />
      <select v-model="filters.status" @change="onSearch" class="select">
        <option value="">所有状态</option>
        <option value="active">active</option>
        <option value="draft">draft</option>
        <option value="archived">archived</option>
      </select>
      <select
        v-model="filters.product_type"
        @change="onSearch"
        class="select"
      >
        <option value="">商品类型</option>
        <option value="physical">physical</option>
        <option value="digital">digital</option>
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
      <div class="empty-icon">🛍️</div>
      <div class="empty-title">暂无商品</div>
      <div class="empty-desc">当前店铺没有商品，或您需要先切换到其他店铺。</div>
    </div>

    <!-- 商品列表 -->
    <template v-else>
      <div class="product-grid">
        <div
          v-for="item in list"
          :key="item.id"
          class="product-card"
        >
          <div class="product-body">
            <div class="product-title">{{ item.title }}</div>
            <div class="product-meta">
              <span
                class="status-tag"
                :class="'status-' + (item.status || '').toLowerCase()"
              >
                {{ item.status || '-' }}
              </span>
              <span v-if="item.vendor" class="meta-chip">
                {{ item.vendor }}
              </span>
              <span v-if="item.product_type" class="meta-chip">
                {{ item.product_type }}
              </span>
            </div>
            <div class="product-footer">
              <span class="muted shop">
                {{ item.shop_name || item.shop }}
              </span>
              <span class="muted">{{ formatTime(item.created_at) }}</span>
            </div>
          </div>
        </div>
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
import { adminApi, ProductItemDto } from '@/api/http';

const loading = ref(false);
const list = ref<ProductItemDto[]>([]);
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
  product_type: '',
});

async function loadProducts() {
  loading.value = true;
  try {
    const result = await adminApi.products({
      page: pagination.value.page,
      page_size: pagination.value.page_size,
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
      product_type: filters.product_type || undefined,
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
  loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onSearch() {
  pagination.value.page = 1;
  loadProducts();
}

function onReset() {
  filters.keyword = '';
  filters.status = '';
  filters.product_type = '';
  pagination.value.page = 1;
  loadProducts();
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '-';
  try {
    return new Date(t).toLocaleDateString('zh-CN');
  } catch {
    return t;
  }
}

onMounted(() => loadProducts());
</script>

<style scoped>
.products-page {
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

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.product-card {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.product-card:hover {
  transform: translateY(-2px);
  border-color: #008060;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.product-body {
  padding: 16px 18px;
}

.product-title {
  font-size: 15px;
  font-weight: 600;
  color: #212326;
  margin-bottom: 10px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 42px;
}

.product-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.status-tag.status-active {
  background: #e8f5f1;
  color: #008060;
}

.status-tag.status-draft {
  background: #fff3d6;
  color: #8a6800;
}

.status-tag.status-archived {
  background: #f1f1f1;
  color: #6d7175;
}

.meta-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  background: #f1f1f1;
  color: #5c5f62;
}

.product-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid #f1f1f1;
  font-size: 12px;
}

.product-footer .shop {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
