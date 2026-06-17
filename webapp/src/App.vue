<template>
  <div class="app-root">
    <nav v-if="showNav" class="app-nav">
      <div class="nav-left">
        <span class="brand">{{ mode === 'embedded' ? 'Shopify App' : '管理后台' }}</span>
      </div>
      <div class="nav-right">
        <template v-if="mode === 'embedded'">
          <router-link to="/shop">店铺</router-link>
          <router-link to="/products">产品</router-link>
          <router-link to="/orders">订单</router-link>
        </template>
        <template v-else>
          <router-link to="/dashboard">仪表盘</router-link>
          <router-link to="/shop">店铺</router-link>
          <router-link to="/products">产品</router-link>
          <router-link to="/orders">订单</router-link>
          <button @click="logout" v-if="userLoggedIn">退出</button>
          <router-link to="/login" v-else>登录</router-link>
        </template>
      </div>
    </nav>

    <main class="app-main">
      <router-view />
    </main>

    <footer class="app-footer">
      <span>© 2026 Shopify App · {{ mode === 'embedded' ? '应用内模式' : '独立应用模式' }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { detectMode, isLoggedInStandalone, clearAuth } from '@/shopify/bridge';

const router = useRouter();
const mode = computed(() => detectMode());
const userLoggedIn = ref(false);
const showNav = computed(() => {
  // 独立应用显示顶部导航；应用内模式 Shop Admin 已经有导航
  return mode.value === 'standalone';
});

onMounted(() => {
  userLoggedIn.value = isLoggedInStandalone();
});

function logout() {
  clearAuth();
  userLoggedIn.value = false;
  router.push('/login');
}
</script>

<style>
* { box-sizing: border-box; }
html, body, #app { margin: 0; padding: 0; height: 100%; background: #f6f6f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #212326; }

.app-root { display: flex; flex-direction: column; min-height: 100vh; }
.app-nav { background: #ffffff; border-bottom: 1px solid #e1e3e5; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 56px; }
.app-nav .brand { font-weight: 600; font-size: 15px; color: #008060; }
.app-nav a { color: #212326; text-decoration: none; padding: 0 14px; font-size: 14px; }
.app-nav a.router-link-exact-active { color: #008060; font-weight: 600; }
.app-nav button { margin-left: 14px; padding: 6px 14px; border: 1px solid #d9d9d9; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; }
.app-nav button:hover { background: #f0f0f0; }

.app-main { flex: 1; padding: 24px; max-width: 1100px; width: 100%; margin: 0 auto; }

.app-footer { text-align: center; padding: 20px; font-size: 12px; color: #8a8a8a; border-top: 1px solid #e1e3e5; background: #fff; }

.card { background: #fff; border: 1px solid #e1e3e5; border-radius: 8px; padding: 24px; margin-bottom: 16px; }
.card h2 { margin: 0 0 16px 0; font-size: 18px; }
.card h3 { margin: 0 0 12px 0; font-size: 15px; color: #454545; }

.btn { padding: 8px 16px; background: #008060; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
.btn:hover { background: #006e51; }
.btn-secondary { background: #fff; color: #212326; border: 1px solid #d9d9d9; }
.btn-secondary:hover { background: #f0f0f0; }
.btn-ghost { background: transparent; color: #008060; border: none; padding: 4px 8px; }
</style>
