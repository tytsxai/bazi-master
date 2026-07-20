# 后端可靠性分析

> 版本: v0.1.3-dev | 更新: 2025-12-30

## AI并发守卫机制

### 实现原理

```javascript
// lib/concurrency.js
export const createAiGuard = (initial = new Set()) => {
  const inFlight = initial;
  return {
    acquire(userId) {
      if (!userId) return () => {};
      if (inFlight.has(userId)) return null; // 阻止并发
      inFlight.add(userId);
      return () => {
        inFlight.delete(userId);
      }; // 释放锁
    },
    has(userId) {
      return userId ? inFlight.has(userId) : false;
    },
    size() {
      return inFlight.size;
    },
  };
};
```

### 应用场景

- **八字AI解读**: `/api/bazi/ai-interpret`
- **塔罗AI解读**: `/api/tarot/ai-interpret`
- **周易AI解读**: `/api/iching/ai-interpret`

### 并发控制策略

```
用户级别限制: 每个用户同时只能有1个AI请求进行中
超时控制: AI请求有合理的超时时间
错误处理: 并发冲突返回友好错误信息
```

## 健康检查增强

### 检查类型

#### 1. 健康检查 (`/health`, `/api/health`)

```json
{
  "service": "bazi-master-backend",
  "status": "ok|degraded",
  "checks": {
    "db": { "ok": true },
    "redis": { "ok": true | false, "status": "disabled|unavailable" }
  },
  "timestamp": "2024-12-26T10:00:00.000Z",
  "uptime": 3600.5
}
```

- **用途**: 综合健康探测（包含 DB/Redis 依赖）；可用于负载均衡/探针
- **补充**: 现已提供 `GET /live` 作为“纯存活”端点（不依赖 DB/Redis）

#### 2. 就绪检查 (`/api/ready`)

```json
{
  "service": "bazi-master-backend",
  "status": "ready|not_ready",
  "checks": {
    "db": { "ok": true },
    "redis": { "ok": true | false, "status": "disabled|unavailable" }
  },
  "timestamp": "2024-12-26T10:00:00.000Z"
}
```

- **用途**: 负载均衡器健康检查，决定是否路由流量
- **检查项目**:
  - PostgreSQL连接性 (1.5秒超时)
  - Redis连接性 (1秒超时，允许未配置)
- **生产模式**: Redis 在启动阶段必须可用；不可用时服务会退出并拒绝启动

### 超时配置

```
数据库检查: 1500ms
Redis检查: 1000ms
总检查超时: 无单独总超时（分别对 DB/Redis 施加超时）
```

## 故障演练脚本

### 测试场景覆盖

#### 1. Redis故障演练

```bash
# 停止Redis → 检查服务降级 → 重启Redis → 验证恢复
✅ 若 Redis 未配置：健康检查显示 `disabled`，服务使用内存会话/缓存/OAuth state/密码重置（仅适合单实例）
✅ 若 Redis 已配置但不可用：健康检查 `degraded`，就绪检查 `not_ready`
✅ 生产模式下启动阶段 Redis 不可用会直接退出
✅ 故障演练脚本默认使用容器名 `bazi_redis`，可通过 `REDIS_CONTAINER_NAME` 覆盖
```

#### 2. 数据库故障演练

```bash
# 停止PostgreSQL → 检查服务状态 → 重启数据库 → 验证恢复
✅ 健康检查标记为degraded
✅ 就绪检查返回not_ready（阻止流量）
✅ 认证和数据操作失败但不崩溃
✅ 连接恢复后自动恢复服务
✅ 故障演练脚本默认使用容器名 `bazi_postgres`，可通过 `POSTGRES_CONTAINER_NAME` 覆盖
```

#### 3. AI并发控制测试

```bash
# 模拟多个用户同时请求AI服务
✅ 单用户并发请求被阻止
✅ 返回友好错误信息: "AI request already in progress. Please wait."
✅ 防止资源浪费和API滥用
```

#### 4. 高负载测试

```bash
# 发送50个并发健康检查请求
✅ 服务保持响应
✅ 无内存泄漏
✅ 请求队列正常处理
```

### 故障恢复路径

