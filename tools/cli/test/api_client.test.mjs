import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from './helpers.mjs';

const BIN = path.join(ROOT, 'tools/cli/bin/bazi.mjs');

/**
 * 异步版的 CLI 调用 —— 这里不能用 helpers 里的 spawnSync 版本。
 *
 * stub 引擎跑在本测试进程里，而 spawnSync 会把 event loop 整个堵死：
 * CLI 子进程发出的请求永远等不到应答，每个用例都会以"超时"收场，
 * 掩盖掉真正要测的映射关系。
 */
const runBazi = (args, { env = {}, timeout = 30_000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: '1', ...env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`bazi ${args.join(' ')} 超过 ${timeout}ms 未退出`));
    }, timeout);
    timer.unref?.();

    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ args, code, stdout, stderr });
    });
  });

const runBaziJson = async (args, options) => {
  const result = await runBazi([...args, '--json'], options);
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `\`bazi ${args.join(' ')} --json\` 的 stdout 不是单个 JSON 文档：${error.message}\n` +
        `--- stdout ---\n${result.stdout.slice(0, 2000)}\n--- stderr ---\n${result.stderr.slice(0, 1000)}`
    );
  }
  return { ...result, payload };
};

/**
 * 能力命令的契约测试。
 *
 * 这里测的是 CLI 最核心的那层翻译：**HTTP 语义 -> 退出码语义**。
 * 引擎回 400 还是 503，对 Agent 来说是两件完全不同的事（改请求 vs 修环境），
 * 而它只应该通过退出码知道这件事。这张映射表破了，调用方要么在参数上
 * 白折腾，要么把一次限流当成永久失败放弃掉。
 *
 * 用 stub 引擎而不是真引擎：这里要覆盖的是 429 / 503 / 500 这些
 * 真引擎在健康状态下根本不会给的响应，只有 stub 能稳定复现。
 */

/** 起一个按固定状态码/响应体应答的 stub 引擎，返回它的 base url。 */
const startStubEngine = async ({ status = 200, body = {}, delayMs = 0 } = {}) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: raw });
      const respond = () => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      if (delayMs > 0) setTimeout(respond, delayMs).unref?.();
      else respond();
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const CALC_ARGS = ['calc', 'bazi', '--birth', '1990-05-20T14:30', '--gender', 'male'];

test('引擎连不上时退 3，并给出把引擎拉起来的命令', async () => {
  // 端口 1 上不可能有服务在听
  const { code, payload } = await runBaziJson(CALC_ARGS, {
    env: { BAZI_API_URL: 'http://127.0.0.1:1' },
  });
  assert.equal(code, 3, '连不上属于环境未就绪');
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'env_not_ready');
  assert.match(payload.next, /stack up/, 'next 必须告诉调用方怎么把引擎起起来');
});

test('HTTP 状态码到退出码的映射', async (t) => {
  const cases = [
    {
      name: '400 参数被拒 -> 4（改请求，不是改环境）',
      status: 400,
      body: { error: 'Invalid input' },
      expectCode: 4,
      expectPayloadCode: 'remote_rejected',
    },
    {
      name: '422 同上 -> 4',
      status: 422,
      body: { error: 'Unprocessable' },
      expectCode: 4,
      expectPayloadCode: 'remote_rejected',
    },
    {
      name: '429 被限流 -> 5（原样重试即可）',
      status: 429,
      body: { error: 'Too many requests' },
      expectCode: 5,
      expectPayloadCode: 'retryable',
    },
    {
      name: '503 引擎未就绪 -> 3（环境问题）',
      status: 503,
      body: { error: 'degraded' },
      expectCode: 3,
      expectPayloadCode: 'env_not_ready',
    },
    {
      name: '500 引擎内部错 -> 1（结果失败，请求本身没问题）',
      status: 500,
      body: { error: 'boom' },
      expectCode: 1,
      expectPayloadCode: 'engine_error',
    },
    {
      name: '404 端点不存在 -> 1，且要能和"参数写错了"区分开',
      status: 404,
      body: { error: 'Not Found' },
      expectCode: 1,
      expectPayloadCode: 'endpoint_missing',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const engine = await startStubEngine({ status: item.status, body: item.body });
      try {
        const { code, payload } = await runBaziJson(CALC_ARGS, {
          env: { BAZI_API_URL: engine.url },
        });
        assert.equal(code, item.expectCode);
        assert.equal(payload.ok, false);
        assert.equal(payload.code, item.expectPayloadCode);
        assert.equal(payload.exit, code, 'payload.exit 必须等于进程退出码');
        assert.equal(typeof payload.next, 'string', '失败必须给出下一步');
      } finally {
        await engine.close();
      }
    });
  }
});

