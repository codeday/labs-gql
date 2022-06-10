/*
  Warnings:

  - Added the required column `dueAt` to the `SurveyOccurence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `visibleAt` to the `SurveyOccurence` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AdmissionRating" DROP CONSTRAINT "AdmissionRating_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Mentor" DROP CONSTRAINT "Mentor_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_eventId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPreference" DROP CONSTRAINT "ProjectPreference_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPreference" DROP CONSTRAINT "ProjectPreference_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Survey" DROP CONSTRAINT "Survey_eventId_fkey";

-- DropForeignKey
ALTER TABLE "SurveyOccurence" DROP CONSTRAINT "SurveyOccurence_surveyId_fkey";

-- DropForeignKey
ALTER TABLE "SurveyResponse" DROP CONSTRAINT "SurveyResponse_surveyOccurenceId_fkey";

-- DropForeignKey
ALTER TABLE "TagTrainingSubmission" DROP CONSTRAINT "TagTrainingSubmission_studentId_fkey";

-- DropForeignKey
ALTER TABLE "TagTrainingSubmission" DROP CONSTRAINT "TagTrainingSubmission_tagId_fkey";

-- AlterTable
ALTER TABLE "SurveyOccurence" ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "visibleAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyOccurence" ADD CONSTRAINT "SurveyOccurence_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyOccurenceId_fkey" FOREIGN KEY ("surveyOccurenceId") REFERENCES "SurveyOccurence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRating" ADD CONSTRAINT "AdmissionRating_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPreference" ADD CONSTRAINT "ProjectPreference_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPreference" ADD CONSTRAINT "ProjectPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagTrainingSubmission" ADD CONSTRAINT "TagTrainingSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagTrainingSubmission" ADD CONSTRAINT "TagTrainingSubmission_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Mentor.username_eventId_unique" RENAME TO "Mentor_username_eventId_key";

-- RenameIndex
ALTER INDEX "Student.username_eventId_unique" RENAME TO "Student_username_eventId_key";
