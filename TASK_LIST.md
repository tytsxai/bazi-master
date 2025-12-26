# Bazi-Master 项目任务清单

> 生成时间: 2025-12-26
> 当前进度: 27/479 测试通过 (5.6%)

---

## 一、总体进度概览

| 类别 | 通过/总数 | 通过率 | 优先级 |
|------|-----------|--------|--------|
| Core Flows | 4/30 | 13.3% | P0 |
| A. Security & Access Control | 6/40 | 15.0% | P0 |
| B. Navigation Integrity | 2/40 | 5.0% | P1 |
| C. Real Data Validation | 3/50 | 6.0% | P1 |
| D. Flow Integrity | 5/40 | 12.5% | P1 |
| E. Error Handling | 0/25 | 0.0% | P2 |
| F. UI-Backend Integration | 1/35 | 2.9% | P1 |
| G. State & Persistence | 1/15 | 6.7% | P2 |
| H. URL & Direct Access | 0/20 | 0.0% | P2 |
| I. Double Actions & Idempotency | 0/15 | 0.0% | P3 |
| J. Data Cleanup & Cascades | 0/20 | 0.0% | P3 |
| K. Defaults & Reset | 0/12 | 0.0% | P3 |
| L. Search & Filter Edge Cases | 0/20 | 0.0% | P2 |
| M. Form Validation | 0/25 | 0.0% | P2 |
| N. Feedback & Notifications | 0/15 | 0.0% | P3 |
| O. Responsive & Layout | 0/15 | 0.0% | P3 |
| P. Accessibility | 5/15 | 33.3% | P3 |
| Q. Time & Timezone | 0/12 | 0.0% | P2 |
| R. Concurrency & Race Conditions | 0/15 | 0.0% | P3 |
| S. Export/Import | 0/10 | 0.0% | P3 |
| T. Performance | 0/10 | 0.0% | P3 |

---

## 二、P0 优先级任务 (核心功能)

### 2.1 Core Flows (4/30 通过)

#### 已完成
- [x] 注册用户 BaZi 完整流程
- [x] 跨模块导航 (Bazi/Tarot/Iching/Zodiac)
- [x] 多记录创建/编辑/删除/导出导入
- [x] 数据导出/导入验证

#### 待完成
- [ ] 访客 BaZi 基础计算 + 刷新持久化
- [ ] Tarot Celtic Cross + AI 解读 + 历史持久化
- [ ] I Ching 变爻 + AI 解读 + 保存历史
- [ ] OAuth Google 流程 + 重定向 + 个人资料更新
- [ ] OAuth WeChat 流程 + 重定向 + 个人资料更新
- [ ] 语言切换 (zh-CN <-> en-US) + 持久化 + UI 重渲染
- [ ] 时区切换 + 日期敏感计算
- [ ] BaZi 真太阳时校正 (基于位置)
- [ ] Zodiac 上升星座计算 (基于出生时间/位置)
- [ ] 历史管理: 筛选/排序/删除/恢复
- [ ] 收藏夹管理: 添加/移除/查看/分享
- [ ] AI 提供商选择 + 可用性检查
- [ ] 压力测试: 快速多次提交 + 幂等性检查
- [ ] 安全流程: 会话过期/重新认证/重试操作
- [ ] 真实数据审计: 创建唯一测试数据/检测 mock 数据
- [ ] 深度链接: 打开带筛选的分享 URL + 加载详情
- [ ] 批量操作: 批量删除
- [ ] 个人资料设置更新 + 语言偏好持久化
- [ ] 响应式布局验证 (桌面/平板/移动端)
- [ ] 可访问性冒烟测试 (纯键盘导航)
- [ ] 性能冒烟测试 (大数据集搜索)
- [ ] AI WebSocket 流式传输 (连接/流/断开)
- [ ] Redis 会话缓存验证
- [ ] 数据清理级联 (用户删除)
- [ ] 表单验证流程
- [ ] 导出后导入完整数据集 + 计数验证
- [ ] 失败处理: 网络中断 + 重试

---

### 2.2 Security & Access Control (6/40 通过)

#### 已完成
- [x] 失败登录尝试处理 (不泄露详情)
- [x] History 行为验证 (场景 5)
- [x] Auth register 行为验证 (场景 6)
- [x] Auth login 行为验证 (场景 10)
- [x] Zodiac monthly horoscope 行为验证 (场景 11)
- [x] History 行为验证 (场景 5)

