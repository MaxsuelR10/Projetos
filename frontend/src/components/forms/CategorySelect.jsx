import { useEffect, useRef, useState } from 'react'

export function CategorySelect({ value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find((option) => option.id === value)

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  function selectCategory(categoryId) {
    onChange({ target: { name: 'categoryId', value: categoryId } })
    setIsOpen(false)
  }

  return <div className="category-select" ref={rootRef}>
    <button type="button" className="category-select-trigger" aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}>
      <span>{selected?.name || 'Selecione'}</span><span aria-hidden="true">⌄</span>
    </button>
    {isOpen ? <div className="category-select-options" role="listbox" aria-label="Categorias">
      {options.map((category) => <button key={category.id} type="button" role="option" aria-selected={category.id === value} className={category.id === value ? 'is-selected' : ''} onClick={() => selectCategory(category.id)}>{category.name}</button>)}
    </div> : null}
  </div>
}
