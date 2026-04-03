import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

process.env['NODE_ENV'] = 'test';
process.env['CORS_ORIGINS'] = 'http://localhost:3000,http://localhost:8080';
