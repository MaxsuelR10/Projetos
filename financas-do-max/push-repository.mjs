import {createHash,randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
export const subscriptionId=endpoint=>createHash('sha256').update(endpoint).digest('hex');
export function createPushRepository(url) {
  const sql=neon(url);
  return {
    async subscribe(userId,subscription) {
      const id=subscriptionId(subscription.endpoint);
      // A device belongs to its current signed-in account; never keep the previous user's alerts.
      await sql`DELETE FROM public.financas_max_push_subscriptions WHERE id=${id} AND user_id<>${userId}`;
      await sql`INSERT INTO public.financas_max_push_subscriptions(id,user_id,subscription) VALUES(${id},${userId},${JSON.stringify(subscription)}::jsonb) ON CONFLICT(id) DO UPDATE SET subscription=EXCLUDED.subscription`;
    },
    async remove(userId,endpoint) {await sql`DELETE FROM public.financas_max_push_subscriptions WHERE id=${subscriptionId(endpoint)} AND user_id=${userId}`;},
    async subscriptions(userId) {return sql`SELECT id,user_id,subscription FROM public.financas_max_push_subscriptions WHERE user_id=${userId} ORDER BY created_at LIMIT 20`;},
    async pendingKeys(id) {return sql`SELECT event_key FROM public.financas_max_push_deliveries WHERE subscription_id=${id} AND sent_at IS NULL AND event_key LIKE 'new-bill:%' ORDER BY claimed_at LIMIT 100`;},
    async users() {return sql`SELECT DISTINCT user_id FROM public.financas_max_push_subscriptions ORDER BY user_id`;},
    async claim(id,key) {
      const token=randomUUID();
      if(key.startsWith('budget:')&&key.endsWith(':80')) {
        const higher=key.slice(0,-2)+'100';
        if((await sql`SELECT 1 FROM public.financas_max_push_deliveries WHERE subscription_id=${id} AND event_key=${higher}`).length)return null;
      }
      const rows=await sql`INSERT INTO public.financas_max_push_deliveries(subscription_id,event_key,claim_token) VALUES(${id},${key},${token}) ON CONFLICT(subscription_id,event_key) DO UPDATE SET claim_token=EXCLUDED.claim_token,claimed_at=now() WHERE financas_max_push_deliveries.sent_at IS NULL AND financas_max_push_deliveries.claimed_at<now()-interval '10 minutes' RETURNING claim_token`;
      return rows.length?token:null;
    },
    async finish(id,key,token) {await sql`UPDATE public.financas_max_push_deliveries SET sent_at=now() WHERE subscription_id=${id} AND event_key=${key} AND claim_token=${token}`;},
    async release(id,key,token) {await sql`UPDATE public.financas_max_push_deliveries SET claimed_at=now()-interval '11 minutes' WHERE subscription_id=${id} AND event_key=${key} AND claim_token=${token} AND sent_at IS NULL`;},
    async cleanup() {await sql`DELETE FROM public.financas_max_push_deliveries WHERE claimed_at<now()-interval '62 days'`;}
  };
}
