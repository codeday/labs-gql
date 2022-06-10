import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import {
  PrismaClient,
  Survey as PrismaSurvey,
  SurveyOccurence as PrismaSurveyOccurance,
  SurveyResponse as PrismaSurveyResponse,
} from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Survey, SurveyOccurence } from '../types';
import { SurveyCreateInput } from '../inputs';
import { validateSurveyEvent } from '../utils';

@Service()
@Resolver(Survey)
export class SurveyResolver {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Survey)
  async createSurvey(
    @Ctx() { auth }: Context,
    @Arg('data', () => SurveyCreateInput) data: SurveyCreateInput,
  ): Promise<PrismaSurvey> {
    return this.prisma.survey.create({
      data: { ...data, event: { connect: { id: auth.eventId! } } },
    });
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => SurveyOccurence)
  async createSurveyOccurance(
    @Ctx() { auth }: Context,
    @Arg('survey', () => String) survey: string,
    @Arg('visibleAt', () => Date) visibleAt: Date,
    @Arg('dueAt', () => Date) dueAt: Date,
  ): Promise<PrismaSurveyOccurance> {
    await validateSurveyEvent(auth, survey);

    return this.prisma.surveyOccurence.create({
      data: {
        survey: { connect: { id: survey } },
        visibleAt,
        dueAt,
      }
    })
  }
}
