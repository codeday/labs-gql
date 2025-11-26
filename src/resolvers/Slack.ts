import {
  Resolver, Authorized, Mutation, Arg, Ctx
} from 'type-graphql';
import { PrismaClient } from '@prisma/client';
import { Inject, Service } from 'typedi';
import { Context, AuthRole } from '../context';
import { idOrUsernameOrEmailOrAuthToUniqueWhere } from '../utils';
import { JwtPayload, verify } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

@Service()
@Resolver()
export class SlackResolver {
  @Inject(() => PrismaClient)
  private readonly prisma: PrismaClient;

  private readonly client = new JwksClient({
    jwksUri: 'https://slack.com/openid/connect/keys'
  });

  private getKey(header: any, callback: (err: any, key: string) => any) {
    this.client.getSigningKey(header.kid, function (err, key) {
      if (err || !key) throw new Error('Key not found');
      callback(null, key.getPublicKey());
    });
  }

  private decodeJwt(token: string): Promise<JwtPayload> {
    const keyResolver = this.getKey.bind(this);
    return new Promise((resolve, reject) => {
      verify(
        token,
        keyResolver,
        { issuer: 'https://slack.com' },
        (err, resp) => {
          if (err) return reject(err);
          if (typeof resp !== 'object') return reject('JWT was not an object.');
          resolve(resp as JwtPayload);
        }
      );
    });
  }

  @Authorized(AuthRole.STUDENT, AuthRole.MENTOR)
  @Mutation(() => Boolean)
  async linkSlack(
    @Ctx() { auth }: Context,
    @Arg('token', () => String) tokenStr: string,
  ) {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: auth.eventId },
      rejectOnNotFound: true,
    });

    const token = await this.decodeJwt(tokenStr);

    if (token['https://slack.com/team_id'] !== event.slackWorkspaceId) {
      throw new Error('Signed in with the wrong workspace. Please sign in with the Slack workspace used for this event.');
    }

    const slackId = token['https://slack.com/user_id'];

    if (auth.isStudent) {
      await this.prisma.student.update({
        where: await idOrUsernameOrEmailOrAuthToUniqueWhere(auth),
        data: { slackId },
      });
      return true;

    } else if (auth.isMentor) {
      await this.prisma.mentor.update({
        where: await idOrUsernameOrEmailOrAuthToUniqueWhere(auth),
        data: { slackId },
      });
      return true;
    }

    throw new Error('Not a student or mentor.');
  }
}
