/* eslint-disable @typescript-eslint/no-non-null-assertion, node/no-process-env */
import { config as loadEnv } from 'dotenv';

loadEnv();

[
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_AUDIENCE',
  'EMAIL_DOMAIN',
  'EMAIL_SERVER',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
].forEach((req) => { if (!process.env[req]) throw Error(`The ${req} environment variable is required.`); });

const config = {
  debug: process.env.NODE_ENV !== 'production',
  port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 5000,
  auth: {
    secret: process.env.AUTH_SECRET!,
    audience: process.env.AUTH_AUDIENCE!,
  },
  email: {
    domain: process.env.EMAIL_DOMAIN!,
    server: process.env.EMAIL_SERVER!,
    port: process.env.EMAIL_PORT!,
    user: process.env.EMAIL_USER!,
    password: process.env.EMAIL_PASSWORD!,
  },
};

export default config;
