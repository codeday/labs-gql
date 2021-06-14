import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { Client } from '@elastic/elasticsearch';
import nodemailer from 'nodemailer';
import config from './config';

export function registerDi(): void {
  Container.set(PrismaClient, new PrismaClient());
  Container.set(Client, new Client({ node: config.elastic.url }));
  Container.set('email', nodemailer.createTransport(config.email));
}
