/*
  Warnings:

  - You are about to drop the column `approved` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Mentor` MODIFY `status` ENUM('APPLIED', 'SCHEDULED', 'ACCEPTED', 'REJECTED', 'CANCELED') NOT NULL DEFAULT 'APPLIED';

-- AlterTable
ALTER TABLE `Project` DROP COLUMN `approved`,
    ADD COLUMN `status` ENUM('PROPOSED', 'ACCEPTED', 'MATCHED') NOT NULL DEFAULT 'PROPOSED';

-- AlterTable
ALTER TABLE `Student` MODIFY `status` ENUM('APPLIED', 'TRACK_INTERVIEW', 'TRACK_CHALLENGE', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'APPLIED';
