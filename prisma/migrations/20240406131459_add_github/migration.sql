ALTER TABLE "Student" ADD COLUMN "githubUsername" TEXT NULL DEFAULT NULL;

CREATE TYPE "PrStatus" AS ENUM ('NOT_OPENED', 'OPENED_PENDING', 'OPENED_CLA_REQUESTED', 'OPENED_CHANGES_REQUESTED', 'CLOSED_REJECTED', 'CLOSED_MERGED');

ALTER TABLE "Project" ADD COLUMN "issueFetchedAt" TIMESTAMP(3) NULL DEFAULT NULL;
ALTER TABLE "Project" ADD COLUMN "prFetchedAt" TIMESTAMP(3) NULL DEFAULT NULL;
ALTER TABLE "Project" ADD COLUMN "prStatusUpdatedAt" TIMESTAMP(3) NULL DEFAULT NULL;
ALTER TABLE "Project" ADD COLUMN "prUrl" TEXT NULL DEFAULT NULL;
ALTER TABLE "Project" ADD COLUMN "prStatus" "PrStatus" NULL DEFAULT NULL;

ALTER TABLE "Repository" ADD COLUMN "usersExp" INTEGER NULL DEFAULT NULL;