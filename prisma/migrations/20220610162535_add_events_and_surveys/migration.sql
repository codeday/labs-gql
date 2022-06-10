-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('MENTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'NUMBER', 'AGREE', 'CHECKBOXES', 'RADIOS', 'DROPDOWN', 'CONTENT');

-- AlterTable
ALTER TABLE "AdmissionRating" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmailSent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Mentor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tag" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TagTrainingSubmission" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "studentApplicationsStartAt" TIMESTAMP(3) NOT NULL,
    "studentApplicationsEndAt" TIMESTAMP(3) NOT NULL,
    "studentApplicationSchema" JSONB NOT NULL,
    "studentApplicationUi" JSONB NOT NULL,
    "studentApplicationPostprocess" JSONB NOT NULL,
    "mentorApplicationsStartAt" TIMESTAMP(3) NOT NULL,
    "mentorApplicationsEndAt" TIMESTAMP(3) NOT NULL,
    "mentorApplicationSchema" JSONB NOT NULL,
    "mentorApplicationUi" JSONB NOT NULL,
    "mentorApplicationPostprocess" JSONB NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personType" "PersonType" NOT NULL,
    "selfSchema" JSONB,
    "selfUi" JSONB,
    "selfCaution" TEXT,
    "peerSchema" JSONB,
    "peerUi" JSONB,
    "peerShare" JSONB,
    "peerCaution" TEXT,
    "menteeSchema" JSONB,
    "menteeUi" JSONB,
    "menteeShare" JSONB,
    "menteeCaution" TEXT,
    "mentorSchema" JSONB,
    "mentorUi" JSONB,
    "mentorShare" JSONB,
    "mentorCaution" TEXT,
    "projectSchema" JSONB,
    "projectUi" JSONB,
    "projectShare" JSONB,
    "projectCaution" TEXT,
    "eventId" TEXT NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyOccurence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "surveyId" TEXT NOT NULL,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "response" JSONB NOT NULL,
    "caution" DOUBLE PRECISION NOT NULL,
    "surveyOccurenceId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "authorMentorId" TEXT,
    "studentId" TEXT,
    "mentorId" TEXT,
    "projectId" TEXT,

    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SurveyOccurence" ADD FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("surveyOccurenceId") REFERENCES "SurveyOccurence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("authorMentorId") REFERENCES "Mentor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("mentorId") REFERENCES "Mentor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
