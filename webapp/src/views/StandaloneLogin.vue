<template>
  <div class="login-wrap">
    <div class="login-card">
      <h2>登录管理后台</h2>
      <p class="subtitle">输入用户名和密码登录系统</p>

      <form @submit.prevent="onSubmit">
        <div class="form-item">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="请输入用户名" :disabled="loading" />
        </div>
        <div class="form-item">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" :disabled="loading" />
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <p class="muted" style="text-align:center; margin-top: 16px;">
          还没有账号？<router-link to="/register" style="color:#008060;">注册</router-link>
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { userAuthApi } from '@/api/http';
import { saveStandaloneAuth } from '@/shopify/bridge';

const router = useRouter();
const route = useRoute();
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function onSubmit() {
  if (!username.value || !password.value) {
    error.value = '请填写用户名和密码';
    return;
  }

  loading.value = true;
  error.value = '';

  try {
    const resp = await userAuthApi.login(username.value, password.value);
    saveStandaloneAuth(resp.token, resp.user?.shop);
    const redirect = (route.query.redirect as string) || '/dashboard';
    router.replace(redirect);
  } catch (e: any) {
    error.value = e?.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap { max-width: 420px; margin: 80px auto 0; }
.login-card { background: #fff; border: 1px solid #e1e3e5; border-radius: 8px; padding: 32px; }
.login-card h2 { margin: 0 0 8px 0; font-size: 22px; text-align: center; }
.subtitle { text-align: center; color: #8a8a8a; font-size: 14px; margin: 0 0 24px 0; }
.form-item { margin-bottom: 16px; }
.form-item label { display: block; font-size: 13px; color: #454545; margin-bottom: 6px; }
.form-item input { width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; }
.form-item input:focus { outline: none; border-color: #008060; }
.btn { width: 100%; padding: 11px; background: #008060; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn:hover { background: #006e51; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #d72c0d; font-size: 13px; margin: 0 0 12px 0; }
.muted { color: #8a8a8a; font-size: 13px; }
</style>
