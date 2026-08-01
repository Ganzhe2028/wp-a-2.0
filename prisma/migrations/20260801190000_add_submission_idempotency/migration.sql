ALTER TABLE "Submission"
  ADD COLUMN "submitIdempotencyKeyHash" CHAR(64),
  ADD COLUMN "submitRequestHash" CHAR(64),
  ADD COLUMN "submitResult" JSONB;
