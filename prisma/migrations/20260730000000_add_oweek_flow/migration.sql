ALTER TABLE "Person"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'LEARNER',
ADD COLUMN "groupName" TEXT,
ADD COLUMN "day1SubmittedAt" TIMESTAMP(3),
ADD COLUMN "day3Answers" JSONB,
ADD COLUMN "day3SubmittedAt" TIMESTAMP(3);

CREATE INDEX "Person_role_groupName_idx" ON "Person"("role", "groupName");