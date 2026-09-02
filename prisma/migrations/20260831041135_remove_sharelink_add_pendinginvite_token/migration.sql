/*
  Warnings:

  - You are about to drop the `ShareLink` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[token]` on the table `PendingInvite` will be added. If there are existing duplicate values, this will fail.
  - The required column `token` was added to the `PendingInvite` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "ShareLink" DROP CONSTRAINT "ShareLink_mindMapId_fkey";

-- AlterTable
ALTER TABLE "PendingInvite" ADD COLUMN     "token" TEXT NOT NULL;

-- DropTable
DROP TABLE "ShareLink";

-- CreateIndex
CREATE UNIQUE INDEX "PendingInvite_token_key" ON "PendingInvite"("token");
