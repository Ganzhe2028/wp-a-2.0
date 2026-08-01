-- Explicit, reversible links are required before any legacy Person data can be
-- associated with a formal User. No identity or content is inferred here.
CREATE TABLE "LegacyPersonLink" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "legacyPersonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mappingDigest" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyPersonLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyPersonLink_legacyPersonId_key" ON "LegacyPersonLink"("legacyPersonId");
CREATE UNIQUE INDEX "LegacyPersonLink_userId_key" ON "LegacyPersonLink"("userId");
CREATE UNIQUE INDEX "LegacyPersonLink_userId_eventId_key" ON "LegacyPersonLink"("userId", "eventId");
CREATE INDEX "LegacyPersonLink_eventId_createdAt_idx" ON "LegacyPersonLink"("eventId", "createdAt");

ALTER TABLE "LegacyPersonLink"
  ADD CONSTRAINT "LegacyPersonLink_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyPersonLink"
  ADD CONSTRAINT "LegacyPersonLink_userId_eventId_fkey"
  FOREIGN KEY ("userId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
