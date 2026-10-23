import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyInput,parseCSV,csvExport,seedState,validateState,monthlyRows,totals,accountBalance,categoryTotals,findDuplicates,evaluateAgents,installmentSummary,assistantReply,shiftMonth,validDate,dailyTotals} from '../dist/domain.mjs';

test('valores brasileiros e valores decimais são convertidos para centavos inteiros',()=>{
  assert.equal(moneyInput('R$ 1.234,56'),123456);
  assert.equal(moneyInput('10,01'),1001);
  assert.equal(moneyInput('-0.07'),-7);
  assert.equal(moneyInput('0'),0);
  for(const input of ['NaN','1e8','', '1.2345','abc','99999999999999'])assert.throws(()=>moneyInput(input));
});
test('o exemplo valida, contém meses diferentes e não tem transações bancárias reais',()=>{
  const s=seedState('2026-10-21');assert.equal(validateState(s),s);
  assert.ok(monthlyRows(s,'2026-10').length>0);assert.ok(monthlyRows(s,'2026-09').length>0);
  assert.equal(s.accounts[0].name,'Banco Aurora');assert.equal(s.cards[0].last4,'4242');
});
test('transferências não inflam receitas e despesas; respeitam os dois saldos',()=>{
  const s=seedState('2026-10-21');s.transactions=[];
  const beforeBank=accountBalance(s,'bank'),beforeWallet=accountBalance(s,'wallet');
  s.transactions.push({id:'transfer-1',amount:12000,type:'transfer',accountId:'bank',toAccountId:'wallet',date:'2026-10-10',description:'Transferência',categoryId:'other'});
  assert.equal(accountBalance(s,'bank'),beforeBank-12000);assert.equal(accountBalance(s,'wallet'),beforeWallet+12000);
  assert.deepEqual(totals(s.transactions),{income:0,expense:0,balance:0,count:1});
  assert.equal(monthlyRows(s,'2026-10',{account:'wallet'}).length,1);
});
test('compra no cartão entra nas despesas, mas não desconta saldo de conta',()=>{
  const s=seedState('2026-10-21');s.transactions=[];const before=accountBalance(s,'bank');
  s.transactions.push({id:'card-purchase',amount:10000,type:'expense',accountId:'bank',cardId:'card',date:'2026-10-01',description:'Compra',categoryId:'shopping'});
  assert.equal(accountBalance(s,'bank'),before);assert.equal(totals(s.transactions).expense,10000);
});
test('ocultar afeta relatórios e categorias, mas não apaga o saldo bancário',()=>{
  const s=seedState('2026-10-21');s.transactions=[{id:'x',amount:2500,type:'expense',accountId:'bank',date:'2026-10-01',description:'Exemplo',categoryId:'food',hidden:true}];
  assert.equal(monthlyRows(s,'2026-10').length,0);assert.equal(monthlyRows(s,'2026-10',{hidden:true}).length,1);
  assert.equal(categoryTotals(s,'2026-10').find(c=>c.id==='food').total,0);
  assert.equal(accountBalance(s,'bank'),s.accounts[0].openingBalance-2500);
});
test('CSV preserva descrições com delimitador, aspas e quebras de linha',()=>{
  const parsed=parseCSV('\uFEFFdata;descricao;valor;tipo;categoria\r\n21/10/2026;"Café; com \"\"aspas\"\"\nsegunda linha";-125,50;despesa;Alimentação\r\n2026-10-20;Salário;1000,00;receita;Outros');
  assert.equal(parsed.length,2);assert.equal(parsed[0].amount,12550);assert.equal(parsed[0].type,'expense');assert.equal(parsed[0].date,'2026-10-21');
  assert.equal(parsed[0].description,'Café; com "aspas"\nsegunda linha');assert.equal(parsed[1].type,'income');
  assert.equal(parseCSV('date,description,amount\n2026-10-20,Coffee,-12.50')[0].amount,1250);
});
test('CSV rejeita formatos que produziriam dados financeiros incorretos',()=>{
  for(const input of ['nome;valor\nCafé;3','data;descricao;valor\n2026-02-30;Café;-3','data;descricao;valor\n2026-10-01;Café;0','data;descricao;valor\n2026-10-01;"Café;-3','data;descricao;valor;tipo\n2026-10-01;A;1;transferencia','data;descricao;valor;tipo\n2026-10-01;A;1;desconhecido'])assert.throws(()=>parseCSV(input));
});
test('exportação CSV evita injeção de fórmula em planilhas e permite reimportar receitas e despesas',()=>{
  const s=seedState('2026-10-21');const rows=monthlyRows(s,'2026-10');rows[0]={...rows[0],description:'=HYPERLINK("https://example.test")'};
  const csv=csvExport(rows,s);assert.ok(csv.includes('"\'=HYPERLINK'));const parsed=parseCSV(csv);assert.equal(parsed.length,rows.length);assert.equal(parsed[0].amount,rows[0].amount);assert.equal(parsed[0].type,rows[0].type);
});
test('validação de backup rejeita valores, tipos e referências corrompidos',()=>{
  const s=seedState('2026-10-21');for(const mutate of [x=>x.transactions[0].amount=-1,x=>x.transactions[0].date='inválida',x=>x.transactions[0].accountId='missing',x=>x.transactions[0].type='payment',x=>x.cards[0].limit=-1,x=>x.categories[0].budget=NaN,x=>x.agents[0].kind='remote-code',x=>x.transactions.push(x.transactions[0]),x=>x.installments[0].paid=999,x=>x.accounts[0].openingBalance=0.5,x=>x.profile.name=null]){const copy=structuredClone(s);mutate(copy);assert.throws(()=>validateState(copy));}
});
test('detecção de duplicatas exige a mesma data, conta, valor e descrição',()=>{
  const s=seedState('2026-10-21'),t=s.transactions.find(t=>t.type==='expense');assert.equal(findDuplicates([t,{...t,id:'2'}]).length,1);assert.equal(findDuplicates([t,{...t,id:'2',date:'2026-10-29'}]).length,0);
});
test('agentes ativos calculam limites e duplicatas a partir dos registros',()=>{
  const s=seedState('2026-10-21');s.categories.find(c=>c.id==='food').budget=1;const alerts=evaluateAgents(s,'2026-10');assert.ok(alerts.some(a=>a.severity==='warning'));assert.equal(alerts.length,2);
  s.agents.forEach(a=>a.active=false);assert.deepEqual(evaluateAgents(s,'2026-10'),[]);
});
test('parcelas concluídas ficam fora dos compromissos futuros',()=>{
  assert.deepEqual(installmentSummary([{amount:100,count:10,paid:4},{amount:200,count:4,paid:4}]),{total:1000,paid:400,remaining:600,monthly:100,count:1});
});
test('assistente usa os dados efetivos e explica limites ao receber pergunta fora do escopo',()=>{
  const s=seedState('2026-10-21');assert.match(assistantReply(s,'2026-10','Quanto gastei este mês?'),/transações/);assert.match(assistantReply(s,'2026-10','Quais são minhas assinaturas?'),/3 assinatura/);assert.match(assistantReply(s,'2026-10','Qual é o clima?'),/Não consulto a internet/);
});
test('meses, anos e calendário obedecem à data civil',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.ok(validDate('2024-02-29'));assert.equal(validDate('2026-02-29'),false);assert.equal(dailyTotals([],'2026-02').length,28);
});