#### Redis故障恢复

```
1. Redis重启 → 连接尝试自动恢复
2. 单实例内存会话可短期保持；多实例生产应依赖 Redis 并让实例从就绪池摘除
3. Redis恢复后会话、OAuth state、密码重置 mirror 继续写入
4. 启动阶段若 Redis 不可用（生产）会直接退出，需要先恢复 Redis 再启动服务
```

#### 数据库故障恢复

```
1. PostgreSQL重启 → 连接池自动重建
2. 未完成的数据库事务安全回滚
3. 应用服务自动恢复数据操作
4. 缓存数据在故障期间丢失（预期行为）
```

## 监控指标

### 应用层指标

```
- HTTP请求率 (per second)
- 响应时间分布 (p50/p95/p99)
- 错误率 (4xx/5xx)
- 活跃连接数
```

### 数据库指标

```
- 连接池使用率 (active/idle/total)
- 慢查询数量 (>100ms)
- 事务回滚率
- 表大小增长趋势
```

### Redis指标

```
- 内存使用率
- 连接数
- 缓存命中率
- 键过期率
```

### AI服务指标

```
- 并发请求队列长度
- AI提供商响应时间
- 超时错误率
- 每日API调用次数
```

## 告警配置

### 严重级别告警

```
🚨 服务不可用 (ready检查失败)
🚨 数据库连接池耗尽 (>90%使用率)
🚨 Redis内存使用过高 (>80%)
🚨 AI并发队列过长 (>10个请求排队)
```

### 警告级别告警

```
⚠️ 响应时间变慢 (p95 > 500ms)
⚠️ 错误率升高 (5xx > 1%)
⚠️ 数据库慢查询增加 (>10个/分钟)
⚠️ Redis连接数异常 (>100个连接)
```

## 容量规划

### 当前基准性能

```
- 健康检查: < 50ms
- 八字计算: < 200ms
- AI解读: 2-10秒 (取决于提供商)
- 并发用户: 100+ (视硬件而定)
```

### 扩展策略

```
水平扩展: 多实例 + 负载均衡
垂直扩展: 增加CPU/内存
缓存优化: Redis集群
数据库优化: 读写分离 + 连接池调优
```

## 备份与恢复

### 数据备份策略

**现状（已实现）：**

```
全量备份: scripts/backup-db.sh —— custom 格式 pg_dump + gzip + .sha256
完整性校验: 备份后立即在容器内跑 pg_restore --list
保留策略: RETENTION_DAYS 控制，默认 7 天
备份存储: 本地 BACKUP_DIR（默认 ./backups）
调度: 无内置调度，需要自己配 cron，见 production-runbook.md
```

**未实现（要做需自行接入）：**

```
WAL 归档 / 实时增量备份 —— 没有任何 archive_command / wal_level 配置
异地备份 —— 备份默认与数据库同宿主，磁盘损坏会一起丢
定期恢复演练 —— 只在备份当下校验可读性，没有周期性恢复验证
```

> 备份和数据库放在同一台机器上，只能防误删，防不了硬件故障。
> 上线前至少把 `BACKUP_DIR` 指向独立卷，并加一步对象存储上传。

### 灾难恢复

目前**没有**自动故障转移：这是单实例 Docker Compose 部署，postgres 挂了就要人工介入。
恢复手段只有一条——从 `scripts/backup-db.sh` 的备份用 `scripts/restore-db.sh` 恢复。

实际的 RPO 取决于你配的 cron 频率（按 runbook 的每日示例就是最坏丢 24 小时，
所以部署前必须额外手动备份一次）。RTO 取决于备份体积和人工响应速度，没有测量过。

> 下面这些数字是**目标**，不是当前能力，在做过恢复演练并测量之前不要写进 SLA：
> RTO 1 小时 / RPO 15 分钟。要达到 RPO 15 分钟必须先上 WAL 归档。

## 安全加固

### 运行时安全

```
- 非root用户运行
- 最小权限原则
- 网络隔离 (防火墙规则)
- 敏感数据加密存储
```

### 监控安全

```
- 告警通知加密
- 日志脱敏处理
- 访问控制 (监控面板认证)
- 审计日志保留
```
