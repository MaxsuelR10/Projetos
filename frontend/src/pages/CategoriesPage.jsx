import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { categoryService } from '../services/category.service.js'
import { getApiError } from '../utils/get-api-error.js'

const emptyCategoryForm = { name: '', type: 'EXPENSE', color: '#EF4444', icon: '' }
const emptySubcategoryForm = { name: '', color: '#64748B', icon: '' }

export function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [activeType, setActiveType] = useState('EXPENSE')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryEditor, setCategoryEditor] = useState(null)
  const [subcategoryEditor, setSubcategoryEditor] = useState(null)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [subcategoryForm, setSubcategoryForm] = useState(emptySubcategoryForm)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadCategories = useCallback(async () => {
    setIsLoading(true)
    try {
      setCategories(await categoryService.list('all'))
      setError('')
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    categoryService.list('all')
      .then((loadedCategories) => {
        if (active) {
          setCategories(loadedCategories)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [])

  const visibleCategories = useMemo(
    () => categories.filter((category) => category.type === activeType),
    [categories, activeType],
  )

  function openCategoryEditor(category = null) {
    setSubcategoryEditor(null)
    setCategoryEditor(category || {})
    setCategoryForm(category ? {
      name: category.name,
      type: category.type,
      color: category.color || (category.type === 'EXPENSE' ? '#EF4444' : '#10B981'),
      icon: category.icon || '',
    } : {
      ...emptyCategoryForm,
      type: activeType,
      color: activeType === 'EXPENSE' ? '#EF4444' : '#10B981',
    })
  }

  function openSubcategoryEditor(category, subcategory = null) {
    setCategoryEditor(null)
    setSubcategoryEditor({ category, subcategory })
    setSubcategoryForm(subcategory ? {
      name: subcategory.name,
      color: subcategory.color || category.color || '#64748B',
      icon: subcategory.icon || '',
    } : {
      ...emptySubcategoryForm,
      color: category.color || '#64748B',
    })
  }

  function closeEditors() {
    setCategoryEditor(null)
    setSubcategoryEditor(null)
    setError('')
  }

  async function submitCategory(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      if (categoryEditor?.id) {
        await categoryService.update(categoryEditor.id, categoryForm)
      } else {
        await categoryService.create(categoryForm)
      }
      closeEditors()
      await loadCategories()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitSubcategory(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      if (subcategoryEditor.subcategory) {
        await categoryService.updateSubcategory(
          subcategoryEditor.category.id,
          subcategoryEditor.subcategory.id,
          subcategoryForm,
        )
      } else {
        await categoryService.createSubcategory(subcategoryEditor.category.id, subcategoryForm)
      }
      closeEditors()
      await loadCategories()
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function toggleCategory(category) {
    try {
      await categoryService.update(category.id, { isActive: !category.isActive })
      await loadCategories()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Excluir a categoria "${category.name}"?`)) return
    try {
      await categoryService.remove(category.id)
      await loadCategories()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  async function toggleSubcategory(category, subcategory) {
    try {
      await categoryService.updateSubcategory(category.id, subcategory.id, { isActive: !subcategory.isActive })
      await loadCategories()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  async function removeSubcategory(category, subcategory) {
    if (!window.confirm(`Excluir a subcategoria "${subcategory.name}"?`)) return
    try {
      await categoryService.removeSubcategory(category.id, subcategory.id)
      await loadCategories()
    } catch (requestError) { setError(getApiError(requestError)) }
  }

  return (
    <section className="page-stack">
      <div className="page-heading with-action">
        <div>
          <p className="eyebrow">Fase 2 · Categorias</p>
          <h1>Categorias</h1>
          <p>Personalize a classificação de receitas e despesas antes dos lançamentos.</p>
        </div>
        <button className="primary-button inline-button" type="button" onClick={() => openCategoryEditor()}>+ Nova categoria</button>
      </div>

      <div className="segmented-control" role="tablist" aria-label="Tipo de categoria">
        <button type="button" role="tab" aria-selected={activeType === 'EXPENSE'} className={activeType === 'EXPENSE' ? 'is-selected expense' : ''} onClick={() => setActiveType('EXPENSE')}>Despesas</button>
        <button type="button" role="tab" aria-selected={activeType === 'INCOME'} className={activeType === 'INCOME' ? 'is-selected income' : ''} onClick={() => setActiveType('INCOME')}>Receitas</button>
      </div>

      {error ? <div className="form-alert" role="alert">{error}</div> : null}

      {categoryEditor ? (
        <section className="editor-card" aria-labelledby="category-form-title">
          <div className="editor-heading"><div><p className="eyebrow">{categoryEditor.id ? 'Editar categoria' : 'Nova categoria'}</p><h2 id="category-form-title">{categoryEditor.id ? categoryEditor.name : 'Organizar categoria'}</h2></div><button className="text-button" type="button" onClick={closeEditors}>Cancelar</button></div>
          <form className="entity-form compact-form" onSubmit={submitCategory}>
            <label className="form-field"><span>Nome</span><input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required minLength="2" maxLength="100" placeholder="Ex.: Restaurantes" /></label>
            <label className="form-field"><span>Tipo</span><select value={categoryForm.type} onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value }))}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option></select></label>
            <label className="form-field color-field"><span>Cor</span><input type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} /></label>
            <label className="form-field"><span>Ícone ou apelido visual</span><input value={categoryForm.icon} onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))} maxLength="60" placeholder="Ex.: 🍽️" /></label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : categoryEditor.id ? 'Salvar categoria' : 'Criar categoria'}</button>
          </form>
        </section>
      ) : null}

      {subcategoryEditor ? (
        <section className="editor-card" aria-labelledby="subcategory-form-title">
          <div className="editor-heading"><div><p className="eyebrow">{subcategoryEditor.subcategory ? 'Editar subcategoria' : 'Nova subcategoria'}</p><h2 id="subcategory-form-title">{subcategoryEditor.category.name}</h2></div><button className="text-button" type="button" onClick={closeEditors}>Cancelar</button></div>
          <form className="entity-form compact-form" onSubmit={submitSubcategory}>
            <label className="form-field"><span>Nome</span><input value={subcategoryForm.name} onChange={(event) => setSubcategoryForm((current) => ({ ...current, name: event.target.value }))} required minLength="2" maxLength="100" placeholder="Ex.: Aluguel" /></label>
            <label className="form-field color-field"><span>Cor</span><input type="color" value={subcategoryForm.color} onChange={(event) => setSubcategoryForm((current) => ({ ...current, color: event.target.value }))} /></label>
            <label className="form-field"><span>Ícone ou apelido visual</span><input value={subcategoryForm.icon} onChange={(event) => setSubcategoryForm((current) => ({ ...current, icon: event.target.value }))} maxLength="60" placeholder="Ex.: 🏠" /></label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : subcategoryEditor.subcategory ? 'Salvar subcategoria' : 'Criar subcategoria'}</button>
          </form>
        </section>
      ) : null}

      {isLoading ? <p className="loading-inline">Carregando categorias...</p> : null}
      {!isLoading && visibleCategories.length === 0 ? <EmptyState title="Nenhuma categoria neste grupo" description="Crie uma categoria personalizada para organizar melhor seus lançamentos." action={<button className="primary-button inline-button" type="button" onClick={() => openCategoryEditor()}>Criar categoria</button>} /> : null}
      {!isLoading && visibleCategories.length > 0 ? (
        <div className="category-list">
          {visibleCategories.map((category) => (
            <article className={`category-card ${category.isActive ? '' : 'is-inactive'}`} key={category.id}>
              <div className="category-main">
                <span className="category-dot" style={{ backgroundColor: category.color || '#64748B' }} aria-hidden="true">{category.icon || category.name.slice(0, 1).toUpperCase()}</span>
                <div className="category-title"><h2>{category.name}</h2><div>{category.isDefault ? <span className="status-tag">Padrão</span> : null}{!category.isActive ? <span className="status-tag">Inativa</span> : null}</div></div>
                <div className="card-actions compact-actions"><button type="button" onClick={() => openCategoryEditor(category)}>Editar</button><button type="button" onClick={() => toggleCategory(category)}>{category.isActive ? 'Desativar' : 'Ativar'}</button>{!category.isDefault ? <button type="button" className="danger-action" onClick={() => removeCategory(category)}>Excluir</button> : null}</div>
              </div>
              <div className="subcategory-area">
                <div className="subcategory-header"><span>Subcategorias</span><button type="button" className="text-button" onClick={() => openSubcategoryEditor(category)}>+ Adicionar</button></div>
                {category.subcategories.length === 0 ? <p className="muted-copy">Nenhuma subcategoria.</p> : null}
                {category.subcategories.map((subcategory) => (
                  <div className={`subcategory-row ${subcategory.isActive ? '' : 'is-inactive'}`} key={subcategory.id}>
                    <span style={{ color: subcategory.color || category.color || '#64748B' }}>{subcategory.icon || '•'}</span><span>{subcategory.name}</span>{!subcategory.isActive ? <small>Inativa</small> : null}
                    <div><button type="button" onClick={() => openSubcategoryEditor(category, subcategory)}>Editar</button><button type="button" onClick={() => toggleSubcategory(category, subcategory)}>{subcategory.isActive ? 'Desativar' : 'Ativar'}</button><button type="button" className="danger-action" onClick={() => removeSubcategory(category, subcategory)}>Excluir</button></div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
