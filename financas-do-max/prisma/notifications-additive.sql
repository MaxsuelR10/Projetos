-- Apply to an isolated branch first. Does not alter financial documents.
CREATE TABLE IF NOT EXISTS public.financas_max_push_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financas_max_push_user_idx ON public.financas_max_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS public.financas_max_push_deliveries (
  subscription_id text NOT NULL REFERENCES public.financas_max_push_subscriptions(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  claim_token text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY(subscription_id,event_key)
);
