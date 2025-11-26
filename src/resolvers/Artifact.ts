import {
  Resolver, Authorized, Arg, Ctx, Mutation, Query,
} from 'type-graphql';
import { Prisma, PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Artifact } from '../types';
import { validateActive } from '../utils';

@Service()
@Resolver(Artifact)
export class ArtifactResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized([AuthRole.STUDENT, AuthRole.MENTOR])
  @Mutation(() => Boolean)
  async addArtifact(
    @Ctx() { auth }: Context,
    @Arg('name', () => String, { nullable: true }) name: string | null,
    @Arg('artifactType', () => String, { nullable: true }) artifactTypeId: string | null,
    @Arg('link', () => String) link: string,
    @Arg('groupArtifact', () => Boolean, { nullable: true }) _groupArtifact: boolean | null,
    @Arg('project', () => String) projectId: string,
  ): Promise<boolean> {
    await validateActive(auth);
    if (!name && !artifactTypeId) throw new Error(`Must specify either a name or an artifactType`);
    if (name && artifactTypeId) throw new Error(`Cannot specify name with artifactType`);
    if (artifactTypeId && typeof _groupArtifact === 'boolean') throw new Error(`Cannot specify groupArtifact with artifactType`);

    const project = await this.prisma.project.findFirstOrThrow({
      where: {
        id: projectId,
        ...(auth.isAdmin
          ? {}
          : { [auth.personType === 'MENTOR' ? 'mentors' : 'students']: { some: { id: auth.id } } }
        ),
      },
    });

  const artifactType = artifactTypeId && await this.prisma.artifactType.findFirstOrThrow({
    where: {
      eventId: auth.eventId,
      id: artifactTypeId,
    },
  });

  const groupArtifact = artifactType ? !artifactType.personType : _groupArtifact;

  const nameTypeCriteria: Prisma.ArtifactWhereInput = artifactType
    ? { artifactTypeId: { equals: artifactTypeId } }
    : { name: { equals: name!, mode: 'insensitive' } };

  const whereCriteria: Prisma.ArtifactWhereInput = groupArtifact
    ? { projectId: project.id }
    : {
      projectId: project.id,
      [auth.personType === 'MENTOR' ? 'mentorId' : 'studentId']: auth.id,
    };

  const nameData = artifactType ? artifactType.name : name!;

  const connectData = groupArtifact
    ? { projectId: project.id }
    : {
      projectId: project.id,
      [auth.personType === 'MENTOR' ? 'mentorId' : 'studentId']: auth.id,
    };

  if(await this.prisma.artifact.count({
    where: {
      ...nameTypeCriteria,
      ...whereCriteria,
    }
  })) {
  await this.prisma.artifact.updateMany({
    where: {
      ...nameTypeCriteria,
      ...whereCriteria,
    },
    data: {
      name: nameData,
      link,
      ...connectData,
    },
  });
} else {
  await this.prisma.artifact.create({
    data: {
      name: nameData,
      link,
      ...connectData,
    },
  })
}

return true;
  }
}
