import {
  Resolver, Authorized, Mutation, Arg, Ctx, Int, Query,
} from 'type-graphql';
import { PrismaClient, Project as PrismaProject, ProjectStatus } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole, AuthContext } from '../context';
import { Project } from '../types';
import {
  IdOrUsernameInput, ProjectCreateInput, ProjectEditInput,
} from '../inputs';
import { MentorOnlySelf } from './decorators';
import { idOrUsernameOrAuthToUniqueWhere, idOrUsernameToUniqueWhere, validateMentorEvent, validateProjectEvent, validateStudentEvent } from '../utils';
import { ProjectCountWhereInput } from '../inputs/ProjectCountWhereInput';
import { sendProjectUpdate } from '../email';

@Service()
@Resolver(Project)
export class ProjectResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Query(() => Int)
  async projectCount(
    @Arg('where', () => ProjectCountWhereInput, { nullable: true }) where?: ProjectCountWhereInput,
  ): Promise<number> {
    return this.prisma.project.count({ where: where?.toQuery() });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.OPEN_SOURCE_MANAGER)
  @MentorOnlySelf('mentor')
  @Mutation(() => Project)
  async createProject(
    @Ctx() { auth }: Context,
    @Arg('data', () => ProjectCreateInput) data: ProjectCreateInput,
    @Arg('mentor', () => IdOrUsernameInput, { nullable: true }) mentor?: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    if (auth.isOpenSourceManager && !data.repositoryId) {
      throw new Error('Open Source Managers must select a repository when creating a project.');
    }
    if (auth.isOpenSourceManager && !data.issueUrl) {
      throw new Error('Open Source Managers must include an issue link');
    }

    return this.prisma.project.create({
      data: {
        ...data.toQuery(),
        event: auth.eventId ? { connect: { id: auth.eventId } } : undefined,
        mentors: mentor ? { connect: idOrUsernameOrAuthToUniqueWhere(auth, mentor) } : undefined,
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR, AuthRole.OPEN_SOURCE_MANAGER)
  @Mutation(() => Project)
  async editProject(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('data', () => ProjectEditInput) data: ProjectEditInput,
  ): Promise<PrismaProject> {
    if (
      (
        data.maxStudents
        || (data.status && !(<ProjectStatus[]>[ProjectStatus.PROPOSED, ProjectStatus.DRAFT]).includes(data.status))
      )
      && !(auth.isAdmin || auth.isManager || auth.isOpenSourceManager)
    ) {
      throw Error('You do not have permission to edit restricted fields.');
    }

    const dbProject = await this.prisma.project.findUnique({
      where: { id: project },
      include: {
        mentors: { select: { id: true, username: true, givenName: true, surname: true, email: true } },
        students: { select: { id: true, username: true, givenName: true, surname: true, email: true } },
        event: { select: { matchPreferenceSubmissionOpen: true } } },
    });
    if (!dbProject) throw Error('Project not found.');
    if (!auth.isMentor && dbProject.eventId !== auth.eventId) throw Error('Cannot edit this project.');
    if (auth.isMentor && dbProject.status === ProjectStatus.MATCHED) throw Error('Matched projects cannot be edited.');
    if (auth.isMentor && !this.projectIncludesMentors(auth, dbProject.mentors)) throw Error('No permission to edit.');
    let status = data.status;
    if (auth.isMentor && dbProject.event) {
      if (dbProject.event.matchPreferenceSubmissionOpen && dbProject.status === ProjectStatus.ACCEPTED) {
        // If the mentor's previous project has been approved, and matching is open, we will keep this one approved:
        status = ProjectStatus.ACCEPTED;
      } else if (!status) status = ProjectStatus.DRAFT;
    }

    const newProject = await this.prisma.project.update({
      where: { id: project },
      data: { ...data.toQuery(), status },
    });

    if (
      dbProject.status === ProjectStatus.MATCHED
      && (data.description && dbProject.description !== data.description)
      || (data.issueUrl && dbProject.issueUrl !== data.issueUrl)
    ) {
      const to = [
        ...dbProject.students.map(s => s.email),
        ...dbProject.mentors.map(m => m.email),
      ];
      await sendProjectUpdate(to, dbProject, newProject);
    }

    return newProject;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.OPEN_SOURCE_MANAGER)
  @Mutation(() => Boolean)
  async deleteProject(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
  ): Promise<boolean> {
    await validateProjectEvent(auth, project);
    await this.prisma.project.deleteMany({ where: { id: project, eventId: auth.eventId! } });
    return true;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async addProjectStudent(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('student', () => IdOrUsernameInput) student: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    await validateProjectEvent(auth, project);
    await validateStudentEvent(auth, student);
    return this.prisma.project.update({
      where: { id: project },
      data: {
        students: { connect: [idOrUsernameToUniqueWhere(auth, student)] }
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async removeProjectStudent(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('student', () => IdOrUsernameInput) student: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    await validateProjectEvent(auth, project);
    await validateStudentEvent(auth, student);
    return this.prisma.project.update({
      where: { id: project },
      data: { students: { disconnect: [idOrUsernameToUniqueWhere(auth, student)] } }
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async addProjectMentor(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('mentor', () => IdOrUsernameInput) mentor: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    await validateProjectEvent(auth, project);
    await validateMentorEvent(auth, mentor);
    return this.prisma.project.update({
      where: { id: project },
      data: { mentors: { connect: [idOrUsernameToUniqueWhere(auth, mentor)] } },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Query(() => [Project])
  async unclaimedProjects(
    @Ctx() { auth }: Context,
  ): Promise<PrismaProject[]> {
    return this.prisma.project.findMany({
      where: {
        mentors: { none: {} },
        issueUrl: { not: null },
        OR: [
          { event: null },
          { event: { id: auth.eventId! } },
        ],
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async claimProject(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('mentor', () => IdOrUsernameInput) mentor: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    const dbProject = await this.prisma.project.findUnique({
      where: { id: project },
      include: { mentors: true },
      rejectOnNotFound: true,
    });

    if (dbProject.mentors.length > 0) {
      throw new Error('Project is already claimed.');
    }

    if (dbProject.eventId && dbProject.eventId !== auth.eventId!) {
      throw new Error('Project is not associated with this event.');
    }

    return this.prisma.project.update({
      where: { id: project },
      data: {
        mentors: { connect: [idOrUsernameToUniqueWhere(auth, mentor)] },
        event: { connect: { id: auth.eventId! } },
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async removeProjectMentor(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('mentor', () => IdOrUsernameInput) mentor: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    await validateProjectEvent(auth, project);
    await validateMentorEvent(auth, mentor);
    return this.prisma.project.update({
      where: { id: project },
      data: { mentors: { disconnect: [idOrUsernameToUniqueWhere(auth, mentor)] } },
    });
  }

  private projectIncludesMentors(auth: AuthContext, mentors: {id: string, username: string | null }[]): boolean {
    // BUG(@tylermenezes): Workaround for Typescript bug with reducers
    return <boolean><unknown> mentors.reduce((accum, { id, username }): boolean => (
      accum
      || <boolean><unknown> (auth.username && auth.username === username)
      || <boolean><unknown> (auth.id && auth.id === id)
    ), false);
  }
}
