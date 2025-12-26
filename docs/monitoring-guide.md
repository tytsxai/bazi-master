# 运维监控指南

## 监控指标体系

### 应用性能指标 (APM)

#### HTTP请求指标
```
请求量 (RPM - Requests per Minute)
├── 总请求数: rate(http_requests_total[5m])
├── 按端点: rate(http_requests_total{endpoint="/api/*"}[5m])
└── 按方法: rate(http_requests_total{method="POST"}[5m])

响应时间 (Latency)
├── p50: histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))
├── p95: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
└── p99: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

错误率 (Error Rate)
├── 4xx错误: rate(http_requests_total{status=~"4.."}[5m]) / rate(http_requests_total[5m])
├── 5xx错误: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
└── 总体错误率: 错误请求 / 总请求数
```

#### 业务指标
```
用户活跃度
├── 每日活跃用户 (DAU)
├── 注册用户数
└── 会话持续时间

功能使用统计
├── 八字计算次数
├── AI解读请求数
├── 收藏操作次数
└── 历史记录查询数
```

### 基础设施指标

#### 系统资源
```
CPU使用率
├── 用户态: rate(cpu_usage_seconds_total{mode="user"}[5m])
├── 系统态: rate(cpu_usage_seconds_total{mode="system"}[5m])
└── 空闲率: rate(cpu_usage_seconds_total{mode="idle"}[5m])

内存使用
├── 已用内存: process_resident_memory_bytes
├── 堆内存: nodejs_heap_size_used_bytes
└── 外部内存: nodejs_external_memory_bytes

磁盘I/O
├── 读取速率: rate(disk_io_bytes_total{direction="read"}[5m])
├── 写入速率: rate(disk_io_bytes_total{direction="write"}[5m])
└── I/O等待时间: rate(disk_io_time_seconds_total[5m])
```

#### 网络指标
```
连接数
├── 活跃连接: net_conntrack_dialer_conn_established
├── 等待连接: net_conntrack_dialer_conn_attempted
└── 失败连接: net_conntrack_dialer_conn_failed_total

带宽使用
├── 入站流量: rate(net_bytes_total{direction="receive"}[5m])
├── 出站流量: rate(net_bytes_total{direction="transmit"}[5m])
└── 连接延迟: histogram_quantile(0.95, rate(net_conn_duration_seconds_bucket[5m]))
```

### 数据库指标

#### PostgreSQL监控
```
连接池状态
├── 活跃连接: pg_stat_activity_count{state="active"}
├── 空闲连接: pg_stat_activity_count{state="idle"}
├── 等待连接: pg_stat_activity_count{state="waiting"}
└── 连接池利用率: 活跃连接 / 最大连接数

查询性能
├── 慢查询数量: rate(pg_stat_statements_total{query_time>1000}[5m])
├── 平均查询时间: rate(pg_stat_statements_sum{query_time}[5m]) / rate(pg_stat_statements_count[5m])
└── 查询缓存命中率: pg_stat_database_blks_hit / (pg_stat_database_blks_hit + pg_stat_database_blks_read)

存储使用
├── 数据库大小: pg_database_size_bytes
├── 表大小: pg_table_size_bytes
├── 索引大小: pg_indexes_size_bytes
└── WAL大小: pg_wal_size_bytes
```

#### Redis监控
```
内存使用
├── 已用内存: redis_memory_used_bytes
├── 内存峰值: redis_memory_used_peak_bytes
├── 内存碎片率: redis_memory_fragmentation_ratio
└── 驱逐键数量: redis_evicted_keys_total

连接状态
├── 连接数: redis_connected_clients
├── 阻塞客户端: redis_blocked_clients
└── 连接峰值: redis_client_recent_max_input_buffer

缓存性能
├── 命中率: redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total)
├── 键空间大小: redis_db_keys
└── 过期键: rate(redis_expired_keys_total[5m])
```

### AI服务指标

#### 请求统计
```
并发控制
├── 活跃AI请求: ai_requests_in_flight
├── 队列长度: ai_requests_queued_total
└── 拒绝请求: ai_requests_rejected_total{reason="concurrency_limit"}

提供商性能
├── OpenAI响应时间: histogram_quantile(0.95, rate(openai_request_duration_seconds_bucket[5m]))
├── Anthropic响应时间: histogram_quantile(0.95, rate(anthropic_request_duration_seconds_bucket[5m]))
└── 提供商切换次数: rate(ai_provider_switches_total[5m])

错误统计
├── 超时错误: rate(ai_requests_total{status="timeout"}[5m])
├── API限制错误: rate(ai_requests_total{status="rate_limit"}[5m])
└── 内容过滤: rate(ai_requests_total{status="content_filter"}[5m])
```

## 监控工具栈

### 指标收集
```
Prometheus (时序数据库)
├── Node.js应用: prom-client库
├── 系统指标: node-exporter
├── PostgreSQL: postgres-exporter
└── Redis: redis-exporter
```

### 可视化
```
Grafana仪表板
├── 应用性能面板
├── 基础设施面板
├── 业务指标面板
└── 告警面板
```

### 日志聚合
```
ELK Stack
├── Elasticsearch: 日志存储
├── Logstash: 日志处理
├── Kibana: 日志可视化
└── Filebeat: 日志收集
```

### 分布式追踪
```
Jaeger/OpenTelemetry
├── 请求追踪
├── 服务依赖图
├── 性能瓶颈分析
└── 错误追踪
```

