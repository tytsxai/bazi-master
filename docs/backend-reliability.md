# 后端可靠性分析

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
      return () => { inFlight.delete(userId); }; // 释放锁
    },
    has(userId) { return userId ? inFlight.has(userId) : false; },
    size() { return inFlight.size; },
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

#### 1. 存活检查 (`/health`)
```json
{
  "status": "ok",
  "service": "bazi-master-backend",
  "timestamp": "2024-12-26T10:00:00.000Z",
  "uptime": 3600.5
}
```
- **用途**: Kubernetes存活探针，检查服务是否运行
- **频率**: 每30秒检查一次
- **失败标准**: 3次连续失败触发重启

#### 2. 就绪检查 (`/api/ready`)
```json
{
  "status": "ready|not_ready",
  "checks": {
    "db": { "ok": true },
    "redis": { "ok": true }
  },
  "timestamp": "2024-12-26T10:00:00.000Z"
}
```
- **用途**: 负载均衡器健康检查，决定是否路由流量
- **检查项目**:
  - PostgreSQL连接性 (1.5秒超时)
  - Redis连接性 (1秒超时，允许未配置)
- **生产模式**: Redis必须可用，否则not_ready

### 超时配置
```
数据库检查: 1500ms
Redis检查: 1000ms
总检查超时: 3000ms (Promise.race实现)
```

## 故障演练脚本

### 测试场景覆盖

#### 1. Redis故障演练
```bash
# 停止Redis → 检查服务降级 → 重启Redis → 验证恢复
✅ 服务降级到内存会话存储
✅ API仍可响应，但会话不持久化
✅ 健康检查标记为degraded
✅ 就绪检查保持ready（设计选择）
```

#### 2. 数据库故障演练
```bash
# 停止PostgreSQL → 检查服务状态 → 重启数据库 → 验证恢复
✅ 健康检查标记为degraded
✅ 就绪检查返回not_ready（阻止流量）
✅ 认证和数据操作失败但不崩溃
✅ 连接恢复后自动恢复服务
```

#### 3. AI并发控制测试
```bash
# 模拟多个用户同时请求AI服务
✅ 单用户并发请求被阻止
✅ 返回友好错误信息: "AI request already in progress"
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
1. Redis重启 → 连接自动恢复
2. 现有内存会话保持可用
3. 新会话使用Redis存储
4. 无需重启应用服务
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
```
每日全量备份: PostgreSQL pg_dump
实时增量备份: WAL归档
备份存储: 外部对象存储 (S3/兼容)
保留策略: 7天每日备份 + 30天每周备份
```

### 灾难恢复
```
RTO (Recovery Time Objective): 1小时
RPO (Recovery Point Objective): 15分钟
恢复流程: 自动故障转移 + 手动备份恢复
```

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
