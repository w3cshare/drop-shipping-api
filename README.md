# Shopify Public App with NestJS

一个完整的 Shopify 公共应用（Public App）实现，使用 NestJS 框架构建。

## 功能特性

- OAuth 2.0 授权码模式认证（Online + Offline Token）
- **智能跳过重复授权**：已有有效 token 且 scopes 完整时自动跳过 OAuth 流程
- **授权状态检查**：便捷的 `/auth/status` 端点查看 token、scopes、过期时间
- **强制重授权**：`/auth/install` 快捷端点强制刷新 token 和 scopes
- **Scope 变更感知**：自动检测配置的 scopes 与已授权 scopes 的差异
- Session 数据库存储（MySQL + TypeORM）
- GraphQL API 客户端（优先使用 GraphQL）
- Webhook HMAC-SHA256 验证
- API 限流与指数退避重试
- 订阅计费集成（Shopify App Pricing）
- GDPR Webhook 支持（2026年新规）
- **三层订单同步补偿机制**（Webhook 实时 + 队列异步 + 定时全量）
- **管理员后台 API**（订单/商品列表、统计、同步管理）
- **用户系统**（argon2 加密 + JWT 鉴权）

## 技术栈

- NestJS 10+
- TypeScript
- MySQL 5.7+ / PostgreSQL + TypeORM
- @shopify/shopify-api
- GraphQL
- @nestjs/schedule（定时任务）
- argon2（密码哈希）
- jsonwebtoken（JWT 鉴权）

## 项目结构

```
src/
├── main.ts                          # 应用入口
├── app.module.ts                    # 根模块（注册 ScheduleModule）
├── config/
│   └── data-source.ts               # TypeORM 数据源配置
├── database/
│   └── entities/
│       ├── shop-session.entity.ts   # Session 存储实体
│       ├── order.entity.ts          # 订单实体（b_3rd_orders）
│       ├── product.entity.ts        # 商品实体（b_3rd_products）
│       ├── pending-event.entity.ts  # Webhook 队列实体
│       ├── sync-record.entity.ts    # 同步记录实体
│       └── user.entity.ts           # 后台用户实体（b_3rd_users）
├── auth/
│   ├── user-auth.controller.ts      # 用户注册/登录控制器
│   ├── user-auth.module.ts          # 鉴权模块
│   └── user-jwt-auth.guard.ts       # JWT 鉴权守卫
├── users/
│   ├── users.service.ts             # 用户服务（argon2 加密）
│   ├── users.controller.ts          # 用户管理控制器
│   ├── user.dto.ts                  # 用户 DTO
│   └── users.module.ts              # 用户模块
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
│   ├── webhook.controller.ts        # Webhook 控制器（orders/products）
│   ├── hmac.middleware.ts           # HMAC 验证中间件
│   ├── webhook-queue.service.ts     # 事件队列服务
│   ├── webhook-event-processor.ts   # 事件处理器
│   ├── webhook-registration.service.ts # Webhook 注册服务
│   └── 三层补偿机制.md               # 三层补偿机制说明
├── orders/
│   ├── order.service.ts             # 订单 CRUD 服务
│   ├── order-sync.service.ts        # 订单 REST 同步服务
│   ├── sync-scheduler.ts            # 定时同步调度器（@nestjs/schedule）
│   ├── orders.controller.ts         # 管理员订单 API
│   ├── order.dto.ts                 # 订单 DTO
│   └── order.module.ts              # 订单模块
├── products/
│   ├── product.service.ts           # 商品服务
│   ├── products.controller.ts       # 管理员商品 API
│   ├── dto/product.dto.ts           # 商品 DTO
│   └── products.module.ts           # 商品模块
├── billing/
│   ├── billing.module.ts            # 计费模块
│   └── billing.service.ts           # 计费服务
└── utils/
    ├── password.util.ts             # 密码工具（argon2）
    └── jwt.util.ts                  # JWT 工具
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
| `DB_HOST` | 数据库地址（默认 localhost） |
| `DB_PORT` | 数据库端口（**必须 3306**，MySQL 默认端口） |
| `DB_USERNAME` | 数据库用户名 |
| `DB_PASSWORD` | 数据库密码 |
| `DB_DATABASE` | 数据库名 |
| `PORT` | 应用端口（默认 3000） |
| `JWT_SECRET` | JWT 签名密钥 |
| `JWT_TTL_SECONDS` | JWT 过期时间（秒，默认 86400） |

#### Scopes 配置说明

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
ngrok http 3000
```

将 ngrok 提供的 HTTPS 地址配置到 `SHOPIFY_HOST`。

