import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCurrencyMask,digitsOnly} from '../dist/input-masks.mjs';

test('máscara de moeda brasileira preserva os centavos',()=>{
  assert.equal(formatCurrencyMask('1'),'R$ 0,01');
  assert.equal(formatCurrencyMask('123456'),'R$ 1.234,56');
  assert.equal(formatCurrencyMask('R$ 9,50'),'R$ 9,50');
  assert.equal(formatCurrencyMask('-42'),'−R$ 0,42'.replace('−','-'));
});

test('máscara numérica remove caracteres e respeita tamanho máximo',()=>{
  assert.equal(digitsOnly('12a.34'),'1234');
  assert.equal(digitsOnly('1234-5678',4),'1234');
  assert.equal(digitsOnly(''), '');
});
