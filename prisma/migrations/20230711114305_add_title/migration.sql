-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Open-Source Software Engineering Intern, CodeDay Labs';
ALTER TABLE "Event" ALTER COLUMN   "title" DROP DEFAULT;