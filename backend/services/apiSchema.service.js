export const buildOpenApiSpec = ({ baseUrl } = {}) => ({
  openapi: '3.0.3',
  info: {
    title: 'BaZi Master API',
    version: '1.0.0',
    description: '全球化算命平台API - 支持八字、塔罗、周易、星座等算命功能',
    contact: {
      name: 'API Support',
      email: 'support@bazi-master.com',
    },
  },
  servers: [
    {
      url: baseUrl || 'http://localhost:4000',
      description: 'API服务器',
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: '错误信息',
          },
        },
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['ok', 'degraded'],
          },
          checks: {
            type: 'object',
            properties: {
              db: { type: 'object' },
              redis: { type: 'object' },
            },
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: '健康检查',
        responses: {
          200: {
            description: '服务正常',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' },
              },
            },
          },
          503: {
            description: '服务不可用',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' },
              },
            },
          },
        },
      },
    },
    '/api/ready': {
      get: {
        summary: '就绪检查',
        responses: {
          200: {
            description: '服务就绪',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' },
              },
            },
          },
          503: {
            description: '服务未就绪',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' },
              },
            },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: '获取当前用户信息',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: '用户信息',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { type: 'object' },
                  },
                },
              },
            },
          },
          401: {
            description: '未认证',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
  },
});
