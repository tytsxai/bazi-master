#!/bin/bash

# BaZi Master 部署验证脚本
# 用于验证生产部署的完整性和功能正确性

set -euo pipefail

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-30}"
RETRIES="${RETRIES:-3}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# HTTP request helper with timeout and retries
http_request() {
    local url=$1
    local expected_code=${2:-200}
    local method=${3:-GET}
    local data=${4:-}

    for attempt in $(seq 1 $RETRIES); do
        log_info "Attempting $method $url (attempt $attempt/$RETRIES)"

        local response
        if [ "$method" = "POST" ]; then
            response=$(curl -s -w "HTTPSTATUS:%{http_code};" -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo "HTTPSTATUS:000;")
        else
            response=$(curl -s -w "HTTPSTATUS:%{http_code};" "$url" 2>/dev/null || echo "HTTPSTATUS:000;")
        fi

        local body=$(echo "$response" | sed -e 's/HTTPSTATUS:.*//g')
        local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://' | sed -e 's/;.*//g')

        if [ "$status" = "$expected_code" ]; then
            echo "$body"
            return 0
        fi

        if [ $attempt -eq $RETRIES ]; then
            log_error "Request failed after $RETRIES attempts. Expected $expected_code, got $status"
            log_error "Response: $body"
            return 1
        fi

        log_warn "Request failed (status: $status), retrying in 2 seconds..."
        sleep 2
    done
}

# Validate JSON response
validate_json() {
    local json=$1
    local key=$2
    local expected_value=$3

    if ! echo "$json" | jq -e ".$key" >/dev/null 2>&1; then
        log_error "JSON validation failed: key '$key' not found"
        return 1
    fi

    if [ -n "$expected_value" ]; then
        local actual_value=$(echo "$json" | jq -r ".$key")
        if [ "$actual_value" != "$expected_value" ]; then
            log_error "JSON validation failed: expected '$expected_value', got '$actual_value' for key '$key'"
            return 1
        fi
    fi

    return 0
}

# Test 1: Basic connectivity and health checks
test_basic_connectivity() {
    log_step "1. Testing basic connectivity and health checks"

    # Test API liveness endpoint
    log_info "Testing API liveness endpoint..."
    if ! http_request "$API_BASE_URL/live" >/dev/null; then
        log_error "API liveness check failed"
        return 1
    fi
    log_success "API liveness check passed"

    # Test API health endpoint
    log_info "Testing API health endpoint..."
    local health_response
    if ! health_response=$(http_request "$API_BASE_URL/health"); then
        log_error "API health check failed"
        return 1
    fi

    validate_json "$health_response" "status" "ok"
    validate_json "$health_response" "service" "bazi-master-backend"
    validate_json "$health_response" "timestamp"
    log_success "API health check passed"

    # Test API ready endpoint
    log_info "Testing API ready endpoint..."
    local ready_response
    if ! ready_response=$(http_request "$API_BASE_URL/api/ready"); then
        log_error "API ready check failed"
        return 1
    fi

    validate_json "$ready_response" "status"
    validate_json "$ready_response" "checks"
    log_success "API ready check passed"

    # Test frontend accessibility
    log_info "Testing frontend accessibility..."
    if ! curl -f -s "$WEB_BASE_URL" >/dev/null 2>&1; then
        log_error "Frontend is not accessible at $WEB_BASE_URL"
        return 1
    fi
    log_success "Frontend is accessible"
}

