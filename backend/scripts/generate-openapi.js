import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildOpenApiSpec } from '../services/apiSchema.service.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const main = async () => {
    try {
        const spec = buildOpenApiSpec({
            baseUrl: process.env.BACKEND_BASE_URL || 'http://localhost:4000',
        });

        const outputPath = path.resolve(__dirname, '../../docs/openapi.json');
        // Ensure docs dir exists or put it in public/root?
        // Based on TASK_LIST, it says "Snapshot... and mount /api-docs".
        // Usually we might want it in root or docs folder. Let's put it in docs/openapi.json.

        // Create docs dir if not exists (though it likely exists)
        const docsDir = path.dirname(outputPath);
        if (!fs.existsSync(docsDir)) {
            fs.mkdirSync(docsDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
        logger.info(`OpenAPI spec generated at ${outputPath}`);
        console.log(`OpenAPI spec generated at ${outputPath}`);
    } catch (error) {
        console.error('Failed to generate OpenAPI spec:', error);
        process.exit(1);
    }
};

main();
