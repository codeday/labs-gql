
ALTER TABLE public."Event" ADD COLUMN "contractSchemaNoPartner" jsonb NULL DEFAULT NULL;
ALTER TABLE public."Event" ADD COLUMN "contractUiNoPartner" jsonb NULL DEFAULT NULL;
