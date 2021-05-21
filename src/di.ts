import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';

export function registerDi(): void {
  Container.set(PrismaClient, new PrismaClient());
}
