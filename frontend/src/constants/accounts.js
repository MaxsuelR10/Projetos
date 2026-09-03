export const ACCOUNT_TYPES = [
  ["CHECKING", "Conta corrente"],
  ["DIGITAL", "Conta digital"],
  ["SAVINGS", "Poupança"],
  ["CASH", "Dinheiro"],
  ["WALLET", "Carteira"],
  ["INVESTMENT", "Conta de investimento"],
  ["OTHER", "Outros"],
];

export const EMPTY_ACCOUNT_FORM = {
  name: "",
  institution: "",
  type: "DIGITAL",
  initialBalance: "0",
  color: "#1D6B4F",
  icon: "",
  isActive: true,
};
