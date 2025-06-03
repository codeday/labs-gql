-- Create FileTypeType enum
CREATE TYPE "FileTypeType" AS ENUM ('IMAGE', 'PDF', 'VIDEO');

-- Create FileTypeGenerationCondition enum
CREATE TYPE "FileTypeGenerationCondition" AS ENUM ('ACCEPTED', 'STARTED', 'COMPLETED');

-- Create FileTypeGenerationTarget enum
CREATE TYPE "FileTypeGenerationTarget" AS ENUM ('MENTOR', 'STUDENT', 'PROJECT');

-- Create FileType table
CREATE TABLE "FileType" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "templateId" TEXT NOT NULL,
  "type" "FileTypeType" NOT NULL,
  "layers" JSONB NOT NULL,
  "generationCondition" "FileTypeGenerationCondition" NOT NULL,
  "generationTarget" "FileTypeGenerationTarget" NOT NULL,
  "slug" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,

  CONSTRAINT "FileType_pkey" PRIMARY KEY ("id")
);

-- Create File table
CREATE TABLE "File" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "url" TEXT,
  "pollingUrl" TEXT,
  "projectId" TEXT,
  "mentorId" TEXT,
  "studentId" TEXT,
  "fileTypeId" TEXT NOT NULL,

  CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "FileType" ADD CONSTRAINT "FileType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "File" ADD CONSTRAINT "File_fileTypeId_fkey" FOREIGN KEY ("fileTypeId") REFERENCES "FileType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "File" ADD CONSTRAINT "File_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "File" ADD CONSTRAINT "File_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "Mentor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "File" ADD CONSTRAINT "File_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

