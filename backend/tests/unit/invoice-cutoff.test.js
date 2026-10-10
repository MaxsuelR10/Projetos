import { describe, expect, it } from "vitest";
import { cardInstallmentCompetence } from "../../src/utils/financial-competence.js";
import { parseCsvMoney } from "../../src/utils/csv-format.js";
describe("corte exclusivo da fatura", () => {
  it.each([
    [3, 10, "2026-10-02", 0, 2026, 10], [3, 10, "2026-10-03", 0, 2026, 11],
    [3, 10, "2026-10-04", 0, 2026, 11], [3, 1, "2026-10-03", 0, 2026, 12],
    [3, 10, "2026-12-03", 0, 2027, 1], [3, 10, "2026-10-03", 2, 2027, 1],
    [31, 5, "2026-02-27", 0, 2026, 3], [31, 5, "2026-02-28", 0, 2026, 4],
    [31, 5, "2028-02-28", 0, 2028, 3], [31, 5, "2028-02-29", 0, 2028, 4],
  ])("fechamento %i, vencimento %i, compra %s, parcela %i", (closingDay, dueDay, date, index, year, month) => {
    expect(cardInstallmentCompetence({ closingDay, dueDay }, date, index)).toMatchObject({ year, month });
  });
  it("preserva quatro casas e valores grandes, sem arredondamento binário", () => {
    expect(parseCsvMoney("999999999999999,1234", "COMMA").amount).toBe("999999999999999.1234");
    expect(parseCsvMoney("1,250.50", "DOT").amount).toBe("1250.50");
    expect(parseCsvMoney("1.250", "AUTO").error).toContain("ambíguo");
  });
});
