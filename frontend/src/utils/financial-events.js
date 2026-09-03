export const FINANCIAL_DATA_CHANGED = "financial-data-changed";

export function notifyFinancialDataChanged() {
  window.dispatchEvent(new Event(FINANCIAL_DATA_CHANGED));
}
