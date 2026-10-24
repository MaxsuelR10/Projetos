export async function requireSession(){
  async function session(){const res=await fetch('/api/session',{cache:'no-store'});if(res.status===401)return null;if(!res.ok)throw new Error('Serviço de acesso indisponível. Recarregue para tentar novamente.');return (await res.json()).user;}
  let user=await session();if(user)return user;
  const app=document.querySelector('#app');let signup=false;
  return new Promise(resolve=>{
    function show(){
      app.innerHTML=`<main class="auth-page"><form class="panel auth-panel"><img src="./mark.svg" width="48" height="48" alt="Finanças do Max"><h1>${signup?'Crie sua conta':'Seu dinheiro, organizado.'}</h1><p>Entre para acessar suas finanças com segurança.</p>${signup?'<label class="field">Nome<input name="name" autocomplete="name" required maxlength="100"></label>':''}<label class="field">E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label class="field">Senha<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="8" maxlength="128" required></label><p role="alert" id="auth-error"></p><button class="btn primary" type="submit">${signup?'Criar conta':'Fazer login'}</button><button class="btn" type="button" id="auth-toggle">${signup?'Já tenho conta':'Criar uma conta'}</button></form></main>`;
      document.querySelector('#auth-toggle').onclick=()=>{signup=!signup;show();};
      app.querySelector('form').onsubmit=async ev=>{
        ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
        try{const body=Object.fromEntries(new FormData(form));const res=await fetch(signup?'/api/signup':'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await res.json();if(!res.ok)throw new Error(result.error);user=await session();if(!user)throw new Error('Não foi possível confirmar a sessão.');form.reset();resolve(user);}catch(err){document.querySelector('#auth-error').textContent=err.message;}finally{button.disabled=false;}
      };
    }show();
  });
}
