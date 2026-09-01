-- Cash payments can be tracked without inventing a bank account. Existing
-- references and the composite foreign key are preserved for every record that
-- already has an account.
ALTER TABLE "Transaction" ALTER COLUMN "accountId" DROP NOT NULL;
