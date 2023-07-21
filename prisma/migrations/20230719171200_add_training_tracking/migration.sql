ALTER TABLE "StandupResult" ADD COLUMN "trainingSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "standupAiModelVague" TEXT NULL;
ALTER TABLE "Event" ADD COLUMN "standupAiModelVaguePending" TEXT NULL;
ALTER TABLE "Event" ADD COLUMN "standupAiModelWorkload" TEXT NULL;
ALTER TABLE "Event" ADD COLUMN "standupAiModelWorkloadPending" TEXT NULL;