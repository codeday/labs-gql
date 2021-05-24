import {
  Resolver, Authorized, Query, Mutation, Arg,
} from 'type-graphql';
import { PrismaClient, Tag as PrismaTag } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { AuthRole } from '../context';
import { Tag } from '../types';
import {
  TagCreateInput, TagEditInput,
} from '../inputs';
import { TagType } from '../enums';

@Service()
@Resolver(Tag)
export class TagResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Query(() => [Tag])
  async tags(
    @Arg('type', () => TagType, { nullable: true }) type?: TagType,
  ): Promise<PrismaTag[]> {
    return this.prisma.tag.findMany({ where: { type } });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Tag)
  async createTag(
    @Arg('data', () => TagCreateInput) data: TagCreateInput,
  ): Promise<PrismaTag> {
    return this.prisma.tag.create({ data: data.toQuery() });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Tag)
  async editTag(
    @Arg('tag', () => String) tag: string,
    @Arg('data', () => TagEditInput) data: TagEditInput,
  ): Promise<PrismaTag> {
    return this.prisma.tag.update({
      where: { id: tag },
      data: data.toQuery(),
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Boolean)
  async deleteTag(
    @Arg('tag', () => String) tag: string,
  ): Promise<boolean> {
    await this.prisma.tag.delete({ where: { id: tag } });
    return true;
  }
}
