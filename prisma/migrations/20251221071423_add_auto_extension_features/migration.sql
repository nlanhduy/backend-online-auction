/*
Warnings:

- Added the required column `startTime` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "extendedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "originalEndTime" TIMESTAMP(3),
ADD COLUMN "startTime" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "autoExtendThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "extensionDuration" INTEGER NOT NULL DEFAULT 10,
    "maxExtensions" INTEGER DEFAULT 3,
    "minImages" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_status_endTime_idx" ON "Product" ("status", "endTime");

-- AddForeignKey
ALTER TABLE "system_settings"
ADD CONSTRAINT "system_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;