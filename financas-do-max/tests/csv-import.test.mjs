import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState, accountBalance, validateState} from '../dist/domain.mjs';
import {previewCsvImport, csvSelectionSummary, buildCsvImport} from '../dist/csv-import.mjs';

const records = [{date:'2026-10-22', description:'Mercado teste', amount:4567, type:'expense', categoryName:'Supermercado'}, {date:'2026-10-22', description:'Recebimento teste', amount:10000, type:'income', categoryName:'Outros'}];
const fixture = () => {const state=seedState('2026-10-22');state.transactions=[];return state;};
const ids = () => {let i=0;return () => `import-${++i}`;};

test('prévia não grava nem altera o estado e projeta o saldo em centavos', () => {
  const state=fixture(), original=structuredClone(state), preview=previewCsvImport(state,records,'bank');
  const summary=csvSelectionSummary(preview,[0,1]);
  assert.deepEqual(state,original);assert.equal(summary.netEffect,5433);
  assert.equal(summary.balanceAfter,accountBalance(state,'bank')+5433);assert.equal(summary.count,2);
});
test('seleção limita os registros efetivamente importados', () => {
  const state=fixture(), result=buildCsvImport(state,records,'bank',[0],ids());
  assert.equal(state.transactions.length,0);assert.equal(result.transactions.length,1);
  state.transactions.push(...result.transactions);validateState(state);
  assert.equal(accountBalance(state,'bank'),state.accounts[0].openingBalance-4567);
  assert.equal(result.transactions[0].settledAt,'2026-10-22');
});
test('duplicatas existentes e dentro do arquivo são ignoradas na mesma conta', () => {
  const state=fixture(), repeated=[records[0],{...records[0],description:'MERCÁDO TESTE'},records[1]];
  const first=buildCsvImport(state,repeated,'bank',[0,1,2],ids());
  assert.equal(first.duplicateCount,1);assert.equal(first.transactions.length,2);
  state.transactions.push(...first.transactions);
  assert.equal(previewCsvImport(state,repeated,'bank').duplicateCount,3);
  assert.throws(()=>buildCsvImport(state,repeated,'bank',[0,1,2],ids()),/ao menos/);
  assert.equal(previewCsvImport(state,repeated,'wallet').duplicateCount,1);
});
test('compras de cartão e cancelamentos não escondem lançamento CSV em conta', () => {
  for (const extra of [{cardId:'card'}, {status:'cancelled'}]) {
    const state=fixture();state.transactions.push({...records[0],id:'existing',accountId:'bank',...extra});
    assert.equal(previewCsvImport(state,records,'bank').duplicateCount,0);
  }
});
test('pagamento vinculado de fatura impede segundo débito pelo extrato CSV', () => {
  const state=fixture();state.transactions.push({...records[0],id:'invoice',accountId:'bank',invoicePaymentId:'invoice',status:'completed'});
  const result=buildCsvImport(state,records,'bank',[0,1],ids());
  assert.equal(result.duplicateCount,1);assert.equal(result.transactions.length,1);
  assert.equal(result.transactions[0].type,'income');
});
test('confirmação reavalia duplicatas surgidas após a prévia', () => {
  const state=fixture();previewCsvImport(state,records,'bank');
  state.transactions.push({...records[0],id:'new-elsewhere',accountId:'bank'});
  const result=buildCsvImport(state,records,'bank',[0,1],ids());
  assert.equal(result.transactions.length,1);assert.equal(result.summary.netEffect,10000);
});
test('prévia rejeita conta ausente, arquivo vazio, datas e valores inválidos', () => {
  const state=fixture();assert.throws(()=>previewCsvImport(state,records,'missing'));
  assert.throws(()=>previewCsvImport(state,[],'bank'));
  for(const patch of [{date:'2026-02-30'},{amount:0},{amount:1.5},{type:'transfer'},{description:' '},{amount:Infinity}]) assert.throws(()=>previewCsvImport(state,[{...records[0],...patch}],'bank'));
  assert.throws(()=>buildCsvImport(state,records,'bank',[],ids()));
});
test('identificadores duplicados abortam sem mutação parcial', () => {
  const state=fixture(), original=structuredClone(state);
  assert.throws(()=>buildCsvImport(state,records,'bank',[0,1],()=> 'same'),/único/);
  assert.deepEqual(state,original);
});
