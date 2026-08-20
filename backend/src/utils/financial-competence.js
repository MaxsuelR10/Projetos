export function monthBounds(value) {
  const [year, month] = (value || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function transactionCompetenceFilter(range) {
  const period = { gte: range.start, lt: range.end };
  return { OR: [{ dueDate: period }, { dueDate: null, date: period }] };
}

function dateParts(value) {
  const date = new Date(value);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function addMonths(year, month, amount) {
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 };
}

function dateWithDay(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

export function invoiceDates(card, referenceYear, referenceMonth) {
  const closesInPreviousMonth = card.dueDay <= card.closingDay;
  const closingMonth = addMonths(referenceYear, referenceMonth, closesInPreviousMonth ? -1 : 0);
  return {
    closingDate: dateWithDay(closingMonth.year, closingMonth.month, card.closingDay),
    dueDate: dateWithDay(referenceYear, referenceMonth, card.dueDay),
  };
}

export function cardInstallmentCompetence(card, purchaseDate, installmentIndex = 0) {
  const purchase = dateParts(purchaseDate);
  const closingOffset = purchase.day > card.closingDay ? 1 : 0;
  const dueOffset = card.dueDay <= card.closingDay ? 1 : 0;
  const reference = addMonths(purchase.year, purchase.month, closingOffset + dueOffset + installmentIndex);
  return { ...reference, ...invoiceDates(card, reference.year, reference.month) };
}
