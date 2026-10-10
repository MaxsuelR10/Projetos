CREATE TABLE "CsvImportProfile" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "headers" JSONB NOT NULL,
  "mapping" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CsvImportProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CsvImportProfile_userId_name_key" ON "CsvImportProfile"("userId", "name");
ALTER TABLE "CsvImportProfile" ADD CONSTRAINT "CsvImportProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
