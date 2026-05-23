-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TripStyle" AS ENUM ('car', 'backpacking');

-- CreateEnum
CREATE TYPE "ItemScope" AS ENUM ('per_person', 'shared', 'per_tent');

-- CreateEnum
CREATE TYPE "ItemSource" AS ENUM ('template', 'amenity', 'custom');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('Shelter', 'Sleep', 'Kitchen', 'Water', 'Food', 'Clothing', 'Navigation', 'Health_Safety', 'Hygiene', 'Tools_Repair', 'Personal_Misc');

-- CreateTable
CREATE TABLE "Campsite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agency" TEXT,
    "state" CHAR(2),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "description" TEXT,
    "amenities" JSONB NOT NULL,
    "activities" TEXT[],
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campsite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campsiteId" TEXT NOT NULL,
    "campsiteSnapshot" JSONB NOT NULL,
    "style" "TripStyle" NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "tentCapacity" SMALLINT NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ItemScope" NOT NULL,
    "baseQty" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "note" TEXT,
    "source" "ItemSource" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TripItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "tripId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("itemId","participantId")
);

-- CreateIndex
CREATE INDEX "Campsite_state_idx" ON "Campsite"("state");

-- CreateIndex
CREATE INDEX "Campsite_agency_idx" ON "Campsite"("agency");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_ownerToken_key" ON "Trip"("ownerToken");

-- CreateIndex
CREATE INDEX "TripItem_tripId_idx" ON "TripItem"("tripId");

-- CreateIndex
CREATE INDEX "Participant_tripId_token_idx" ON "Participant"("tripId", "token");

-- CreateIndex
CREATE INDEX "Claim_tripId_idx" ON "Claim"("tripId");

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TripItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

