import { normalizeName } from "../utils/normalize-name.js";

const expenseCategories = [
  "Alimentação",
  "Mercado",
  "Moradia",
  "Energia",
  "Água",
  "Internet",
  "Telefone",
  "Transporte",
  "Combustível",
  "Veículo",
  "Saúde",
  "Farmácia",
  "Educação",
  "Faculdade",
  "Lazer",
  "Streaming",
  "Games",
  "Compras",
  "Roupas",
  "Assinaturas",
  "Viagem",
  "Pets",
  "Impostos",
  "Outros",
];

const incomeCategories = [
  "Salário",
  "Freelance",
  "Venda",
  "Cashback",
  "Rendimentos",
  "Bônus",
  "Outros",
];

function buildCategories(names, type, color) {
  return names.map((name) => ({
    name,
    normalizedName: normalizeName(name),
    type,
    color,
    isDefault: true,
  }));
}

export const defaultCategories = [
  ...buildCategories(expenseCategories, "EXPENSE", "#EF4444"),
  ...buildCategories(incomeCategories, "INCOME", "#10B981"),
];
