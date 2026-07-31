-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LEARNER', 'SENIOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionSection" AS ENUM ('DAY1', 'DAY3');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "AssetScanStatus" AS ENUM ('PENDING', 'PROCESSING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetProcessingStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSettings" (
    "eventId" TEXT NOT NULL,
    "day1Open" BOOLEAN NOT NULL DEFAULT false,
    "day3Open" BOOLEAN NOT NULL DEFAULT false,
    "authoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowEditing" BOOLEAN NOT NULL DEFAULT false,
    "showName" BOOLEAN NOT NULL DEFAULT false,
    "fullProfileVisible" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSettings_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayNameSortKey" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LEARNER',
    "groupId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "SubmissionSection" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "templateVersion" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "scanStatus" "AssetScanStatus" NOT NULL DEFAULT 'PENDING',
    "processingStatus" "AssetProcessingStatus" NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day1Slot" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "assetId" TEXT,
    "cropX" DOUBLE PRECISION,
    "cropY" DOUBLE PRECISION,
    "cropScale" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Day1Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day3Bottle" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "bottleKey" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "level" INTEGER,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Day3Bottle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Day3Bottle_level_range" CHECK ("level" IS NULL OR ("level" >= 0 AND "level" <= 5))
);

-- CreateTable
CREATE TABLE "EventAnonymousId" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anonymousId" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAnonymousId_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventAnonymousId_length" CHECK (char_length("anonymousId") = 8)
);

-- CreateTable
CREATE TABLE "ArtworkPublicId" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ArtworkPublicId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventKey_key" ON "Event"("eventKey");
CREATE INDEX "EventSettings_updatedBy_idx" ON "EventSettings"("updatedBy");
CREATE INDEX "User_eventId_status_role_idx" ON "User"("eventId", "status", "role");
CREATE INDEX "User_eventId_displayNameSortKey_idx" ON "User"("eventId", "displayNameSortKey");
CREATE INDEX "User_groupId_idx" ON "User"("groupId");
CREATE UNIQUE INDEX "User_eventId_issuer_externalSubject_key" ON "User"("eventId", "issuer", "externalSubject");
CREATE UNIQUE INDEX "User_id_eventId_key" ON "User"("id", "eventId");
CREATE INDEX "Group_eventId_sortOrder_idx" ON "Group"("eventId", "sortOrder");
CREATE UNIQUE INDEX "Group_eventId_stableKey_key" ON "Group"("eventId", "stableKey");
CREATE UNIQUE INDEX "Group_eventId_name_key" ON "Group"("eventId", "name");
CREATE UNIQUE INDEX "Group_id_eventId_key" ON "Group"("id", "eventId");
CREATE INDEX "Submission_eventId_section_status_idx" ON "Submission"("eventId", "section", "status");
CREATE INDEX "Submission_userId_status_idx" ON "Submission"("userId", "status");
CREATE UNIQUE INDEX "Submission_eventId_userId_section_key" ON "Submission"("eventId", "userId", "section");
CREATE UNIQUE INDEX "Submission_id_eventId_key" ON "Submission"("id", "eventId");
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");
CREATE INDEX "Asset_eventId_ownerUserId_createdAt_idx" ON "Asset"("eventId", "ownerUserId", "createdAt");
CREATE INDEX "Asset_eventId_checksum_idx" ON "Asset"("eventId", "checksum");
CREATE INDEX "Asset_processingStatus_scanStatus_idx" ON "Asset"("processingStatus", "scanStatus");
CREATE UNIQUE INDEX "Asset_id_eventId_key" ON "Asset"("id", "eventId");
CREATE INDEX "Day1Slot_assetId_idx" ON "Day1Slot"("assetId");
CREATE UNIQUE INDEX "Day1Slot_submissionId_slotKey_key" ON "Day1Slot"("submissionId", "slotKey");
CREATE UNIQUE INDEX "Day3Bottle_submissionId_bottleKey_key" ON "Day3Bottle"("submissionId", "bottleKey");
CREATE INDEX "EventAnonymousId_userId_idx" ON "EventAnonymousId"("userId");
CREATE UNIQUE INDEX "EventAnonymousId_eventId_userId_key" ON "EventAnonymousId"("eventId", "userId");
CREATE UNIQUE INDEX "EventAnonymousId_eventId_anonymousId_key" ON "EventAnonymousId"("eventId", "anonymousId");
CREATE UNIQUE INDEX "ArtworkPublicId_publicId_key" ON "ArtworkPublicId"("publicId");
CREATE INDEX "ArtworkPublicId_eventId_userId_revokedAt_idx" ON "ArtworkPublicId"("eventId", "userId", "revokedAt");
CREATE INDEX "AdminAuditLog_requestId_idx" ON "AdminAuditLog"("requestId");
CREATE INDEX "AdminAuditLog_eventId_createdAt_idx" ON "AdminAuditLog"("eventId", "createdAt");
CREATE INDEX "AdminAuditLog_eventId_actorUserId_createdAt_idx" ON "AdminAuditLog"("eventId", "actorUserId", "createdAt");
CREATE INDEX "AdminAuditLog_eventId_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("eventId", "targetType", "targetId", "createdAt");
CREATE INDEX "AdminAuditLog_eventId_action_createdAt_idx" ON "AdminAuditLog"("eventId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "EventSettings" ADD CONSTRAINT "EventSettings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSettings" ADD CONSTRAINT "EventSettings_updatedBy_eventId_fkey" FOREIGN KEY ("updatedBy", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_eventId_fkey" FOREIGN KEY ("groupId", "eventId") REFERENCES "Group"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_eventId_fkey" FOREIGN KEY ("userId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerUserId_eventId_fkey" FOREIGN KEY ("ownerUserId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Day1Slot" ADD CONSTRAINT "Day1Slot_submissionId_eventId_fkey" FOREIGN KEY ("submissionId", "eventId") REFERENCES "Submission"("id", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Day1Slot" ADD CONSTRAINT "Day1Slot_assetId_eventId_fkey" FOREIGN KEY ("assetId", "eventId") REFERENCES "Asset"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Day3Bottle" ADD CONSTRAINT "Day3Bottle_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAnonymousId" ADD CONSTRAINT "EventAnonymousId_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventAnonymousId" ADD CONSTRAINT "EventAnonymousId_userId_eventId_fkey" FOREIGN KEY ("userId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtworkPublicId" ADD CONSTRAINT "ArtworkPublicId_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtworkPublicId" ADD CONSTRAINT "ArtworkPublicId_userId_eventId_fkey" FOREIGN KEY ("userId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_eventId_fkey" FOREIGN KEY ("actorUserId", "eventId") REFERENCES "User"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;
