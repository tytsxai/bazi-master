/**
 * OpenAPI 规格。这份文档就是能力层对外的契约——Agent 拿它来决定"能调什么、怎么调"，
 * 所以它写错的代价和代码写错一样大。
 *
 * 这里刻意不做任何注解式生成：路由是手写的 Express，注解会漂。约束改由测试保证——
 * `test/api-contract.test.js` 会遍历真实挂载的路由表，和这里的 paths 双向比对，
 * 少写一个端点或多留一个已删端点都会当场失败。改路由时不用记得回来改文档，测试会提醒你。
 */

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const json = (schema, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

const errorResponse = (description) => json(ref('Error'), description);

// 每个 AI 端点都共享同一组失败语义，重复写 5 遍必然会写歪一处。
const AI_RESPONSES = {
  200: json(ref('AiContent'), 'AI 解读文本（Markdown）'),
  400: errorResponse('入参缺失，或指定了不可用的 provider'),
  429: errorResponse('同一调用方已有一个 AI 请求在处理中'),
  503: errorResponse('上游 AI 供应商不可用'),
};

const BIRTH_PROPS = {
  birthYear: { type: 'integer', minimum: 1, maximum: 9999, example: 1990 },
  birthMonth: { type: 'integer', minimum: 1, maximum: 12, example: 5 },
  birthDay: { type: 'integer', minimum: 1, maximum: 31, example: 20 },
  birthHour: { type: 'integer', minimum: 0, maximum: 23, example: 14 },
  birthMinute: { type: 'integer', minimum: 0, maximum: 59, default: 0 },
  gender: { type: 'string', enum: ['male', 'female'], example: 'male' },
};

export const buildOpenApiSpec = ({ baseUrl } = {}) => ({
  openapi: '3.0.3',
  info: {
    title: 'BaZi Master API',
    version: '2.0.0',
    description: [
      '八字 / 紫微斗数 / 塔罗 / 周易 / 星座 / 合盘的算法能力层。',
      '',
      '**无状态**：不存数据、不认用户、没有数据库。同样的入参永远得到同样的结果，',
      '可以随意水平扩容，也不需要迁移或备份。',
      '',
      '**无鉴权**：所有端点都是公开的，靠限流而不是身份来控制成本。',
      '需要访问控制请放在反向代理层。唯一带凭据的是 `/api-docs`（Basic）和 `/metrics`（Bearer），',
      '它们都不是能力端点。',
      '',
      '`/ai-interpret` 这类端点会调用外部大模型，是唯一有副作用（花钱、可能超时）的一类；',
      '排盘类端点纯本地计算。',
    ].join('\n'),
  },
  servers: [{ url: baseUrl || 'http://localhost:4000', description: 'API 服务器' }],
  components: {
    securitySchemes: {
      // 只用于 /metrics。能力端点不需要任何凭据。
      metricsToken: { type: 'http', scheme: 'bearer' },
      docsBasic: { type: 'http', scheme: 'basic' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string', description: '错误信息' } },
      },
      DependencyCheck: {
        type: 'object',
        description: '单个依赖的探测结果。',
        properties: {
          ok: { type: 'boolean' },
          status: { type: 'string', enum: ['disabled', 'unavailable'] },
          error: { type: 'string' },
        },
      },
      HealthCheck: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          status: {
            type: 'string',
            enum: ['ok', 'degraded', 'ready', 'not_ready', 'shutting_down'],
          },
          checks: {
            type: 'object',
            description:
              '依赖名 -> 状态。目前只有 redis，且它是可选的：没配 REDIS_URL 时为 disabled，视为健康。',
            additionalProperties: ref('DependencyCheck'),
          },
          timestamp: { type: 'string', format: 'date-time' },
          uptime: { type: 'number', description: '运行时间（秒）' },
        },
      },
      AliveCheck: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          status: { type: 'string', enum: ['alive'] },
          timestamp: { type: 'string', format: 'date-time' },
          uptime: { type: 'number' },
        },
      },
      Pillar: {
        type: 'object',
        description: '一柱：天干 + 地支，各带五行属性与汉字。',
        properties: {
          stem: { type: 'string', example: 'Geng' },
          branch: { type: 'string', example: 'Wu' },
          elementStem: { type: 'string', example: 'Metal' },
          elementBranch: { type: 'string', example: 'Fire' },
          charStem: { type: 'string', example: '庚' },
          charBranch: { type: 'string', example: '午' },
        },
      },
      Pillars: {
        type: 'object',
        properties: {
          year: ref('Pillar'),
          month: ref('Pillar'),
          day: ref('Pillar'),
          hour: ref('Pillar'),
        },
      },
      TrueSolarTime: {
        type: 'object',
        nullable: true,
        description:
          '真太阳时校正结果。只有同时解析出经度（来自 birthLocation）和时区偏移时才会生成；' +
          '否则整个字段为 null —— 不会静默按 0 处理。',
        properties: {
          applied: { type: 'boolean' },
          correctionMinutes: { type: 'number', description: '相对钟表时间的偏移分钟数' },
          correctedIso: { type: 'string', format: 'date-time', nullable: true },
          location: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
          },
        },
      },
      BaziCalculationRequest: {
        type: 'object',
        required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'gender'],
        properties: {
          ...BIRTH_PROPS,
          birthLocation: {
            type: 'string',
            description:
              '地名或 "纬度,经度" 坐标串。认得的地名见 GET /api/locations；' +
              '解析不出经度时不做真太阳时校正，但排盘照常返回。',
            example: 'Beijing',
          },
          timezone: { type: 'string', example: 'Asia/Shanghai' },
          timezoneOffsetMinutes: {
            type: 'integer',
            description: '给了就优先于 timezone，用于无法解析 IANA 时区名的调用方。',
          },
        },
      },
      BaziCalculation: {
        type: 'object',
        properties: {
          pillars: ref('Pillars'),
          fiveElements: {
            type: 'object',
            description: '五行计数。',
            additionalProperties: { type: 'integer' },
          },
          fiveElementsPercent: {
            type: 'object',
            additionalProperties: { type: 'integer' },
          },
          tenGods: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, strength: { type: 'number' } },
            },
          },
          luckCycles: { type: 'array', items: { type: 'object' } },
          strength: { type: 'object' },
          timezoneOffsetMinutes: { type: 'integer', nullable: true },
          trueSolarTime: ref('TrueSolarTime'),
        },
      },
      AiContent: {
        type: 'object',
        properties: { content: { type: 'string', description: 'Markdown 文本' } },
      },
      AiInterpretRequestBase: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: '覆盖默认供应商。可用值见 GET /api/ai/providers；不可用会返回 400。',
            enum: ['openai', 'anthropic', 'mock'],
          },
        },
      },
      Location: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Beijing' },
          latitude: { type: 'number', example: 39.9042 },
          longitude: { type: 'number', example: 116.4074 },
        },
      },
      TarotCard: {
        type: 'object',
        properties: {
          position: { type: 'integer' },
          name: { type: 'string' },
          isReversed: { type: 'boolean' },
          meaningUp: { type: 'string' },
          meaningRev: { type: 'string' },
          positionLabel: { type: 'string' },
          positionMeaning: { type: 'string' },
        },
      },
      Hexagram: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          number: { type: 'integer' },
          upperTrigram: { type: 'object' },
          lowerTrigram: { type: 'object' },
        },
      },
      ZodiacSign: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'leo' },
          value: { type: 'string', example: 'leo' },
          name: { type: 'string' },
          dateRange: { type: 'string' },
        },
      },
    },
  },
  paths: {
    // ---------------------------------------------------------------- 运维探针
    '/live': {
      get: {
        tags: ['运维'],
        summary: '存活探针（只看进程）',
        description: '不探任何依赖，进程能应答就返回 200。给 orchestrator 的 livenessProbe 用。',
        responses: { 200: json(ref('AliveCheck')) },
      },
    },
    '/health': {
      get: {
        tags: ['运维'],
        summary: '健康检查（含依赖）',
        description:
          '结果在生产环境有 1 秒缓存，所以高频轮询不会打穿依赖。' +
          '引擎无状态，唯一依赖 Redis 又是可选的，因此没配 Redis 时本端点与 /live 结论一致。',
        responses: {
          200: json(ref('HealthCheck')),
          503: json(ref('HealthCheck'), '依赖不可用，或进程正在优雅退出'),
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['运维'],
        summary: 'Prometheus 抓取端点',
        description:
          '未配置 METRICS_TOKEN 时：生产环境返回 404（视为未暴露），非生产环境免鉴权开放。',
        security: [{ metricsToken: [] }],
        responses: {
          200: {
            description: 'Prometheus 文本格式',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
          401: errorResponse('token 不匹配'),
          404: errorResponse('生产环境未配置 METRICS_TOKEN'),
        },
      },
    },
    '/api/live': {
      get: {
        tags: ['运维'],
        summary: '存活探针（/live 的 /api 前缀别名）',
        responses: { 200: json(ref('AliveCheck')) },
      },
    },
    '/api/health': {
      get: {
        tags: ['运维'],
        summary: '健康检查（/health 的 /api 前缀别名）',
        responses: { 200: json(ref('HealthCheck')), 503: json(ref('HealthCheck'), '不健康') },
      },
    },
    '/api/ready': {
      get: {
        tags: ['运维'],
        summary: '就绪探针',
        description:
          '收到 SIGTERM 后立刻转 503（早于停止监听），让负载均衡在进程还能处理存量请求时先摘掉它。',
        responses: {
          200: json(ref('HealthCheck')),
          503: json(ref('HealthCheck'), '未就绪或正在排空'),
        },
      },
    },
    '/api/system/cache-status': {
      get: {
        tags: ['运维'],
        summary: '缓存状态',
        description: '排盘缓存是否挂上了 Redis 镜像。没挂不影响正确性，只影响多实例命中率。',
        responses: {
          200: json({
            type: 'object',
            properties: {
              redis: ref('DependencyCheck'),
              baziCache: {
                type: 'object',
                properties: { mirror: { type: 'boolean' } },
              },
            },
          }),
        },
      },
    },
    '/api/ai/providers': {
      get: {
        tags: ['AI'],
        summary: '可用的 AI 供应商',
        description: '未配置 API key 的供应商 enabled 为 false，选它会被 400 拒绝。',
        responses: {
          200: json({
            type: 'object',
            properties: {
              activeProvider: { type: 'string' },
              providers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, enabled: { type: 'boolean' } },
                },
              },
            },
          }),
        },
      },
    },

    // ---------------------------------------------------------------- 八字
    '/api/bazi/calculate': {
      post: {
        tags: ['八字'],
        summary: '八字排盘',
        description:
          '纯计算。命中缓存时响应头 `x-bazi-cache: hit`，否则 `miss`——缓存只影响延迟，不影响结果。',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: ref('BaziCalculationRequest') } },
        },
        responses: {
          200: json(ref('BaziCalculation')),
          400: errorResponse('入参非法（含非法日期、纯空白字符串）'),
          500: errorResponse('计算失败'),
        },
      },
    },
    '/api/bazi/ai-interpret': {
      post: {
        tags: ['八字', 'AI'],
        summary: '八字 AI 解读',
        description:
          '接收 /api/bazi/calculate 的输出，返回解读文本。同一调用方同时只允许一个 AI 请求。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  ref('AiInterpretRequestBase'),
                  {
                    type: 'object',
                    required: ['pillars'],
                    properties: {
                      pillars: ref('Pillars'),
                      fiveElements: { type: 'object' },
                      tenGods: { type: 'array', items: { type: 'object' } },
                      luckCycles: { type: 'array', items: { type: 'object' } },
                      strength: { type: 'object' },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: AI_RESPONSES,
      },
    },
    '/api/bazi/full-analysis': {
      post: {
        tags: ['八字', 'AI'],
        summary: '八字排盘 + AI 解读（一次调用）',
        description: 'calculate 与 ai-interpret 的合并调用，省一个来回。入参同 calculate。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [ref('AiInterpretRequestBase'), ref('BaziCalculationRequest')],
              },
            },
          },
        },
        responses: {
          200: json({
            allOf: [
              ref('BaziCalculation'),
              {
                type: 'object',
                properties: {
                  calculation: ref('BaziCalculation'),
                  interpretation: { type: 'string' },
                },
              },
            ],
          }),
          400: errorResponse('入参非法，或指定了不可用的 provider'),
          429: errorResponse('同一调用方已有一个 AI 请求在处理中'),
          500: errorResponse('分析失败'),
        },
      },
    },

    // ---------------------------------------------------------------- 紫微斗数
    '/api/ziwei/calculate': {
      post: {
        tags: ['紫微斗数'],
        summary: '紫微斗数排盘',
        description: '返回十二宫与星曜分布。不做真太阳时校正，只按给定时间排盘。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'gender'],
                properties: BIRTH_PROPS,
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              palaces: { type: 'array', items: { type: 'object' } },
              timezoneOffsetMinutes: { type: 'integer', nullable: true },
            },
          }),
          400: errorResponse('缺少必填字段或取值越界'),
          500: errorResponse('计算失败'),
        },
      },
    },

    // ---------------------------------------------------------------- 塔罗
    '/api/tarot/cards': {
      get: {
        tags: ['塔罗'],
        summary: '完整牌库',
        responses: {
          200: json({
            type: 'object',
            properties: { cards: { type: 'array', items: ref('TarotCard') } },
          }),
        },
      },
    },
    '/api/tarot/draw': {
      post: {
        tags: ['塔罗'],
        summary: '抽牌',
        description: '牌阵未知时回退到 SingleCard，不会报错。',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  spreadType: { type: 'string', default: 'SingleCard', example: 'ThreeCard' },
                },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              spreadType: { type: 'string' },
              cards: { type: 'array', items: ref('TarotCard') },
            },
          }),
        },
      },
    },
    '/api/tarot/ai-interpret': {
      post: {
        tags: ['塔罗', 'AI'],
        summary: '塔罗 AI 解读',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  ref('AiInterpretRequestBase'),
                  {
                    type: 'object',
                    required: ['cards'],
                    properties: {
                      spreadType: { type: 'string' },
                      cards: { type: 'array', minItems: 1, items: ref('TarotCard') },
                      userQuestion: { type: 'string' },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: AI_RESPONSES,
      },
    },

    // ---------------------------------------------------------------- 周易
    '/api/iching/hexagrams': {
      get: {
        tags: ['周易'],
        summary: '六十四卦全表',
        responses: {
          200: json({
            type: 'object',
            properties: { hexagrams: { type: 'array', items: ref('Hexagram') } },
          }),
        },
      },
    },
    '/api/iching/divine': {
      post: {
        tags: ['周易'],
        summary: '起卦',
        description:
          'method=number 需要恰好三个数字；method=time 用服务器当前时间起卦，此时 numbers 被忽略。',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  method: { type: 'string', enum: ['number', 'time'], default: 'number' },
                  numbers: {
                    type: 'array',
                    items: { type: 'integer' },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              hexagram: ref('Hexagram'),
              changingLines: { type: 'array', items: { type: 'integer' } },
              timeContext: { type: 'object', nullable: true },
              method: { type: 'string' },
            },
          }),
          400: errorResponse('数字个数不对、不是有效数字，或无法据此推出卦象'),
        },
      },
    },
    '/api/liuyao/chart': {
      post: {
        tags: ['六爻'],
        summary: '六爻纳甲装卦',
        description:
          '给定六爻与动爻，装出可断之卦：卦名、八宫归属、世应、纳甲干支、六亲、六神、伏神、旬空、动爻变卦。' +
          '不给起卦日期则取服务器当日，此时结果不可复现 —— 响应的 castDate 会回显实际所用日期。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lines'],
                properties: {
                  lines: {
                    type: 'array',
                    items: { type: 'integer', enum: [0, 1] },
                    minItems: 6,
                    maxItems: 6,
                    description: '自初爻至上爻，0 为阴、1 为阳',
                  },
                  changingLines: {
                    type: 'array',
                    items: { type: 'integer', minimum: 1, maximum: 6 },
                    description: '动爻位置，1 为初爻',
                  },
                  year: { type: 'integer' },
                  month: { type: 'integer', minimum: 1, maximum: 12 },
                  day: { type: 'integer', minimum: 1, maximum: 31 },
                },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              name: { type: 'object', nullable: true, description: '卦名与《周易》序号' },
              palace: { type: 'object', description: '八宫归属、世卦名目、世应爻位' },
              yaos: {
                type: 'array',
                items: { type: 'object' },
                description: '六爻详情：纳甲、六亲、六神、世应、动否、月建日辰作用',
              },
              hiddenSpirits: { type: 'array', items: { type: 'object' }, description: '伏神' },
              xunkong: { type: 'object', nullable: true, description: '旬空' },
              changedHexagram: { type: 'object', nullable: true, description: '之卦' },
              castDate: { type: 'object', description: '起卦日期与日干支、月建' },
            },
          }),
          400: errorResponse('爻数不对、动爻位越界，或起卦日期非法'),
        },
      },
    },
    '/api/iching/ai-interpret': {
      post: {
        tags: ['周易', 'AI'],
        summary: '周易 AI 解读',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  ref('AiInterpretRequestBase'),
                  {
                    type: 'object',
                    required: ['hexagram'],
                    properties: {
                      hexagram: {
                        oneOf: [{ type: 'string' }, ref('Hexagram')],
                        description: '卦名字符串或完整卦象对象都接受。',
                      },
                      userQuestion: { type: 'string' },
                      method: { type: 'string' },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: AI_RESPONSES,
      },
    },

    // ---------------------------------------------------------------- 星座
    '/api/zodiac/compatibility': {
      get: {
        tags: ['星座'],
        summary: '两个星座的相性',
        parameters: [
          {
            name: 'primary',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            example: 'leo',
          },
          {
            name: 'secondary',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            example: 'aries',
          },
        ],
        responses: {
          200: json({
            type: 'object',
            properties: {
              primary: ref('ZodiacSign'),
              secondary: ref('ZodiacSign'),
              score: { type: 'number' },
              summary: { type: 'string' },
            },
          }),
          400: errorResponse('星座名无法识别'),
        },
      },
    },
    '/api/zodiac/rising': {
      post: {
        tags: ['星座'],
        summary: '上升星座',
        description: '需要精确到分的出生时间、时区偏移和经纬度——上升星座对这几项都极敏感。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'birthDate',
                  'birthTime',
                  'timezoneOffsetMinutes',
                  'latitude',
                  'longitude',
                ],
                properties: {
                  birthDate: { type: 'string', format: 'date', example: '1990-05-20' },
                  birthTime: { type: 'string', example: '14:30' },
                  timezoneOffsetMinutes: {
                    type: 'integer',
                    minimum: -840,
                    maximum: 840,
                    example: 480,
                  },
                  latitude: { type: 'number', minimum: -90, maximum: 90 },
                  longitude: { type: 'number', minimum: -180, maximum: 180 },
                },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: { rising: ref('ZodiacSign'), ascendant: { type: 'number' } },
          }),
          400: errorResponse('日期、时间、时区偏移或经纬度非法'),
          500: errorResponse('无法解析出上升星座'),
        },
      },
    },
    '/api/zodiac/{sign}/horoscope': {
      get: {
        tags: ['星座'],
        summary: '星座运势',
        parameters: [
          { name: 'sign', in: 'path', required: true, schema: { type: 'string' }, example: 'leo' },
          {
            name: 'period',
            in: 'query',
            schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
          },
        ],
        responses: {
          200: json({
            type: 'object',
            properties: {
              sign: ref('ZodiacSign'),
              period: { type: 'string' },
              range: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' },
              horoscope: { type: 'object' },
            },
          }),
          400: errorResponse('星座名或 period 无法识别'),
        },
      },
    },
    '/api/zodiac/{sign}': {
      get: {
        tags: ['星座'],
        summary: '星座基础信息',
        parameters: [
          { name: 'sign', in: 'path', required: true, schema: { type: 'string' }, example: 'leo' },
        ],
        responses: {
          200: json({ type: 'object', properties: { sign: ref('ZodiacSign') } }),
          400: errorResponse('星座名无法识别'),
        },
      },
    },

    // ---------------------------------------------------------------- 合盘 / 历法 / 地点
    '/api/synastry/analyze': {
      post: {
        tags: ['合盘'],
        summary: '两张八字盘的相性分析',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['personA', 'personB'],
                properties: {
                  personA: {
                    type: 'object',
                    properties: { ...BIRTH_PROPS, name: { type: 'string' } },
                  },
                  personB: {
                    type: 'object',
                    properties: { ...BIRTH_PROPS, name: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              personA: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  dayMaster: { type: 'string' },
                  element: { type: 'string' },
                },
              },
              personB: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  dayMaster: { type: 'string' },
                  element: { type: 'string' },
                },
              },
              compatibility: {
                type: 'object',
                properties: { score: { type: 'number' } },
              },
            },
          }),
          400: errorResponse('personA / personB 缺失'),
        },
      },
    },
    '/api/calendar/daily': {
      get: {
        tags: ['历法'],
        summary: '当日日柱与流日运势',
        description:
          '不带出生参数时只返回当日日柱；出生参数要么一个不给，要么给全（缺一个就是 400），' +
          '给全了才会算个人化的流日分数。',
        parameters: [
          { name: 'birthYear', in: 'query', schema: { type: 'integer' } },
          { name: 'birthMonth', in: 'query', schema: { type: 'integer' } },
          { name: 'birthDay', in: 'query', schema: { type: 'integer' } },
          { name: 'birthHour', in: 'query', schema: { type: 'integer' } },
          { name: 'gender', in: 'query', schema: { type: 'string', enum: ['male', 'female'] } },
        ],
        responses: {
          200: json({
            type: 'object',
            properties: {
              date: { type: 'string' },
              dailyPillar: { type: 'object' },
              fortune: { type: 'object' },
            },
          }),
          400: errorResponse('出生参数给了一部分但不完整，或日期非法'),
        },
      },
    },
    '/api/locations': {
      get: {
        tags: ['地点'],
        summary: '真太阳时校正认得的地点',
        description:
          '这里列出的地名，传给 birthLocation 一定解析得出经纬度。' +
          '不传 search 返回全表。引擎另外也接受 "39.9,116.4" 这种坐标串，那种写法不在本列表里。',
        parameters: [
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string' },
            description: '按地名子串过滤，大小写不敏感。',
          },
        ],
        responses: { 200: json({ type: 'array', items: ref('Location') }) },
      },
    },
  },
});
