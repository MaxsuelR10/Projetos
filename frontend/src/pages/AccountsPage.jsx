import { useEffect, useState } from "react";
import { ActionMenu } from "../components/actions/ActionMenu.jsx";
import { EmptyState } from "../components/feedback/EmptyState.jsx";
import { CurrencyInput } from "../components/forms/CurrencyInput.jsx";
import { ACCOUNT_TYPES, EMPTY_ACCOUNT_FORM } from "../constants/accounts.js";
import { useAuth } from "../hooks/useAuth.js";
import { useConfirm } from "../hooks/useConfirm.js";
import { accountService } from "../services/account.service.js";
import { notifyFinancialDataChanged } from "../utils/financial-events.js";
import { formatAccountType, formatCurrency, formatDate, parseCurrency } from "../utils/formatters.js";
import { getApiError } from "../utils/get-api-error.js";

function dependencyMessage(dependencies) {
  return dependencies.items.map((item) => `${item.count} ${item.label}`).join(", ");
}

function BalanceHistory({ items, currency }) {
  if (!items.length) return <p className="form-help">Nenhum ajuste de saldo registrado.</p>;
  return <div className="balance-history">{items.map((adjustment) => <div key={adjustment.id}><span>{formatDate(adjustment.createdAt)}</span><strong>{formatCurrency(adjustment.previousBalance, currency)} → {formatCurrency(adjustment.newBalance, currency)}</strong></div>)}</div>;
}

