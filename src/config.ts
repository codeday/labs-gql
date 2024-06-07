/* eslint-disable @typescript-eslint/no-non-null-assertion, node/no-process-env */
import { config as loadEnv } from 'dotenv';
import SMTPConnection from 'nodemailer/lib/smtp-connection';
import path from 'path';

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
  'EMAIL_INBOUND_DOMAIN',
  'GEOCODIO_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_ORGANIZATION',
  'WEBHOOK_KEY',
  'BADGR_USERNAME',
  'BADGR_PASSWORD',
  'BADGR_ISSUER',
].forEach((req) => { if (!process.env[req]) throw Error(`The ${req} environment variable is required.`); });

const secondaryRegion = process.env.PRIMARY_REGION
  && process.env.FLY_REGION
  && process.env.FLY_REGION !== process.env.PRIMARY_REGION;

const config = {
  debug: process.env.NODE_ENV !== 'production',
  port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 5000,
  portWebhoook: process.env.PORT_WEBHOOK ? Number.parseInt(process.env.PORT_WEBHOOK) : 5001,
  secondaryRegion,
  webhook: {
    key: process.env.WEBHOOK_KEY!,
  },
  uploader: {
    base: process.env.UPLOADER_BASE!,
    secret: process.env.UPLOADER_SECRET,
  },
  badgr: {
    endpoint: process.env.BADGR_ENDPOINT || 'https://api.badgr.io',
    username: process.env.BADGR_USERNAME!,
    password: process.env.BADGR_PASSWORD!,
    issuerEntityId: process.env.BADGR_ISSUER!,
  },
  app: {
    emailTemplateDir: path.join(__dirname, 'email', 'templates'),
  },
  geocodio: {
    apiKey: process.env.GEOCODIO_API_KEY!,
  },
  elastic: {
    url: process.env.ELASTIC_URL!,
    index: process.env.ELASTIC_INDEX!,
  },
  auth: {
    secret: process.env.AUTH_SECRET!,
    audience: process.env.AUTH_AUDIENCE!,
  },
  email: <SMTPConnection.Options & { disable: boolean, from: string, inboundDomain: string }> {
    from: process.env.EMAIL_FROM || 'labs@codeday.org',
    inboundDomain: process.env.EMAIL_INBOUND_DOMAIN!,
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
  },
};

export default config;
