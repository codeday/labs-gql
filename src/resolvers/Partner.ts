import {
  Resolver, Authorized, Mutation, Arg, Ctx,
} from 'type-graphql';
import { PersonType, PrismaClient, Partner as PrismaPartner, Student as PrismaStudent } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Partner, Student } from '../types';
import {
  IdOrUsernameOrEmailInput, PartnerCreateInput, PartnerEditInput,
} from '../inputs';
import { StudentOnlySelf } from './decorators';
import { idOrUsernameOrEmailOrAuthToUniqueWhere, validateStudentEvent } from '../utils';

@Service()
@Resolver(Partner)
export class ProjectResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Partner)
  async createPartner(
    @Ctx() { auth }: Context,
    @Arg('data', () => PartnerCreateInput) data: PartnerCreateInput,
  ): Promise<PrismaPartner> {
    return this.prisma.partner.create({
      data: {
        ...data.toQuery(),
        event: { connect: { id: auth.eventId! } },
      }
    })
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Partner)
  async editPartner(
    @Ctx() { auth }: Context,
    @Arg('partnerCode', () => String) partnerCode: string,
    @Arg('data', () => PartnerEditInput) data: PartnerEditInput,
  ): Promise<PrismaPartner> {
    const updatedPartner = await this.prisma.partner.update({
      where: {
        partnerCode_eventId: {
          partnerCode: partnerCode.toUpperCase(),
          eventId: auth.eventId!
        }
      },
      data: {
        ...data.toQuery(),
      }
    });

    await this.prisma.student.updateMany({
      where: { eventId: updatedPartner.eventId, partnerCode },
      data: {
        ...(updatedPartner.minHours ? { minHours: updatedPartner.minHours } : {}),
        ...(updatedPartner.weeks ? { weeks: updatedPartner.weeks } : {}),
        skipPreferences: updatedPartner.skipPreferences,
        partnerCode: updatedPartner.partnerCode,
      },
    });

    return updatedPartner;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.PARTNER, AuthRole.STUDENT)
  @StudentOnlySelf('where')
  @Mutation(() => Student)
  async associatePartnerCode(
    @Ctx() { auth }: Context,
    @Arg('partnerCode', () => String, { nullable: true }) partnerCodeSet?: string,
    @Arg('where', () => IdOrUsernameOrEmailInput, { nullable: true }) where?: IdOrUsernameOrEmailInput,
  ): Promise<PrismaStudent> {
    if (where) await validateStudentEvent(auth, where);

    const partnerCode = auth.partnerCode ?? partnerCodeSet;
    if (!partnerCode || !partnerCodeSet && auth.type !== AuthRole.PARTNER) {
      throw new Error('You must specify a partner code.');
    }

    const partner = await this.prisma.partner.findUnique({
      where: {
        partnerCode_eventId: { 
          partnerCode: partnerCode.toUpperCase(),
          eventId: auth.eventId!,
        }
      },
      rejectOnNotFound: true,
    });

    return await this.prisma.student.update({
      where: idOrUsernameOrEmailOrAuthToUniqueWhere(auth, where),
      data: {
        ...(partner.minHours ? { minHours: partner.minHours } : {}),
        ...(partner.weeks ? { weeks: partner.weeks } : {}),
        skipPreferences: partner.skipPreferences,
        partnerCode: partner.partnerCode,
      },
    });
  }
}
