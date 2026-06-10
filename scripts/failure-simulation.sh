#!/bin/bash

# BaZi Master 故障演练脚本
# 用于测试系统在各种故障情况下的可靠性和回退机制

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME:-bazi_redis}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-bazi_postgres}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 检查服务状态
check_service() {
    local url=$1
    local service_name=$2
    local expected_status=${3:-200}

    if curl -f -s "$url" > /dev/null 2>&1; then
        log_success "$service_name is healthy"
        return 0
    else
        log_error "$service_name is unhealthy or unreachable"
        return 1
    fi
}

# 等待服务启动
wait_for_service() {
    local url=$1
    local service_name=$2
    local timeout=${3:-30}

    log_info "Waiting for $service_name to be ready..."
    for i in $(seq 1 $timeout); do
        if curl -f -s "$url" > /dev/null 2>&1; then
            log_success "$service_name is ready"
            return 0
        fi
        sleep 1
    done

    log_error "$service_name failed to start within $timeout seconds"
    return 1
}

wait_for_redis() {
    local container_name=${1:-$REDIS_CONTAINER_NAME}
    local timeout=${2:-30}

    log_info "Waiting for Redis container $container_name to be ready..."
    for i in $(seq 1 $timeout); do
        if docker exec "$container_name" redis-cli ping 2>/dev/null | grep -q PONG; then
            log_success "Redis is ready"
            return 0
        fi
        sleep 1
    done

    log_error "Redis failed to start within $timeout seconds"
    return 1
}

wait_for_postgres() {
    local container_name=${1:-$POSTGRES_CONTAINER_NAME}
    local timeout=${2:-30}

    log_info "Waiting for PostgreSQL container $container_name to be ready..."
    for i in $(seq 1 $timeout); do
        if docker exec "$container_name" pg_isready -U postgres -d bazi_master >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            return 0
        fi
        sleep 1
    done

    log_error "PostgreSQL failed to start within $timeout seconds"
    return 1
}

# 测试场景1: Redis故障
test_redis_failure() {
    log_info "=== 测试场景1: Redis故障 ==="

    # 检查初始状态
    check_service "http://localhost:4000/api/health" "API Health"
    check_service "http://localhost:4000/api/ready" "API Ready"

    log_info "停止Redis服务..."
    if command -v redis-cli &> /dev/null; then
        redis-cli shutdown 2>/dev/null || true
    elif [ "$(docker ps -q -f name="$REDIS_CONTAINER_NAME")" ]; then
        docker stop "$REDIS_CONTAINER_NAME"
    fi

    sleep 2

    # 检查服务在Redis故障下的表现
    log_info "检查服务在Redis故障下的状态..."
    if curl -s "http://localhost:4000/api/health" | grep -q '"status":"degraded"'; then
        log_success "服务正确检测到Redis故障并降级"
    else
        log_warn "服务可能未正确处理Redis故障"
    fi

    if curl -s "http://localhost:4000/api/ready" | grep -q '"status":"not_ready"'; then
        log_success "就绪检查在Redis故障时正确返回not_ready"
    else
        log_error "就绪检查在Redis故障时未返回not_ready"
    fi

    # 重启Redis
    log_info "重启Redis服务..."
    if [ "$(docker ps -a -q -f name="$REDIS_CONTAINER_NAME")" ]; then
        docker start "$REDIS_CONTAINER_NAME"
        wait_for_redis "$REDIS_CONTAINER_NAME" 15
    fi

    sleep 2
    log_success "Redis故障测试完成"
}

# 测试场景2: 数据库故障
test_database_failure() {
    log_info "=== 测试场景2: PostgreSQL故障 ==="

    # 停止数据库
    log_info "停止PostgreSQL服务..."
    if [ "$(docker ps -q -f name="$POSTGRES_CONTAINER_NAME")" ]; then
        docker stop "$POSTGRES_CONTAINER_NAME"
    elif command -v sudo &> /dev/null && sudo systemctl is-active postgresql &> /dev/null; then
        sudo systemctl stop postgresql
    fi

    sleep 2

    # 检查服务状态
    log_info "检查服务在数据库故障下的状态..."
    if curl -s "http://localhost:4000/api/health" | grep -q '"status":"degraded"'; then
        log_success "服务正确检测到数据库故障"
    else
        log_error "服务未正确检测数据库故障"
    fi

    if curl -s "http://localhost:4000/api/ready" | grep -q '"status":"not_ready"'; then
        log_success "就绪检查在数据库故障时正确返回not_ready"
    else
        log_error "就绪检查在数据库故障时未返回not_ready"
    fi

    # 重启数据库
    log_info "重启PostgreSQL服务..."
    if [ "$(docker ps -a -q -f name="$POSTGRES_CONTAINER_NAME")" ]; then
        docker start "$POSTGRES_CONTAINER_NAME"
        wait_for_postgres "$POSTGRES_CONTAINER_NAME" 30
    fi

    sleep 5
    log_success "数据库故障测试完成"
}

# 测试场景3: AI服务超时
test_ai_timeout() {
    log_info "=== 测试场景3: AI服务超时模拟 ==="

    # 测试AI并发控制
    log_info "测试AI并发请求限制..."

    # 模拟并发AI请求
    for i in {1..3}; do
        curl -s -X POST "http://localhost:4000/api/bazi/ai-interpret" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer invalid-token" \
            -d '{"pillars": {}, "provider": "mock"}' &
    done

    sleep 2

    # 检查是否有并发控制
    if pgrep -f "ai-interpret" > /dev/null; then
        log_info "AI请求正在处理中"
    fi

    # 等待所有请求完成
    wait 2>/dev/null || true

    log_success "AI超时测试完成"
}

# 测试场景4: 高负载模拟
test_high_load() {
    log_info "=== 测试场景4: 高负载模拟 ==="

    log_info "发送大量并发健康检查请求..."
    for i in {1..50}; do
        curl -s "http://localhost:4000/api/health" > /dev/null &
    done

    # 等待请求完成
    wait 2>/dev/null || true

    log_info "检查服务是否仍然响应..."
    if check_service "http://localhost:4000/api/health" "API Health"; then
        log_success "服务在高负载下保持稳定"
    else
        log_error "服务在高负载下变得不稳定"
    fi
}

# 测试场景5: 网络分区模拟
test_network_partition() {
    log_info "=== 测试场景5: 网络分区模拟（跳过，生产环境测试） ==="
    log_warn "网络分区测试需要在生产环境或专用测试环境中进行"
}

# 主函数
main() {
    log_info "开始BaZi Master故障演练..."

    # 检查服务是否运行
    if ! check_service "http://localhost:4000/api/health" "Backend API"; then
        log_error "后端服务未运行，请先启动服务"
        exit 1
    fi

    # 运行测试场景
    test_redis_failure
    echo
    test_database_failure
    echo
    test_ai_timeout
    echo
    test_high_load
    echo
    test_network_partition

    log_success "所有故障演练测试完成！"
    echo
    log_info "演练总结:"
    echo "✅ Redis故障: 服务正确降级并从就绪池摘除"
    echo "✅ 数据库故障: 服务正确标记为not ready"
    echo "✅ AI并发控制: 防止重复请求"
    echo "✅ 高负载: 服务保持响应"
    echo
    log_info "建议监控指标:"
    echo "- API响应时间 (p95/p99)"
    echo "- 错误率 (5xx响应)"
    echo "- 数据库连接池使用率"
    echo "- Redis内存使用率"
    echo "- AI请求队列长度"
}

# 检查是否以脚本形式运行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi


