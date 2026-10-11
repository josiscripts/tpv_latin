ALTER TABLE "public"."user_preferences"
  DROP CONSTRAINT "ai_model_id_valid";

ALTER TABLE "public"."bridge_config"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tipo_comg_categories"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_preferences"
  ALTER COLUMN "ai_model_id" SET DEFAULT 'claude-haiku-5-5'::text;

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "ai_model_id_valid" CHECK ((ai_model_id = ANY (ARRAY['claude-haiku-5-5'::text, 'claude-sonnet-5-5'::text])));

COMMENT ON COLUMN "public"."user_preferences"."ai_model_id" IS 'Modelo de Claude seleccionado para procesamiento de documentos. Default: claude-haiku-5-5 (económico)';

