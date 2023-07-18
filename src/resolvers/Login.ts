import {
  Resolver, Arg, Mutation
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { sendLoginLinks } from '../email';

@Service()
@Resolver(Boolean)
export class LoginResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Mutation(() => Boolean)
  async requestLoginLink(
    @Arg('email', () => String) email: string,
  ): Promise<Boolean> {
    const [mentors, students] = await Promise.all([
      this.prisma.mentor.findMany({ where: { email }, include: { event: true } }),
      this.prisma.student.findMany({ where: { email }, include: { event: true } }),
    ]);

    await sendLoginLinks(email, mentors, students);
    return true;
  }
}
