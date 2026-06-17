<template>
  <div class="login-wrap">
    <div class="login-card">
      <h2>注册账号</h2>

      <form @submit.prevent="onSubmit">
        <div class="form-item">
          <label>用户名 <span class="required">*</span></label>
          <input v-model="username" type="text" placeholder="至少 3 位" :disabled="loading" />
        </div>
        <div class="form-item">
          <label>邮箱 <span class="required">*</span></label>
          <input v-model="email" type="email" placeholder="可选" :disabled="loading" />
        </div>
        <div class="form-item">
          <label>Shopify 店铺域名</label>
          <input v-model="shop" type="text" placeholder="xxx.myshopify.com（可选）" :disabled="loading" />
        </div>
        <div class="form-item">
          <label>密码 <span class="required">*</span></label>
          <input v-model="password" type="password" placeholder="至少 6 位" :disabled="loading" />
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="btn" :disabled="loading">
          {{ loading ? '注册中...' : '注册' }}
        </button>

        <p class="muted" style="text-align:center; margin-top: 16px;">
          已有账号？<router-link to="/login" style="color:#008060;">登录</router-link>
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { userAuthApi } from '@/api/http';

const router = useRouter();
const username = ref('');
const password = ref('');
const email = ref('');
const shop = ref('');
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
    await userAuthApi.register(username.value, password.value, shop.value || undefined, email.value || undefined);
    router.replace('/login');
  } catch (e: any) {
    error.value = e?.message || '注册失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap { max-width: 420px; margin: 80px auto 0; }
.login-card { background: #fff; border: 1px solid #e1e3e5; border-radius: 8px; padding: 32px; }
.login-card h2 { margin: 0 0 16px 0; font-size: 22px; text-align: center; }
.form-item { margin-bottom: 16px; }
.form-item label { display: block; font-size: 13px; color: #454545; margin-bottom: 6px; }
.form-item input { width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; }
.form-item input:focus { outline: none; border-color: #008060; }
.required { color: #d72c0d; }
.btn { width: 100%; padding: 11px; background: #008060; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn:hover { background: #006e51; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #d72c0d; font-size: 13px; margin: 0 0 12px 0; }
.muted { color: #8a8a8a; font-size: 13px; }
</style>
