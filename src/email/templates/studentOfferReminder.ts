import { PrismaClient } from '@prisma/client';
import { StudentStatus } from '../../enums';
import { EmailContext } from '../spec';
import { PartialEvent } from '../loader';
import { DateTime } from 'luxon';

export async function getId(): Promise<string | null> {
  return `studentOfferReminder`;
}

export async function getList(prisma: PrismaClient, event: PartialEvent): Promise<EmailContext[]> {
  const yesterday = DateTime.now().minus({ days: 1 }).toJSDate();
  
  const students = await prisma.student.findMany({
    where: {
      status: StudentStatus.OFFERED,
      eventId: event.id,
      emailsSent: { some: { emailId: 'studentOffer', createdAt: { lt: yesterday } } },
    },
  });
  return students.map((student): EmailContext => ({
    student,
  }));
}
