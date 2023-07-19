import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const GRACE_PERIOD_WEEKS = 2;

export async function updateActiveEvents() {
  const prisma = Container.get(PrismaClient);
  const now = DateTime.now();

  // Mark events inactive after all students are over.
  const [events, eventsMaxWeeks] = await Promise.all([
    prisma.event.findMany({
      where: { isActive: true },
      select: { id: true, startsAt: true },
    }),
    prisma.student.groupBy({
      _max: { weeks: true },
      by: ['eventId'],
      where: { event: { isActive: true } },
    }),
  ]);

  const eventStartsAt = Object.fromEntries(events.map(e => [e.id, e.startsAt]));

  const expiredEvents = eventsMaxWeeks
    .filter(e => {
      const startsAt = eventStartsAt[e.eventId]!;
      const expiresAt = DateTime.fromJSDate(startsAt)
        .plus({ weeks: (e._max.weeks || 2) + GRACE_PERIOD_WEEKS });

      return now > expiresAt;
    });

  await prisma.event.updateMany({
    where: { id: { in: expiredEvents.map(e => e.eventId) } },
    data: { isActive: false },
  });
}