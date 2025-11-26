import { createMethodDecorator } from 'type-graphql';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';
import { Context } from '../context';

export function MentorOnlySelf(argName: string): MethodDecorator {
  // Assumes auth has already been checked.
  return createMethodDecorator<Context>(async ({ context: { auth }, args }, next) => {
    const where = args[argName];
    // Assumes auth has already been checked.
    if (auth.isAdmin || auth.isManager) {
      if (!where) throw new Error('Token type requires where argument.');
      return next();
    }
    if (where) {
      let compare: { id?: string | null, username?: string | null } | null = where;
      if (!((auth.username && where.username) || (auth.id && where.id))) {
        compare = await Container.get(PrismaClient).mentor.findUniqueOrThrow({
          where: where.toQuery(),
          select: { username: true, id: true },
        });
      }
      if (!compare || !auth.compareEditingTarget(compare)) throw Error('No access to requested user.');
    }
    return next();
  });
}

export function StudentOnlySelf(argName: string): MethodDecorator {
  // Assumes auth has already been checked.
  return createMethodDecorator<Context>(async ({ context: { auth }, args }, next) => {
    const where = args[argName];
    // Assumes auth has already been checked.
    if (auth.isAdmin || auth.isManager) {
      if (!where) throw new Error('Token type requires where argument.');
      return next();
    }
    if (where) {
      let compare: { id?: string | null, username?: string | null } | null = where;
      if (!((auth.username && where.username) || (auth.id && where.id))) {
        compare = await Container.get(PrismaClient).student.findUniqueOrThrow({
          where: where.toQuery(),
          select: { username: true, id: true },
        });
      }
      if (!compare || !auth.compareEditingTarget(compare)) throw Error('No access to requested user.');
    }
    return next();
  });
}
