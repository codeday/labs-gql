import {
  Resolver, Query, Arg
} from 'type-graphql';
import { PrismaClient, ProjectStatus, StudentStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { EmploymentRecord, Project } from '../types';

@Service()
@Resolver(EmploymentRecord)
export class StudentResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Query(() => [EmploymentRecord])
  async employmentRecords(
    @Arg('givenName', () => String, { nullable: true }) givenName?: string,
    @Arg('surname', () => String, { nullable: true }) surname?: string,
    @Arg('username', () => String, { nullable: true }) username?: string,
    @Arg('email', () => String, { nullable: true }) email?: string,
  ): Promise<EmploymentRecord[]> {
    const students = await this.prisma.student.findMany({
      where: {
        ...(givenName ? { givenName: { equals: givenName, mode: 'insensitive' } } : {} ),
        ...(surname ? { surname: { equals: surname, mode: 'insensitive' } } : {} ),
        ...(username ? { username: { equals: username, mode: 'insensitive' } } : {} ),
        ...(email ? { email: { equals: email, mode: 'insensitive' } } : {} ),
        status: StudentStatus.ACCEPTED,
      },
      include: { event: true, projects: { select: { mentors: { select: { givenName: true, surname: true } } } } },
    });

    return students.map((student) => Object.assign(new EmploymentRecord, { student }));
  }
}