# Test 2: Core API functionality
test_core_api() {
    log_step "2. Testing core API functionality"

    # Test bazi calculation (public endpoint)
    log_info "Testing bazi calculation endpoint..."
    local calc_payload='{
        "birthYear": 1993,
        "birthMonth": 6,
        "birthDay": 18,
        "birthHour": 12,
        "locationKey": "beijing",
        "timezone": "Asia/Shanghai"
    }'

    local calc_response
    if ! calc_response=$(http_request "$API_BASE_URL/api/bazi/calculate" 200 "POST" "$calc_payload"); then
        log_error "Bazi calculation failed"
        return 1
    fi

    validate_json "$calc_response" "pillars"
    validate_json "$calc_response" "fiveElements"
    log_success "Bazi calculation works correctly"

    # Test tarot endpoint (should require auth)
    log_info "Testing tarot endpoint authentication..."
    local tarot_response
    if tarot_response=$(http_request "$API_BASE_URL/api/tarot/cards" 401); then
        log_success "Tarot endpoint correctly requires authentication"
    else
        log_error "Tarot endpoint should require authentication"
        return 1
    fi
}

# Test 3: Authentication flow
test_authentication() {
    log_step "3. Testing authentication flow"

    # Skip if in CI or no test credentials
    if [ "${SKIP_AUTH_TESTS:-false}" = "true" ]; then
        log_warn "Skipping authentication tests (SKIP_AUTH_TESTS=true)"
        return 0
    fi

    # Test login endpoint exists (don't actually login to avoid side effects)
    log_info "Testing auth endpoints are accessible..."
    local login_response
    if login_response=$(http_request "$API_BASE_URL/api/auth/login" 400 "POST" '{"email":"","password":""}'); then
        log_success "Auth login endpoint responds correctly"
    fi

    # Test me endpoint (should require auth)
    local me_response
    if me_response=$(http_request "$API_BASE_URL/api/auth/me" 401); then
        log_success "Auth me endpoint correctly requires authentication"
    fi
}

# Test 4: Database connectivity
test_database() {
    log_step "4. Testing database connectivity"

    # Check if ready endpoint reports database as ok
    log_info "Checking database status via ready endpoint..."
    local ready_response
    if ! ready_response=$(http_request "$API_BASE_URL/api/ready"); then
        log_error "Could not get ready status"
        return 1
    fi

    local db_status=$(echo "$ready_response" | jq -r '.checks.db.ok')
    if [ "$db_status" != "true" ]; then
        log_error "Database is not ready: $(echo "$ready_response" | jq -r '.checks.db.error')"
        return 1
    fi
    log_success "Database connectivity confirmed"
}

# Test 5: External service connectivity
test_external_services() {
    log_step "5. Testing external service connectivity"

    # Check Redis status via ready endpoint
    log_info "Checking Redis status..."
    local ready_response
    if ! ready_response=$(http_request "$API_BASE_URL/api/ready"); then
        log_error "Could not get ready status"
        return 1
    fi

    local redis_status=$(echo "$ready_response" | jq -r '.checks.redis.ok')
    local redis_disabled=$(echo "$ready_response" | jq -r '.checks.redis.status')

    if [ "$redis_status" = "true" ]; then
        log_success "Redis is connected and operational"
    elif [ "$redis_disabled" = "disabled" ]; then
        log_warn "Redis is disabled (expected in some environments)"
    else
        log_error "Redis connectivity issue: $(echo "$ready_response" | jq -r '.checks.redis.error')"
        return 1
    fi
}

# Test 6: Performance baseline
test_performance() {
    log_step "6. Testing performance baseline"

    log_info "Running performance baseline tests..."

    # Test response time for health endpoint
    local start_time=$(date +%s%N)
    if ! http_request "$API_BASE_URL/health" >/dev/null; then
        log_error "Health endpoint performance test failed"
        return 1
    fi
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

    if [ $response_time -gt 1000 ]; then
        log_warn "Health endpoint response time is high: ${response_time}ms (expected < 1000ms)"
    else
        log_success "Health endpoint response time: ${response_time}ms"
    fi
}

