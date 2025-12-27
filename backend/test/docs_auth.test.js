import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { docsBasicAuth } from '../middleware/auth.js';

const createRequest = ({ headers = {} } = {}) => ({
    headers,
});

const createResponse = () => {
    const headers = new Map();
    const res = {
        statusCode: 200,
        body: undefined,
        set(name, value) {
            headers.set(String(name).toLowerCase(), value);
            return this;
        },
        getHeader(name) {
            return headers.get(String(name).toLowerCase());
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
    };
    return res;
};

describe('Docs Basic Auth Middleware', () => {
    const originalEnv = { ...process.env };

    before(() => {
        process.env.DOCS_USER = 'admin';
        process.env.DOCS_PASSWORD = 'secret_password';
        process.env.NODE_ENV = 'production';
    });

    after(() => {
        process.env = originalEnv;
    });

    it('should return 401 if no Authorization header', () => {
        const req = createRequest();
        const res = createResponse();
        const next = () => { };

        docsBasicAuth(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.getHeader('WWW-Authenticate'), 'Basic realm="API Docs"');
    });

    it('should return 401 if invalid credentials', () => {
        const req = createRequest({
            headers: {
                authorization: 'Basic ' + Buffer.from('admin:wrong_password').toString('base64'),
            },
        });
        const res = createResponse();
        const next = () => { };

        docsBasicAuth(req, res, next);

        assert.strictEqual(res.statusCode, 401);
    });

    it('should call next() if valid credentials', () => {
        const req = createRequest({
            headers: {
                authorization: 'Basic ' + Buffer.from('admin:secret_password').toString('base64'),
            },
        });
        const res = createResponse();

        let nextCalled = false;
        docsBasicAuth(req, res, () => {
            nextCalled = true;
        });
        assert.ok(nextCalled);
    });

    it('should allow access if password not configured in non-production', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.DOCS_PASSWORD;

        const req = createRequest();
        const res = createResponse();

        let nextCalled = false;
        docsBasicAuth(req, res, () => {
            nextCalled = true;
        });

        // Cleanup
        process.env.NODE_ENV = 'production';
        process.env.DOCS_PASSWORD = 'secret_password';

        assert.ok(nextCalled);
    });

    it('should deny access if password not configured in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DOCS_PASSWORD;

        const req = createRequest({
            headers: {
                authorization: 'Basic ' + Buffer.from('admin:any').toString('base64'),
            }
        });
        const res = createResponse();
        const next = () => { };

        docsBasicAuth(req, res, next);

        // Should return 500 error configuration error or 401?
        // Implementation says: return res.status(500).send('Docs authentication not configured.');
        assert.strictEqual(res.statusCode, 500);

        // Restore
        process.env.DOCS_PASSWORD = 'secret_password';
    });
});
