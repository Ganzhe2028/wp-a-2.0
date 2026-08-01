CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "scope" VARCHAR(120) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "responseCiphertext" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_eventId_actorUserId_scope_keyHash_key"
  ON "IdempotencyRecord"("eventId", "actorUserId", "scope", "keyHash");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE INDEX "IdempotencyRecord_eventId_actorUserId_createdAt_idx"
  ON "IdempotencyRecord"("eventId", "actorUserId", "createdAt");

ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_actorUserId_eventId_fkey"
  FOREIGN KEY ("actorUserId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