export function AccountsPage() {
  const { user } = useAuth();
  const requestConfirmation = useConfirm();
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [balanceAccount, setBalanceAccount] = useState(null);
  const [historyAccount, setHistoryAccount] = useState(null);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [balance, setBalance] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState(null);

  useEffect(() => {
    let active = true;
    accountService.list("all")
      .then((loadedAccounts) => active && setAccounts(loadedAccounts))
      .catch((requestError) => active && setError(getApiError(requestError)))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  function closeEditors() { setForm(null); setEditingAccount(null); setBalanceAccount(null); setHistoryAccount(null); setBalanceHistory([]); setBalance(""); setError(""); }
  function openCreate() { closeEditors(); setForm({ ...EMPTY_ACCOUNT_FORM }); }
  function openEdit(account) { closeEditors(); setEditingAccount(account); setForm({ name: account.name, institution: account.institution || "", type: account.type, color: account.color || "#1D6B4F", icon: account.icon || "", isActive: account.isActive }); }
  async function loadHistory(account) { setBalanceHistory([]); try { setBalanceHistory(await accountService.listBalanceAdjustments(account.id)); } catch (requestError) { setError(getApiError(requestError)); } }
  function openBalanceEditor(account) { closeEditors(); setBalanceAccount(account); setBalance(account.currentBalance); loadHistory(account); }
  function openHistory(account) { closeEditors(); setHistoryAccount(account); loadHistory(account); }
  function updateForm(event) { const { name, value, checked, type } = event.target; setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }

  async function submitAccount(event) {
    event.preventDefault(); setIsSubmitting(true); setError("");
    try {
      const payload = { ...form, institution: form.institution || null, icon: form.icon || null };
      if (editingAccount) {
        const updated = await accountService.update(editingAccount.id, payload);
        setAccounts((current) => current.map((account) => account.id === updated.id ? { ...account, ...updated } : account));
        setNotice("Conta atualizada.");
      } else {
        const created = await accountService.create({ ...payload, initialBalance: parseCurrency(form.initialBalance) });
        setAccounts((current) => [...current, created]); setNotice("Conta criada.");
      }
      notifyFinancialDataChanged(); closeEditors();
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setIsSubmitting(false); }
  }

  async function submitBalance(event) {
    event.preventDefault(); const nextBalance = parseCurrency(balance);
    if (nextBalance === "") return setError("Informe um saldo válido.");
    if (Number(nextBalance) === Number(balanceAccount.currentBalance)) return closeEditors();
    const confirmed = await requestConfirmation({ title: "Alterar saldo?", message: `O saldo atual será alterado de ${formatCurrency(balanceAccount.currentBalance, user.currency)} para ${formatCurrency(nextBalance, user.currency)}. O ajuste será registrado no histórico.`, confirmLabel: "Confirmar ajuste" });
    if (!confirmed) return;
    setIsSubmitting(true); setError("");
    try {
      const updated = await accountService.adjustBalance(balanceAccount.id, nextBalance);
      setAccounts((current) => current.map((account) => account.id === updated.id ? { ...account, ...updated } : account));
      notifyFinancialDataChanged(); setNotice("Saldo atualizado e registrado no histórico."); closeEditors();
    } catch (requestError) { setError(getApiError(requestError, "Não foi possível atualizar o saldo. Tente novamente.")); }
    finally { setIsSubmitting(false); }
  }

  async function toggleStatus(account, nextStatus = !account.isActive) {
    setBusyAccountId(account.id); setError("");
    try {
      const updated = await accountService.update(account.id, { isActive: nextStatus });
      setAccounts((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      notifyFinancialDataChanged(); setNotice(nextStatus ? "Conta ativada." : "Conta desativada. O histórico foi preservado.");
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusyAccountId(null); }
  }

  async function remove(account) {
    setBusyAccountId(account.id); setError("");
    try {
      const dependencies = await accountService.dependencies(account.id);
      if (dependencies.total > 0) {
        const deactivate = await requestConfirmation({ title: "Não é possível excluir esta conta", message: `Há ${dependencyMessage(dependencies)} vinculados. Desative a conta para preservar o histórico financeiro.`, confirmLabel: "Desativar conta" });
        if (deactivate) await toggleStatus(account, false);
        return;
      }
      const confirmed = await requestConfirmation({ title: "Excluir conta?", message: `A conta “${account.name}” não possui vínculos e será excluída definitivamente.`, confirmLabel: "Excluir conta", destructive: true, icon: "!" });
      if (!confirmed) return;
      await accountService.remove(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id)); notifyFinancialDataChanged(); setNotice("Conta excluída.");
    } catch (requestError) { setError(getApiError(requestError, "Não foi possível excluir a conta.")); }
    finally { setBusyAccountId(null); }
  }

  const activeAccounts = accounts.filter((account) => account.isActive);
  const totalCurrentBalance = activeAccounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const totalProjectedBalance = activeAccounts.reduce((sum, account) => sum + Number(account.projectedBalance ?? account.currentBalance), 0);

  return <section className="page-stack">
    <div className="page-heading with-action"><div><p className="eyebrow">Fase 2 · Contas</p><h1>Suas contas</h1><p>Cadastre bancos, carteiras e dinheiro físico para formar seu saldo disponível.</p></div><button className="primary-button inline-button" type="button" onClick={openCreate}>+ Nova conta</button></div>
    <section className="balance-banner"><span>Saldo disponível</span><strong>{formatCurrency(totalCurrentBalance, user.currency)}</strong><small>Após compromissos vencidos: {formatCurrency(totalProjectedBalance, user.currency)}</small></section>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}{notice ? <div className="form-notice" role="status">{notice}</div> : null}
    {form ? <section className="editor-card" aria-labelledby="account-form-title"><div className="editor-heading"><div><p className="eyebrow">{editingAccount ? "Editar conta" : "Nova conta"}</p><h2 id="account-form-title">{editingAccount ? editingAccount.name : "Adicionar uma conta"}</h2></div><button className="text-button" type="button" onClick={closeEditors}>Cancelar</button></div><form className="entity-form" onSubmit={submitAccount}>
      <label className="form-field"><span>Nome</span><input name="name" value={form.name} onChange={updateForm} required minLength="2" maxLength="100" placeholder="Ex.: Nubank" /></label><label className="form-field"><span>Instituição</span><input name="institution" value={form.institution} onChange={updateForm} maxLength="120" placeholder="Ex.: Nubank" /></label><label className="form-field"><span>Tipo</span><select name="type" value={form.type} onChange={updateForm}>{ACCOUNT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!editingAccount ? <label className="form-field"><span>Saldo inicial</span><CurrencyInput name="initialBalance" value={form.initialBalance} onChange={updateForm} required /></label> : null}<label className="form-field color-field"><span>Cor</span><input name="color" value={form.color} onChange={updateForm} type="color" /></label><label className="form-field"><span>Ícone ou apelido visual</span><input name="icon" value={form.icon} onChange={updateForm} maxLength="60" placeholder="Ex.: 💳 ou carteira" /></label>{editingAccount ? <label className="checkbox-field"><input name="isActive" type="checkbox" checked={form.isActive} onChange={updateForm} /> Conta ativa</label> : null}<button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : editingAccount ? "Salvar alterações" : "Criar conta"}</button>
    </form></section> : null}
    {balanceAccount ? <section className="editor-card" aria-labelledby="balance-form-title"><div className="editor-heading"><div><p className="eyebrow">Ajuste manual</p><h2 id="balance-form-title">Editar saldo de {balanceAccount.name}</h2></div><button className="text-button" type="button" onClick={closeEditors}>Cancelar</button></div><form className="entity-form" onSubmit={submitBalance}><label className="form-field"><span>Saldo atual registrado</span><input value={formatCurrency(balanceAccount.currentBalance, user.currency)} disabled /></label><label className="form-field"><span>Novo saldo atual</span><CurrencyInput name="currentBalance" value={balance} onChange={(event) => setBalance(event.target.value)} required /></label><p className="form-help form-field-wide">O ajuste é registrado no histórico da conta e não cria uma receita ou despesa.</p><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Confirmar ajuste de saldo"}</button></form></section> : null}
    {historyAccount ? <section className="editor-card"><div className="editor-heading"><div><p className="eyebrow">Histórico</p><h2>Ajustes de {historyAccount.name}</h2></div><button className="text-button" type="button" onClick={closeEditors}>Fechar</button></div><BalanceHistory items={balanceHistory} currency={user.currency} /></section> : null}
    {isLoading ? <p className="loading-inline">Carregando contas...</p> : null}{!isLoading && accounts.length === 0 ? <EmptyState title="Nenhuma conta cadastrada" description="Adicione sua primeira conta para começar a visualizar seu saldo." action={<button className="primary-button inline-button" type="button" onClick={openCreate}>Cadastrar conta</button>} /> : null}
    {!isLoading && accounts.length > 0 ? <div className="entity-grid">{accounts.map((account) => <article className={`account-card ${account.isActive ? "" : "is-inactive"}`} key={account.id}><div className="account-card-top"><span className="color-chip" style={{ backgroundColor: account.color || "#667085" }} aria-hidden="true">{account.icon || account.name.slice(0, 1).toUpperCase()}</span><div><h2>{account.name}</h2><p>{account.institution || formatAccountType(account.type)}</p></div>{!account.isActive ? <span className="status-tag">Inativa</span> : null}<ActionMenu items={[{ label: "Editar conta", onSelect: () => openEdit(account), disabled: busyAccountId === account.id }, { label: "Editar saldo", onSelect: () => openBalanceEditor(account), disabled: busyAccountId === account.id }, { label: "Ver histórico", onSelect: () => openHistory(account), disabled: busyAccountId === account.id }, { label: account.isActive ? "Desativar" : "Ativar", onSelect: () => toggleStatus(account), disabled: busyAccountId === account.id }, { label: "Excluir", onSelect: () => remove(account), destructive: true, disabled: busyAccountId === account.id }]} /></div><strong>{formatCurrency(account.currentBalance, user.currency)}</strong><small className={Number(account.projectedBalance ?? account.currentBalance) < 0 ? "expense-text" : ""}>Disponível projetado: {formatCurrency(account.projectedBalance ?? account.currentBalance, user.currency)}</small><small>{Number(account.pendingCommitments) > 0 ? `Compromissos pendentes: ${formatCurrency(account.pendingCommitments, user.currency)}` : `Saldo inicial: ${formatCurrency(account.initialBalance, user.currency)}`}</small></article>)}</div> : null}
  </section>;
}
