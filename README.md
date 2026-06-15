# Shopify Public App with NestJS

一个完整的 Shopify 公共应用（Public App）实现，使用 NestJS 框架构建。

## 功能特性

- OAuth 2.0 授权码模式认证（Online + Offline Token）
- **智能跳过重复授权**：已有有效 token 且 scopes 完整时自动跳过 OAuth 流程
- **授权状态检查**：便捷的 `/auth/status` 端点查看 token、scopes、过期时间
- **强制重授权**：`/auth/install` 快捷端点强制刷新 token 和 scopes
- **Scope 变更感知**：自动检测配置的 scopes 与已授权 scopes 的差异
- Session 数据库存储（PostgreSQL + TypeORM）
- GraphQL API 客户端（优先使用 GraphQL）
- Webhook HMAC-SHA256 验证
- API 限流与指数退避重试
- 订阅计费集成（Shopify App Pricing）
- GDPR Webhook 支持（2026年新规）

## 技术栈

- NestJS 10+
- TypeScript
- PostgreSQL + TypeORM
- @shopify/shopify-api
- GraphQL

## 项目结构

```
src/
├── main.ts                          # 应用入口
├── app.module.ts                    # 根模块
├── config/
│   └── data-source.ts               # TypeORM 数据源配置
├── database/
│   └── entities/
│       └── shop-session.entity.ts   # Session 存储实体
├── migrations/
│   └── 1700000000000-CreateShopSessionsTable.ts
├── shopify/
│   ├── shopify.module.ts            # Shopify 核心模块
│   ├── auth/
│   │   ├── auth.controller.ts       # OAuth 认证控制器
│   │   └── auth.guard.ts            # 认证守卫
│   ├── session/
│   │   └── shopify-session.service.ts # Session 存储服务
│   ├── graphql/
│   │   └── graphql.service.ts       # GraphQL 客户端
│   ├── client/
│   │   └── shopify-client.service.ts # REST API 客户端
│   └── rate-limit/
│       └── rate-limit.service.ts    # 限流与重试服务
├── webhooks/
│   ├── webhook.module.ts            # Webhook 模块
│   ├── webhook.controller.ts        # Webhook 控制器
│   └── hmac.middleware.ts           # HMAC 验证中间件
├── billing/
│   ├── billing.module.ts            # 计费模块
│   └── billing.service.ts           # 计费服务
└── products/
    ├── products.module.ts           # 产品模块
    └── products.controller.ts       # 产品控制器
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

必需的环境变量：

| 变量 | 说明 |
|------|------|
| `SHOPIFY_API_KEY` | Shopify 应用 API Key |
| `SHOPIFY_API_SECRET` | Shopify 应用 API Secret |
| `SHOPIFY_HOST` | 应用公网地址（需要 HTTPS） |
| `SHOPIFY_SCOPES` | OAuth scopes（逗号分隔） |
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `PORT` | 应用端口（默认 3000） |

#### Scopes 配置说明

当前配置的 scopes：

```env
SHOPIFY_SCOPES=read_products,write_products,read_orders,read_all_orders,write_orders,read_customers,write_customers
```

**关键 scopes 说明**：

| Scope | 说明 |
|-------|------|
| `read_orders` | 访问最近 60 天的订单 |
| `read_all_orders` | 访问所有历史订单（需在 Partner 后台开启 PCD） |
| `read_customers` / `write_customers` | 访问客户数据（需在 Partner 后台开启 PCD） |

> **重要**：`read_all_orders`、`read_customers`、`write_customers` 需要在 Shopify Partner 后台的 **Protected Customer Data** 部分开启权限。

### 3. 设置 ngrok（本地开发）

Shopify 应用需要 HTTPS 地址，本地开发可使用 ngrok：

```bash
# 安装 ngrok
npm install -g ngrok

