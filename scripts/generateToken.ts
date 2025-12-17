import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { signTokenAdmin, signTokenManager, signTokenUser } from '../src/utils';

const prisma = new PrismaClient();

async function main() {
  const eventId = process.argv[2] || 'event-test-2025';
  const role = process.argv[3] || 'admin'; // admin, manager, mentor, or student

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

  let token: string;

  if (role === 'admin') {
    token = signTokenAdmin(event);
    console.log(`\nAdmin token for event "${eventId}":\n${token}\n`);
  } else if (role === 'manager') {
    token = signTokenManager(event);
    console.log(`\nManager token for event "${eventId}":\n${token}\n`);
  } else if (role === 'mentor') {
    const mentor = await prisma.mentor.findFirst({ where: { eventId } });
    if (!mentor) throw new Error(`No mentors found for event ${eventId}`);
    token = signTokenUser(mentor);
    console.log(`\nMentor token for ${mentor.email} in event "${eventId}":\n${token}\n`);
  } else if (role === 'student') {
    const student = await prisma.student.findFirst({ where: { eventId } });
    if (!student) throw new Error(`No students found for event ${eventId}`);
    token = signTokenUser(student);
    console.log(`\nStudent token for ${student.email} in event "${eventId}":\n${token}\n`);
  } else {
    throw new Error(`Unknown role: ${role}. Use admin, manager, mentor, or student.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
