import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import config from './config';

export function registerDi(): void {
  Container.set(PrismaClient, new PrismaClient());
  Container.set('email', nodemailer.createTransport(config.email));
}