# 启动 ngrok
ngrok http 3000
```

将 ngrok 提供的 HTTPS 地址配置到 `SHOPIFY_HOST`。

### 4. 创建数据库

```bash
# 创建 PostgreSQL 数据库
createdb shopify_app

# 或使用 Docker
docker run -d --name shopify-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=shopify_app -p 5432:5432 postgres
```

### 5. 运行数据库迁移

```bash
# 生成迁移文件
npm run migration:generate

# 运行迁移
npm run migration:run
```

### 6. 启动应用

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

### 7. 配置 Shopify Partner Dashboard

在 Shopify Partner Dashboard 中：

1. 创建新的 Public App
2. 设置 App URL: `https://your-ngrok-url.ngrok.io`
3. 设置 Allowed redirection URLs:
   - `https://your-ngrok-url.ngrok.io/auth/callback`
   - `https://your-ngrok-url.ngrok.io/auth/offline-callback`
4. 配置 Webhook URLs（可选）
5. 配置 App Pricing（可选）

### 8. 安装应用

访问以下 URL 开始安装流程：

```
https://your-ngrok-url.ngrok.io/auth/login?shop=your-shop.myshopify.com
```

## OAuth 认证流程

### 为什么同时需要 Online 和 Offline Token？

**Online Token（在线令牌）**
- 与用户会话绑定
- 用于前端嵌入式应用交互
- 包含用户权限范围
- 有过期时间（通常 24 小时）

**Offline Token（离线令牌）**
- 不与特定用户绑定
- 用于后台任务（Webhook、定时任务）
- 永不过期（除非用户卸载应用）
- 2026年4月新规：支持刷新

### 认证流程

#### 正常授权流程

1. 用户点击安装 → `GET /auth/login?shop=xxx`
2. **智能检查**：如果已有有效 token 且 scopes 完整，直接跳转到应用首页（跳过 OAuth）
3. 否则重定向到 Shopify 授权页面（Online 模式）
4. 用户授权后回调 → `GET /auth/callback`
5. 存储 Online Token
6. 自动请求 Offline Token → `GET /auth/offline-callback`
7. 存储 Offline Token
8. 重定向到应用前端

#### 强制重新授权

当需要更新 scopes（如新增 `read_all_orders`）时：

```bash
# 方式一：使用 force 参数
GET /auth/login?shop=xxx&force=1

# 方式二：使用 install 快捷端点（推荐）
GET /auth/install?shop=xxx
```

#### 检查授权状态

```bash
GET /auth/status?shop=xxx
```

返回字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `shop` | string | 店铺域名 |
| `hasToken` | boolean | 是否有有效的 offline token |
| `scopesMatch` | boolean | 已授权 scopes 是否与配置的一致 |
| `missingScopes` | string[] | 缺失的 scopes |
| `storedScopes` | string[] | 当前已授权的 scopes |
| `requiredScopes` | string[] | 配置文件中要求的 scopes |
| `needsReauth` | boolean | 是否需要重新授权 |
| `hint` | string | 友好提示信息 |

## Webhook 验证

### HMAC-SHA256 验证流程

1. 从 header 获取 `x-shopify-hmac-sha256`
2. 使用 API Secret 对原始请求体计算 HMAC
3. 比较计算结果与 header 中的签名
4. 使用时间安全的比较方法防止时序攻击

**重要**：必须验证原始请求体（raw body），不能使用已解析的 JSON。

### GDPR Webhook（2026年新规）

必须配置以下 Webhook：

- `customers/data_request`: 客户请求获取数据副本
- `customers/redact`: 客户请求删除数据
- `shop/redact`: 店铺请求删除数据

必须在 30 天内响应这些请求。

## API 限流

### Shopify 限流规则

- REST API: 每分钟 2 点/秒，突发限制 40 点
- GraphQL API: 基于 cost 计算，每分钟 50 点/秒

### 本应用实现的限流策略

- 指数退避重试（处理 429 状态码）
- 解析 GraphQL `extensions.cost` 主动延迟
- 批量请求自动控制速率

