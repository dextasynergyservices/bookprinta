-- AddValue: PENDING_REDIS to JobStatus enum
-- Safe to re-run: IF NOT EXISTS prevents failure on replay.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PENDING_REDIS';
