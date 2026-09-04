import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardService } from "../services/dashboard.service.js";
import { formatCurrency } from "../utils/formatters.js";
import { getApiError } from "../utils/get-api-error.js";
import { useAuth } from "../hooks/useAuth.js";
import { FINANCIAL_DATA_CHANGED } from "../utils/financial-events.js";

export function HomePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [chartMonths, setChartMonths] = useState(6);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [hoveredSeries, setHoveredSeries] = useState(null);

  const loadDashboard = useCallback(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    dashboardService
      .get(month, chartMonths)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch((error) => active && setState({ loading: false, error: getApiError(error), data: null }));
    return () => { active = false; };
  }, [chartMonths, month]);

  useEffect(() => {
    let active = true;
    dashboardService
      .get(month, chartMonths)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch((error) => active && setState({ loading: false, error: getApiError(error), data: null }));
    window.addEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    return () => {
      active = false;
      window.removeEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    };
  }, [chartMonths, loadDashboard, month]);

  const data = state.data;
  const max = data
    ? Math.max(
        ...data.monthlySeries.flatMap((item) => [
          Number(item.income),
          Number(item.expense),
        ]),
        1,
      )
    : 1;

  // Selected or active month in series for chart highlight
  const activeMonthData =
    hoveredSeries ||
    (data?.monthlySeries
      ? data.monthlySeries.find(
          (item) => item.label === `${month.slice(5, 7)}/${month.slice(0, 4)}`,
        ) || data.monthlySeries[data.monthlySeries.length - 1]
      : null);

  return (
    <section className="page-stack">
      <div className="page-heading with-action">
        <div>
          <p className="eyebrow">Visão Geral · Dashboard</p>
          <h1>Olá, {user.name.split(" ")[0]}.</h1>
          <p>Acompanhe seu fluxo financeiro com total clareza.</p>
        </div>
        <label className="month-picker">
          <span>Mês de referência</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </div>

      {state.error ? <div className="form-alert">{state.error}</div> : null}
      {state.loading ? (
        <p className="loading-inline">Carregando painel financeiro...</p>
      ) : null}

      {data ? (
        <>
          {/* Saldo real e resultado em regime de caixa */}
          <section className="overview-grid">
            <article className="overview-card overview-card-primary">
              <span>Saldo disponível</span>
              <strong>
                {formatCurrency(data.summary.currentBalance, user.currency)}
              </strong>
              <small>
                Após compromissos vencidos: {formatCurrency(data.summary.projectedBalance, user.currency)}
              </small>
            </article>

            <article className="overview-card">
              <span>Resultado do mês · caixa</span>
              <strong
                className={
                  Number(data.summary.monthlyResult) >= 0
                    ? "income-text"
                    : "expense-text"
                }
              >
                {Number(data.summary.monthlyResult) >= 0 ? "+" : ""}
                {formatCurrency(data.summary.monthlyResult, user.currency)}
              </strong>
              <small>
                {Number(data.summary.monthlyResult) >= 0
                  ? "Recebimentos menos pagamentos"
                  : "Pagamentos superaram recebimentos"}
              </small>
            </article>
          </section>

          {/* Quanto entrou -> Quanto saiu -> Quanto a pagar -> Quanto já pago -> Patrimônio */}
          <section className="metric-grid metric-grid-5">
            <article>
              <span>Quanto entrou</span>
              <strong className="income-text">
                {formatCurrency(data.summary.monthlyIncome, user.currency)}
              </strong>
              <small>Receitas recebidas no mês</small>
            </article>

            <article>
              <span>Quanto saiu</span>
              <strong className="expense-text">
                {formatCurrency(data.summary.monthlyExpense, user.currency)}
              </strong>
              <small>Despesas e faturas pagas no mês</small>
            </article>

            <article
              className={
                Number(data.summary.overdueBills) > 0
                  ? "metric-alert is-overdue"
                  : Number(data.summary.pendingBills) > 0
                    ? "metric-alert"
                    : ""
              }
            >
              <span>A pagar (Pendências)</span>
              <strong
                className={
                  Number(data.summary.overdueBills) > 0
                    ? "expense-text"
                    : ""
                }
              >
                {formatCurrency(data.summary.pendingBills, user.currency)}
              </strong>
              {Number(data.summary.overdueBills) > 0 ? (
                <small className="expense-text">
                  ⚠️ {formatCurrency(data.summary.overdueBills, user.currency)} em atraso
                </small>
              ) : (
                <small>Aguardando pagamento</small>
              )}
            </article>

            <article>
              <span>Já pago no mês</span>
              <strong className="income-text">
                {formatCurrency(data.summary.paidBills ?? "0", user.currency)}
              </strong>
              <small>Contas e faturas quitadas</small>
            </article>

            <article>
              <span>Patrimônio total</span>
              <strong>
                {formatCurrency(data.summary.netWorth, user.currency)}
              </strong>
              <small>
                {Number(data.summary.investedTotal) > 0
                  ? `Inclui ${formatCurrency(data.summary.investedTotal, user.currency)} investidos`
                  : "Contas e investimentos"}
              </small>
            </article>
          </section>

          {/* Gráfico Interativo Receitas x Despesas com Valores Exatos */}
          <section className="dashboard-panel">
            <div className="chart-header">
              <div>
                <p className="eyebrow">Comparativo Mensal</p>
                <h2>Receitas x Despesas</h2>
                <label className="chart-range-filter">
                  <span>Período do gráfico</span>
                  <select value={chartMonths} onChange={(event) => { setHoveredSeries(null); setChartMonths(Number(event.target.value)) }}>
                    <option value={1}>Este mês</option>
                    <option value={3}>Últimos 3 meses</option>
                    <option value={6}>Últimos 6 meses</option>
                    <option value={12}>Este ano / últimos 12 meses</option>
                  </select>
                </label>
              </div>
              {activeMonthData ? (
                <div className="chart-active-summary" aria-live="polite">
                  <span className="chart-month-badge">{activeMonthData.label}</span>
                  <div className="chart-values-row">
                    <span className="chart-val-income">
                      <i className="dot dot-income" /> Receitas:{" "}
                      <strong>{formatCurrency(activeMonthData.income, user.currency)}</strong>
                    </span>
                    <span className="chart-val-expense">
                      <i className="dot dot-expense" /> Despesas:{" "}
                      <strong>{formatCurrency(activeMonthData.expense, user.currency)}</strong>
                    </span>
                    <span className="chart-val-result">
                      Saldo:{" "}
                      <strong
                        className={
                          Number(activeMonthData.income) - Number(activeMonthData.expense) >= 0
                            ? "income-text"
                            : "expense-text"
                        }
                      >
                        {formatCurrency(
                          Number(activeMonthData.income) - Number(activeMonthData.expense),
                          user.currency,
                        )}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bar-chart-container">
              <div className="bar-chart" role="img" aria-label="Gráfico de receitas e despesas dos últimos 6 meses">
                {data.monthlySeries.map((item) => {
                  const isCurrent =
                    item.label === `${month.slice(5, 7)}/${month.slice(0, 4)}`;
                  const isHovered = hoveredSeries?.label === item.label;
                  return (
                    <div
                      className={`bar-group ${isCurrent ? "is-selected-period" : ""} ${isHovered ? "is-hovered" : ""}`}
                      key={item.label}
                      onMouseEnter={() => setHoveredSeries(item)}
                      onMouseLeave={() => setHoveredSeries(null)}
                      onClick={() => setHoveredSeries(item)}
                      tabIndex="0"
                    >
                      <div className="bar-values-top">
                        <span className="val-top income-text">
                          {Number(item.income) > 0 ? formatCurrency(item.income, user.currency) : ""}
                        </span>
                        <span className="val-top expense-text">
                          {Number(item.expense) > 0 ? formatCurrency(item.expense, user.currency) : ""}
                        </span>
                      </div>
                      <div className="bars">
                        <i
                          className="bar-income"
                          style={{
                            height: `${Math.max((Number(item.income) / max) * 100, Number(item.income) > 0 ? 4 : 0)}%`,
                          }}
                          title={`Receitas em ${item.label}: ${formatCurrency(item.income, user.currency)}`}
                        />
                        <i
                          className="bar-expense"
                          style={{
                            height: `${Math.max((Number(item.expense) / max) * 100, Number(item.expense) > 0 ? 4 : 0)}%`,
                          }}
                          title={`Despesas em ${item.label}: ${formatCurrency(item.expense, user.currency)}`}
                        />
                      </div>
                      <small className="bar-label">{item.label}</small>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="chart-footer-legend">
              <span className="legend-item">
                <i className="dot dot-income" /> Receitas
              </span>
              <span className="legend-item">
                <i className="dot dot-expense" /> Despesas
              </span>
              <small className="chart-tip">
                Toque ou passe o mouse nas barras para ver detalhes do mês.
              </small>
            </div>
          </section>

          {/* Ações Rápidas */}
          <section className="setup-card">
            <div>
              <p className="eyebrow">Ações Rápidas</p>
              <h2>Mantenha suas contas em dia.</h2>
            </div>
            <div className="setup-actions">
              <Link className="primary-button inline-button" to="/movimentacoes">
                + Novo Lançamento
              </Link>
              <Link className="secondary-button inline-button" to="/cartoes">
                Ver Cartões & Faturas
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
