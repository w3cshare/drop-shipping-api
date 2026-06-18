<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">Shopify App</div>
        <h2>登录管理后台</h2>
        <p class="subtitle">使用您的账号密码登录以继续</p>
      </div>

      <form @submit.prevent="onSubmit">
        <div class="form-item">
          <label>用户名</label>
          <input
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            :disabled="loading"
            autocomplete="username"
          />
        </div>

        <div class="form-item">
          <label>密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            :disabled="loading"
            autocomplete="current-password"
            @keydown.enter.prevent="onSubmit"
          />
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="successMsg" class="success">{{ successMsg }}</p>

        <button type="submit" class="btn" :disabled="loading">
          <span v-if="loading">登录中...</span>
          <span v-else>登录</span>
        </button>

        <div class="muted-links">
          <span>还没有账号？</span>
          <router-link to="/register" class="link">立即注册</router-link>
        </div>
      </form>
    </div>

    <footer class="footer">
      <span>© {{ nowYear }} Shopify App · 商家独立管理后台</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const successMsg = ref('');

const nowYear = computed(() => new Date().getFullYear());

// 注册页返回时显示提示
onMounted(() => {
  if (route.query.registration === 'ok') {
    successMsg.value = '注册成功！请使用您的账号密码登录。';
  }
});

async function onSubmit() {
  error.value = '';
  successMsg.value = '';
  if (!username.value.trim() || !password.value) {
    error.value = '请填写用户名和密码';
    return;
  }

  loading.value = true;
  try {
    const redirect = (route.query.redirect as string) || '/dashboard';
    await userStore.login(username.value.trim(), password.value, redirect);
    successMsg.value = '登录成功，正在跳转...';
    router.replace(redirect).catch(() => {
      window.location.href = redirect;
    });
  } catch (e: any) {
    error.value = e?.message || '登录失败，请检查用户名密码';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  max-width: 420px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 60px 20px 20px;
  display: flex;
  flex-direction: column;
  background: #f6f6f7;
}

.login-card {
  background: #fff;
  border: 1px solid #e1e3e5;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.login-header {
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

.login-card h2 {
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
  margin-bottom: 16px;
}

.form-item label {
  display: block;
  font-size: 13px;
  color: #454545;
  margin-bottom: 6px;
  font-weight: 500;
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

.success {
  color: #008060;
  font-size: 13px;
  margin: 0 0 12px;
  background: #e8f5f0;
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
