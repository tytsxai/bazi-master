# BaZi Master 任务清单

> 更新: 2025-12-26 | 后端测试: 80.9% 通过

## P0 - 紧急

- [ ] 提交代码 - 模块化重构 + hooks 拆分
- [ ] 修复后端测试 - 6 个用例失败 (Express 模块加载)

## P1 - 重要

- [ ] 前端代码分割 - Bundle 527KB > 500KB
- [ ] 完善后端路由拆分 - routes/api.js
- [ ] 修复前端 E2E 测试 - 导航跳转、Admin UI

## P2 - 改进

- [ ] 增加测试覆盖 - Error Handling, Form Validation
- [ ] 实现备份脚本 - backup-db.sh, restore-db.sh
- [ ] 配置 OAuth - Google/WeChat

## P3 - 优化

- [ ] 性能优化 - 懒加载、首屏 < 3s
- [ ] 可访问性 - 颜色对比度、键盘快捷键
- [ ] 响应式布局验证

## 已完成

- [x] 后端 server.js 模块化 (5,558 → 181 行)
- [x] 数据库兼容性修复 (SQLite/PostgreSQL)
- [x] 前端导航系统修复
- [x] 管理员权限界面修复
- [x] 删除临时文件和备份文件
