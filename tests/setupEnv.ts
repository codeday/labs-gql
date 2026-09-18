/**
 * Test environment bootstrap.
 *
 * `src/config.ts` validates a long list of required environment variables at
 * import time and throws if any are missing. Importing the ResourceResolver
 * (transitively) loads `src/config.ts`, so these dummy values MUST be present
 * before that import is evaluated.
 *
 * This module is imported FIRST by ResourceResolver.test.ts. Both ts-node
 * (CommonJS, source order preserved) and tsx/esbuild (ESM, source order)
 * evaluate imported modules in source order, so importing this side-effect
 * module before any config-dependent module guarantees the env vars are set
 * before `src/config.ts` runs its validation.
 */
const REQUIRED_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ELASTIC_URL: 'http://localhost:9200',
  ELASTIC_INDEX: 'test',
  AUTH_SECRET: 'test-secret',
  AUTH_AUDIENCE: 'test-audience',
  EMAIL_HOST: 'localhost',
  EMAIL_PORT: '587',
  EMAIL_USER: 'test',
  EMAIL_PASS: 'test',
  EMAIL_INBOUND_DOMAIN: 'test.local',
  GEOCODIO_API_KEY: 'test-key',
  OPENAI_API_KEY: 'test-key',
  OPENAI_ORGANIZATION: 'test-org',
  WEBHOOK_KEY: 'test-key',
  BADGR_USERNAME: 'test',
  BADGR_PASSWORD: 'test',
  BADGR_ISSUER: 'test',
  SHOPIFY_API_TOKEN: 'test',
  SHOPIFY_API_KEY: 'test',
  SHOPIFY_API_SECRET_KEY: 'test',
  SHOPIFY_STORE_DOMAIN: 'test.myshopify.com',
  LINEAR_API_KEY: 'test',
  LINEAR_TEAM_ID: 'test',
  LINEAR_PROBLEM_LABEL_ID: 'test',
  METRICS_KEY: 'test',
  PLACID_API_TOKEN: 'test',
  ATTIO_API_TOKEN: 'test',
  ATTIO_ALUMNI_LIST: 'test',
};
for (const [k, v] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[k]) process.env[k] = v;
}
