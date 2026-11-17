import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {institutionIdentity, institutionOptionLabel, institutionOptions, institutions, matchesInstitution, suggestInstitution} from '../dist/institutions.mjs';
import {accountBalance, seedState, validateState} from '../dist/domain.mjs';
import {cardCommitment, invoiceFor} from '../dist/billing.mjs';
import {createStore} from '../storage.mjs';

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

test('catálogo usa identificadores únicos, SVGs locais e contraste AA', async () => {
  assert.equal(new Set(institutionOptions.map(item => item.id)).size, institutionOptions.length);
  for (const item of institutionOptions) {
    const values = [luminance(item.primary), luminance(item.text)];
    assert.ok((Math.max(...values)+0.05)/(Math.min(...values)+0.05) >= 4.5, item.displayName);
  }
  for (const item of institutions) {
    assert.match(item.logo, /^\.\/institution-logos\/[a-z-0-9]+\.svg$/);
    const svg = await readFile(new URL('../dist/' + item.logo, import.meta.url), 'utf8');
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /<(?:script|foreignObject|image)\b|\bon\w+=|\bhref=|url\((?!#)/i);
  }
});

test('busca ignora acentos e sugestões são explícitas e conservadoras', () => {
  assert.ok(matchesInstitution(institutionIdentity('itau'), 'itau'));
  assert.ok(matchesInstitution(institutionIdentity('caixa'), 'economica federal'));
  assert.equal(suggestInstitution({name:'Banco Inter'})?.id, 'inter');
  assert.equal(suggestInstitution({name:'Inter e Nubank'}), null);
  assert.equal(suggestInstitution({name:'Nubank',type:'Dinheiro'}), null);
  assert.equal(suggestInstitution({name:'Nubank',institutionId:'custom'}), null);
  assert.equal(institutionOptionLabel({name:'Cartão virtual',institutionId:'mercado-pago'}), 'Cartão virtual · Mercado Pago');
});

test('metadados opcionais preservam os vínculos, os cálculos e a leitura de registros anteriores', () => {
  const before = seedState('2026-11-17');
  const after = structuredClone(before);
  assert.equal(validateState(before), before);
  assert.equal(institutionIdentity(before.accounts[0].institutionId).logo, null);
  after.accounts[0].institutionId = 'nubank';
  after.accounts[1].institutionId = 'custom';
  after.cards[0].institutionId = 'santander';
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(after))), after);
  assert.equal(after.cards[0].accountId, before.cards[0].accountId);
  assert.equal(accountBalance(after, 'bank'), accountBalance(before, 'bank'));
  assert.deepEqual(cardCommitment(after, after.cards[0]), cardCommitment(before, before.cards[0]));
  assert.deepEqual(invoiceFor(after, after.cards[0], '2026-11', '2026-11-17'),
    invoiceFor(before, before.cards[0], '2026-11', '2026-11-17'));
});

test('armazenamento do servidor rejeita IDs arbitrários antes da gravação', async () => {
  const store = createStore('postgresql://test:test@invalid.example/test', 'user:teste');
  for (const collection of ['accounts','cards']) {
    for (const id of ['https://example.org/brand.svg', '<svg>', 'color:red', '__proto__', {}, 0, '']) {
      const state = seedState();
      state[collection][0].institutionId = id;
      await assert.rejects(store.write(state, 1), /Instituição financeira inválida/);
    }
  }
});
