import { Mentor, Student, Project } from '@prisma/client';

export interface ScheduledEmail {
  to: Mentor | Student,
  project?: Project,
}