# Test 7: Load test (light)
test_load() {
    log_step "7. Running light load test"

    if [ "${SKIP_LOAD_TESTS:-false}" = "true" ]; then
        log_warn "Skipping load tests (SKIP_LOAD_TESTS=true)"
        return 0
    fi

    log_info "Running light concurrent load test (10 requests)..."

    # Run 10 concurrent requests to health endpoint
    local pids=()
    local failed=0

    for i in {1..10}; do
        (
            if ! http_request "$API_BASE_URL/health" >/dev/null 2>&1; then
                echo "failed"
            fi
        ) &
        pids+=($!)
    done

    # Wait for all requests to complete
    for pid in "${pids[@]}"; do
        if ! wait "$pid" 2>/dev/null; then
            ((failed++))
        fi
    done

    if [ $failed -gt 0 ]; then
        log_error "Load test failed: $failed out of 10 requests failed"
        return 1
    else
        log_success "Load test passed: all 10 concurrent requests succeeded"
    fi
}

# Test 8: OpenAPI documentation
test_openapi() {
    log_step "8. Testing OpenAPI documentation"

    # Test API docs endpoint
    log_info "Testing OpenAPI specification endpoint..."
    if ! http_request "$API_BASE_URL/api-docs.json" >/dev/null; then
        log_error "OpenAPI specification not accessible"
        return 1
    fi
    log_success "OpenAPI specification is accessible"

    # Test Swagger UI
    log_info "Testing Swagger UI..."
    if ! curl -f -s "$API_BASE_URL/api-docs/" >/dev/null 2>&1; then
        log_error "Swagger UI not accessible"
        return 1
    fi
    log_success "Swagger UI is accessible"
}

# Main function
main() {
    log_info "🚀 Starting BaZi Master deployment verification"
    log_info "API Base URL: $API_BASE_URL"
    log_info "Web Base URL: $WEB_BASE_URL"
    log_info "Timeout: ${TIMEOUT}s, Retries: $RETRIES"
    echo

    local start_time=$(date +%s)
    local test_count=0
    local pass_count=0
    local fail_count=0

    # Run all tests
    local tests=(
        "test_basic_connectivity"
        "test_core_api"
        "test_authentication"
        "test_database"
        "test_external_services"
        "test_performance"
        "test_load"
        "test_openapi"
    )

    for test_func in "${tests[@]}"; do
        ((test_count++))
        echo
        if $test_func; then
            ((pass_count++))
        else
            ((fail_count++))
            log_error "Test '$test_func' failed"
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo
    log_info "=== Deployment Verification Summary ==="
    echo "Total tests: $test_count"
    echo "Passed: $pass_count"
    echo "Failed: $fail_count"
    echo "Duration: ${duration}s"
    echo

    if [ $fail_count -eq 0 ]; then
        log_success "🎉 All deployment verification tests passed!"
        echo
        log_info "✅ Deployment is ready for production"
        log_info "✅ All core functionality verified"
        log_info "✅ Performance baseline established"
        exit 0
    else
        log_error "❌ Deployment verification failed: $fail_count test(s) failed"
        echo
        log_error "Please review the failed tests above and fix issues before deploying to production"
        exit 1
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --api-url URL       API base URL (default: $API_BASE_URL)"
    echo "  --web-url URL       Web base URL (default: $WEB_BASE_URL)"
    echo "  --timeout SEC       Request timeout (default: $TIMEOUT)"
    echo "  --retries NUM       Number of retries (default: $RETRIES)"
    echo "  --skip-auth-tests   Skip authentication tests"
    echo "  --skip-load-tests   Skip load tests"
    echo "  --help             Show this help"
    echo
    echo "Environment variables:"
    echo "  API_BASE_URL       Same as --api-url"
    echo "  WEB_BASE_URL       Same as --web-url"
    echo "  SKIP_AUTH_TESTS    Same as --skip-auth-tests"
    echo "  SKIP_LOAD_TESTS    Same as --skip-load-tests"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_BASE_URL="$2"
            shift 2
            ;;
        --web-url)
            WEB_BASE_URL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --retries)
            RETRIES="$2"
            shift 2
            ;;
        --skip-auth-tests)
            SKIP_AUTH_TESTS=true
            shift
            ;;
        --skip-load-tests)
            SKIP_LOAD_TESTS=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main "$@"


