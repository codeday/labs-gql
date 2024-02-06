import {
  Resolver, Query, Arg
} from 'type-graphql';
import { PrismaClient, StudentStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { EmploymentRecord } from '../types';

@Service()
@Resolver(EmploymentRecord)
export class StudentResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Query(() => [EmploymentRecord])
  async employmentRecords(
    @Arg('givenName', () => String) givenName: string,
    @Arg('surname', () => String) surname: string,
  ): Promise<EmploymentRecord[]> {
    const students = await this.prisma.student.findMany({
      where: {
        givenName: { equals: givenName, mode: 'insensitive' },
        surname: { equals: surname, mode: 'insensitive' },
        status: StudentStatus.ACCEPTED,
        projects: { some: {} },
      },
      include: { event: true, projects: { select: { mentors: { select: { givenName: true, surname: true } } } } },
    });

    return students.map((student) => Object.assign(new EmploymentRecord, { student }));
  }
}
