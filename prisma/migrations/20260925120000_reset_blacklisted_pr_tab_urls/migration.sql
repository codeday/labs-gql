UPDATE "Project"
SET "prDescriptionFetchedAt" = NULL,
    "prShortDescription" = NULL
WHERE "prDescriptionFetchedAt" IS NOT NULL
  AND "prShortDescription" IS NULL
  AND "prUrl" ~ 'github\.com/[^/]+/[^/]+/pull/[0-9]+/';
