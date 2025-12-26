import helmet from 'helmet';
import { createCorsMiddleware } from './cors.middleware.js';

export const helmetMiddleware = helmet();
// Re-export for backward compatibility with older imports.
export { createCorsMiddleware };

