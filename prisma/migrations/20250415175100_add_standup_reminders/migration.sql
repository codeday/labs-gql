ALTER TABLE public."StandupThread" ADD COLUMN "sentMissingReminderSlack" boolean NOT NULL DEFAULT true;
ALTER TABLE public."StandupThread" ADD COLUMN "sentMissingReminderEmail" boolean NOT NULL DEFAULT true;

ALTER TABLE public."StandupThread" ALTER COLUMN "sentMissingReminderSlack" SET DEFAULT false;
ALTER TABLE public."StandupThread" ALTER COLUMN "sentMissingReminderEmail" SET DEFAULT false;