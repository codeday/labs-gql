import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';
import nodemailer from 'nodemailer';
import OpenAIApi from "openai";
import config from './config';
import { registerHandlebarsHelpers } from './email/helpers';

export function registerDi(): void {
  Container.set(PrismaClient, new PrismaClient());
  Container.set(Client, new Client({ node: config.elastic.url }));
  Container.set('email', nodemailer.createTransport(config.email));
  Container.set(OpenAIApi, new OpenAIApi({
    organization: config.openAi.organization,
    apiKey: config.openAi.apiKey,
  }));
  registerHandlebarsHelpers();
}
