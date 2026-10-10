import { useState } from 'react'

export function CsvMapping({ inspection, mapping, profiles, profileId, busy, onChange, onDelimiter, onProfile, onSaveProfile, onDeleteProfile, onPreview }) {
  const [name, setName] = useState('')
  const compatible = profiles.filter((profile) => JSON.stringify(profile.headers) === JSON.stringify(inspection.headers))
  const column = (key, label) => <label className="form-field" key={key}><span>{label}</span><select value={mapping[key] ?? ''} onChange={(event) => onChange({ ...mapping, [key]: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Selecione a coluna</option>{inspection.headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || 'Sem título'}</option>)}</select></label>
  return <section className="import-card csv-mapping"><fieldset disabled={busy}>
    <div><p className="eyebrow">2. Formato do arquivo</p><h2>Confira as colunas do CSV</h2><p>{inspection.rowCount} linha(s). Escolha como interpretar as datas e os valores antes da prévia.</p></div>
    <div className="csv-mapping-grid">
      <label className="form-field"><span>Perfil do banco</span><select value={profileId} onChange={(event) => onProfile(event.target.value)}><option value="">Mapeamento personalizado</option>{compatible.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      <label className="form-field"><span>Separador de colunas</span><select value={mapping.delimiter} onChange={(event) => onDelimiter(event.target.value)}><option value=";">Ponto e vírgula (;)</option><option value=",">Vírgula (,)</option><option value={'\t'}>Tabulação</option></select></label>
      {column('date', 'Coluna da data')}{column('description', 'Coluna da descrição')}
      <label className="form-field"><span>Formato da data</span><select value={mapping.dateFormat} onChange={(event) => onChange({ ...mapping, dateFormat: event.target.value })}><option value="AUTO">Detectar — pedir revisão se ambígua</option><option value="ISO">Ano-mês-dia (2026-10-09)</option><option value="DMY">Dia/mês/ano (09/10/2026)</option><option value="MDY">Mês/dia/ano (10/09/2026)</option></select></label>
      <label className="form-field"><span>Separador decimal</span><select value={mapping.decimalSeparator} onChange={(event) => onChange({ ...mapping, decimalSeparator: event.target.value })}><option value="AUTO">Detectar — pedir revisão se ambíguo</option><option value="COMMA">Vírgula — 1.250,50</option><option value="DOT">Ponto — 1,250.50</option></select></label>
      <label className="form-field"><span>Colunas de valores</span><select value={mapping.amountMode} onChange={(event) => onChange({ ...mapping, amountMode: event.target.value })}><option value="SIGNED">Uma coluna: negativo é despesa</option><option value="SPLIT">Débito e crédito separados</option></select></label>
      {mapping.amountMode === 'SIGNED' ? column('amount', 'Coluna do valor') : <>{column('debit', 'Coluna de débito (saída)')}{column('credit', 'Coluna de crédito (entrada)')}</>}
    </div>
    <div className="csv-sample-wrap"><table className="csv-sample"><caption>Amostra original — primeiras linhas</caption><thead><tr>{inspection.headers.map((header, index) => <th key={index}>{index + 1}. {header || 'Sem título'}</th>)}</tr></thead><tbody>{inspection.samples.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    <div className="csv-profile-actions"><label className="form-field"><span>Nome do perfil para reutilizar</span><input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Banco — conta corrente" /></label><button className="secondary-button" type="button" disabled={busy || name.trim().length < 2} onClick={() => onSaveProfile(name.trim())}>Salvar perfil</button>{profileId ? <button className="text-button danger-action" disabled={busy} type="button" onClick={() => onDeleteProfile(profileId)}>Excluir perfil</button> : null}</div>
    <p>O perfil guarda somente os cabeçalhos e suas escolhas de formato. Nenhum lançamento é criado ao salvar o perfil.</p>
    <button className="primary-button inline-button" type="button" disabled={busy} onClick={onPreview}>{busy ? 'Lendo...' : 'Gerar prévia para conferir'}</button>
  </fieldset></section>
}
