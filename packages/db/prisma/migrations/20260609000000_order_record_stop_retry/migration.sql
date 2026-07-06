-- Track consecutive failed trailing-stop placement retries for the position.protect recovery worker
ALTER TABLE "OrderRecord" ADD COLUMN "stopRetryCount" INTEGER NOT NULL DEFAULT 0;
