import { Arg, Authorized, Ctx, Mutation, Query, Resolver, } from 'type-graphql';
import { PrismaClient, } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { StudentStatus, Track } from '../enums';
import { AuthRole, Context } from '../context';
import { Match, Preference, Student, Tag, } from '../types';
import { getProjectRecs } from '../search';

@Service()
@Resolver(Match)
export class MatchResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  async matchStudents(
    @Ctx() { auth }: Context,
  ) {
    
  }

  @Authorized(AuthRole.STUDENT)
  @Query(() => [Match], { nullable: true })
  // TODO: Check how to rename endpoints like this. This is really getting recs not matches.
  async projectRecs(
    @Ctx() { auth }: Context,
    @Arg('tags', () => [String]) tagIds: string[],
  ): Promise<Match[]> {
    const student = await this.prisma.student.findUnique({ where: auth.toWhere() });
    const tags = await this.prisma.tag.findMany({ where: { id: { in: tagIds } } });

    if (!student || student.status !== StudentStatus.ACCEPTED) throw Error('You have not been accepted.');
    return getProjectRecs(<Student>student, <Tag[]>tags);
  }

  @Authorized(AuthRole.STUDENT)
  @Query(() => [Preference], { nullable: true })
  async projectPreferences(
    @Ctx() { auth }: Context,
  ): Promise<Preference[]> {
    return <Preference[]><unknown>this.prisma.projectPreference.findMany({
      where: { student: auth.toWhere() },
      include: {
        project: {
          include: {
            tags: true,
            mentors: true
          }
        }
      },
      orderBy: [{ ranking: 'asc' }],
    });
  }

  @Authorized(AuthRole.STUDENT)
  @Mutation(() => [Preference], { nullable: true })
  async expressProjectPreferences(
    @Ctx() ctx: Context,
    @Arg('projects', () => [String]) projectIdsArg: string[],
  ): Promise<Preference[]> {
    const { auth } = ctx;
    const projectIds = [...new Set(projectIdsArg)];
    const student = await this.prisma.student.findUnique({ where: auth.toWhere() });
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: {
        tags: true,
        mentors: true
      },
    });

    if (!student || student.status !== StudentStatus.ACCEPTED) throw Error('You have not been accepted.');
    if (projectIds.length < 3) throw Error('You must select at least 3 project preferences.');
    if (projects.length !== projectIds.length) throw Error('You selected a project which does not exist.');
    projects.forEach(({
      id,
      track
    }) => {
      if (
        (student.track === Track.BEGINNER && track !== Track.BEGINNER)
        || (student.track !== Track.BEGINNER && track === Track.BEGINNER)
      ) {
        throw Error(`You cannot select project ID ${id} because it is not in your track.`);
      }
    });

    await this.prisma.projectPreference.deleteMany({ where: { student: auth.toWhere() } });

    await this.prisma.projectPreference.createMany({
      data: projectIds.map((id, i) => ({
        projectId: id,
        studentId: student.id,
        ranking: i,
      })),
    });

    return this.projectPreferences(ctx);
  }
}