### 4. 创建数据库

```bash
# 创建 MySQL 数据库
mysql -u root -p -e "CREATE DATABASE shopify_app CHARACTER SET utf8mb4;"

# 或使用 Docker
docker run -d --name shopify-mysql -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=shopify_app -p 3306:3306 mysql:8
```

> **注意**：MySQL 端口必须是 **3306**（不是 33306 或其他）。

### 5. 启动应用

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

> 当前 `synchronize: true`，TypeORM 启动时会自动建表（仅限开发环境）。

### 6. 配置 Shopify Partner Dashboard

1. 创建新的 Public App
2. 设置 App URL: `https://your-ngrok-url.ngrok.io`
3. 设置 Allowed redirection URLs:
   - `https://your-ngrok-url.ngrok.io/auth/callback`
   - `https://your-ngrok-url.ngrok.io/auth/offline-callback`
4. 配置 Webhook URLs（可选）
5. 配置 App Pricing（可选）

### 7. 安装应用

```
https://your-ngrok-url.ngrok.io/auth/login?shop=your-shop.myshopify.com
```

## OAuth 认证流程

### Online Token vs Offline Token

**Online Token**
- 与用户会话绑定，用于前端嵌入式应用
- 有过期时间（通常 24 小时）

**Offline Token**
- 不与特定用户绑定，用于后台任务（Webhook、定时任务）
- 永不过期（除非用户卸载应用），2026年4月新规支持刷新

### 智能跳过重复授权

```bash
# 强制重新授权（用于更新 scopes）
GET /auth/install?shop=xxx

# 查看授权状态
GET /auth/status?shop=xxx
```

## 三层订单同步机制

