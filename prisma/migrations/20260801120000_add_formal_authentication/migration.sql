-- Formal local credentials and revocable sessions are additive to the v1.1
-- domain tables. The formal User table was not connected to production traffic
-- before this migration, so accountCode can be introduced as NOT NULL without
-- guessing identifiers for legacy Person rows.

ALTER TABLE "User"
  ADD COLUMN "accountCode" VARCHAR(32) NOT NULL,
  ADD COLUMN "protectedSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "issuer" DROP NOT NULL,
  ALTER COLUMN "externalSubject" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "EventAnonymousId"
  ADD COLUMN "secretVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "AdminAuditLog"
  ADD COLUMN "ipHash" CHAR(64),
  ADD COLUMN "userAgentHash" CHAR(64);

ALTER TABLE "Asset"
  ALTER COLUMN "width" DROP NOT NULL,
  ALTER COLUMN "height" DROP NOT NULL;

CREATE UNIQUE INDEX "User_accountCode_key" ON "User"("accountCode");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "LocalCredential" (
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "OidcIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OidcIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipHash" CHAR(64),
  "userAgentHash" CHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OidcIdentity_issuer_subject_key" ON "OidcIdentity"("issuer", "subject");
CREATE UNIQUE INDEX "OidcIdentity_userId_issuer_key" ON "OidcIdentity"("userId", "issuer");
CREATE INDEX "OidcIdentity_userId_idx" ON "OidcIdentity"("userId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "LocalCredential"
  ADD CONSTRAINT "LocalCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OidcIdentity"
  ADD CONSTRAINT "OidcIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
