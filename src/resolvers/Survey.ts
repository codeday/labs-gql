import {
  Resolver, Authorized, Query, Mutation, Arg, Ctx,
} from 'type-graphql';
import {
  PersonType,
  PrismaClient,
  Survey as PrismaSurvey,
  SurveyOccurence as PrismaSurveyOccurence,
  SurveyResponse as PrismaSurveyResponse,
} from '@prisma/client';
import { makeDebug } from '../utils';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { Survey, SurveyOccurence, SurveyResponse } from '../types';
import { SurveyCreateInput } from '../inputs';
import { getSurveyResponseType, validateActive, validateSurveyEvent } from '../utils';
import { SurveyRespondInput } from '../inputs/SurveyRespondInput';

const DEBUG = makeDebug('resolvers:Survey');

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
  async createSurveyOccurence(
    @Ctx() { auth }: Context,
    @Arg('survey', () => String) survey: string,
    @Arg('visibleAt', () => Date) visibleAt: Date,
    @Arg('dueAt', () => Date) dueAt: Date,
  ): Promise<PrismaSurveyOccurence> {
    await validateSurveyEvent(auth, survey);

    return this.prisma.surveyOccurence.create({
      data: {
        survey: { connect: { id: survey } },
        visibleAt,
        dueAt,
      }
    })
  }

  @Authorized([AuthRole.ADMIN, AuthRole.STUDENT, AuthRole.MENTOR])
  @Query(() => [Survey])
  async surveys(
    @Ctx() { auth }: Context,
  ): Promise<PrismaSurvey[]> {
    const wherePersonType = auth.isAdmin ? {} : {
      personType: auth.personType!,
      surveyOccurences: {
        some: {
          visibleAt: { lte: new Date() },
          surveyResponses: {
            none: auth.personType === PersonType.MENTOR
              ? { authorMentorId: auth.id }
              : { authorStudentId: auth.id },
          },
        },
      },
    };
    if (!auth.isAdmin) {
      try { await validateActive(auth); }
      catch (_) { return []; }
    }

    return this.prisma.survey.findMany({
      where: {
        ...wherePersonType,
        eventId: auth.eventId!,
      },
    });
  }

  @Authorized([AuthRole.ADMIN, AuthRole.STUDENT, AuthRole.MENTOR])
  @Query(() => Survey)
  async survey(
    @Ctx() { auth }: Context,
    @Arg('survey', () => String) survey: string,
  ): Promise<PrismaSurvey> {
    const wherePersonType = auth.isAdmin ? {} : {
      personType: auth.personType!,
      surveyOccurences: {
        some: { visibleAt: { lte: new Date() } },
      },
    };
    if (!auth.isAdmin) await validateActive(auth);

    return this.prisma.survey.findFirst({
      where: {
        id: survey,
        ...wherePersonType,
        eventId: auth.eventId!,
      },
      rejectOnNotFound: true,
    });
  }

  @Authorized([AuthRole.STUDENT, AuthRole.MENTOR])
  @Mutation(() => Boolean)
  async surveyRespond(
    @Ctx() { auth }: Context,
    @Arg('occurrence', () => String) occurrence: string,
    @Arg('responses', () => [SurveyRespondInput]) responses: SurveyRespondInput[],
  ): Promise<boolean> {
    await validateActive(auth);

    const { survey } = await this.prisma.surveyOccurence.findFirst({
      where: {
        id: occurrence,
        survey: { personType: auth.personType!, eventId: auth.eventId! },
      },
      rejectOnNotFound: true,
      include: { survey: true },
    });

    // Validate the responses.
    // TODO(@tylermenezes): Validate that all required parts have been submitted.
    // TODO(@tylermenezes): Validate that the user isn't submitting a survey for non-teammates.
    for (const response of responses) {
      if ([response.mentor, response.student, response.project].filter(Boolean).length !== 1) {
        throw new Error('Each response should target one mentor, student, or project.');
      }
    }

    await this.prisma.surveyResponse.createMany({
      data: responses
        .map((response) => ({
          surveyOccurenceId: occurrence,
          projectId: response.project,
          mentorId: response.mentor,
          studentId: response.student,
          authorMentorId: auth.isMentor ? auth.id! : null,
          authorStudentId: auth.isStudent ? auth.id! : null,
          response: response.response,
          caution: 0.0,
        }))
        .map((response) => {
          const surveyCautionName = `${getSurveyResponseType(response)}Caution` as keyof typeof survey;
          if (surveyCautionName in survey && survey[surveyCautionName]) {
            try {
              const cautionFunction = new Function(`{ return ${survey[surveyCautionName] as string} };`);
              response.caution = cautionFunction.call(null)(response.response);
            } catch (ex) {
              DEBUG(`Could not evaluate ${survey.name}.${surveyCautionName}: `, ex);
            }
          }
          return response;
        }),
    });

    return true;
  }

  @Authorized(AuthRole.ADMIN, AuthRole.MANAGER, AuthRole.PARTNER)
  @Query(() => SurveyResponse)
  async getSurveyResponse(
    @Ctx() { auth }: Context,
    @Arg('where', () => String) where: string,
  ): Promise<PrismaSurveyResponse> {
    const surveyResponse = await this.prisma.surveyResponse.findUnique({
      where: { id: where },
      include: {
        student: true,
        authorStudent: true,
        mentor: true,
        authorMentor: true,
        surveyOccurence: { include: { survey: true } },
      },
      rejectOnNotFound: true,
    });

    if (auth.type === AuthRole.PARTNER) {
      if (
        !surveyResponse.student
        || auth.partnerCode !== surveyResponse.student.partnerCode
      ) {
        throw new Error('No permission to view this student\'s survey responses.');
      }
    }

    return surveyResponse;
  }
}
