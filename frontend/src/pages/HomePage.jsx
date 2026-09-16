import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardService } from "../services/dashboard.service.js";
import { formatCurrency } from "../utils/formatters.js";
import { getApiError } from "../utils/get-api-error.js";
import { useAuth } from "../hooks/useAuth.js";
import { FINANCIAL_DATA_CHANGED } from "../utils/financial-events.js";

function addMonth(value, amount = 1) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function firstDayOfMonth(value) {
  return `${value}-01`;
}

function lastDayOfMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function formatReferencePeriod(startMonth, endMonth) {
  const formatMonth = (value) => {
    const [year, month] = value.split("-").map(Number);
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  return `${formatMonth(startMonth)} até ${formatMonth(endMonth)}`;
}

function pointOnCircle(percentage, radius) {
  const angle = ((percentage / 100) * 360 - 90) * (Math.PI / 180);
  return {
    x: 100 + radius * Math.cos(angle),
    y: 100 + radius * Math.sin(angle),
  };
}

function donutSegmentPath(start, end, outerRadius = 96, innerRadius = 56) {
  const size = end - start;

  if (size >= 99.999) {
    return "M 100 4 A 96 96 0 1 1 100 196 A 96 96 0 1 1 100 4 M 100 44 A 56 56 0 1 0 100 156 A 56 56 0 1 0 100 44 Z";
  }

  const outerStart = pointOnCircle(start, outerRadius);
  const outerEnd = pointOnCircle(end, outerRadius);
  const innerEnd = pointOnCircle(end, innerRadius);
  const innerStart = pointOnCircle(start, innerRadius);
  const largeArc = size > 50 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function HomePage() {
  const { user } = useAuth();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState(() => addMonth(currentMonth));
  const [expenseFrom, setExpenseFrom] = useState(() => firstDayOfMonth(currentMonth));
  const [expenseTo, setExpenseTo] = useState(() => lastDayOfMonth(addMonth(currentMonth)));
  const [chartMonths, setChartMonths] = useState(6);
  const [activeChart, setActiveChart] = useState("anatomy");
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [hoveredSeries, setHoveredSeries] = useState(null);
  const [hoveredPieItem, setHoveredPieItem] = useState(null);

  const loadDashboard = useCallback(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    dashboardService
      .get(startMonth, endMonth, chartMonths, expenseFrom, expenseTo)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch((error) => active && setState({ loading: false, error: getApiError(error), data: null }));
    return () => { active = false; };
  }, [chartMonths, endMonth, expenseFrom, expenseTo, startMonth]);

  useEffect(() => {
    let active = true;
    dashboardService
      .get(startMonth, endMonth, chartMonths, expenseFrom, expenseTo)
      .then((data) => active && setState({ loading: false, error: "", data }))
      .catch((error) => active && setState({ loading: false, error: getApiError(error), data: null }));
    window.addEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    return () => {
      active = false;
      window.removeEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    };
  }, [chartMonths, endMonth, expenseFrom, expenseTo, loadDashboard, startMonth]);

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
          (item) => item.month === endMonth,
        ) || data.monthlySeries[data.monthlySeries.length - 1]
      : null);

  const expenseTotal = data
    ? (data.expenseBreakdown || []).reduce((total, item) => total + Number(item.amount), 0)
    : 0;
  const pieItems = (data?.expenseBreakdown || []).map((item, index, items) => {
    const percentage = expenseTotal ? (Number(item.amount) / expenseTotal) * 100 : 0;
    const start = items.slice(0, index).reduce(
      (total, previous) => total + ((Number(previous.amount) / expenseTotal) * 100),
      0,
    );
    return {
      ...item,
      color: ["#197454", "#d75a50", "#e1a636", "#4d73b8", "#8d5bb7", "#3c9cb0", "#cc7185"][index % 7],
      percentage,
      start,
      end: start + percentage,
    };
  });
  const activePieItem = pieItems.find((item) => item.name === hoveredPieItem?.name) ?? null;

  return (
    <section className="page-stack">
      <div className="page-heading with-action">
        <div>
          <p className="eyebrow">Visão Geral · Dashboard</p>
          <h1>Olá, {user.name.split(" ")[0]}.</h1>
          <p>Acompanhe seu fluxo financeiro com total clareza.</p>
        </div>
        <div className="period-picker">
          <span>Período de referência</span>
          <strong>{formatReferencePeriod(startMonth, endMonth)}</strong>
          <div className="period-picker-fields">
            <label>
              <span>De</span>
              <input
                type="month"
                value={startMonth}
                onChange={(event) => {
                  const nextStart = event.target.value;
                  setStartMonth(nextStart);
                  setExpenseFrom(firstDayOfMonth(nextStart));
                  if (nextStart > endMonth) setEndMonth(nextStart);
                  if (nextStart > endMonth) setExpenseTo(lastDayOfMonth(nextStart));
                }}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="month"
                min={startMonth}
                value={endMonth}
                onChange={(event) => {
                  setEndMonth(event.target.value);
                  setExpenseTo(lastDayOfMonth(event.target.value));
                }}
              />
            </label>
          </div>
        </div>
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
              <span>Resultado do período · caixa</span>
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
              <small>Receitas recebidas no período</small>
            </article>

            <article>
              <span>Quanto saiu</span>
              <strong className="expense-text">
                {formatCurrency(data.summary.monthlyExpense, user.currency)}
              </strong>
              <small>Despesas e faturas pagas no período</small>
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
              <span>Já pago no período</span>
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

          {activeChart === "comparison" ? (
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
                    item.month >= startMonth && item.month <= endMonth;
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
          ) : (
          <section className="dashboard-panel expense-anatomy-panel">
            <div className="chart-header">
              <div>
                <p className="eyebrow">Anatomia das despesas</p>
                <h2>Despesas por categoria</h2>
                <p className="chart-description">Veja quanto cada categoria representa no total gasto no período.</p>
              </div>
              <div className="expense-date-filter">
                <label>
                  <span>De</span>
                  <input type="date" value={expenseFrom} max={expenseTo} onChange={(event) => setExpenseFrom(event.target.value)} />
                </label>
                <label>
                  <span>Até</span>
                  <input type="date" value={expenseTo} min={expenseFrom} onChange={(event) => setExpenseTo(event.target.value)} />
                </label>
              </div>
            </div>
            {pieItems.length ? (
              <div className="expense-anatomy-content">
                <div className="pie-chart-wrapper">
                  {activePieItem ? (
                    <div className="pie-tooltip" role="status" aria-live="polite">
                      <span className="pie-tooltip-category">
                        <i style={{ background: activePieItem.color }} />
                        {activePieItem.name}
                      </span>
                      <strong>{formatCurrency(activePieItem.amount, user.currency)}</strong>
                      <small>{activePieItem.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total gasto</small>
                    </div>
                  ) : null}
                  <div className="pie-chart">
                    <svg
                      viewBox="0 0 200 200"
                      role="img"
                      aria-label="Gráfico de pizza das despesas por categoria. Passe o mouse sobre uma categoria para ver os detalhes."
                    >
                      {pieItems.map((item) => (
                        <path
                          className={`pie-slice ${activePieItem?.name === item.name ? "is-active" : ""}`}
                          d={donutSegmentPath(item.start, item.end)}
                          fill={item.color}
                          key={item.name}
                          tabIndex="0"
                          aria-label={`${item.name}: ${formatCurrency(item.amount, user.currency)}, ${item.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total`}
                          onFocus={() => setHoveredPieItem(item)}
                          onBlur={() => setHoveredPieItem(null)}
                          onMouseEnter={() => setHoveredPieItem(item)}
                          onMouseLeave={() => setHoveredPieItem(null)}
                        />
                      ))}
                    </svg>
                    <div className="pie-chart-center"><span>Total gasto</span><strong>{formatCurrency(expenseTotal, user.currency)}</strong></div>
                  </div>
                </div>
                <div className="expense-breakdown-list">
                  {pieItems.map((item) => (
                    <article key={item.name}>
                      <i style={{ background: item.color }} />
                      <span>{item.name}</span>
                      <strong>{formatCurrency(item.amount, user.currency)}</strong>
                      <small>{item.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : <p className="muted-copy">Não há despesas registradas no período selecionado.</p>}
          </section>
          )}
          <div className="chart-tabs" role="tablist" aria-label="Gráficos do dashboard">
            <button className={activeChart === "comparison" ? "is-active" : ""} type="button" role="tab" aria-selected={activeChart === "comparison"} onClick={() => setActiveChart("comparison")}>Gráfico 1</button>
            <button className={activeChart === "anatomy" ? "is-active" : ""} type="button" role="tab" aria-selected={activeChart === "anatomy"} onClick={() => setActiveChart("anatomy")}>Gráfico 2</button>
          </div>

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
