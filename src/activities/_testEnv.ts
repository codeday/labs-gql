/**
 * Test-only environment bootstrap for activity-task unit tests.
 *
 * Activity task modules import `../../utils` and `../../context`, both of which load
 * `src/config`. `src/config` throws at load time if a set of environment variables is
 * unset, so any test that imports an activity task must have those variables present
 * first.
 *
 * Import this module as the FIRST import in an activity-task test file. It loads a
 * developer `.env` (if present, without overriding existing values) and fills any
 * still-missing required variables with offline placeholders, so the task module
 * (and therefore `src/config`) can be imported without a database or any external
 * service.
 */
import { config as loadEnv } from 'dotenv';

loadEnv();

const REQUIRED_ENV = [
  'DATABASE_URL', 'ELASTIC_URL', 'ELASTIC_INDEX', 'AUTH_SECRET', 'AUTH_AUDIENCE',
  'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_ORGANIZATION', 'WEBHOOK_KEY',
  'BADGR_USERNAME', 'BADGR_PASSWORD', 'BADGR_ISSUER', 'SHOPIFY_API_TOKEN',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET_KEY', 'SHOPIFY_STORE_DOMAIN',
  'LINEAR_API_KEY', 'LINEAR_TEAM_ID', 'LINEAR_PROBLEM_LABEL_ID', 'METRICS_KEY',
  'PLACID_API_TOKEN', 'ATTIO_API_TOKEN', 'ATTIO_ALUMNI_LIST',
];

const DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  EMAIL_PORT: '587',
};

for (const key of REQUIRED_ENV) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = DEFAULTS[key] ?? 'test';
  }
}
