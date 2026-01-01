import { EventEmitter } from 'node:events';

/**
 * Creates a mock Express response object for testing middleware
 */
export function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = null;

  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.json = function (data) {
    res.body = data;
    return res;
  };

  res.setHeader = function (name, value) {
    res.headers[name.toLowerCase()] = value;
    return res;
  };

  res.getHeader = function (name) {
    return res.headers[name.toLowerCase()];
  };

  return res;
}

/**
 * Creates a mock Express request object for testing middleware
 */
export function createMockRequest(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    query: options.query || {},
    params: options.params || {},
    body: options.body || {},
    user: options.user || null,
    ...options,
  };

  return req;
}

/**
 * Runs middleware directly without HTTP server
 * @param {Function} middleware - Express middleware function
 * @param {Object} reqOptions - Request options
 * @returns {Promise<Object>} - Response object with statusCode and body
 */
export async function runMiddleware(middleware, reqOptions = {}) {
  const req = createMockRequest(reqOptions);
  const res = createMockResponse();

  return new Promise((resolve, reject) => {
    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      reject(new Error('Middleware test timed out'));
    }, 5000);

    // Call the middleware
    const next = (error) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: res.body,
        });
      }
    };

    try {
      middleware(req, res, next);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Tests an authenticated route by running requireAuth middleware first
 * @param {Function} routeHandler - The route handler function
 * @param {Object} reqOptions - Request options
 * @returns {Promise<Object>} - Response object
 */
export async function testAuthenticatedRoute(routeHandler, reqOptions = {}) {
  const { requireAuth } = await import('../../middleware/auth.js');

  const req = createMockRequest(reqOptions);
  const res = createMockResponse();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Authenticated route test timed out'));
    }, 10000); // Increased timeout

    const finalNext = (error) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve({
          statusCode: res.statusCode,
          body: res.body,
        });
      }
    };

    try {
      // First run requireAuth middleware
      requireAuth(req, res, (authError) => {
        if (authError) {
          finalNext(authError);
          return;
        }
        // If auth passed, run the route handler
        routeHandler(req, res);
        finalNext();
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Tests requireAuth middleware directly with mock request/response
 * @param {Object} reqOptions - Request options
 * @returns {Promise<Object>} - Response object
 */
export async function testRequireAuth(reqOptions = {}) {
  const { requireAuth } = await import('../../middleware/auth.js');

  const req = createMockRequest(reqOptions);
  const res = createMockResponse();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Auth middleware test timed out'));
    }, 10000); // Increased timeout

    try {
      // Run requireAuth middleware - it's an async function that calls next() when done
      requireAuth(req, res, (error) => {
        clearTimeout(timeout);
        resolve({
          statusCode: res.statusCode,
          body: res.body,
          error,
          user: req.user, // Check if user was set
        });
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
