import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardService } from "../services/dashboard.service.js";
import { cardService } from "../services/card.service.js";
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

function formatReferencePeriod(startDate, endDate) {
  const formatDate = (value) => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));

  return `${formatDate(startDate)} até ${formatDate(endDate)}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatAgendaDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

const agendaTypeLabels = {
  TRANSACTION: "Lançamento",
  INVOICE: "Fatura",
  RECURRENCE: "Recorrência",
  SUBSCRIPTION: "Assinatura",
  REMINDER: "Lembrete",
  GOAL: "Meta",
  BUDGET: "Orçamento",
};

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
  const [startDate, setStartDate] = useState(() => firstDayOfMonth(currentMonth));
  const [endDate, setEndDate] = useState(() => lastDayOfMonth(addMonth(currentMonth)));
  const [expenseFrom, setExpenseFrom] = useState(() => firstDayOfMonth(currentMonth));
  const [expenseTo, setExpenseTo] = useState(() => lastDayOfMonth(addMonth(currentMonth)));
  const [chartMonths, setChartMonths] = useState(6);
  const [activeChart, setActiveChart] = useState("anatomy");
  const [agendaRange, setAgendaRange] = useState("7");
  const [cardId, setCardId] = useState("");
  const [cards, setCards] = useState([]);
  const [cardsError, setCardsError] = useState("");
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [hoveredSeries, setHoveredSeries] = useState(null);
  const [hoveredPieItem, setHoveredPieItem] = useState(null);
  const requestControllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    cardService.list("all")
      .then((items) => { if (active) setCards(items); })
      .catch((error) => { if (active) setCardsError(getApiError(error)); });
    return () => { active = false; };
  }, []);

  const loadDashboard = useCallback(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loading: true, error: "" }));
    });
    dashboardService
      .get(startDate, endDate, chartMonths, expenseFrom, expenseTo, cardId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ loading: false, error: "", data }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, error: getApiError(error), data: null }); });
  }, [cardId, chartMonths, endDate, expenseFrom, expenseTo, startDate]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    return () => {
      requestControllerRef.current?.abort();
      window.removeEventListener(FINANCIAL_DATA_CHANGED, loadDashboard);
    };
  }, [loadDashboard]);

  const data = state.data;
  const agendaItems = data?.agenda?.items ?? [];
  const agendaCutoff = data?.agenda?.today
    ? agendaRange === "today"
      ? data.agenda.today
      : addDays(data.agenda.today, Number(agendaRange))
    : null;
  const visibleAgenda = agendaCutoff
    ? agendaItems.filter((item) => item.dueDate <= agendaCutoff)
    : [];
  const onboardingSteps = data ? [
    { label: "Criar sua primeira conta", done: data.onboarding.hasAccount, to: "/contas" },
    { label: "Informar o saldo inicial", done: data.onboarding.hasInitialBalance, to: "/contas" },
    { label: "Registrar o primeiro gasto ou receita", done: data.onboarding.hasMovement, to: "/movimentacoes" },
    { label: "Cadastrar um cartão, se usar", done: data.onboarding.hasCard, optional: true, to: "/cartoes" },
  ] : [];
  const essentialOnboardingComplete = data?.onboarding?.hasAccount && data?.onboarding?.hasMovement;
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
          (item) => item.month === endDate.slice(0, 7),
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
          <strong>{formatReferencePeriod(startDate, endDate)}</strong>
          <div className="period-picker-fields">
            <label>
              <span>De</span>
              <input
                type="date"
                max={endDate}
                value={startDate}
                onChange={(event) => {
                  const nextStartDate = event.target.value;
                  setStartDate(nextStartDate);
                  setExpenseFrom(nextStartDate);
                  if (nextStartDate > endDate) {
                    setEndDate(nextStartDate);
                    setExpenseTo(nextStartDate);
                  }
                }}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => {
                  const nextEndDate = event.target.value;
                  setEndDate(nextEndDate);
                  setExpenseTo(nextEndDate);
                }}
              />
            </label>
          </div>
          <label className="dashboard-card-filter">
            <span>Cartão</span>
            <select value={cardId} onChange={(event) => { setHoveredSeries(null); setCardId(event.target.value); }}>
              <option value="">Todos os cartões</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>{card.name}{card.isActive ? "" : " (inativo)"}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {cardsError ? <div className="form-alert">Não foi possível carregar os cartões: {cardsError}</div> : null}
      {state.error ? <div className="form-alert">{state.error}</div> : null}
      {state.loading ? (
        <p className="loading-inline">Carregando painel financeiro...</p>
      ) : null}

      {data ? (
        <>
          {!essentialOnboardingComplete ? (
            <section className="onboarding-card" aria-labelledby="onboarding-title">
              <div className="onboarding-heading">
                <div>
                  <p className="eyebrow">Primeiros passos</p>
                  <h2 id="onboarding-title">Deixe sua visão financeira pronta.</h2>
                </div>
                <strong>{onboardingSteps.filter((step) => step.done).length}/4</strong>
              </div>
              <div className="onboarding-progress" aria-hidden="true">
                <i style={{ width: `${onboardingSteps.filter((step) => step.done).length * 25}%` }} />
              </div>
              <div className="onboarding-steps">
                {onboardingSteps.map((step) => (
                  <Link className={step.done ? "is-done" : ""} key={step.label} to={step.to}>
                    <span aria-hidden="true">{step.done ? "✓" : "○"}</span>
                    <strong>{step.label}</strong>
                    {step.optional ? <small>Opcional</small> : null}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="financial-summary" aria-labelledby="financial-summary-title">
            <div className="section-heading dashboard-section-heading">
              <div>
                <p className="eyebrow">Sua posição agora</p>
                <h2 id="financial-summary-title">Dinheiro disponível e compromissos</h2>
                <p>O caixa mostra o que já aconteceu; a projeção considera o que vence nos próximos 30 dias.</p>
              </div>
            </div>
            <div className="summary-card-grid">
              <Link className="summary-card summary-card-primary" to="/contas">
                <span>Saldo atual em contas</span>
                <strong>{formatCurrency(data.summary.currentBalance, user.currency)}</strong>
                <small>Ver contas e saldos →</small>
              </Link>
              <Link className="summary-card" to="/movimentacoes">
                <span>Gastos já pagos no período</span>
                <strong className="expense-text">{formatCurrency(data.summary.paidExpenses, user.currency)}</strong>
                <small>Ver lançamentos concluídos →</small>
              </Link>
              <a className={`summary-card ${Number(data.summary.futureCommitments) > 0 ? "summary-card-warning" : ""}`} href="#agenda-financeira">
                <span>Compromissos dos próximos 30 dias</span>
                <strong>{formatCurrency(data.summary.futureCommitments, user.currency)}</strong>
                <small>Ver exatamente o que vence →</small>
              </a>
              <a className={`summary-card ${Number(data.summary.freeBalanceProjected) < 0 ? "summary-card-danger" : ""}`} href="#agenda-financeira">
                <span>Saldo livre projetado</span>
                <strong className={Number(data.summary.freeBalanceProjected) < 0 ? "expense-text" : "income-text"}>
                  {formatCurrency(data.summary.freeBalanceProjected, user.currency)}
                </strong>
                <small>Saldo atual menos compromissos →</small>
              </a>
            </div>
          </section>

          <section className="metric-grid metric-grid-4">
            <Link to="/movimentacoes">
              <span>Recebido no período</span>
              <strong className="income-text">{formatCurrency(data.summary.monthlyIncome, user.currency)}</strong>
              <small>Entradas efetivamente recebidas</small>
            </Link>
            <Link to="/movimentacoes">
              <span>Pago no período</span>
              <strong className="expense-text">{formatCurrency(data.summary.monthlyExpense, user.currency)}</strong>
              <small>Saídas efetivamente pagas</small>
            </Link>
            <a href="#agenda-financeira" className={Number(data.summary.overdueBills) > 0 ? "metric-alert is-overdue" : Number(data.summary.pendingBills) > 0 ? "metric-alert" : ""}>
              <span>Pendências no período</span>
              <strong>{formatCurrency(data.summary.pendingBills, user.currency)}</strong>
              <small>{Number(data.summary.overdueBills) > 0 ? `${formatCurrency(data.summary.overdueBills, user.currency)} em atraso` : "Contas e faturas ainda abertas"}</small>
            </a>
            <Link to="/investimentos">
              <span>Patrimônio total</span>
              <strong>{formatCurrency(data.summary.netWorth, user.currency)}</strong>
              <small>Contas e investimentos</small>
            </Link>
          </section>

          {data.alerts.length ? (
            <section className="alerts-panel" aria-labelledby="alerts-title">
              <div className="section-heading dashboard-section-heading">
                <div><p className="eyebrow">Atenção necessária</p><h2 id="alerts-title">Alertas úteis</h2></div>
                <span>{data.alerts.length}</span>
              </div>
              <div className="alert-list">
                {data.alerts.map((alert) => (
                  <Link className={`financial-alert is-${alert.severity}`} key={alert.id} to={alert.path}>
                    <i aria-hidden="true">{alert.severity === "danger" ? "!" : "↗"}</i>
                    <span><strong>{alert.title}</strong><small>{alert.description}</small></span>
                    <b aria-hidden="true">›</b>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="agenda-panel" id="agenda-financeira" aria-labelledby="agenda-title">
            <div className="section-heading dashboard-section-heading agenda-heading">
              <div>
                <p className="eyebrow">Agenda financeira</p>
                <h2 id="agenda-title">O que exige atenção agora</h2>
                <p>Faturas, lançamentos, recorrências, lembretes, metas e orçamentos em um só lugar.</p>
              </div>
              <div className="agenda-tabs" role="tablist" aria-label="Período da agenda">
                <button className={agendaRange === "today" ? "is-active" : ""} type="button" role="tab" aria-selected={agendaRange === "today"} onClick={() => setAgendaRange("today")}>Hoje</button>
                <button className={agendaRange === "7" ? "is-active" : ""} type="button" role="tab" aria-selected={agendaRange === "7"} onClick={() => setAgendaRange("7")}>7 dias</button>
                <button className={agendaRange === "30" ? "is-active" : ""} type="button" role="tab" aria-selected={agendaRange === "30"} onClick={() => setAgendaRange("30")}>30 dias</button>
              </div>
            </div>
            {visibleAgenda.length ? (
              <div className="agenda-list">
                {visibleAgenda.map((item) => (
                  <Link className={`agenda-item is-${item.status.toLowerCase()}`} key={item.id} to={item.path}>
                    <time dateTime={item.dueDate}><strong>{formatAgendaDate(item.dueDate)}</strong><small>{item.status === "OVERDUE" ? "Atrasado" : item.status === "TODAY" ? "Hoje" : "Previsto"}</small></time>
                    <span className="agenda-item-copy"><small>{agendaTypeLabels[item.type] ?? item.type}</small><strong>{item.title}</strong><em>{item.subtitle}</em></span>
                    <span className="agenda-item-value">{item.amount !== null ? formatCurrency(item.amount, user.currency) : "Ver detalhe"}<b aria-hidden="true">›</b></span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="agenda-empty"><span aria-hidden="true">✓</span><div><strong>Nada pendente neste período.</strong><small>Você está em dia com os compromissos cadastrados.</small></div></div>
            )}
          </section>

          {activeChart === "comparison" ? (
          <section className="dashboard-panel">
            <div className="chart-header">
              <div>
                <p className="eyebrow">Comparativo Mensal</p>
                <h2>{cardId ? "Pagamentos do cartão por mês" : "Receitas x Despesas"}</h2>
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
                    {!cardId ? <span className="chart-val-income">
                      <i className="dot dot-income" /> Receitas:{" "}
                      <strong>{formatCurrency(activeMonthData.income, user.currency)}</strong>
                    </span> : null}
                    <span className="chart-val-expense">
                      <i className="dot dot-expense" /> {cardId ? "Pagamentos:" : "Despesas:"}{" "}
                      <strong>{formatCurrency(activeMonthData.expense, user.currency)}</strong>
                    </span>
                    {!cardId ? <span className="chart-val-result">
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
                    </span> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bar-chart-container">
              <div className="bar-chart" role="img" aria-label={cardId ? "Gráfico de pagamentos do cartão por mês" : "Gráfico de receitas e despesas por mês"}>
                {data.monthlySeries.map((item) => {
                  const isCurrent =
                    item.month >= startDate.slice(0, 7) && item.month <= endDate.slice(0, 7);
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
                        {!cardId ? <span className="val-top income-text">
                          {Number(item.income) > 0 ? formatCurrency(item.income, user.currency) : ""}
                        </span> : null}
                        <span className="val-top expense-text">
                          {Number(item.expense) > 0 ? formatCurrency(item.expense, user.currency) : ""}
                        </span>
                      </div>
                      <div className="bars">
                        {!cardId ? <i
                          className="bar-income"
                          style={{
                            height: `${Math.max((Number(item.income) / max) * 100, Number(item.income) > 0 ? 4 : 0)}%`,
                          }}
                          title={`Receitas em ${item.label}: ${formatCurrency(item.income, user.currency)}`}
                        /> : null}
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
              {!cardId ? <span className="legend-item">
                <i className="dot dot-income" /> Receitas
              </span> : null}
              <span className="legend-item">
                <i className="dot dot-expense" /> {cardId ? "Pagamentos do cartão" : "Despesas"}
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
              <Link className="secondary-button inline-button" to="/assistente">
                Falar com assistente
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
