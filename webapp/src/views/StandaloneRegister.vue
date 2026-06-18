<template>
  <div class="register-wrap">
    <div class="register-card">
      <div class="register-header">
        <div class="logo">Shopify App</div>
        <h2>创建账号</h2>
        <p class="subtitle">注册后即可管理您的 Shopify 店铺</p>
      </div>

      <form @submit.prevent="onSubmit">
        <div class="form-item">
          <label>用户名 <span class="required">*</span></label>
          <input
            v-model="username"
            type="text"
            placeholder="至少 3 个字符"
            :disabled="loading"
            autocomplete="username"
          />
        </div>

        <div class="form-item">
          <label>密码 <span class="required">*</span></label>
          <input
            v-model="password"
            type="password"
            placeholder="至少 6 个字符"
            :disabled="loading"
            autocomplete="new-password"
          />
        </div>

        <div class="form-item">
          <label>确认密码 <span class="required">*</span></label>
          <input
            v-model="passwordConfirm"
            type="password"
            placeholder="再次输入密码"
            :disabled="loading"
            autocomplete="new-password"
          />
        </div>

        <div class="form-item">
          <label>邮箱</label>
          <input
            v-model="email"
            type="email"
            placeholder="可选，用于接收通知"
            :disabled="loading"
            autocomplete="email"
          />
        </div>

        <div class="form-item">
          <label>店铺域名</label>
          <input
            v-model="shop"
            type="text"
            placeholder="例如：my-store.myshopify.com（可选）"
            :disabled="loading"
          />
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="btn" :disabled="loading">
          <span v-if="loading">注册中...</span>
          <span v-else>创建账号</span>
        </button>

        <div class="muted-links">
          <span>已有账号？</span>
          <router-link to="/login" class="link">返回登录</router-link>
        </div>
      </form>
    </div>

    <footer class="footer">
      <span>© {{ nowYear }} Shopify App · 商家独立管理后台</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '@/api/http';

const router = useRouter();
const username = ref('');
const password = ref('');
const passwordConfirm = ref('');
const email = ref('');
const shop = ref('');
const loading = ref(false);
const error = ref('');

const nowYear = computed(() => new Date().getFullYear());

async function onSubmit() {
  error.value = '';
  if (!username.value.trim()) {
    error.value = '请填写用户名';
    return;
  }
  if (username.value.trim().length < 3) {
    error.value = '用户名长度至少 3 个字符';
    return;
  }
  if (!password.value) {
    error.value = '请填写密码';
    return;
  }
  if (password.value.length < 6) {
    error.value = '密码长度至少 6 个字符';
    return;
  }
  if (password.value !== passwordConfirm.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    error.value = '邮箱格式不正确';
    return;
  }
  if (shop.value && !shop.value.trim().toLowerCase().includes('.myshopify.com')) {
    error.value = '店铺域名格式应为 xxx.myshopify.com';
    return;
  }

  loading.value = true;
  try {
    await adminApi.register({
      username: username.value.trim(),
      password: password.value,
      email: email.value.trim() || undefined,
      shop: shop.value.trim() || undefined,
    });
    router.replace({ path: '/login', query: { registration: 'ok' } });
  } catch (e: any) {
    error.value = e?.message || '注册失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.register-wrap {
  max-width: 460px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 40px 20px 20px;
  display: flex;
  flex-direction: column;
  background: #f6f6f7;
}

.register-card {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.register-header {
  margin-bottom: 24px;
  text-align: center;
}

.logo {
  display: inline-block;
  background: #008060;
  color: #fff;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 4px;
  margin-bottom: 14px;
  font-size: 14px;
  letter-spacing: 1px;
}

.register-card h2 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #212326;
}

.subtitle {
  color: #8a8a8a;
  font-size: 14px;
  margin: 0;
}

.form-item {
  margin-bottom: 14px;
}

.form-item label {
  display: block;
  font-size: 13px;
  color: #454545;
  margin-bottom: 6px;
  font-weight: 500;
}

.required {
  color: #d72c0d;
}

.form-item input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.form-item input:focus {
  border-color: #008060;
}

.btn {
  width: 100%;
  padding: 12px;
  background: #008060;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  margin-top: 6px;
  transition: background 0.15s;
}

.btn:hover:not(:disabled) {
  background: #006e51;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #d72c0d;
  font-size: 13px;
  margin: 0 0 12px;
  background: #fff1ed;
  padding: 8px 12px;
  border-radius: 4px;
}

.muted-links {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #8a8a8a;
}

.link {
  color: #008060;
  text-decoration: none;
  font-weight: 500;
  margin-left: 4px;
}

.link:hover {
  text-decoration: underline;
}

.footer {
  text-align: center;
  margin-top: auto;
  padding-top: 30px;
  font-size: 12px;
  color: #8a8a8a;
}
</style>
