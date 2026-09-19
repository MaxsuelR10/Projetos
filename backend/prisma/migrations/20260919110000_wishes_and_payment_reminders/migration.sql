-- CreateEnum
CREATE TYPE "WishStatus" AS ENUM ('ACTIVE', 'PURCHASED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "WishItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "normalizedName" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "url" VARCHAR(2048),
    "notes" TEXT,
    "status" "WishStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WishItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(19,4),
    "notes" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishItem_userId_status_createdAt_idx" ON "WishItem"("userId", "status", "createdAt");
CREATE INDEX "WishItem_userId_normalizedName_idx" ON "WishItem"("userId", "normalizedName");
CREATE INDEX "PaymentReminder_userId_isDone_dueDate_idx" ON "PaymentReminder"("userId", "isDone", "dueDate");

-- AddForeignKey
ALTER TABLE "WishItem" ADD CONSTRAINT "WishItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
