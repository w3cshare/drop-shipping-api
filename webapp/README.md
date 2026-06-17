# Shopify App - 前端项目（webapp）

Vue 3 + Vite 构建的前端项目，**同时支持两种运行模式**：

## 📦 安装依赖

```bash
cd webapp
npm install
```

## 🚀 启动开发服务器

```bash
# 开发模式（默认端口 5173，代理 API 到 http://localhost:3000）
npm run dev

# 生产构建（输出到 ../dist-webapp）
npm run build

# 预览生产构建
npm run preview
```

## 🔧 环境变量

复制 `.env.example` 为 `.env.local` 并按需修改：

| 变量 | 用途 |
|------|------|
| `VITE_PORT` | 开发服务器端口（默认 5173） |
| `VITE_API_BASE_URL` | 后端 API 地址（默认 http://localhost:3000） |
| `VITE_SHOPIFY_API_KEY` | Shopify Partner 分配的 App API Key（应用内模式需要） |

## 🔌 两种运行模式

### 模式 1：应用内（Embedded App，运行在 Shopify Admin iframe 内）

**场景**：商家在 Shopify 后台 → 已安装的应用 → 点击进入

**认证流程**：
1. Shopify OAuth 授权（/auth/login?shop=xxx.myshopify.com）
2. 前端由 Shopify App Bridge 自动获取 JWT Session Token
3. 每个 API 请求自动附带 `Authorization: Bearer <JWT>`
4. 后端解析 JWT 得到 shop → 查数据库 offline token → 调用 Shopify Admin API

**前端入口**：访问应用首页 → 自动跳转到 /shop

### 模式 2：独立应用（Standalone，独立后台系统）

**场景**：团队自建的管理后台，不需要在 Shopify Admin 内运行

**认证流程**：
1. 注册账号，绑定 Shopify 店铺域名
2. 用户名/密码登录，得到自定义 JWT
3. 调用 Shopify 相关 API 时，前端自动附带 `?shop=xxx.myshopify.com`
4. 后端根据 shop 参数查找数据库中的 offline token → 调用 Shopify Admin API

**前端入口**：访问 `/login` → 登录 → `/dashboard`

## 📂 目录结构

```
webapp/
├── src/
│   ├── shopify/bridge.ts    # App Bridge 核心模块 + 鉴权逻辑（两种模式统一接口）
│   ├── api/http.ts          # axios 实例 + API 封装（自动注入 Authorization / shop）
│   ├── router/index.ts      # Vue Router，登录态守卫
│   ├── views/
│   │   ├── HomeView.vue           # 首页，自动分流
│   │   ├── ShopDetail.vue         # 店铺详情页（共用）
│   │   ├── ProductList.vue        # 产品列表（共用）
│   │   ├── OrderList.vue          # 订单列表（共用）
│   │   ├── StandaloneLogin.vue    # 独立应用登录
│   │   ├── StandaloneRegister.vue # 独立应用注册
│   │   └── StandaloneDashboard.vue# 独立应用仪表盘
│   ├── App.vue              # 根组件
│   └── main.ts              # 入口
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 🔑 前置条件

**不管哪种模式都需要**：
1. Shopify 店铺已经完成 OAuth 授权（访问后端 `/auth/login?shop=xxx.myshopify.com`）
2. 数据库里已经保存该店铺的 offline token
3. 后端服务正常运行（默认 http://localhost:3000）
