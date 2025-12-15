/*
  Warnings:

  - You are about to drop the column `answer` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `answererId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `askerId` on the `Question` table. All the data in the column will be lost.
  - Added the required column `userId` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_answererId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_askerId_fkey";

-- DropIndex
DROP INDEX "Question_askerId_idx";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "answer",
DROP COLUMN "answererId",
DROP COLUMN "askerId",
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Question_userId_idx" ON "Question"("userId");

-- CreateIndex
CREATE INDEX "Question_parentId_idx" ON "Question"("parentId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
