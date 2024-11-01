
ALTER TABLE public."Event" ADD COLUMN "contractSchema" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Event" ADD COLUMN "contractUi" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Partner" ADD COLUMN "contractSchema" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Partner" ADD COLUMN "contractUi" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Student" ADD COLUMN "eventContractData" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Student" ADD COLUMN "partnerContractData" jsonb NULL DEFAULT NULL;