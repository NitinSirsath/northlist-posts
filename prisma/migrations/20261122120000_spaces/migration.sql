-- Spaces (owner, 22 Nov 2026): the one Profile per user becomes a list of spaces, each with its own links,
-- accounts and drafts. Every user gets one space made from their profile; their accounts and drafts move into it.
-- Users who exist already never see the new first-run steps.

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('PLAIN', 'FRIENDLY', 'BOLD');

-- CreateEnum
CREATE TYPE "LinkKind" AS ENUM ('WEBSITE', 'GITHUB_REPO', 'GITHUB_PROFILE', 'PAGE');

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "Goal" NOT NULL DEFAULT 'PROMOTE',
    "productName" TEXT NOT NULL DEFAULT '',
    "productUrl" TEXT NOT NULL DEFAULT '',
    "productLine" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postsPerDay" INTEGER NOT NULL DEFAULT 3,
    "repliesPerDay" INTEGER NOT NULL DEFAULT 0,
    "useX" BOOLEAN NOT NULL DEFAULT true,
    "useLinkedIn" BOOLEAN NOT NULL DEFAULT true,
    "tone" "Tone" NOT NULL DEFAULT 'PLAIN',
    "styleSamples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readyAt" TEXT NOT NULL DEFAULT '08:00',
    "weekends" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL DEFAULT 'you',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceLink" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "readOk" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceLink_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0;

-- Existing users: first-run steps count as done.
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP;

-- One space per existing user, from their profile when they have one ("shippedFrom" folders are not
-- carried over: spaces read links, not folders on a computer).
INSERT INTO "Space" ("id", "userId", "name", "goal", "productName", "productUrl", "productLine", "interests",
                     "postsPerDay", "repliesPerDay", "useX", "useLinkedIn", "styleSamples", "updatedBy", "updatedAt")
SELECT 'sp' || substr(md5(u."id" || clock_timestamp()::text), 1, 23),
       u."id",
       COALESCE(NULLIF(btrim(p."productName"), ''), 'My space'),
       COALESCE(p."goal", 'PROMOTE'),
       COALESCE(p."productName", ''),
       COALESCE(p."productUrl", ''),
       COALESCE(p."productLine", ''),
       COALESCE(p."interests", ARRAY[]::TEXT[]),
       COALESCE(p."postsPerDay", 3),
       COALESCE(p."repliesPerDay", 0),
       COALESCE(p."useX", true),
       COALESCE(p."useLinkedIn", true),
       COALESCE(p."styleSamples", ARRAY[]::TEXT[]),
       COALESCE(p."updatedBy", 'you'),
       CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "Profile" p ON p."userId" = u."id";

-- The product link becomes the space's first link.
INSERT INTO "SourceLink" ("id", "spaceId", "url", "kind", "title")
SELECT 'sl' || substr(md5(s."id" || clock_timestamp()::text), 1, 23), s."id", s."productUrl", 'WEBSITE', s."productName"
FROM "Space" s
WHERE s."productUrl" <> '';

-- Drafts and accounts move into the user's space.
ALTER TABLE "Idea" ADD COLUMN "spaceId" TEXT;
UPDATE "Idea" i SET "spaceId" = s."id" FROM "Space" s WHERE s."userId" = i."userId";
ALTER TABLE "Idea" ALTER COLUMN "spaceId" SET NOT NULL;

ALTER TABLE "SocialConnection" ADD COLUMN "spaceId" TEXT;
UPDATE "SocialConnection" c SET "spaceId" = s."id" FROM "Space" s WHERE s."userId" = c."userId";
ALTER TABLE "SocialConnection" ALTER COLUMN "spaceId" SET NOT NULL;

-- DropIndex
DROP INDEX "SocialConnection_userId_channel_key";

-- DropTable
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_userId_fkey";
DROP TABLE "Profile";

-- CreateIndex
CREATE INDEX "Space_userId_position_idx" ON "Space"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SourceLink_spaceId_url_key" ON "SourceLink"("spaceId", "url");

-- CreateIndex
CREATE INDEX "Idea_spaceId_createdAt_idx" ON "Idea"("spaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_spaceId_channel_key" ON "SocialConnection"("spaceId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_userId_channel_accountId_key" ON "SocialConnection"("userId", "channel", "accountId");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceLink" ADD CONSTRAINT "SourceLink_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
