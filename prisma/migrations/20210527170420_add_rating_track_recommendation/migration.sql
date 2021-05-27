/*
  Warnings:

  - Added the required column `track` to the `AdmissionRating` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `AdmissionRating` ADD COLUMN `track` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED') NOT NULL;
