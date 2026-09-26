import { PrismaClient } from "@prisma/client";
import Container from "typedi";
import { Context } from '../../context';
import { makeDebug } from "../../utils";
import { issueGiftcard } from '../../shopify';
import { sendGiftcard } from '../../email';

const DEBUG = makeDebug('activities:tasks:issueGiftcard');

interface IssueMentorGiftcardArgs {
  initialValue?: number
  featuredProduct?: string
}

export type IssueGiftcardFn = typeof issueGiftcard;
export type SendGiftcardFn = typeof sendGiftcard;

export interface IssueMentorGiftcardDeps {
  issueGiftcard: IssueGiftcardFn;
  sendGiftcard: SendGiftcardFn;
}

const DEFAULT_DEPS: IssueMentorGiftcardDeps = { issueGiftcard, sendGiftcard };

export const SCHEMA = {
  type: 'object',
  required: ['initialValue'],
  properties: {
    initialValue: {
      type: 'number',
      title: 'Value (USD)',
      default: 10,
    },
    featuredProduct: {
      type: 'string',
      title: 'Featured Product',
      default: 'a Software Engineering Mentor Pin',
    }
  },
}

// Issue a gift card to every eligible mentor who has not already received one for this event.
// Idempotency is enforced via the `giftcardCode` column: the query excludes mentors that have
// already been issued a code, and a successful issue/email stamps the code back onto the mentor.
export async function issueMentorGiftcards(
  prisma: PrismaClient,
  eventId: string,
  args: IssueMentorGiftcardArgs,
  deps: IssueMentorGiftcardDeps = DEFAULT_DEPS,
): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, rejectOnNotFound: true });

  const mentors = await prisma.mentor.findMany({
    where: {
      eventId,
      status: 'ACCEPTED',
      projects: { some: { status: 'MATCHED' } },
      giftcardCode: null,
    },
  });

  for (const mentor of mentors) {
    try {
      DEBUG(`Issuing $${args.initialValue!} gift card to ${mentor.email}`);
      const code = await deps.issueGiftcard(
        args.initialValue!,
        `${event.name}: ${mentor.givenName} ${mentor.surname} (${mentor.email})`,
      );
      if (code) {
        await deps.sendGiftcard(
          mentor.email,
          event,
          args.initialValue!.toFixed(2),
          code,
          `Thank you for your mentorship at ${event.name}.`,
          'https://codeday.to/mentorshop',
          args.featuredProduct && args.featuredProduct.trim().length > 0 ? args.featuredProduct : undefined,
        );
        await prisma.mentor.update({
          where: { id: mentor.id },
          data: { giftcardCode: code },
        });
        DEBUG(`Emailed ${mentor.email} gift card.`)
      } else { DEBUG(`Could not create gift card for ${mentor.email}.` );}
    } catch (ex) { DEBUG(ex); }
  }
}

export default async function issueMentorGiftcardActivity({ auth }: Context, args: Partial<IssueMentorGiftcardArgs> | undefined): Promise<void> {
  const prisma = Container.get(PrismaClient);

  if (!args || !args.initialValue) {
    throw new Error(`Must specify badgeClassEntityId in arguments.`);
  }

  await issueMentorGiftcards(prisma, auth.eventId!, args, DEFAULT_DEPS);
}
