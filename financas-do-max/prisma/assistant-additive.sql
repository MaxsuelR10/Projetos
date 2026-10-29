-- Additive and repeatable. Existing financas_max_state and financial records are preserved.
-- Do not run db push / migrate reset; this project has no Prisma baseline for existing tables.
CREATE TABLE IF NOT EXISTS public.financas_max_assistant_operations (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  request_id text NOT NULL,
  input_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token text NOT NULL,
  revision integer NOT NULL,
  operation jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS financas_max_assistant_operations_expires_at_idx
  ON public.financas_max_assistant_operations(expires_at);
