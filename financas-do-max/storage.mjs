import {neon} from '@neondatabase/serverless';
import {validateState} from './dist/domain.mjs';

export function createStore(url, workspace) {
  const sql=neon(url);
  return {
    async read(){
      const rows=await sql`SELECT revision, payload FROM public.financas_max_state WHERE workspace_id=${workspace}`;
      return rows.length?{revision:rows[0].revision,state:validateState(rows[0].payload)}:{revision:0,state:null};
    },
    async write(state, revision){
      validateState(state);
      if(!Number.isSafeInteger(revision)||revision<0)throw Object.assign(new Error('Versão inválida.'),{status:400});
      const payload=JSON.stringify(state);
      const rows=revision===0
        ?await sql`INSERT INTO public.financas_max_state(workspace_id,revision,payload) VALUES (${workspace},1,${payload}::jsonb) ON CONFLICT DO NOTHING RETURNING revision`
        :await sql`UPDATE public.financas_max_state SET payload=${payload}::jsonb,revision=revision+1,updated_at=now() WHERE workspace_id=${workspace} AND revision=${revision} RETURNING revision`;
      if(!rows.length)throw Object.assign(new Error('Os dados foram alterados em outra aba. Exporte seu backup e recarregue a página.'),{status:409});
      return {revision:rows[0].revision};
    }
  };
}
