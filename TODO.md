# Bazi-Master 完整任务清单

> 生成时间: 2025-12-26T16:04:17+07:00
> 项目路径: /Users/jiesen/Desktop/autonomous-coding/generations/bazi-master

---

## 📊 项目健康度概览

| 指标 | 当前状态 | 目标 |
|------|----------|------|
| 测试通过率 | 5.6% (27/479) | > 50% |
| 后端单元测试 | ✅ 94/94 | 保持 |
| 前端构建 | ✅ 成功 (有警告) | 无警告 |
| Bundle Size | 527KB (超限) | < 500KB |
| 代码提交状态 | ⚠️ 15文件未提交 | 全部提交 |
| server.js 行数 | 5,558 行 | < 500 行/文件 |

---

## 🚨 P0 - 紧急任务 (24小时内)

### 1. 提交未追踪的代码变更
**状态**: ⬜ 未开始
**预计时间**: 15 分钟

```bash
# 未追踪的新文件
frontend/src/components/bazi/BaziForm.jsx
frontend/src/components/bazi/BaziResult.jsx
frontend/src/components/bazi/useBaziCalculation.js
frontend/src/components/history/HistoryItem.jsx
frontend/src/components/history/HistoryList.jsx
frontend/src/hooks/useHistoryData.js

# 已修改的文件
claude-progress.txt
feature_list.json
frontend/scripts/dev-server.mjs
frontend/src/i18n/locales/en.json
frontend/src/pages/Bazi.jsx
frontend/src/pages/Profile.jsx
frontend/src/pages/Ziwei.jsx
frontend/tests/iching.spec.js
prisma/schema.prisma
```

**操作步骤**:
```bash
cd /Users/jiesen/Desktop/autonomous-coding/generations/bazi-master
git add .
git commit -m "feat: add bazi/history components and hooks refactoring"
git push origin master
```

---

### 2. 删除临时测试文件
**状态**: ⬜ 未开始
**预计时间**: 5 分钟

需要删除的文件:
```
frontend/test-error.txt
frontend/test-error-2.txt
frontend/test-error-3.txt
frontend/test-error-4.txt
frontend/test-error-5.txt
frontend/test-output.txt
frontend/test-output-2.txt
frontend/test-output-3.txt
frontend/test-output-4.txt
frontend/test-output-5.txt
```

**操作步骤**:
```bash
cd /Users/jiesen/Desktop/autonomous-coding/generations/bazi-master
rm -f frontend/test-error*.txt frontend/test-output*.txt
# 添加到 .gitignore
echo "frontend/test-error*.txt" >> .gitignore
echo "frontend/test-output*.txt" >> .gitignore
```

---

### 3. 修复环境变量配置重复
**状态**: ⬜ 未开始
**预计时间**: 5 分钟

**文件**: `.env.example`
**问题**: `SESSION_TOKEN_SECRET` 重复定义了两次 (第9行和第11行)

**修复**: 删除第11行的重复定义

---

### 4. 修复 Prisma Schema 与开发环境不一致
**状态**: ⬜ 未开始  
**预计时间**: 10 分钟

**问题**:
- `prisma/schema.prisma` 配置 `provider = "postgresql"`
- `.env` 使用 `DATABASE_URL="file:./dev.db"` (SQLite)

**方案 A - 开发环境使用 SQLite** (推荐):
1. 保持 `.env` 不变
2. 依赖后端 `IS_SQLITE` 自动检测逻辑

**方案 B - 开发环境使用 PostgreSQL**:
```bash
# 启动 Docker
docker compose up -d postgres

# 更新 .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public"

# 同步数据库
cd backend && npm run prisma:push
```

---

## ⚠️ P1 - 重要任务 (本周内)

### 5. 拆分后端 server.js (5,558 行 → 模块化)
**状态**: ⬜ 未开始
**预计时间**: 4-6 小时

**目标结构**:
```
backend/
├── server.js              # 入口文件 (< 100 行)
├── app.js                 # Express 配置
├── routes/
│   ├── index.js           # 路由汇总
│   ├── auth.routes.js     # 认证路由
│   ├── bazi.routes.js     # 八字路由
│   ├── tarot.routes.js    # 塔罗路由
│   ├── iching.routes.js   # 易经路由
│   ├── zodiac.routes.js   # 星座路由
│   ├── ziwei.routes.js    # 紫微路由
│   ├── user.routes.js     # 用户/Profile 路由
│   └── admin.routes.js    # 管理员路由
├── controllers/
│   ├── auth.controller.js
│   ├── bazi.controller.js
│   └── ...
├── middleware/
│   ├── auth.middleware.js
│   ├── rateLimit.middleware.js
│   ├── validation.middleware.js
│   └── error.middleware.js
└── services/
    ├── ai.service.js
    ├── cache.service.js
    └── ...
```

**步骤**:
1. 创建目录结构
2. 提取中间件到 `middleware/`
3. 提取路由到 `routes/`
4. 提取业务逻辑到 `controllers/` 和 `services/`
5. 验证所有测试仍然通过

---

### 6. 配置前端代码分割 (Bundle > 500KB)
**状态**: ⬜ 未开始
**预计时间**: 1-2 小时

**当前**: `dist/assets/index-sseBinFl.js` = 527.25 KB

**修改** `frontend/vite.config.js`:
```javascript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          i18n: ['i18next', 'react-i18next'],
        }
      }
    }
  }
})
```

**使用动态导入**:
```javascript
// 路由懒加载
const Bazi = lazy(() => import('./pages/Bazi'));
const Tarot = lazy(() => import('./pages/Tarot'));
```

---

### 7. 拆分超大 Hook 文件
**状态**: ⬜ 未开始
**预计时间**: 2-3 小时

