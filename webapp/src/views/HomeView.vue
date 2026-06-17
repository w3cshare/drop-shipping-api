<template>
  <div class="card">
    <h2>欢迎使用</h2>
    <p class="muted">
      运行模式：<strong>{{ mode === 'embedded' ? '应用内（Shopify Admin iframe）' : '独立应用' }}</strong>
    </p>
    <p v-if="mode === 'embedded'">
      正在跳转到店铺详情页面...
    </p>
    <template v-else>
      <p v-if="loggedIn">正在跳转到仪表盘...</p>
      <div v-else style="display:flex; gap: 12px; margin-top: 16px;">
        <router-link class="btn" to="/login">登录</router-link>
        <router-link class="btn btn-secondary" to="/register">注册</router-link>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { detectMode, isLoggedInStandalone } from '@/shopify/bridge';

const router = useRouter();
const mode = computed(() => detectMode());
const loggedIn = ref(isLoggedInStandalone());

onMounted(() => {
  setTimeout(() => {
    if (mode.value === 'embedded') {
      router.replace('/shop');
    } else if (loggedIn.value) {
      router.replace('/dashboard');
    }
  }, 500);
});
</script>

<style scoped>
.muted { color: #8a8a8a; font-size: 14px; }
</style>
