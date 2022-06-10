/*
  Warnings:

  - A unique constraint covering the columns `[username,eventId]` on the table `Mentor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[username,eventId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Student.username_unique";

-- DropIndex
DROP INDEX "Mentor.username_unique";

-- AlterTable
ALTER TABLE "Mentor" ADD COLUMN     "eventId" TEXT NOT NULL DEFAULT E'codeday-labs-2022';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "eventId" TEXT NOT NULL DEFAULT E'codeday-labs-2022';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "eventId" TEXT NOT NULL DEFAULT E'codeday-labs-2022';

-- CreateIndex
CREATE UNIQUE INDEX "Mentor.username_eventId_unique" ON "Mentor"("username", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Student.username_eventId_unique" ON "Student"("username", "eventId");

-- AddForeignKey
ALTER TABLE "Student" ADD FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentor" ADD FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