## 订阅计费

### 配置定价方案

在 Partner Dashboard 中配置定价方案，代码只需：

1. 查询当前订阅状态
2. 上报使用量（用于按量计费）

### 使用示例

```typescript
// 查询订阅状态
const subscription = await billingService.getActiveSubscription(shop);

// 上报使用量
await billingService.reportUsage(shop, 'api_calls', 100);
```

## API 端点

### 认证端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/auth/login?shop=xxx` | GET | 发起 OAuth 授权（智能跳过重复授权） |
| `/auth/login?shop=xxx&force=1` | GET | 强制重新授权 |
| `/auth/install?shop=xxx` | GET | 快捷强制重新授权（等价 `force=1`） |
| `/auth/status?shop=xxx` | GET | 查看授权状态、scopes、过期时间、是否需要重授权 |
| `/auth/callback` | GET | OAuth 回调处理（Online Token） |
| `/auth/offline-callback` | GET | Offline Token 回调 |

#### 授权状态检查示例

```bash
curl "https://your-domain.com/auth/status?shop=your-shop.myshopify.com"
```

返回：
```json
{
  "shop": "your-shop.myshopify.com",
  "hasToken": true,
  "scopesMatch": true,
  "missingScopes": [],
  "storedScopes": ["read_products", "write_products", "read_orders", "read_all_orders", ...],
  "requiredScopes": ["read_products", "write_products", "read_orders", "read_all_orders", ...],
  "expiresAt": null,
  "updatedAt": "2026-06-12T03:34:05.000Z",
  "needsReauth": false,
  "hint": "授权状态良好。scopes 完整，token 有效。"
}
```

### Webhook 端点

- `POST /webhooks/orders/create`: 订单创建
- `POST /webhooks/orders/updated`: 订单更新
- `POST /webhooks/products/update`: 产品更新
- `POST /webhooks/app/uninstalled`: 应用卸载
- `POST /webhooks/customers/data_request`: GDPR 数据请求
- `POST /webhooks/customers/redact`: GDPR 数据删除
- `POST /webhooks/shop/redact`: GDPR 店铺删除

### 业务端点

- `GET /api/products`: 获取产品列表
- `GET /api/orders`: 获取订单列表
- `GET /api/customers`: 获取客户列表
- `GET /api/subscription`: 获取订阅状态
- `GET /api/shop`: 获取店铺信息

## 开发建议

### 安全注意事项

1. 验证所有 Webhook 的 HMAC 签名
2. 使用 state 参数防止 CSRF 攻击
3. 不要在日志中记录敏感信息（如 access token）
4. 应用卸载时清理所有店铺数据

### 性能优化

1. 优先使用 GraphQL API
2. 使用 Bulk Operation API 处理大量数据
3. 实现请求缓存减少 API 调用
4. 使用限流服务避免触发 Shopify 限制

### 错误处理

1. 所有异步操作使用 try/catch
2. 使用 NestJS Logger 记录错误
3. Webhook 处理失败返回 200（避免 Shopify 重试）
4. 实现全局异常过滤器

## 测试

```bash
# 单元测试
npm run test

# E2E 测试
npm run test:e2e

# 测试覆盖率
npm run test:cov
```

## 部署

### Docker 部署

```bash
# 构建镜像
docker build -t shopify-app .

# 运行容器
docker run -d -p 3000:3000 --env-file .env shopify-app
```

### 生产环境配置

1. 使用 HTTPS（必须）
2. 配置数据库连接池
3. 设置日志级别
4. 配置监控和告警
5. 实现健康检查端点

## 许可证

MIT

## 支持

如有问题，请查看 Shopify 官方文档：
- [Shopify App Development](https://shopify.dev/docs/apps)
- [Shopify API Reference](https://shopify.dev/docs/api)
- [Shopify App Pricing](https://shopify.dev/docs/apps/billing)