const emailField='<label class="field">E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label>';
const passwordField=(label,name,autocomplete)=>`<label class="field">${label}<input name="${name}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="128" required></label>`;
const backButton='<button class="btn" type="button" data-auth-view="login">Voltar para o login</button>';
const recoveryButton='<button class="btn" type="button" data-auth-view="request">Esqueci minha senha</button>';
const views={
  login:{
    title:'Seu dinheiro, organizado.',
    description:'Entre para acessar suas finanças com segurança.',
    fields:emailField+passwordField('Senha','password','current-password'),
    submit:'Fazer login',
    actions:recoveryButton+'<button class="btn" type="button" data-auth-view="signup">Criar uma conta</button>'
  },
  signup:{
    title:'Crie sua conta',
    fields:'<label class="field">Nome<input name="name" autocomplete="name" required maxlength="100"></label>'+emailField+passwordField('Senha','password','new-password'),
    submit:'Criar conta',
    actions:'<button class="btn" type="button" data-auth-view="login">Já tenho conta</button>'
  },
  request:{
    title:'Recupere sua senha',
    description:'Informe o e-mail cadastrado para receber o link de redefinição.',
    fields:emailField,
    submit:'Enviar link por e-mail',
    actions:backButton
  },
  sent:{
    title:'Confira seu e-mail',
    description:'Se houver uma conta com esse endereço, você receberá um link de redefinição. Confira também a pasta de spam.',
    actions:backButton
  },
  reset:{
    title:'Redefina sua senha',
    description:'Use uma senha de 8 a 128 caracteres.',
    fields:passwordField('Nova senha','newPassword','new-password')+passwordField('Confirme a nova senha','confirmPassword','new-password'),
    submit:'Redefinir senha',
    actions:'<button class="btn" type="button" data-auth-view="request">Solicitar outro link</button>'+backButton
  },
  done:{
    title:'Senha redefinida',
    description:'Entre com sua nova senha.',
    actions:backButton
  }
};

async function currentSession(){
  const res=await fetch('/api/session',{cache:'no-store'});
  if(res.status===401)return null;
  if(!res.ok)throw new Error('Serviço de acesso indisponível. Recarregue para tentar novamente.');
  return (await res.json()).user;
}

async function post(path,body){
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){
    const result=await res.json().catch(()=>null);
    throw new Error(result?.error||'Serviço de acesso indisponível. Tente novamente.');
  }
}

export async function requireSession(){
  const callback=new URL(location.href);
  const resetting=callback.searchParams.get('redefinir-senha')==='1';
  let token='';
  if(resetting){
    token=callback.searchParams.has('error')?'':callback.searchParams.get('token')||'';
    callback.searchParams.delete('token');
    callback.searchParams.delete('error');
    history.replaceState(history.state,'',callback);
  }else{
    const user=await currentSession();
    if(user)return user;
  }

  const app=document.querySelector('#app');
  let email='';
  return new Promise(resolve=>{
    function show(view,{error='',focus=true}={}){
      if(view!=='reset'&&resetting){
        token='';
        if(callback.searchParams.has('redefinir-senha')){
          callback.searchParams.delete('redefinir-senha');
          history.replaceState(history.state,'',callback);
        }
      }
      const {title,description,fields,submit,actions}=views[view];
      app.innerHTML=`<main class="auth-page"><form class="panel auth-panel">
        <img src="./finance-icon.png" width="96" height="96" alt="Finanças do Max">
        <h1 tabindex="-1">${title}</h1>
        ${description?`<p>${description}</p>`:''}
        ${fields||''}
        <p role="alert" id="auth-error"></p>
        ${submit?`<button class="btn primary" type="submit">${submit}</button>`:''}
        ${actions}
      </form><install-app></install-app></main>`;
      const form=app.querySelector('form');
      const alert=form.querySelector('#auth-error');
      const emailInput=form.elements.namedItem('email');
      if(emailInput)emailInput.value=email;
      if(error)alert.textContent=error;
      if(focus)form.querySelector('h1').focus();

      const buttons=form.querySelectorAll('button');
      for(const button of form.querySelectorAll('[data-auth-view]')){
        button.onclick=()=>{
          if(emailInput)email=emailInput.value;
          show(button.dataset.authView);
        };
      }
      if(!submit)return;

      form.onsubmit=async event=>{
        event.preventDefault();
        alert.textContent='';
        for(const button of buttons)button.disabled=true;
        try{
          const input=Object.fromEntries(new FormData(form));
          if(emailInput)email=input.email;
          if(view==='request'){
            await post('/api/password-reset/request',{email});
            show('sent');
          }else if(view==='reset'){
            if(input.newPassword!==input.confirmPassword){
              form.elements.namedItem('confirmPassword').focus();
              throw new Error('As senhas precisam ser iguais.');
            }
            await post('/api/password-reset/confirm',{token,newPassword:input.newPassword});
            form.reset();
            show('done');
          }else{
            await post(view==='signup'?'/api/signup':'/api/login',input);
            const user=await currentSession();
            if(!user)throw new Error('Não foi possível confirmar a sessão.');
            form.reset();
            resolve(user);
          }
        }catch(err){
          alert.textContent=err.message;
        }finally{
          for(const button of buttons)button.disabled=false;
        }
      };
    }

    if(!resetting)show('login',{focus:false});
    else if(token)show('reset');
    else show('request',{error:'O link de redefinição é inválido ou expirou. Solicite um novo link.'});
  });
}