详细文档见 [src/webhooks/三层补偿机制.md](file:///c:/Users/Admin/Desktop/com/shopify-project/growing-logistics-app/api-shopify/src/webhooks/三层补偿机制.md)。

### 三层架构

| 层级 | 触发方式 | 实时性 | 文件 |
|------|----------|--------|------|
| **第一层**：Webhook 实时接收 | 事件驱动 | 几秒 | `webhook.controller.ts` |
| **第二层**：事件队列异步处理 | 每 30 秒轮询 | 30 秒 | `webhook-event-processor.ts` |
| **第三层**：定时全量同步 | 每 5 分钟 | 5 分钟 | `sync-scheduler.ts` |

### 数据库表

| 表名 | 用途 | 唯一约束 |
|------|------|----------|
| `b_3rd_orders` | 订单数据 | `(order_id, shop)` |
| `b_3rd_products` | 商品数据 | - |
| `b_3rd_pending_events` | Webhook 事件队列 | - |
| `b_3rd_sync_records` | 同步记录（断点续传） | - |
| `b_3rd_shop_sessions` | Shopify Session | - |
| `b_3rd_users` | 后台用户 | `(username)`, `(email)` |

### 同步策略

- **首次同步**：回溯最近 **7 天**
- **增量同步**：回溯最近 **24 小时**
- **智能检测**：如果 Shopify 订单数 > 本地数据库订单数，自动扩大到 7 天
- **去重保证**：`orderId + shop` 组合唯一约束，使用 TypeORM `upsert` 防止重复

## 用户与鉴权

### 密码加密

使用 **argon2id** 算法（OWASP 推荐）：

```typescript
// 哈希（注册）
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
});

// 验证（登录）
const valid = await argon2.verify(hash, password);
```

argon2 的 hash 字符串中已包含 salt（无需单独字段），格式：
```
$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
```

### JWT 鉴权

- 算法：HS256
- 默认 TTL：24 小时
- Payload：`{ sub, username, role }`

### 用户接口

| 端点 | 方法 | 功能 | 鉴权 |
|------|------|------|------|
| `/user/auth/register` | POST | 注册 | 无 |
| `/user/auth/login` | POST | 登录 | 无 |
| `/user/auth/me` | GET | 当前用户信息 | JWT |
| `/api/admin/users` | POST | 管理员创建用户 | JWT |
| `/api/admin/users/me` | GET | 当前登录用户 | JWT |
| `/api/admin/users/:id` | GET | 用户详情 | JWT |
| `/api/admin/users/:id/status` | PUT | 修改状态 | JWT |
| `/api/admin/users/change-password` | POST | 修改密码 | JWT |

## 管理员 API

所有接口均需 JWT 鉴权，路径前缀 `/api/admin`。

### 订单接口

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/admin/orders` | GET | 订单列表（分页 + 多条件过滤） |
| `/api/admin/orders/:id` | GET | 单条订单详情 |
| `/api/admin/orders/stats` | GET | 订单统计（按状态/财务/物流分组） |
| `/api/admin/orders/sync/status` | GET | 同步状态概览 |
| `/api/admin/orders/sync/manual?shop=xxx` | POST | 手动触发增量同步 |
| `/api/admin/orders/sync/force?shop=xxx` | POST | 强制全量同步（7天回溯） |

**列表查询参数**：
- `page`（默认 1）
- `page_size`（默认 20，最大 100）
- `status`（订单状态）
- `financial_status`（财务状态）
- `fulfillment_status`（物流状态）
- `start_date` / `end_date`（按创建时间过滤）
- `keyword`（搜索订单名 / 订单 ID）
- `shop`（**必填**，店铺隔离）

### 商品接口

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/admin/products` | GET | 商品列表（分页 + 多条件过滤） |
| `/api/admin/products/:id` | GET | 单条商品详情 |

**列表查询参数**：`page`、`page_size`、`status`、`product_type`、`vendor`、`start_date`、`end_date`、`keyword`、`shop`

## Webhook 端点

- `POST /webhooks/orders/create`: 订单创建
- `POST /webhooks/orders/updated`: 订单更新
- `POST /webhooks/products/create`: 商品创建
- `POST /webhooks/products/update`: 商品更新
- `POST /webhooks/products/delete`: 商品删除
- `POST /webhooks/app/uninstalled`: 应用卸载
- `POST /webhooks/customers/data_request`: GDPR 数据请求
- `POST /webhooks/customers/redact`: GDPR 数据删除
- `POST /webhooks/shop/redact`: GDPR 店铺删除

## 定时任务

使用 `@nestjs/schedule` 管理（声明式）：

| 任务 | 频率 | 装饰器 |
|------|------|--------|
| 订单全量同步 | 每 5 分钟 | `@Cron('0 */5 * * * *', { timeZone: 'Asia/Shanghai' })` |
| 队列状态检查 | 每 30 秒 | `@Interval('queueCheck', 30000)` |
| 队列清理 | 每小时 | `@Interval('cleanup', 3600000)` |

## OAuth 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/auth/login?shop=xxx` | GET | 发起 OAuth 授权（智能跳过重复授权） |
| `/auth/login?shop=xxx&force=1` | GET | 强制重新授权 |
| `/auth/install?shop=xxx` | GET | 快捷强制重新授权 |
| `/auth/status?shop=xxx` | GET | 查看授权状态、scopes、过期时间 |
| `/auth/callback` | GET | OAuth 回调处理（Online Token） |
| `/auth/offline-callback` | GET | Offline Token 回调 |

## 开发建议

### 安全注意事项

1. 验证所有 Webhook 的 HMAC 签名
2. 使用 state 参数防止 CSRF 攻击
3. 不要在日志中记录敏感信息（如 access token、password）
4. argon2 参数调优：`memoryCost=65536, timeCost=3`（约 100ms 哈希时间）
5. JWT Secret 长度 ≥ 32 字符
6. 应用卸载时清理所有店铺数据

### 性能优化

1. 优先使用 GraphQL API
2. 定时任务尽量错峰（cron 表达式分散在非整点）
3. 数据库批量 upsert 而非循环 save
4. 复杂查询加索引（订单的 `(shop, created_at)`、商品的 `(shop, status)`）

### 错误处理

1. 所有异步操作使用 try/catch
2. 使用 NestJS Logger 记录错误
3. Webhook 处理失败返回 200（避免 Shopify 重试）
4. 定时任务抛错不影响其他任务（@nestjs/schedule 自动隔离）

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
docker build -t shopify-app .
docker run -d -p 3000:3000 --env-file .env shopify-app
```

### 生产环境配置

1. 使用 HTTPS（必须）
2. 配置数据库连接池
3. 设置 `synchronize: false` 并使用 TypeORM 迁移
4. 配置日志级别和结构化输出
5. 实现健康检查端点
6. 配置告警（队列积压、同步失败）

## 许可证

MIT

## 相关文档

- [三层补偿机制详解](file:///c:/Users/Admin/Desktop/com/shopify-project/growing-logistics-app/api-shopify/src/webhooks/三层补偿机制.md)
- [Shopify App Development](https://shopify.dev/docs/apps)
- [Shopify API Reference](https://shopify.dev/docs/api)
- [Shopify App Pricing](https://shopify.dev/docs/apps/billing)
- [NestJS Schedule](https://docs.nestjs.com/scheduling)
- [argon2 文档](https://github.com/ranisalt/node-argon2)