test('成功时 stdout 是单个 JSON 文档，退 0', async () => {
  const engine = await startStubEngine({
    status: 200,
    body: {
      pillars: {
        year: { stem: 'Geng', branch: 'Wu', charStem: '庚', charBranch: '午' },
        month: { stem: 'Xin', branch: 'Si', charStem: '辛', charBranch: '巳' },
        day: { stem: 'Ren', branch: 'Xu', charStem: '壬', charBranch: '戌' },
        hour: { stem: 'Ding', branch: 'Wei', charStem: '丁', charBranch: '未' },
      },
      fiveElements: { Wood: 1, Fire: 3, Earth: 2, Metal: 2, Water: 1 },
    },
  });
  try {
    const { code, payload } = await runBaziJson(CALC_ARGS, { env: { BAZI_API_URL: engine.url } });
    assert.equal(code, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.pillars.day.charStem, '壬');

    assert.equal(engine.requests.length, 1);
    const sent = JSON.parse(engine.requests[0].body);
    assert.equal(engine.requests[0].method, 'POST');
    assert.equal(sent.birthYear, 1990);
    assert.equal(sent.birthHour, 14);
    assert.equal(sent.birthMinute, 30);
    assert.equal(sent.gender, 'male');
  } finally {
    await engine.close();
  }
});

test('超时退 5 而不是 3 —— 引擎在跑，只是这次慢了', async () => {
  const engine = await startStubEngine({ status: 200, body: {}, delayMs: 2000 });
  try {
    const { code, payload } = await runBaziJson([...CALC_ARGS, '--timeout', '150'], {
      env: { BAZI_API_URL: engine.url },
    });
    assert.equal(code, 5);
    assert.equal(payload.code, 'retryable');
  } finally {
    await engine.close();
  }
});

test('--dry-run 不发请求，只回显解析结果', async () => {
  const engine = await startStubEngine({ status: 500, body: { error: 'should not be called' } });
  try {
    const { code, payload } = await runBaziJson([...CALC_ARGS, '--dry-run'], {
      env: { BAZI_API_URL: engine.url },
    });
    assert.equal(code, 0);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.wouldRequest.method, 'POST');
    assert.equal(engine.requests.length, 0, 'dry-run 绝不能真的发出请求');
  } finally {
    await engine.close();
  }
});

test('出生时刻缺时辰要当场拒绝，不能默认补 00:00', async () => {
  // 补 00:00 会算出一张完全不同的盘，而且不报错 —— 这是最危险的那类"成功"。
  const { code, payload } = await runBaziJson([
    'calc',
    'bazi',
    '--birth',
    '1990-05-20',
    '--gender',
    'male',
  ]);
  assert.equal(code, 2);
  assert.equal(payload.code, 'usage');
  assert.match(payload.next, /YYYY-MM-DDTHH:mm/);
});

test('起卦命令同样遵守这套契约', async () => {
  const engine = await startStubEngine({
    status: 200,
    body: { hexagram: { name: 'Qian' }, changingLines: [3], method: 'number' },
  });
  try {
    const { code, payload } = await runBaziJson(['cast', 'iching', '--numbers', '7,8,9'], {
      env: { BAZI_API_URL: engine.url },
    });
    assert.equal(code, 0);
    assert.equal(payload.data.hexagram.name, 'Qian');
    const sent = JSON.parse(engine.requests[0].body);
    assert.deepEqual(sent.numbers, [7, 8, 9]);
  } finally {
    await engine.close();
  }
});

test('文本模式与 json 模式的退出码一致', async () => {
  const engine = await startStubEngine({ status: 400, body: { error: 'Invalid input' } });
  try {
    const text = await runBazi(CALC_ARGS, { env: { BAZI_API_URL: engine.url } });
    const json = await runBazi([...CALC_ARGS, '--json'], { env: { BAZI_API_URL: engine.url } });
    assert.equal(text.code, 4);
    assert.equal(json.code, text.code);
  } finally {
    await engine.close();
  }
});
