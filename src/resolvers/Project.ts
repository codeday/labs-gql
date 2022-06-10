import {
  Resolver, Authorized, Mutation, Arg, Ctx,
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

@Service()
@Resolver(Project)
export class ProjectResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @MentorOnlySelf('mentor')
  @Mutation(() => Project)
  async createProject(
    @Ctx() { auth }: Context,
    @Arg('data', () => ProjectCreateInput) data: ProjectCreateInput,
    @Arg('mentor', () => IdOrUsernameInput, { nullable: true }) mentor?: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    return this.prisma.project.create({
      data: {
        ...data.toQuery(),
        event: { connect: { id: auth.eventId } },
        mentors: { connect: idOrUsernameOrAuthToUniqueWhere(auth, mentor) },
      },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
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
      && !(auth.isAdmin || auth.isManager)
    ) {
      throw Error('You do not have permission to edit restricted fields.');
    }
    const dbProject = await this.prisma.project.findUnique({
      where: { id: project },
      select: { status: true, mentors: { select: { id: true, username: true } }, eventId: true },
    });
    if (!dbProject) throw Error('Project not found.');
    if (!auth.isMentor && dbProject.eventId !== auth.eventId) throw Error('Cannot edit this project.');
    if (auth.isMentor && dbProject.status === ProjectStatus.MATCHED) throw Error('Matched projects cannot be edited.');
    if (auth.isMentor && !this.projectIncludesMentors(auth, dbProject.mentors)) throw Error('No permission to edit.');

    return this.prisma.project.update({
      where: { id: project },
      data: { ...data.toQuery(), ...(auth.isMentor && !data.status ? { status: ProjectStatus.DRAFT } : {}) },
    });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
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
