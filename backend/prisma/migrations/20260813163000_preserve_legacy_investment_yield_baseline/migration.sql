-- Preserva o valor atual legado como ponto de partida: a rentabilidade automática
-- passa a incidir a partir desta migração, sem duplicar rendimento já informado.
ALTER TABLE "InvestmentContribution"
  ADD COLUMN "yieldStartDate" DATE NOT NULL DEFAULT CURRENT_DATE;