#### 待完成
- [ ] 访客无法访问 /profile → 重定向 /login
- [ ] 访客无法访问 /history → 重定向 /login
- [ ] 普通用户无法访问 admin 区域 → 403/重定向
- [ ] API /api/bazi/full-analysis 拒绝未认证请求 (401)
- [ ] API /api/tarot/ai-interpret 拒绝未认证请求 (401)
- [ ] API /api/iching/ai-interpret 拒绝未认证请求 (401)
- [ ] API /api/auth/me 拒绝无效/过期 token (401)
- [ ] 会话过期后强制重新登录
- [ ] 登出清除 tokens/session/用户缓存
- [ ] 直接 URL 访问他人记录被阻止
- [ ] 访客角色菜单项隐藏
- [ ] 敏感操作需确认 (删除/AI 请求)
- [ ] 密码重置不泄露邮箱是否存在
- [ ] Ziwei chart (V2) 行为验证 (场景 1, 4)
- [ ] Bazi full analysis 行为验证 (场景 2)
- [ ] Profile 行为验证 (场景 3, 7)
- [ ] Zodiac monthly horoscope 行为验证 (场景 8)
- [ ] Tarot three-card spread 行为验证 (场景 9)
- [ ] Tarot single draw 行为验证 (场景 12)
- [ ] History 行为验证 (场景 13)
- [ ] Zodiac rising sign 行为验证 (场景 14)
- [ ] Zodiac compatibility 行为验证 (场景 15)
- [ ] Auth login 行为验证 (场景 16)
- [ ] Favorites 行为验证 (场景 17+)

---

## 三、P1 优先级任务 (关键功能)

### 3.1 Navigation Integrity (2/40 通过)

#### 待完成
- [ ] 首页卡片链接正确跳转
- [ ] 侧边栏导航所有链接可用
- [ ] 面包屑导航正确显示层级
- [ ] 404 页面正确渲染
- [ ] 返回按钮行为正确
- [ ] Logo 点击返回首页
- [ ] 导航高亮当前页面
- [ ] 移动端汉堡菜单功能
- [ ] 子菜单展开/收起
- [ ] 外部链接新窗口打开

---

### 3.2 Real Data Validation (3/50 通过)

#### 待完成
- [ ] BaZi 计算结果与后端数据一致
- [ ] Tarot 抽牌结果持久化验证
- [ ] I Ching 卦象数据完整性
- [ ] Zodiac 星座数据准确性
- [ ] Ziwei 紫微斗数计算验证
- [ ] 历史记录 CRUD 后数据持久化
- [ ] 收藏夹 CRUD 后数据持久化
- [ ] 用户资料更新后数据持久化
- [ ] AI 解读结果保存验证
- [ ] 导出数据完整性验证

---

### 3.3 Flow Integrity (5/40 通过)

#### 待完成
- [ ] BaZi 完整流程不中断
- [ ] Tarot 完整流程不中断
- [ ] I Ching 完整流程不中断
- [ ] Zodiac 完整流程不中断
- [ ] 注册 → 登录 → 使用功能流程
- [ ] 登录 → 计算 → 保存 → 查看历史流程
- [ ] 多模块切换状态保持

---

### 3.4 UI-Backend Integration (1/35 通过)

#### 待完成
- [ ] 前端表单提交 → 后端 API 响应正确
- [ ] 后端错误 → 前端正确显示
- [ ] Loading 状态正确显示
- [ ] 数据加载后 UI 正确渲染
- [ ] WebSocket 连接状态同步
- [ ] 分页数据正确加载
- [ ] 筛选/排序参数正确传递

---

## 四、P2 优先级任务 (重要功能)

### 4.1 Error Handling (0/25 通过)

- [ ] 网络失败显示友好错误
- [ ] API 500 错误处理
- [ ] API 400 错误处理
- [ ] 表单验证错误显示
- [ ] 超时错误处理
- [ ] 重试机制
- [ ] 错误边界组件

---

### 4.2 URL & Direct Access (0/20 通过)

- [ ] 直接访问 /bazi 正确渲染
- [ ] 直接访问 /tarot 正确渲染
- [ ] 直接访问 /iching 正确渲染
- [ ] 直接访问 /zodiac 正确渲染
- [ ] 直接访问 /history 需登录
- [ ] 直接访问 /favorites 需登录
- [ ] 直接访问 /profile 需登录
- [ ] 带参数 URL 正确解析
- [ ] 无效 URL 显示 404

