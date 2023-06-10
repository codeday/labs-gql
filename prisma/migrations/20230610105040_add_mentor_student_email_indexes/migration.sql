-- CreateIndex
CREATE UNIQUE INDEX "Mentor.email_eventId_unique" ON "Mentor"("email", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Student.email_eventId_unique" ON "Student"("email", "eventId");