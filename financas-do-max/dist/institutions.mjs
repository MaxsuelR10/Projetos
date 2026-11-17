// Brand artwork is bundled locally. See institution-logos/LICENSE.txt.
const brand = (id, displayName, name, primary, text, secondary = primary, aliases = []) =>
  Object.freeze({id, displayName, name, primary, secondary, text, aliases: Object.freeze(aliases),
    logo: './institution-logos/' + id + '.svg'});

export const institutions = Object.freeze([
  brand('banco-do-brasil', 'Banco do Brasil', 'Banco do Brasil', '#FFDD00', '#003D7A', '#003D7A', ['BB']),
  brand('banco-pan', 'Banco PAN', 'Banco PAN', '#FFFFFF', '#414141', '#414141', ['PAN']),
  brand('bradesco', 'Bradesco', 'Banco Bradesco', '#CC092F', '#FFFFFF'),
  brand('btg-pactual', 'BTG Pactual', 'Banco BTG Pactual', '#001E62', '#FFFFFF', '#46689F', ['BTG']),
  brand('c6-bank', 'C6 Bank', 'Banco C6', '#121212', '#FFFFFF', '#626262', ['C6']),
  brand('caixa', 'Caixa', 'Caixa Econômica Federal', '#0066A1', '#FFFFFF', '#F39200', ['CEF', 'Caixa Tem']),
  brand('cora', 'Cora', 'Cora Sociedade de Crédito Direto', '#FE3E6D', '#15131C'),
  brand('inter', 'Inter', 'Banco Inter', '#FF7A00', '#211306', '#A84500', ['Intermedium']),
  brand('itau', 'Itaú', 'Itaú Unibanco', '#EC7000', '#19144A', '#19144A', ['Banco Itaú']),
  brand('mercado-pago', 'Mercado Pago', 'Mercado Pago', '#00BCFF', '#0A0080', '#0A0080', ['Mercadopago']),
  brand('neon', 'Neon', 'Neon Pagamentos', '#01C4E0', '#161C3E', '#161C3E', ['Banco Neon']),
  brand('nubank', 'Nubank', 'Nu Pagamentos', '#820AD1', '#FFFFFF', '#B26BD8', ['Nu', 'NuBank Ultravioleta']),
  brand('pagbank', 'PagBank', 'PagBank', '#42A936', '#062513', '#083D87', ['PagSeguro']),
  brand('picpay', 'PicPay', 'PicPay', '#21C25E', '#052A18', '#063D2B'),
  brand('santander', 'Santander', 'Banco Santander', '#EC0000', '#FFFFFF', '#9D1417'),
  brand('sicoob', 'Sicoob', 'Sistema de Cooperativas Financeiras do Brasil', '#003B43', '#FFFFFF', '#B8D335'),
  brand('sicredi', 'Sicredi', 'Sistema de Crédito Cooperativo', '#3DAE2B', '#102710', '#174829'),
  brand('xp', 'XP', 'XP Investimentos', '#171717', '#FFFFFF', '#737373', ['Banco XP'])
].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR')));

const institutionsById = new Map(institutions.map(item => [item.id, item]));
const neutral = {primary: '#344054', secondary: '#98A2B3', text: '#FFFFFF', logo: null};

export const institutionOptions = Object.freeze([
  Object.freeze({...neutral, id: '', displayName: 'Sem instituição selecionada'}),
  Object.freeze({...neutral, id: 'other', displayName: 'Outra instituição'}),
  Object.freeze({...neutral, id: 'custom', displayName: 'Personalizado'}),
  ...institutions
]);
const optionsById = new Map(institutionOptions.map(item => [item.id, item]));

export const isValidInstitutionId = id =>
  id === undefined || id === null || (id !== '' && optionsById.has(id));

export const institutionIdentity = id => optionsById.get(id) || institutionOptions[0];

function searchKey(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function searchNames(item) {
  return [item.displayName, item.name, ...(item.aliases || [])].filter(Boolean).map(searchKey);
}

export function matchesInstitution(item, query) {
  const words = searchKey(query).split(' ').filter(Boolean);
  return searchNames(item).some(name => words.every(word => name.includes(word)));
}

export function suggestInstitution(record) {
  if (!record || record.institutionId != null || record.type === 'Dinheiro') return null;
  const name = searchKey(record.name);
  const matches = institutions.filter(item => searchNames(item).includes(name));
  return matches.length === 1 ? matches[0] : null;
}

export function institutionOptionLabel(record) {
  const bank = institutionsById.get(record.institutionId);
  return bank && searchKey(bank.displayName) !== searchKey(record.name)
    ? record.name + ' · ' + bank.displayName
    : record.name;
}
