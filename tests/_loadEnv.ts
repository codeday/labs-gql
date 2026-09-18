import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';

// Must run before any import of src/ modules, because:
//  - src/config.ts validates 28 environment variables at module-load time; importing
//    this file first (side-effect import) ensures dotenv populates process.env before
//    src/config is required.
//  - src/enums (imported transitively by AuthContext) uses type-graphql decorators that
//    require the reflect-metadata polyfill, which must be imported before any
//    type-graphql code executes.
// ESM/tsx preserves source order among hoisted imports, so importing this first
// guarantees both side effects occur before src/ modules load.
loadEnv({ path: '.env.test.example' });
