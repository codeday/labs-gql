import {
  Resolver, Arg, Mutation,
  Authorized,
  Query,
  Ctx
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { sendLoginLinks } from '../email';
import { AuthContext, Context } from '../context';
import { EventToken } from '../types/EventToken';
import { idOrUsernameOrAuthToUniqueWhere, signTokenAdmin, signTokenPartner, signTokenUser } from '../utils';

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
      this.prisma.mentor.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, include: { event: true } }),
      this.prisma.student.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, include: { event: true } }),
    ]);

    await sendLoginLinks(email, mentors, students);
    return true;
  }

  @Authorized()
  @Query(() => [EventToken])
  async otherEventTokens(
    @Ctx() { auth }: Context
  ): Promise<EventToken[]> {
    if (auth.isAdmin) return this.prisma.event.findMany().then(events => events.map(event => ({ event, token: signTokenAdmin(event) })));
    else if (auth.isManager) return this.prisma.event.findMany().then(events => events.map(event => ({ event, token: signTokenAdmin(event) })));
    else if (auth.isStudent) {
      const student = await this.prisma.student.findUnique({ where: idOrUsernameOrAuthToUniqueWhere(auth), rejectOnNotFound: true });
      return await this.prisma.student
        .findMany({ where: { OR: [{ email: { equals: student.email, mode: 'insensitive' } }, { username: student.username }] }, include: { event: true } })
        .then(students => students.map(student => ({ event: student.event, token: signTokenUser(student) })));
    } else if (auth.isMentor) {
      const mentor = await this.prisma.mentor.findUnique({ where: idOrUsernameOrAuthToUniqueWhere(auth), rejectOnNotFound: true });
      return this.prisma.mentor
        .findMany({ where: { OR: [{ email: { equals: mentor.email, mode: 'insensitive' } }, { username: mentor.username }] }, include: { event: true } })
        .then(mentors => mentors.map(mentor => ({ event: mentor.event, token: signTokenUser(mentor) })));
    } else if (auth.isPartner) {
      return this.prisma.partner
        .findMany({
          where: {
            partnerCode: { equals: auth.partnerCode },
            OR: [
              { event: { students: { some: { partnerCode: { equals: auth.partnerCode } } } } },
              { event: { startsAt: { gt: new Date() } } },
            ]
          },
          include: { event: true }
        })
        .then(partners => partners.map(partner => ({ event: partner.event, token: signTokenPartner(partner) })));
    } else return [];
  }
}
