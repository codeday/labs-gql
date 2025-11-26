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

export default async function issueMentorGiftcardActivity({ auth }: Context, args: Partial<IssueMentorGiftcardArgs> | undefined): Promise<void> {
  const prisma = Container.get(PrismaClient);

  if (!args || !args.initialValue) {
    throw new Error(`Must specify badgeClassEntityId in arguments.`);
  }
  const event = await prisma.event.findUniqueOrThrow({ where: { id: auth.eventId! } });

  const mentors = await prisma.mentor.findMany({
    where: {
      eventId: auth.eventId!,
      status: 'ACCEPTED',
      projects: { some: { status: 'MATCHED' } },
    },
  });

  for (const mentor of mentors) {
    try {
      DEBUG(`Issuing $${args.initialValue!} gift card to ${mentor.email}`);
      const code = await issueGiftcard(
        args.initialValue!,
        `${event.name}: ${mentor.givenName} ${mentor.surname} (${mentor.email})`,
      );
      if (code) {
        await sendGiftcard(
          mentor.email,
          event,
          args.initialValue!.toFixed(2),
          code,
          `Thank you for your mentorship at ${event.name}.`,
          'https://codeday.to/mentorshop',
          args.featuredProduct && args.featuredProduct.trim().length > 0 ? args.featuredProduct : undefined,
        );
        DEBUG(`Emailed ${mentor.email} gift card.`)
      } else { DEBUG(`Could not create gift card for ${mentor.email}.`); }
    } catch (ex) { DEBUG(ex); }
  }
}