| 文件 | 当前大小 | 建议 |
|------|----------|------|
| `useBaziCalculation.js` | 45KB | 拆分为 3-5 个 hooks |
| `useHistoryData.js` | 50KB | 拆分为 3-5 个 hooks |

**建议拆分**:
```
hooks/
├── useBaziCalculation/
│   ├── index.js           # 主入口
│   ├── useBaziForm.js     # 表单状态
│   ├── useBaziApi.js      # API 调用
│   ├── useBaziCache.js    # 缓存逻辑
│   └── useBaziValidation.js
└── useHistoryData/
    ├── index.js
    ├── useHistoryFilters.js
    ├── useHistoryPagination.js
    └── useHistoryCrud.js
```

---

### 8. 添加结构化日志 (Pino)
**状态**: ⬜ 未开始
**预计时间**: 1-2 小时

**安装**:
```bash
cd backend && npm install pino pino-pretty
```

**创建** `backend/lib/logger.js`:
```javascript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty' } 
    : undefined,
});

export default logger;
```

**替换所有** `console.log` → `logger.info`

---

## 🔧 P2 - 改进任务 (两周内)

### 9. 增加测试覆盖率
**状态**: ⬜ 未开始
**预计时间**: 8-16 小时

| 类别 | 当前 | 目标 | 优先级 |
|------|------|------|--------|
| Error Handling | 0/25 | 15/25 | 高 |
| Form Validation | 0/25 | 15/25 | 高 |
| URL & Direct Access | 0/20 | 10/20 | 中 |
| Search & Filter | 0/20 | 10/20 | 中 |

**需要添加的测试类型**:
- [ ] 网络失败 → 友好错误显示
- [ ] API 500 错误处理
- [ ] API 400 错误处理
- [ ] 表单必填字段验证
- [ ] 邮箱格式验证
- [ ] 密码复杂度验证
- [ ] 直接 URL 访问保护页面 → 重定向登录

---

### 10. 实现备份脚本
**状态**: ⬜ 未开始
**预计时间**: 1 小时

**创建** `scripts/backup-db.sh`:
```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

docker exec bazi_postgres pg_dump -U postgres bazi_master | gzip > "$BACKUP_DIR/bazi_master_$TIMESTAMP.sql.gz"
echo "Backup saved to $BACKUP_DIR/bazi_master_$TIMESTAMP.sql.gz"
```

**创建** `scripts/restore-db.sh`:
```bash
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

gunzip -c "$1" | docker exec -i bazi_postgres psql -U postgres -d bazi_master
echo "Restore complete"
```

---

### 11. 配置 OAuth 凭证
**状态**: ⬜ 未开始
**预计时间**: 2-4 小时

**Google OAuth**:
1. 访问 https://console.cloud.google.com/
2. 创建 OAuth 2.0 客户端 ID
3. 配置重定向 URI
4. 更新 `.env.production`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
   ```

**WeChat OAuth** (如需中国用户):
1. 访问 https://open.weixin.qq.com/
2. 创建网站应用
3. 更新配置

---

### 12. 添加 ESLint/Prettier 配置
**状态**: ⬜ 未开始
**预计时间**: 1 小时

```bash
# 后端
cd backend
npm install -D eslint prettier eslint-config-prettier

# 前端
cd frontend
npm install -D eslint prettier eslint-plugin-react
```

创建 `.eslintrc.json` 和 `.prettierrc`

---

## 📦 P3 - 优化任务 (长期)

### 13. 性能优化
- [ ] 图片懒加载
- [ ] API 响应缓存优化
- [ ] 大列表虚拟滚动
- [ ] 首屏加载 < 3s

### 14. 可访问性改进 (5/15 已完成)
- [x] Tab 导航
- [x] 焦点样式可见
- [x] 屏幕阅读器可达主内容
- [x] Skip-to-content 链接
- [x] 基础 ARIA 标签
- [ ] 颜色对比度
- [ ] 键盘快捷键
- [ ] 表单标签关联

### 15. 响应式布局验证
- [ ] 桌面端 (1920px)
- [ ] 平板端 (768px)
- [ ] 移动端 (375px)
- [ ] 横屏适配

### 16. 文档完善
- [ ] API 文档 (Swagger 已配置，需完善)
- [ ] 组件文档 (Storybook 可选)
- [ ] 部署文档 (PRODUCTION.md 已有，可扩展)

---

## ✅ 完成检查清单

### 提交前检查
- [ ] 所有测试通过: `npm test`
- [ ] 构建成功: `npm run build`
- [ ] 无 lint 错误: `npm run lint`
- [ ] 敏感信息未提交 (.env 等)

### 部署前检查
- [ ] 环境变量已配置
- [ ] 数据库迁移已执行
- [ ] SSL 证书已配置
- [ ] 备份机制已验证

---

## 📅 建议时间表

| 周 | 任务 | 预计时间 |
|---|------|----------|
| 第1周 Day1 | P0 任务 #1-4 | 30 分钟 |
| 第1周 Day2-3 | P1 任务 #5 (拆分 server.js) | 6 小时 |
| 第1周 Day4-5 | P1 任务 #6-8 | 5 小时 |
| 第2周 | P2 任务 #9-12 | 12 小时 |
| 第3-4周 | P3 任务 | 按需 |

---

## 🔗 相关文档

- [TASK_LIST.md](./TASK_LIST.md) - 功能测试任务清单
- [PRODUCTION.md](./PRODUCTION.md) - 生产部署指南
- [.env.example](./.env.example) - 环境变量模板
- [.env.production.example](./.env.production.example) - 生产环境变量模板

---

*此清单由 AI 分析生成，请根据实际情况调整优先级*
