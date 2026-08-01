-- Senior viewers are group-scoped by default. Admins may explicitly widen this
-- through the audited EventSettings switch.
ALTER TABLE "EventSettings"
ADD COLUMN "seniorCanBrowseAll" BOOLEAN NOT NULL DEFAULT false;
