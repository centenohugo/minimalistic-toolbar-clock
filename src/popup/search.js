// Compact zone search: an input with up to eight suggestions under it, enough
// to list every zone of the countries and states it knows.

import { searchPlaces, placeKey } from '../lib/time.js';
import { h, t } from './dom.js';

const LIMIT = 8;

/**
 * @param {{
 *   taken: () => Set<string>,
 *   timeText: (now: Date, timeZone: string) => string,
 *   onPick: (place: import('../lib/time.js').Place) => void,
 *   onClose: () => void,
 * }} options
 */
export function createSearch({ taken, timeText, onPick, onClose }) {
  let results = [];
  let active = 0;

  const input = h('input', {
    class: 'search-input',
    type: 'text',
    role: 'combobox',
    placeholder: t('searchPlaceholder'),
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': t('addZone'),
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'suggestions',
  });
  const list = h('ul', { class: 'suggestions', id: 'suggestions', role: 'listbox', 'aria-label': t('addZone') });
  const el = h('section', { class: 'search', hidden: true }, input, list);

  function setActive(index) {
    active = index;
    list.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
    if (results.length) input.setAttribute('aria-activedescendant', `suggestion-${index}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function refresh() {
    const query = input.value.trim();
    const skip = taken();
    const hits = query ? searchPlaces(query, { limit: LIMIT + skip.size }) : [];
    results = hits.filter((place) => !skip.has(placeKey(place.timeZone, place.name))).slice(0, LIMIT);
    const now = new Date();
    list.replaceChildren(...results.map((place, i) => h('li', {
      class: 'suggestion',
      id: `suggestion-${i}`,
      role: 'option',
      onmousedown: (event) => event.preventDefault(), // keep focus in the input
      onmousemove: () => active !== i && setActive(i),
      onclick: () => onPick(place),
    },
      h('span', { class: 'city' }, place.name),
      h('span', { class: 'region' }, place.region),
      h('span', { class: 'suggestion-time' }, timeText(now, place.timeZone)),
    )));
    if (query && !results.length) {
      list.append(h('li', { class: 'empty' }, t(hits.length ? 'alreadyAdded' : 'noResults')));
    }
    input.setAttribute('aria-expanded', String(results.length > 0));
    setActive(Math.min(active, Math.max(results.length - 1, 0)));
  }

  input.addEventListener('input', () => {
    active = 0;
    refresh();
  });

  input.addEventListener('keydown', (event) => {
    const n = results.length;
    if (event.key === 'ArrowDown' && n) setActive((active + 1) % n);
    else if (event.key === 'ArrowUp' && n) setActive((active - 1 + n) % n);
    else if (event.key === 'Enter' && n) onPick(results[active]);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });

  return {
    el,
    get open() {
      return !el.hidden;
    },
    show() {
      el.hidden = false;
      input.value = '';
      active = 0;
      refresh();
      input.focus();
    },
    hide() {
      el.hidden = true;
    },
    refresh() {
      if (!el.hidden) refresh();
    },
  };
}
