import {
  Resolver, Mutation, Authorized, Arg,
} from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Mentor, PrismaClient, Student } from '@prisma/client';
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import { Transporter } from 'nodemailer';
import { AuthRole } from '../context';
import { StudentStatus, MentorStatus } from '../enums';
import { StudentFilterInput, MentorFilterInput } from '../inputs';
import { tokenFor } from '../email/helpers';

@Service()
@Resolver(() => Boolean)
export class Emails {
  @Inject(() => PrismaClient)
  private readonly prisma : PrismaClient;

  @Inject('email')
  private readonly email: Transporter;

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Number)
  async sendStudentEmail(
    @Arg('subject', () => String) subjectStr: string,
    @Arg('body', () => String) bodyStr: string,
    @Arg('where', () => StudentFilterInput, { nullable: true }) where?: StudentFilterInput,
    @Arg('dryRun', () => Boolean, { nullable: true, defaultValue: false }) dryRun?: boolean,
  ): Promise<number> {
    const tos = await this.prisma.student.findMany({
      where: where ? where.toQuery() : { status: StudentStatus.ACCEPTED },
      include: { projects: { include: { mentors: true } } },
    });
    if (!dryRun) this.genericEmailSend(subjectStr, bodyStr, tos);
    return tos.length;
  }

  @Authorized(AuthRole.ADMIN)
  @Mutation(() => Number)
  async sendMentorEmail(
    @Arg('subject', () => String) subjectStr: string,
    @Arg('body', () => String) bodyStr: string,
    @Arg('where', () => MentorFilterInput, { nullable: true }) where?: MentorFilterInput,
    @Arg('dryRun', () => Boolean, { nullable: true, defaultValue: false }) dryRun?: boolean,
  ): Promise<number> {
    const tos = await this.prisma.mentor.findMany({
      where: where ? where.toQuery() : { status: MentorStatus.ACCEPTED },
      include: { projects: { include: { students: true } } },
    });
    if (!dryRun) this.genericEmailSend(subjectStr, bodyStr, tos);
    return tos.length;
  }

  genericEmailSend(subjectStr: string, bodyStr: string, tos: (Student | Mentor)[]): void {
    const subject = handlebars.compile(subjectStr);
    const body = handlebars.compile(bodyStr);

    (async () => {
      for (const to of tos) {
        const toWithToken = { ...to, token: tokenFor(to) };
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.email.sendMail({
            to: to.email,
            from: `"CodeDay Labs" <labs@codeday.org>`,
            subject: subject(toWithToken),
            html: Marked.parse(body(toWithToken)),
            text: body(toWithToken),
          });
        // eslint-disable-next-line no-console
        } catch (err) { console.error(err); }
      }
    })();
  }
}
