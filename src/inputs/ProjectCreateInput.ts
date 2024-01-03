import { InputType, Field, Int } from 'type-graphql';
import { Prisma } from '@prisma/client';
import { Track } from '../enums';

@InputType()
export class ProjectCreateInput {
  @Field(() => String, { nullable: true })
  description?: string

  @Field(() => String, { nullable: true })
  deliverables?: string

  @Field(() => Track)
  track: Track

  @Field(() => Int, { nullable: true })
  maxStudents?: number

  @Field(() => [String], { nullable: true })
  tags?: string[]

  @Field(() => String, { nullable: true })
  affinePartnerId?: string | null

  @Field(() => String, { nullable: true })
  issueUrl?: string | null

  @Field(() => Boolean, { nullable: true })
  complete?: boolean | null

  @Field(() => String, { nullable: true })
  repositoryId?: string | null


  toQuery(): Prisma.ProjectCreateInput {
    return {
      description: this.description,
      deliverables: this.deliverables,
      track: this.track,
      maxStudents: this.maxStudents,
      affinePartner: this.affinePartnerId
        ? { connect: { id: this.affinePartnerId } }
        : undefined,
      tags: this.tags ? { connect: this.tags.map((id): Prisma.TagWhereUniqueInput => ({ id })) } : undefined,
      issueUrl: this.issueUrl ?? undefined,
      complete: this.complete ?? undefined,
      repository: this.repositoryId ? { connect: { id: this.repositoryId } } : undefined,
    };
  }
}
