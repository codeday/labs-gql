import { Mentor, Student, Project } from '@prisma/client';

export interface EmailContext {
  mentor?: Mentor,
  student?: Student,
  project?: Project,
}

export interface FrontMatter {
  to?: string
  cc?: string
  bcc?: string
  from?: string
  subject: string
}
