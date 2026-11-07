ALTER TYPE "IssuerType" ADD VALUE IF NOT EXISTS 'TRANSPORT_AUTHORITY';

UPDATE "Issuer"
SET "type" = 'TRANSPORT_AUTHORITY'
WHERE "normalizedName" IN ('transport for london', 'transport for london (tfl)', 'tfl');
