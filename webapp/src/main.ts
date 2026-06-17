import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initAppBridge, detectMode } from './shopify/bridge';

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
app.use(router);
app.mount('#app');
