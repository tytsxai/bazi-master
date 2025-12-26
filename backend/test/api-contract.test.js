import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildOpenApiSpec } from '../services/apiSchema.service.js';

// API Contract Tests - Validate OpenAPI specification compliance
describe('API Contract', () => {
  const spec = buildOpenApiSpec({ baseUrl: 'http://localhost:4000' });

  describe('OpenAPI Specification', () => {
    it('should have valid OpenAPI version', () => {
      assert.strictEqual(spec.openapi, '3.0.3');
    });

    it('should have required info fields', () => {
      assert.ok(spec.info.title);
      assert.ok(spec.info.version);
      assert.ok(spec.info.description);
    });

    it('should have servers configuration', () => {
      assert.ok(Array.isArray(spec.servers));
      assert.ok(spec.servers.length > 0);
      assert.ok(spec.servers[0].url);
    });

    it('should have security schemes', () => {
      assert.ok(spec.components.securitySchemes);
      assert.ok(spec.components.securitySchemes.bearerAuth);
    });

    it('should have schemas', () => {
      assert.ok(spec.components.schemas);
      const requiredSchemas = ['Error', 'HealthCheck', 'BaziRecord', 'Favorite'];
      requiredSchemas.forEach(schema => {
        assert.ok(spec.components.schemas[schema], `Missing schema: ${schema}`);
      });
    });
  });

  describe('Bazi Records API Contract', () => {
    const recordsPath = spec.paths['/api/bazi/records'];

    it('should have GET /api/bazi/records endpoint', () => {
      assert.ok(recordsPath);
      assert.ok(recordsPath.get);
      assert.strictEqual(recordsPath.get.summary, '获取八字记录列表');
      assert.ok(recordsPath.get.security);
      assert.ok(recordsPath.get.responses['200']);
      assert.ok(recordsPath.get.responses['401']);
    });

    it('should have POST /api/bazi/records endpoint', () => {
      assert.ok(recordsPath.post);
      assert.strictEqual(recordsPath.post.summary, '创建八字记录');
      assert.ok(recordsPath.post.security);
      assert.ok(recordsPath.post.requestBody);
      assert.ok(recordsPath.post.responses['200']);
      assert.ok(recordsPath.post.responses['400']);
      assert.ok(recordsPath.post.responses['401']);
    });

    it('should have GET /api/bazi/records/{id} endpoint', () => {
      const recordPath = spec.paths['/api/bazi/records/{id}'];
      assert.ok(recordPath);
      assert.ok(recordPath.get);
      assert.strictEqual(recordPath.get.summary, '获取单个八字记录');
      assert.ok(recordPath.get.security);
      assert.ok(recordPath.get.parameters);
      assert.ok(recordPath.get.responses['200']);
      assert.ok(recordPath.get.responses['401']);
      assert.ok(recordPath.get.responses['404']);
    });

    it('should have DELETE /api/bazi/records/{id} endpoint', () => {
      const recordPath = spec.paths['/api/bazi/records/{id}'];
      assert.ok(recordPath.delete);
      assert.strictEqual(recordPath.delete.summary, '删除八字记录');
      assert.ok(recordPath.delete.security);
      assert.ok(recordPath.delete.parameters);
      assert.ok(recordPath.delete.responses['200']);
      assert.ok(recordPath.delete.responses['401']);
      assert.ok(recordPath.delete.responses['404']);
    });
  });

  describe('Favorites API Contract', () => {
    const favoritesPath = spec.paths['/api/favorites'];

    it('should have GET /api/favorites endpoint', () => {
      assert.ok(favoritesPath);
      assert.ok(favoritesPath.get);
      assert.strictEqual(favoritesPath.get.summary, '获取收藏列表');
      assert.ok(favoritesPath.get.security);
      assert.ok(favoritesPath.get.responses['200']);
      assert.ok(favoritesPath.get.responses['401']);
    });

    it('should have POST /api/favorites endpoint', () => {
      assert.ok(favoritesPath.post);
      assert.strictEqual(favoritesPath.post.summary, '添加收藏');
      assert.ok(favoritesPath.post.security);
      assert.ok(favoritesPath.post.requestBody);
      assert.ok(favoritesPath.post.responses['200']);
      assert.ok(favoritesPath.post.responses['400']);
      assert.ok(favoritesPath.post.responses['401']);
      assert.ok(favoritesPath.post.responses['409']);
    });

    it('should have DELETE /api/favorites/{id} endpoint', () => {
      const favoritePath = spec.paths['/api/favorites/{id}'];
      assert.ok(favoritePath);
      assert.ok(favoritePath.delete);
      assert.strictEqual(favoritePath.delete.summary, '删除收藏');
      assert.ok(favoritePath.delete.security);
      assert.ok(favoritePath.delete.parameters);
      assert.ok(favoritePath.delete.responses['200']);
      assert.ok(favoritePath.delete.responses['401']);
      assert.ok(favoritePath.delete.responses['404']);
    });
  });

  describe('Schema Validation', () => {
    it('should have valid BaziRecord schema', () => {
      const schema = spec.components.schemas.BaziRecord;
      assert.ok(schema.properties);
      const requiredFields = ['id', 'userId', 'birthYear', 'birthMonth', 'birthDay', 'pillars', 'fiveElements'];
      requiredFields.forEach(field => {
        assert.ok(schema.properties[field], `Missing field: ${field}`);
      });
    });

    it('should have valid Favorite schema', () => {
      const schema = spec.components.schemas.Favorite;
      assert.ok(schema.properties);
      const requiredFields = ['id', 'userId', 'recordId', 'record', 'createdAt'];
      requiredFields.forEach(field => {
        assert.ok(schema.properties[field], `Missing field: ${field}`);
      });
    });

    it('should have valid request schemas', () => {
      assert.ok(spec.components.schemas.BaziCalculationRequest);
      assert.ok(spec.components.schemas.CreateFavoriteRequest);

      const calcRequest = spec.components.schemas.BaziCalculationRequest;
      assert.ok(calcRequest.required);
      assert.ok(calcRequest.required.includes('birthYear'));
      assert.ok(calcRequest.required.includes('birthMonth'));
      assert.ok(calcRequest.required.includes('birthDay'));
    });
  });

  describe('Error Response Contract', () => {
    it('should have consistent error schema across endpoints', () => {
      const errorSchema = spec.components.schemas.Error;
      assert.ok(errorSchema.properties.error);
      assert.strictEqual(errorSchema.properties.error.type, 'string');
    });

    it('should use error schema in error responses', () => {
      const authMe = spec.paths['/api/auth/me'];
      const errorResponse = authMe.get.responses['401'];
      assert.ok(errorResponse.content['application/json'].schema.$ref);
      assert.ok(errorResponse.content['application/json'].schema.$ref.includes('Error'));
    });
  });

  describe('Authentication Contract', () => {
    it('should require authentication for protected endpoints', () => {
      const protectedPaths = [
        '/api/auth/me',
        '/api/bazi/records',
        '/api/bazi/records/{id}',
        '/api/favorites',
        '/api/favorites/{id}',
      ];

      protectedPaths.forEach(path => {
        const pathSpec = spec.paths[path];
        const methods = ['get', 'post', 'put', 'delete'].filter(method => pathSpec[method]);

        methods.forEach(method => {
          if (path !== '/api/bazi/calculate') { // calculate is public
            assert.ok(pathSpec[method].security, `Missing security for ${method.toUpperCase()} ${path}`);
            assert.ok(pathSpec[method].security[0].bearerAuth, `Missing bearer auth for ${method.toUpperCase()} ${path}`);
          }
        });
      });
    });

    it('should have proper 401 responses for protected endpoints', () => {
      const protectedPaths = [
        '/api/auth/me',
        '/api/bazi/records',
        '/api/bazi/records/{id}',
        '/api/favorites',
        '/api/favorites/{id}',
      ];

      protectedPaths.forEach(path => {
        const pathSpec = spec.paths[path];
        const methods = ['get', 'post', 'put', 'delete'].filter(method => pathSpec[method]);

        methods.forEach(method => {
          assert.ok(pathSpec[method].responses['401'], `Missing 401 response for ${method.toUpperCase()} ${path}`);
        });
      });
    });
  });
});

