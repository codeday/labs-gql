import {
  ObjectType, Field, Arg, Ctx,
} from 'type-graphql';
import { Container } from 'typedi';
import { PrismaClient, Survey as PrismaSurvey, SurveyResponse as PrismaSurveyResponse } from '@prisma/client';
import { Context } from '../context';
import { PersonType } from '../enums';
import { Survey } from './Survey';
import { SurveyResponse } from './SurveyResponse';
import { sanitizeSurveyResponses } from '../utils';

@ObjectType()
export class SurveyOccurence {
  @Field(() => String)
  id: string

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date

  @Field(() => String)
  surveyId: string

  survey: PrismaSurvey

  @Field(() => Survey, { name: 'survey' })
  async fetchSurvey(): Promise<PrismaSurvey> {
    if (!this.survey) {
      this.survey = (await Container.get(PrismaClient).survey.findUnique({
        where: { id: this.surveyId },
        rejectOnNotFound: true,
      }));
    }
    return this.survey;
  }

  @Field(() => [SurveyResponse], { name: 'surveyResponses' })
  async fetchSurveyResponses(
    @Ctx() { auth }: Context,
    @Arg('personType', () => String, { nullable: true }) personType?: PersonType,
  ): Promise<PrismaSurveyResponse[]> {
    const prisma = Container.get(PrismaClient);
    if (auth.isAdmin) {
      return prisma.surveyResponse.findMany({
        where: {
          surveyOccurence: { id: this.id },
          ...(personType ? { personType } : {}),
        },
      });
    }
    if (personType) throw Error('surveyResponses.personType may only be set by admins.');
    if (auth.isStudent || auth.isMentor) {
      return prisma.surveyResponse.findMany({
        where: {
          surveyOccurence: { id: this.id },
          [auth.isStudent ? 'authorStudent' : 'authorMentor']: { id: auth.id },
        },
      });
    }
    return [];
  }

  @Field(() => [SurveyResponse], { name: 'surveyFeedback' })
  async fetchSurveyFeedback(
    @Ctx() { auth }: Context,
    @Arg('personType', () => String, { nullable: true }) personType?: PersonType,
  ): Promise<PrismaSurveyResponse[]> {
    if (auth.isStudent || auth.isMentor) {
      const rawResponses = await Container.get(PrismaClient).surveyResponse.findMany({
        where: {
          surveyOccurence: { id: this.id },
          ...(personType ? { personType } : {}),
          OR: [
            { project: { students: { some: { id: auth.id } } } },
            { [auth.isStudent ? 'student' : 'mentor']: { id: auth.id } },
          ],
        },
      });
      const survey = await this.fetchSurvey();
      return sanitizeSurveyResponses(rawResponses, survey, auth);
    }

    // TODO(@tylermenezes): School dashboard.
    return [];
  }
}
