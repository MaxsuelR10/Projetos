import {institutionIdentity, institutionOptions, matchesInstitution, suggestInstitution} from './institutions.mjs';

export function createInstitutionUI({icon, escape}) {
  function logo(identity, kind) {
    return identity.logo
      ? `<img class="institution-logo" src="${identity.logo}" width="40" height="40" alt="">`
      : `<span class="institution-logo institution-neutral" aria-hidden="true">${icon(kind, 19)}</span>`;
  }

  function colors(identity) {
    return `--institution-bg:${identity.primary};--institution-text:${identity.text};--institution-accent:${identity.secondary}`;
  }

  function badge(record, kind = 'wallet', {name = '', showUnselected = false} = {}) {
    const identity = institutionIdentity(record?.institutionId);
    const label = identity.id || showUnselected ? identity.displayName : '';
    return `<span class="institution-identity">${logo(identity, kind)}${name || label
      ? `<span>${name ? `<strong>${escape(name)}</strong>` : ''}${label && label !== name ? `<small>${escape(label)}</small>` : ''}</span>` : ''}</span>`;
  }

  function picker(record, kind) {
    const current = institutionIdentity(record?.institutionId);
    const suggestion = suggestInstitution(record);
    return `<fieldset class="institution-field" data-institution-picker data-kind="${kind}">
      <legend>Instituição financeira <small>(opcional)</small></legend>
      <input type="hidden" name="institutionId" value="${current.id}">
      <output class="institution-preview" aria-live="polite" style="${colors(current)}">${badge(record, kind, {showUnselected:true})}</output>
      ${suggestion ? `<button class="btn small institution-suggestion" type="button" data-institution-id="${suggestion.id}">Usar sugestão: ${escape(suggestion.displayName)}</button>` : ''}
      <details class="institution-picker">
        <summary>Escolher instituição</summary>
        <label class="field"><span>Buscar instituição</span><input type="search" autocomplete="off" data-institution-search></label>
        <ul class="institution-options" aria-label="Instituições financeiras">
          ${institutionOptions.map(item => `<li><button type="button" data-institution-id="${item.id}" aria-pressed="${item.id === current.id}">${logo(item, kind)}<span>${escape(item.displayName)}</span></button></li>`).join('')}
        </ul>
        <p class="muted" role="status" hidden>Nenhuma instituição encontrada.</p>
      </details>
    </fieldset>`;
  }

  function bind(root) {
    const field = root.querySelector('[data-institution-picker]');
    if (!field) return;
    const details = field.querySelector('details');
    const summary = details.querySelector('summary');
    const search = details.querySelector('[data-institution-search]');
    const status = details.querySelector('[role="status"]');
    const buttons = [...details.querySelectorAll('button')];
    const preview = field.querySelector('output');
    const input = field.querySelector('[name="institutionId"]');
    const visibleButtons = () => buttons.filter(button => !button.parentElement.hidden);

    function filter() {
      buttons.forEach((button, index) => {
        button.parentElement.hidden = !matchesInstitution(institutionOptions[index], search.value);
      });
      status.hidden = visibleButtons().length > 0;
    }

    search.addEventListener('input', filter);
    field.addEventListener('click', event => {
      const button = event.target.closest('[data-institution-id]');
      if (!button) return;
      const identity = institutionIdentity(button.dataset.institutionId);
      input.value = identity.id;
      preview.style.cssText = colors(identity);
      preview.innerHTML = badge({institutionId:identity.id}, field.dataset.kind, {showUnselected:true});
      for (const option of buttons) option.setAttribute('aria-pressed', option.dataset.institutionId === identity.id);
      field.querySelector('.institution-suggestion')?.remove();
      details.open = false;
      search.value = '';
      filter();
      summary.focus();
    });
    details.addEventListener('keydown', event => {
      if (!details.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        summary.focus();
      } else if (['ArrowDown', 'ArrowUp'].includes(event.key) || (event.key === 'Enter' && event.target === search)) {
        event.preventDefault();
        const visible = visibleButtons();
        const index = visible.indexOf(event.target);
        const next = event.key === 'ArrowUp' ? index - 1 : index + 1;
        (visible[next] || (event.key === 'ArrowUp' ? search : visible.at(-1)))?.focus();
      }
    });
  }

  return {badge, colors, picker, bind};
}
