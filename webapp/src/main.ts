import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initAppBridge, detectMode } from './shopify/bridge';
import { useUserStore } from './stores/user';

const mode = detectMode();
console.log('[App] 启动模式:', mode);

if (mode === 'embedded') {
  const apiKey = import.meta.env.VITE_SHOPIFY_API_KEY;
  if (apiKey) {
    initAppBridge(apiKey);
  } else {
    console.warn('[App] VITE_SHOPIFY_API_KEY 未配置，无法初始化 App Bridge');
  }
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// 独立应用模式下，如果本地已有 token，尝试恢复用户态
if (mode === 'standalone') {
  useUserStore().bootstrap().catch((e: any) => {
    console.warn('[App] 恢复用户态失败:', e?.message);
  });
}