## 告警规则

### 严重告警 (P0 - 立即响应)
```
🚨 服务不可用
├── 条件: up{job="bazi-master"} == 0 for 1m
└── 响应: 立即调查，必要时回滚

🚨 高错误率
├── 条件: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.1
└── 响应: 检查应用日志，分析错误原因

🚨 数据库连接池耗尽
├── 条件: pg_stat_activity_count{state="active"} / pg_settings_max_connections > 0.9
└── 响应: 增加连接池大小或扩展数据库

🚨 内存不足
├── 条件: (1 - rate(node_memory_MemAvailable_bytes[5m]) / node_memory_MemTotal_bytes) > 0.9
└── 响应: 增加内存或优化应用内存使用
```

### 重要告警 (P1 - 1小时内响应)
```
⚠️ 响应时间变慢
├── 条件: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2.0
└── 响应: 检查慢查询，优化代码

⚠️ 磁盘空间不足
├── 条件: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
└── 响应: 清理磁盘或扩展存储

⚠️ Redis内存使用过高
├── 条件: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
└── 响应: 增加Redis内存或优化缓存策略
```

### 一般告警 (P2 - 工作时间内响应)
```
📢 缓存命中率降低
├── 条件: redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) < 0.8
└── 响应: 调整缓存策略，检查热键分布

📢 AI并发队列过长
├── 条件: ai_requests_queued_total > 10
└── 响应: 增加AI服务实例或调整并发限制
```

## 容量规划

### 资源规划
```
CPU规划
├── 当前使用率: 60%
├── 峰值容量: 80%
└── 规划容量: 扩展到2倍实例

内存规划
├── 当前使用: 2GB
├── 峰值使用: 4GB
└── 规划容量: 8GB (考虑缓存增长)

存储规划
├── 日志保留: 30天
├── 数据库增长: 每月10%
└── 备份存储: 3倍数据大小
```

### 自动扩展规则
```
水平扩展触发条件
├── CPU使用率 > 70% for 10m
├── 内存使用率 > 80% for 5m
├── 请求队列长度 > 100
└── 响应时间p95 > 1s

缩容条件
├── CPU使用率 < 30% for 30m
├── 内存使用率 < 50% for 30m
└── 请求量降低50%
```

## 备份策略

### 数据库备份
```
全量备份
├── 频率: 每日凌晨2:00
├── 保留: 7天本地 + 30天远程
├── 工具: pg_dump --format=custom
└── 验证: 每周恢复测试

增量备份 (WAL)
├── 频率: 实时
├── 保留: 7天
├── 工具: archive_command
└── 恢复点: 任意时间点恢复
```

### 应用备份
```
配置文件备份
├── 频率: 每次部署
├── 位置: Git + 对象存储
└── 内容: .env.production, nginx.conf

日志备份
├── 频率: 每日
├── 保留: 90天
├── 压缩: gzip
└── 存储: 对象存储
```

### 备份验证
```
自动化测试
├── 每日恢复测试
├── 完整性检查: pg_dump --format=custom | pg_restore --list
├── 性能测试: 恢复后运行基准测试
└── 报告生成: 自动发送验证结果
```

## 部署验证

### 冒烟测试 (Smoke Tests)
```bash
# 部署后立即执行
✅ 健康检查通过: curl -f https://api.domain.com/health
✅ 就绪检查通过: curl -f https://api.domain.com/api/ready
✅ 前端页面加载: curl -f https://domain.com | grep "BaZi Master"
✅ 数据库连接: PGPASSWORD=xxx psql -h db -U user -d db -c "SELECT 1"
✅ Redis连接: redis-cli -h redis ping
```

### 功能测试
```bash
# 核心功能验证
✅ 用户注册: 创建测试用户
✅ 八字计算: 提交测试数据
✅ AI解读: 请求AI服务 (mock模式)
✅ 数据持久化: 验证记录保存
✅ 会话管理: 登录/登出流程
```

### 性能测试
```bash
# 负载测试
✅ 并发请求: ab -n 1000 -c 10 https://api.domain.com/api/health
✅ 内存泄漏: 监控内存使用1小时
✅ 数据库压力: 模拟100并发用户
✅ 缓存性能: 验证Redis命中率
```

### 回滚计划
```
快速回滚
├── 蓝绿部署: 切换到上一版本
├── 金丝雀部署: 逐步回滚流量
└── 数据库回滚: PITR (Point-in-Time Recovery)

应急回滚
├── 部署失败: 自动回滚到上一个稳定版本
├── 性能问题: 手动触发回滚，通知团队
└── 数据问题: 停止服务，恢复备份
```

## 故障排查清单

### 服务启动失败
```
1. 检查环境变量配置
2. 验证数据库连接
3. 确认Redis可用性
4. 查看应用日志
5. 检查端口占用
```

### 高CPU使用率
```
1. 分析线程堆栈 (kill -3 PID)
2. 检查内存泄漏
3. 分析慢查询
4. 审查代码热点
5. 考虑增加实例
```

### 数据库连接问题
```
1. 检查连接池配置
2. 验证网络连接
3. 查看数据库日志
4. 监控连接数限制
5. 考虑连接池调优
```

### 缓存性能问题
```
1. 检查Redis内存使用
2. 分析缓存命中率
3. 审查缓存键分布
4. 调整TTL策略
5. 考虑集群扩展
```

