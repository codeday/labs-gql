CREATE TYPE "TrainingEntryType" AS ENUM ('ARTICLE', 'VIDEO', 'QUIZ');

ALTER TABLE "Event" ADD COLUMN "mentorTrainingUrl" TEXT NULL DEFAULT NULL;
ALTER TABLE "Event" ADD COLUMN "studentTrainingUrl" TEXT NULL DEFAULT NULL;
ALTER TABLE "Event" ADD COLUMN "partnersOnly" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "Mentor" ADD COLUMN "trainingComplete" BOOLEAN DEFAULT FALSE;

CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT NOT NULL,

    "vivibleAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
	
	"sentAgendaVisibleReminder" BOOLEAN NOT NULL DEFAULT FALSE,
	"sentAgendaOverdueReminder" BOOLEAN NOT NULL DEFAULT FALSE,
	"sentMeetingReminder" BOOLEAN NOT NULL DEFAULT FALSE,
	
	"agendaStudentSchema" jsonb NULL DEFAULT NULL,
	"agendaStudentUi" jsonb NULL DEFAULT NULL,
	
	"notesStudentSchema" jsonb NULL DEFAULT NULL,
	"notesStudentUi" jsonb NULL DEFAULT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Meeting" ADD FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	"attended" BOOLEAN NOT NULL DEFAULT FALSE,
	"prepared" BOOLEAN NOT NULL DEFAULT FALSE,
	
	"meetingId" TEXT NOT NULL,
	"studentId" TEXT NOT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingAttendance" ADD FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "MeetingResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	"agenda" jsonb NULL DEFAULT NULL,
	"notes" jsonb NULL DEFAULT NULL,
	
	"meetingId" TEXT NOT NULL,
	"authorStudentId" TEXT NOT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MeetingResponse" ADD FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingResponse" ADD FOREIGN KEY ("authorStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrainingGroup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

		"name" TEXT NOT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Event" ADD COLUMN "studentTrainingGroupId" TEXT NULL DEFAULT NULL;
ALTER TABLE "Event" ADD FOREIGN KEY ("studentTrainingGroupId") REFERENCES "TrainingGroup"("id") ON DELETE SET NULL ON UPDATE SET NULL;


CREATE TABLE "TrainingEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

		"sort" INTEGER NOT NULL DEFAULT 0,
		"name" TEXT NOT NULL,
		"type" "TrainingEntryType" NOT NULL DEFAULT E'ARTICLE',
		"content" TEXT NULL DEFAULT NULL,
		"videoId" TEXT NULL DEFAULT NULL,
		"videoTranscript" TEXT NULL DEFAULT NULL,
		"quizSchema" jsonb NULL DEFAULT NULL,
		"quizUi" jsonb NULL DEFAULT NULL,
		"quizScore" TEXT NULL DEFAULT NULL,
		
		"trainingGroupId" TEXT NOT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrainingEntry" ADD FOREIGN KEY ("trainingGroupId") REFERENCES "TrainingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "TrainingEntryResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	"score" FLOAT NOT NULL,
	"response" jsonb NULL DEFAULT NULL,
	
	"trainingGroupId" TEXT NOT NULL,
	"studentId" TEXT NULL DEFAULT NULL,
	
    PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrainingEntryResponse" ADD FOREIGN KEY ("trainingGroupId") REFERENCES "TrainingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEntryResponse" ADD FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
