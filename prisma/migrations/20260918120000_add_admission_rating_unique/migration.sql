-- Drop legacy duplicate (studentId, ratedBy) ratings so the unique index can
-- be created; keep one row per pair, preferring the most recently updated
-- (tie-break by the latest id).
DELETE FROM "AdmissionRating"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT DISTINCT ON ("studentId", "ratedBy") "id"
    FROM "AdmissionRating"
    ORDER BY "studentId", "ratedBy", "updatedAt" DESC, "id" DESC
  ) AS "keepers"
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionRating.studentId_ratedBy_unique" ON "AdmissionRating"("studentId", "ratedBy");
