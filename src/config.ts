/* eslint-disable @typescript-eslint/no-non-null-assertion, node/no-process-env */
import { config as loadEnv } from 'dotenv';
import SMTPConnection from 'nodemailer/lib/smtp-connection';

loadEnv();

[
  'DATABASE_URL',
  'ELASTIC_URL',
  'ELASTIC_INDEX',
  'AUTH_SECRET',
  'AUTH_AUDIENCE',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASS',
  'GEOCODIO_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_ORGANIZATION',
].forEach((req) => { if (!process.env[req]) throw Error(`The ${req} environment variable is required.`); });

const secondaryRegion = process.env.PRIMARY_REGION
  && process.env.FLY_REGION
  && process.env.FLY_REGION !== process.env.PRIMARY_REGION;

if (secondaryRegion)
  console.log(`Running in secondary region ${process.env.FLY_REGION}, disabling automation.`);

const config = {
  debug: process.env.NODE_ENV !== 'production',
  port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 5000,
  secondaryRegion,
  geocodio: {
    apiKey: process.env.GEOCODIO_API_KEY!,
  },
  elastic: {
    disable: process.env.DISABLE_SEARCH === 'TRUE' || secondaryRegion,
    url: process.env.ELASTIC_URL!,
    index: process.env.ELASTIC_INDEX!,
  },
  auth: {
    secret: process.env.AUTH_SECRET!,
    audience: process.env.AUTH_AUDIENCE!,
  },
  slack: {
    disable: process.env.DISABLE_SLACK === 'TRUE' || secondaryRegion,
  },
  standupAndProsper: {
    disable: process.env.DISABLE_STANDUPANDPROSPER === 'TRUE' || secondaryRegion,
  },
  email: <SMTPConnection.Options & { disable: boolean }> {
    disable: process.env.DISABLE_EMAIL === 'TRUE' || secondaryRegion,
    host: process.env.EMAIL_HOST!,
    port: Number.parseInt(process.env.EMAIL_PORT!, 10),
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  },
  openAi: {
    apiKey: process.env.OPENAI_API_KEY!,
    organization: process.env.OPENAI_ORGANIZATION!,
    disable: process.env.DISABLE_OPENAI === 'TRUE' || secondaryRegion,
  },
};

export default config;
