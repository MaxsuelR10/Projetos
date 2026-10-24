export const palettes={
  green:{name:'Verde · padrão',accent:'#79e6b4'},
  rose:{name:'Rosa degradê',accent:'#ed83b5'},
  violet:{name:'Violeta',accent:'#ad8cf0'},
  blue:{name:'Azul oceano',accent:'#65b6ed'},
  amber:{name:'Âmbar',accent:'#e5b457'},
};
const validHex=value=>/^#[0-9a-f]{6}$/i.test(value||'');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>'#'+rgb(a).map((c,i)=>Math.round(c+(rgb(b)[i]-c)*t).toString(16).padStart(2,'0')).join('');
const luminance=hex=>rgb(hex).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function readable(color,background,target){let result=color;for(let i=0;i<=100&&contrast(result,background)<4.6;i++)result=mix(color,target,i/100);return result;}

export function themeTokens(name='green',surface='dark',customColor=''){
  const id=name==='custom'&&validHex(customColor)?'custom':Object.hasOwn(palettes,name)?name:'green';
  const color=id==='custom'?customColor:palettes[id].accent,light=surface==='light';
  // Related tinted surfaces give the entire application the chosen color identity.
  const bg=mix(color,light?'#eef0f4':'#080a0e',light?.89:.95);
  const panel=mix(color,light?'#fafbfe':'#101319',light?.95:.94);
  const raised=mix(color,light?'#e9edf3':'#181c24',light?.88:.9);
  const accent=readable(color,panel,light?'#191521':'#ffffff');
  let end=mix(color,light?'#ffffff':'#d6c7ff',.13);
  const weakest=c=>Math.min(contrast(c,color),contrast(c,end));
  let onAccent=weakest('#000000')>=weakest('#ffffff')?'#000000':'#ffffff';
  if(weakest(onAccent)<4.5){end=color;onAccent=contrast('#000000',color)>=contrast('#ffffff',color)?'#000000':'#ffffff';}
  return {id,surface:light?'light':'dark',tokens:{
    bg,panel,'panel-hi':raised,sidebar:mix(color,light?'#e7ebf1':'#07090d',light?.9:.96),
    border:mix(color,light?'#cbd2df':'#303745',.8),text:mix(color,light?'#18202f':'#f0f2f8',.96),
    muted:mix(color,light?'#536078':'#a1adbf',.92),green:accent,'green-dim':mix(color,panel,light?.86:.83),
    'accent-fill':color,'accent-end':end,'on-accent':onAccent,
    'accent-glow':mix(color,bg,light?.87:.9),
    red:light?'#b83345':'#f3a0a7','shadow-color':light?'#24344c12':'#00000026',
  }};
}

export function applyPalette(name='green',surface='dark',customColor=''){
  const theme=themeTokens(name,surface,customColor),root=document.documentElement;
  root.dataset.palette=theme.id;root.dataset.surface=theme.surface;
  root.style.colorScheme=theme.surface==='light'?'light':'dark';
  for(const [key,value] of Object.entries(theme.tokens))root.style.setProperty('--'+key,value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.tokens.bg);
}

export function paletteOptions(selected='green'){
  return Object.entries(palettes).map(([id,p])=>`<option value="${id}" ${id===selected?'selected':''}>${p.name}</option>`).join('')+`<option value="custom" ${selected==='custom'?'selected':''}>Outra cor personalizada…</option>`;
}
