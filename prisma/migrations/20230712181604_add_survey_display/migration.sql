ALTER TABLE "Survey" ADD COLUMN     "intro" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "selfDisplay" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "peerDisplay" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "menteeDisplay" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "mentorDisplay" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "projectDisplay" TEXT;
ALTER TABLE "Survey" ADD COLUMN     "randomize" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Survey" ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false;