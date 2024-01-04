import {
  Resolver, Authorized, Arg, Ctx, Query,
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../enums';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { AutocompleteResult, AutocompleteType } from '../types/AutocompleteResult';
import { AutocompleteFilterTypeInput } from '../inputs';

@Service()
@Resolver(AutocompleteResult)
export class AutocompleteResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [AutocompleteResult])
  async autocomplete(
    @Ctx() { auth }: Context,
    @Arg('types', () => AutocompleteFilterTypeInput) types: AutocompleteFilterTypeInput,
    @Arg('status', () => [StudentStatus], { defaultValue: [StudentStatus.ACCEPTED] }) status: StudentStatus[],
    @Arg('q', () => String) q: string,
  ): Promise<AutocompleteResult[]> {
    const lookups: (() => Promise<AutocompleteResult[]>)[] = [];

    if (types.students) {
      lookups.push(async () => 
        (await this.prisma.student.findMany({
          where: {
            eventId: auth.eventId,
            AND: [
              {
                OR: status.map(s => ({
                  status: s
                }))
              },
              {
                OR: [
                  { givenName: { contains: q, mode: 'insensitive'} },
                  { surname: { contains: q, mode: 'insensitive'} },
                  { email: { contains: q, mode: 'insensitive'} },
                ],
              }
            ]
          },
        }))
          .map(s => ({
            name: `${s.givenName} ${s.surname} (${s.email})`,
            id: s.id,
            type: AutocompleteType.STUDENT,
          }) as AutocompleteResult)
      );
    }

    if (types.mentors) {
      lookups.push(async () =>
        (await this.prisma.mentor.findMany({
          where: {
            eventId: auth.eventId,
            status: 'ACCEPTED',
            OR: [
              { givenName: { contains: q, mode: 'insensitive'} },
              { surname: { contains: q, mode: 'insensitive'} },
              { email: { contains: q, mode: 'insensitive'} },
            ],
          },
        }))
          .map(m => ({
            name: `${m.givenName} ${m.surname} (${m.email})`,
            id: m.id,
            type: AutocompleteType.MENTOR,
          }) as AutocompleteResult)
      );
    }

    if (types.projects) {
      lookups.push(async () =>
        (await this.prisma.project.findMany({
          where: {
            eventId: auth.eventId,
            status: { in: ['ACCEPTED', 'MATCHED' ]},
            description: { contains: q, mode: 'insensitive'}
          },
        }))
          .map(m => ({
            name: `${m.description?.slice(0,40)}...`,
            id: m.id,
            type: AutocompleteType.PROJECT,
          }) as AutocompleteResult)
      );
    }

    const allResults = await Promise.all(lookups.map(e => e()));
    return allResults.flatMap(r => r);
  }
}
