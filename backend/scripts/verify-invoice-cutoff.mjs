import { Prisma } from "@prisma/client";
import { prisma } from "../src/config/database.js";
import { cardInstallmentCompetence } from "../src/utils/financial-competence.js";
// Read-only check after deploying the invoice cutoff migration. No financial details are printed.
try {
  const invoices = await prisma.creditCardInvoice.findMany({ where: { status: { not: "PAID" }, creditCard: { type: "CREDIT" } }, include: { creditCard: true, installments: { include: { purchase: true } } } });
  let wrongMonth = 0; let wrongTotal = 0; let checked = 0;
  for (const invoice of invoices) {
    let total = new Prisma.Decimal(0);
    for (const item of invoice.installments) {
      checked += 1;
      const reference = cardInstallmentCompetence(invoice.creditCard, item.purchase.purchaseDate, item.number - 1);
      if (reference.year !== invoice.referenceYear || reference.month !== invoice.referenceMonth || reference.dueDate.getTime() !== item.dueDate.getTime()) wrongMonth += 1;
      if (item.status !== "CANCELLED") total = total.plus(item.amount);
    }
    if (!total.equals(invoice.totalAmount)) wrongTotal += 1;
  }
  console.log(JSON.stringify({ invoices: invoices.length, installments: checked, wrongMonth, wrongTotal }));
  if (wrongMonth || wrongTotal) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
