import {
  Resolver, Authorized, Arg, Ctx, Mutation, Query,
} from 'type-graphql';
import { Prisma, PrismaClient, File as PrismaFile, FileType as PrismaFileType } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { FileType, File } from '../types';
import { FileTypeCreateInput, FileTypeEditInput } from '../inputs';
import { validateActive } from '../utils';

@Service()
@Resolver(FileType)
export class FileTypeResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  @Authorized([AuthRole.ADMIN])
  @Query(() => [FileType])
  async fileTypes(
    @Ctx() { auth }: Context,
    @Arg('eventId', () => String, { nullable: true }) eventId?: string,
  ): Promise<PrismaFileType[]> {
    return this.prisma.fileType.findMany({
      where: {
        eventId: eventId || auth.eventId,
      },
    });
  }

  @Authorized([AuthRole.ADMIN])
  @Query(() => FileType, { nullable: true })
  async fileType(
    @Arg('id', () => String) id: string,
  ): Promise<PrismaFileType | null> {
    return this.prisma.fileType.findUniqueOrThrow({
      where: { id },
    });
  }

  @Authorized([AuthRole.ADMIN])
  @Mutation(() => FileType)
  async createFileType(
    @Ctx() { auth }: Context,
    @Arg('data', () => FileTypeCreateInput) data: FileTypeCreateInput,
  ): Promise<PrismaFileType> {
    return this.prisma.fileType.create({
      data: data.toQuery(auth.eventId!),
    });
  }

  @Authorized([AuthRole.ADMIN])
  @Mutation(() => FileType)
  async updateFileType(
    @Ctx() { auth }: Context,
    @Arg('id', () => String) id: string,
    @Arg('data', () => FileTypeEditInput) data: FileTypeEditInput,
  ): Promise<PrismaFileType> {
    await validateActive(auth);

    const fileType = await this.prisma.fileType.findUniqueOrThrow({
      where: { id },
      rejectOnNotFound: true,
    });

    // Check if the user has access to the event
    if (fileType.eventId !== auth.eventId) {
      throw new Error('You do not have permission to update this file type');
    }

    return this.prisma.fileType.update({
      where: { id },
      data: data.toQuery(),
    });
  }

  @Authorized([AuthRole.ADMIN])
  @Mutation(() => Boolean)
  async deleteFileType(
    @Ctx() { auth }: Context,
    @Arg('id', () => String) id: string,
  ): Promise<boolean> {
    await validateActive(auth);

    const fileType = await this.prisma.fileType.findUniqueOrThrow({
      where: { id },
      rejectOnNotFound: true,
    });

    // Check if the user has access to the event
    if (fileType.eventId !== auth.eventId) {
      throw new Error('You do not have permission to delete this file type');
    }

    // Check if there are any files using this file type
    const filesCount = await this.prisma.file.count({
      where: { fileTypeId: id },
    });

    if (filesCount > 0) {
      throw new Error('Cannot delete file type that is in use by files');
    }

    await this.prisma.fileType.delete({
      where: { id },
    });

    return true;
  }
}
