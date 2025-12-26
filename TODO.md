# Bazi-Master 任务清单

> 更新时间: 2025-12-26T16:14:56+07:00

---

## 🚨 P0 - 紧急 (今天)

- [ ] **提交代码** - 17个文件未提交 (模块化重构 + hooks 拆分)
- [ ] **修复 .env.example** - SESSION_TOKEN_SECRET 重复定义
- [ ] **修复后端测试** - 6 个用例失败 (模块导入路径问题)

---

## ⚠️ P1 - 重要 (本周)

- [ ] **前端代码分割** - Bundle 527KB > 500KB 限制
- [ ] **完善后端模块化** - routes/api.js 拆分为独立路由文件
- [ ] **完成 Hook 拆分** - useBaziCalculation.js (45KB) 待拆分

---

## 🔧 P2 - 改进 (两周内)

- [ ] **修复前端 E2E 测试** - 导航跳转失败、Admin UI 缺失
- [ ] **增加测试覆盖** - Error Handling (0/25), Form Validation (0/25)
- [ ] **实现备份脚本** - backup-db.sh, restore-db.sh
- [ ] **配置 OAuth** - Google/WeChat 凭证
- [ ] **添加 ESLint/Prettier**

---

## 📦 P3 - 优化 (长期)

- [ ] 性能优化 (懒加载、虚拟滚动、首屏 < 3s)
- [ ] 可访问性 (颜色对比度、键盘快捷键)
- [ ] 响应式布局验证 (桌面/平板/移动端)
- [ ] 文档完善 (API 文档、组件文档)

---

## ✅ 已完成

- [x] 后端 server.js 模块化 (5,558 → 181 行)
- [x] 创建 config/middleware/routes/services/utils 目录
- [x] 添加结构化日志 (logger.js)
- [x] 删除临时测试文件 (test-error*.txt)
- [x] 创建 TEST_RESULTS_SUMMARY.md

---

## 📊 当前状态

| 指标 | 状态 |
|------|------|
| 后端测试 | 76/94 (80.9%) |
| server.js | ✅ 181 行 |
| 未提交 | ⚠️ 17 文件 |
| Bundle | ⚠️ 527KB |
