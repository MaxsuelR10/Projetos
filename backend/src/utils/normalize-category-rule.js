import { normalizeName } from "./normalize-name.js";

export function normalizeCategoryRulePattern(value) {
  return normalizeName(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
