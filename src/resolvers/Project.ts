import {
  Resolver, Authorized, Mutation, Arg, Ctx,
} from 'type-graphql';
import { PrismaClient, Project as PrismaProject } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole, AuthContext } from '../context';
import { Project } from '../types';
import {
  IdOrUsernameInput, ProjectCreateInput, ProjectEditInput,
} from '../inputs';
import { MentorOnlySelf } from './decorators';

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
    return this.prisma.project.create({ data: { ...data, mentors: { connect: mentor || auth.toWhere() } } });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.MENTOR)
  @Mutation(() => Project)
  async editProject(
    @Ctx() { auth }: Context,
    @Arg('project', () => String) project: string,
    @Arg('data', () => ProjectEditInput) data: ProjectEditInput,
  ): Promise<PrismaProject> {
    if ((data.approved || data.maxStudents) && !(auth.isAdmin || auth.isManager)) {
      throw Error('You do not have permission to edit restricted fields.');
    }
    const dbProject = await this.prisma.project.findUnique({
      where: { id: project },
      select: { approved: true, mentors: { select: { id: true, username: true } } },
    });
    if (!dbProject) throw Error('Project not found.');
    if (auth.isMentor && !this.projectIncludesMentors(auth, dbProject.mentors)) throw Error('No permission to edit.');
    if (auth.isMentor && dbProject.approved) throw Error('Approved projects cannot be edited.');
    return this.prisma.project.update({ where: { id: project }, data });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Boolean)
  async deleteProject(
    @Arg('project', () => String) project: string,
  ): Promise<boolean> {
    await this.prisma.project.delete({ where: { id: project } });
    return true;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  async addProjectMentor(
    @Arg('project', () => String) project: string,
    @Arg('mentor', () => IdOrUsernameInput) mentor: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    return this.prisma.project.update({ where: { id: project }, data: { mentors: { connect: [mentor] } } });
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER)
  @Mutation(() => Project)
  removeProjectMentor(
    @Arg('project', () => String) project: string,
    @Arg('mentor', () => IdOrUsernameInput) mentor: IdOrUsernameInput,
  ): Promise<PrismaProject> {
    return this.prisma.project.update({ where: { id: project }, data: { mentors: { disconnect: [mentor] } } });
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