---

### 4.3 State & Persistence (1/15 通过)

- [ ] 刷新页面状态保持
- [ ] 浏览器后退状态保持
- [ ] localStorage 数据持久化
- [ ] sessionStorage 数据持久化
- [ ] Redux/Context 状态同步

---

### 4.4 Search & Filter Edge Cases (0/20 通过)

- [ ] 空搜索结果显示
- [ ] 特殊字符搜索
- [ ] 中文搜索
- [ ] 日期范围筛选
- [ ] 多条件组合筛选
- [ ] 筛选重置
- [ ] 排序切换

---

### 4.5 Form Validation (0/25 通过)

- [ ] 必填字段验证
- [ ] 邮箱格式验证
- [ ] 密码复杂度验证
- [ ] 日期格式验证
- [ ] 数字范围验证
- [ ] 实时验证反馈
- [ ] 提交时验证

---

### 4.6 Time & Timezone (0/12 通过)

- [ ] 时区切换正确计算
- [ ] 日期显示本地化
- [ ] 真太阳时计算
- [ ] 夏令时处理
- [ ] 历史记录时间显示

---

## 五、P3 优先级任务 (增强功能)

### 5.1 Double Actions & Idempotency (0/15 通过)

- [ ] 双击提交防重
- [ ] 快速多次请求幂等
- [ ] 并发保存冲突处理

---

### 5.2 Data Cleanup & Cascades (0/20 通过)

- [ ] 删除用户级联删除记录
- [ ] 删除记录级联删除收藏
- [ ] 软删除 + 恢复功能
- [ ] 批量删除

---

### 5.3 Defaults & Reset (0/12 通过)

- [ ] 表单默认值正确
- [ ] 重置按钮功能
- [ ] 清空筛选功能

---

### 5.4 Feedback & Notifications (0/15 通过)

- [ ] 操作成功 Toast
- [ ] 操作失败 Toast
- [ ] Loading 指示器
- [ ] 进度条显示

---

### 5.5 Responsive & Layout (0/15 通过)

- [ ] 桌面端布局 (1920px)
- [ ] 平板端布局 (768px)
- [ ] 移动端布局 (375px)
- [ ] 横屏适配

---

### 5.6 Accessibility (5/15 通过)

#### 已完成
- [x] Tab 导航
- [x] 焦点样式可见
- [x] 屏幕阅读器可达主内容
- [x] Skip-to-content 链接
- [x] 基础 ARIA 标签

#### 待完成
- [ ] 颜色对比度
- [ ] 键盘快捷键
- [ ] 表单标签关联
- [ ] 错误提示可访问
- [ ] 图片 alt 文本

---

### 5.7 Concurrency & Race Conditions (0/15 通过)

- [ ] 并发请求处理
- [ ] 竞态条件防护
- [ ] 乐观更新回滚

---

### 5.8 Export/Import (0/10 通过)

- [ ] JSON 导出
- [ ] CSV 导出
- [ ] JSON 导入
- [ ] 导入数据验证
- [ ] 导入冲突处理

---

### 5.9 Performance (0/10 通过)

- [ ] 首屏加载 < 3s
- [ ] API 响应 < 500ms
- [ ] 大列表虚拟滚动
- [ ] 图片懒加载
- [ ] 代码分割

---

## 六、执行建议

### 阶段一: 核心功能修复 (P0)
1. 先提交当前 11 个已修改文件
2. 修复 Core Flows 中的访客流程
3. 完善 Security 访问控制

### 阶段二: 关键功能完善 (P1)
1. Navigation Integrity - 导航完整性
2. Real Data Validation - 数据验证
3. UI-Backend Integration - 前后端集成

### 阶段三: 重要功能补充 (P2)
1. Error Handling - 错误处理
2. Form Validation - 表单验证
3. Search & Filter - 搜索筛选

### 阶段四: 增强功能优化 (P3)
1. Responsive Layout - 响应式布局
2. Performance - 性能优化
3. Accessibility - 可访问性

---

## 七、风险提示

1. **Docker 依赖**: Postgres/Redis 需要 colima 启动
2. **Prisma 迁移**: BaziRecordTrash 模型需要同步
3. **i18n 配置**: fallbackLng 配置可能导致前端崩溃
4. **测试环境**: Playwright 测试需要前后端同时运行

---

*此任务清单由 Claude Code 自动生成，请根据实际情况调整优先级*
