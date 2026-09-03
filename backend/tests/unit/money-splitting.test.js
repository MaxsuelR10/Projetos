import { describe, expect, it } from "vitest";
import { splitMoney } from "../../src/services/card.service.js";

function cents(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
}

describe("parcelamento monetário", () => {
  it.each([
    ["0.01", 3, ["0.01", "0.00", "0.00"]],
    ["10.99", 3, ["3.67", "3.66", "3.66"]],
    ["100.00", 3, ["33.34", "33.33", "33.33"]],
    ["1659.74", 7, ["237.11", "237.11", "237.11", "237.11", "237.10", "237.10", "237.10"]],
  ])("divide %s em %i parcelas sem perder centavos", (amount, count, expected) => {
    const installments = splitMoney(amount, count);
    expect(installments).toEqual(expected);
    expect(installments.reduce((sum, value) => sum + cents(value), 0n)).toBe(cents(amount));
  });
});
