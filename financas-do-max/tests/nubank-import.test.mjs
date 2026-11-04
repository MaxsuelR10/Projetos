import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,parseCSV,accountBalance,validateState} from '../dist/domain.mjs';
import {previewCsvImport,buildCsvImport} from '../dist/csv-import.mjs';
import {invoiceFor} from '../dist/billing.mjs';
test('fatura Nubank registra despesas no cartão, mantém saldo e evita duplicatas',()=>{
 const s=seedState('2026-10-01');s.transactions=[];s.invoicePayments=[];const c=s.cards[0];c.closingDay=3;c.dueDay=23;const csv='date,category,title,amount\n2026-10-02,Alimentação,Restaurante,10.50\n2026-10-01,Outros,Mercado,20.00';
 const rows=parseCSV(csv,{cardInvoice:true}), before=accountBalance(s,c.accountId);assert.equal(rows[0].type,'expense');const p=previewCsvImport(s,rows,c.accountId,c.id,'2026-10');assert.equal(p.rows[0].categoryId,s.categories.find(x=>x.name==='Alimentação').id);const result=buildCsvImport(s,rows,c.accountId,[0,1],(()=>{let i=0;return()=>`new${++i}`})(),c.id,'2026-10');s.transactions.push(...result.transactions);validateState(s);assert.equal(accountBalance(s,c.accountId),before);assert.equal(invoiceFor(s,c,'2026-10').total,3050);assert.equal(previewCsvImport(s,rows,c.accountId,c.id,'2026-10').duplicateCount,2);assert.throws(()=>previewCsvImport(s,rows,c.accountId,c.id,'2026-11'),/ciclo/);assert.throws(()=>parseCSV('date,title,amount\n2026-10-01,Pagamento,-20',{cardInvoice:true}),/pagamento ou estorno/);
});

test('pagamento recebido é ignorado; estornos continuam exigindo revisão',()=>{const csv='date,title,amount\n2026-10-01,Pagamento recebido,-100.00\n2026-10-02,Compra,12.00';const rows=parseCSV(csv,{cardInvoice:true});assert.equal(rows.length,1);assert.equal(rows.skippedPayments,1);assert.equal(rows[0].type,'expense');assert.throws(()=>parseCSV('date,title,amount\n2026-10-01,Estorno,-10.00',{cardInvoice:true}),/estorno/);});
