import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient, Student as PrismaStudent, StudentStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { EmploymentRecord, Student } from '../types';
import {
  IdOrUsernameInput, StudentApplyInput, StudentCreateInput, StudentEditInput, StudentFilterInput,
} from '../inputs';
import { StudentOnlySelf } from './decorators';
import { eventAllowsApplicationStudent, idOrUsernameOrAuthToUniqueWhere, validateStudentEvent } from '../utils';

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
