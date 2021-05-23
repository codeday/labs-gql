/*
  Warnings:

  - You are about to drop the column `score` on the `AdmissionRating` table. All the data in the column will be lost.
  - Added the required column `rating` to the `AdmissionRating` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `AdmissionRating` DROP COLUMN `score`,
    ADD COLUMN `rating` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Student` ADD COLUMN `offerDate` DATETIME(3),
    MODIFY `status` ENUM('APPLIED', 'TRACK_INTERVIEW', 'TRACK_CHALLENGE', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELED') NOT NULL DEFAULT 'APPLIED';
