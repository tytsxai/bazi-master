import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenApiSpec } from '../services/apiSchema.service.js';
import { app } from '../server.js';

/**
 * OpenAPI 规格是这个项目对外的契约——Agent 靠它决定能调什么、怎么调。
 *
 * 这份测试的重点不是"规格长得对不对"，而是**规格和真实路由表是否还对得上**。
 * 上一版测试逐条断言了 /api/auth/me、/api/bazi/records、/api/favorites 的形状，
 * 结果那些端点被删掉之后测试依然全绿——因为它只问了"文档里有没有"，
 * 没问"代码里还在不在"。绿灯掩护着一份说谎的契约，比没有测试更糟。
 *
 * 所以这里改成遍历 Express 真实挂载的路由，和 spec.paths 做双向比对。
 * 新增端点忘了写文档 -> 失败；删了端点忘了删文档 -> 失败。
 */

// Express 4 把挂载信息放在 app._router.stack。这是私有字段，但它是唯一一个
// "真实挂载了什么"的来源——比任何需要人手同步的清单都可靠。
const layerPattern = (layer) => {
  if (layer.regexp?.fast_slash) return '';
  const source = layer.regexp?.source;
  if (!source) return null;
  // 形如 ^\/api\/?(?=\/|$) —— 取出中间的字面量前缀。
  const match = /^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/.exec(source);
  if (!match) return null;
  return `/${match[1].replace(/\\\//g, '/')}`;
};

const collectRoutes = (stack, prefix = '', found = new Set()) => {
  for (const layer of stack) {
    if (layer.route) {
      const path = `${prefix}${layer.route.path}`.replace(/\/$/, '') || '/';
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) found.add(`${method.toUpperCase()} ${path}`);
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle?.stack) {
      const mounted = layerPattern(layer);
      if (mounted === null) continue;
      collectRoutes(layer.handle.stack, `${prefix}${mounted}`, found);
    }
  }
  return found;
};

// Express 用 :sign，OpenAPI 用 {sign}。
const toOpenApiPath = (expressPath) => expressPath.replace(/:([^/]+)/g, '{$1}');

// 文档页自身不是能力端点，不进契约。
const NOT_CAPABILITIES = new Set(['GET /api-docs.json', 'GET /api-docs']);

const spec = buildOpenApiSpec({ baseUrl: 'http://localhost:4000' });

const documented = new Set(
  Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`)
  )
);

const mounted = new Set(
  Array.from(collectRoutes(app._router.stack))
    .map((entry) => {
      const [method, path] = entry.split(' ');
      return `${method} ${toOpenApiPath(path)}`;
    })
    .filter((entry) => !NOT_CAPABILITIES.has(entry))
);

describe('API Contract', () => {
  describe('规格与真实路由表一致', () => {
    // 这条断言存在的意义是自我校验：如果 Express 换了内部结构导致遍历不到路由，
    // 下面两条比对会因为 mounted 是空集而"全部通过"，静默失效。
    it('能从 Express 里遍历出路由（否则下面的比对形同虚设）', () => {
      assert.ok(mounted.size >= 20, `只遍历到 ${mounted.size} 条路由，遍历逻辑可能已失效`);
      assert.ok(mounted.has('POST /api/bazi/calculate'));
      assert.ok(mounted.has('GET /api/zodiac/{sign}'));
    });

    it('每一个真实端点都写进了文档', () => {
      const undocumented = Array.from(mounted).filter((entry) => !documented.has(entry));
      assert.deepEqual(
        undocumented,
        [],
        `这些端点存在但没写进 OpenAPI：\n  ${undocumented.join('\n  ')}`
      );
    });

    it('文档里没有已经不存在的端点', () => {
      const phantom = Array.from(documented).filter((entry) => !mounted.has(entry));
      assert.deepEqual(
        phantom,
        [],
        `这些端点写在 OpenAPI 里但代码中不存在：\n  ${phantom.join('\n  ')}`
      );
    });
  });

  describe('规格自身完整', () => {
    it('是 OpenAPI 3.0.3 且元信息齐全', () => {
      assert.equal(spec.openapi, '3.0.3');
      assert.ok(spec.info.title);
      assert.ok(spec.info.version);
      assert.ok(spec.info.description);
      assert.equal(spec.servers[0].url, 'http://localhost:4000');
    });

    it('每个操作都有 summary、tags 和 200 响应', () => {
      for (const [path, ops] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(ops)) {
          const label = `${method.toUpperCase()} ${path}`;
          assert.ok(op.summary, `${label} 缺 summary`);
          assert.ok(op.tags?.length, `${label} 缺 tags`);
          assert.ok(op.responses?.['200'], `${label} 缺 200 响应`);
        }
      }
    });

    it('所有 $ref 都指向真实存在的 schema', () => {
      const names = new Set(Object.keys(spec.components.schemas));
      const dangling = [];
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.$ref === 'string') {
          const name = node.$ref.replace('#/components/schemas/', '');
          if (!names.has(name)) dangling.push(node.$ref);
        }
        for (const value of Object.values(node)) walk(value);
      };
      walk(spec);
      assert.deepEqual(dangling, [], `悬空 $ref：${dangling.join(', ')}`);
    });

    // 没有用户系统，就不该有任何端点声称需要用户身份——那会让调用方去找一个不存在的登录流程。
    it('没有任何能力端点要求用户鉴权', () => {
      assert.equal(spec.security, undefined, '不该有全局 security 要求');
      for (const [path, ops] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(ops)) {
          if (!op.security) continue;
          // 只有 /metrics 带凭据，且那是运维端点不是能力端点。
          assert.equal(path, '/metrics', `${method.toUpperCase()} ${path} 不该要求鉴权`);
        }
      }
      assert.equal(spec.components.securitySchemes.bearerAuth, undefined);
    });
  });

  describe('错误响应契约', () => {
    it('Error schema 形状稳定', () => {
      assert.equal(spec.components.schemas.Error.properties.error.type, 'string');
    });

    it('所有 4xx/5xx 响应都用同一个 Error schema', () => {
      for (const [path, ops] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(ops)) {
          for (const [status, response] of Object.entries(op.responses)) {
            if (!/^[45]/.test(status)) continue;
            const schema = response.content?.['application/json']?.schema;
            // /health 的 503 回的是完整健康快照，不是错误信封——那是刻意的。
            if (!schema) continue;
            const ok = schema.$ref?.includes('Error') || schema.$ref?.includes('HealthCheck');
            assert.ok(ok, `${method.toUpperCase()} ${path} 的 ${status} 用了非标准错误结构`);
          }
        }
      }
    });
  });
});
