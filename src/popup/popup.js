// Popup: lists the zones and holds the settings.

import { loadSettings, saveSettings, onSettingsChanged, newZoneId, MAX_ZONES } from '../lib/settings.js';
import {
  systemTimeZone, resolveTimeZone, formatTime, formatDate, offsetFrom, formatUtcOffset, zoneName, dayDelta,
  displayLabel, msUntilNextMinute,
} from '../lib/time.js';
import { h, t, replaceKeepingFocus } from './dom.js';
import { createSearch } from './search.js';
import { createPrefs } from './prefs.js';

const locale = chrome.i18n.getUILanguage();

let settings;
let editingId = null; // zone whose label is being edited
let updaters = []; // one per visible time, called every minute

const app = document.getElementById('app');
const list = h('ul', { class: 'zones' });

const search = createSearch({
  taken: () => new Set(settings.zones.map((z) => z.timeZone).filter(Boolean)),
  timeText,
  onPick: addZone,
  onClose: closeSearch,
});

const prefs = createPrefs({ onChange: commit });

const addButton = h('button', {
  class: 'footer-button',
  type: 'button',
  'aria-expanded': 'false',
  onclick: () => (search.open ? closeSearch() : openSearch()),
}, t('addZone'));

const prefsButton = h('button', {
  class: 'footer-button',
  type: 'button',
  'aria-expanded': 'false',
  onclick: () => togglePrefs(!prefs.open),
}, t('settings'));

/** Applies a change locally right away and persists it. */
function commit(change) {
  const next = structuredClone(settings);
  change(next);
  settings = next;
  render();
  saveSettings(next);
}

function timeText(now, timeZone) {
  return formatTime(now, timeZone, { hour12: settings.hour12, withDayPeriod: true, locale });
}

function zoneRow(zone) {
  const primary = zone.id === settings.primaryId;
  const timeZone = resolveTimeZone(zone);
  const time = h('span', { class: 'time' });
  const date = h('span', { class: 'date' });
  const offset = h('span', { class: 'offset' });
  const day = h('span', { class: 'day' });
  const official = h('span', { class: 'zone-name' });

  updaters.push((now) => {
    const delta = dayDelta(now, timeZone, systemTimeZone());
    time.textContent = timeText(now, timeZone);
    date.textContent = formatDate(now, timeZone, locale);
    offset.textContent = formatUtcOffset(offsetFrom(now, timeZone, 'UTC'));
    day.textContent = delta > 0 ? t('tomorrow') : delta < 0 ? t('yesterday') : '';
    official.textContent = zoneName(now, timeZone, locale) || '';
  });

  const label = displayLabel(zone, t('localZone'));
  const editing = zone.id === editingId;
  const action = (key, text, run) => h('button', {
    class: 'action',
    type: 'button',
    title: '',
    'aria-label': `${text} ${label}`,
    'data-key': `${key}:${zone.id}`,
    onclick: (event) => {
      event.stopPropagation();
      run();
    },
  }, text);

  const makePrimary = () => {
    if (!primary && !editing) commit((s) => { s.primaryId = zone.id; });
  };

  return h('li', {
    class: ['zone', primary && 'primary', editing && 'editing'].filter(Boolean).join(' '),
    title: primary || editing ? null : t('makePrimary'),
    onclick: makePrimary,
  },
    h('div', { class: 'name' },
      editing ? labelInput(zone) : h('button', {
        class: 'label',
        type: 'button',
        'aria-current': primary ? 'true' : null,
        'aria-description': primary ? null : t('makePrimary'),
        'data-key': `row:${zone.id}`,
      }, label),
      h('span', { class: 'sub' },
        official,
        editing ? null : h('span', { class: 'actions' },
          action('edit', t('edit'), () => startEdit(zone.id)),
          settings.zones.length > 1 ? action('remove', t('remove'), () => removeZone(zone.id)) : null,
        ),
      ),
      primary ? h('span', { class: 'hint' }, t('primaryHint')) : null,
    ),
    h('span', { class: 'shift' }, offset, day),
    h('span', { class: 'clock' }, time, date),
  );
}

/** Inline label editor: Enter or blur saves, Esc cancels, empty resets to the derived name. */
function labelInput(zone) {
  const derived = displayLabel({ ...zone, label: '' }, t('localZone'));
  const input = h('input', {
    class: 'label-input',
    type: 'text',
    value: zone.label,
    placeholder: derived,
    maxLength: 40,
    'aria-label': t('labelPlaceholder'),
    'data-key': `row:${zone.id}`,
    onclick: (event) => event.stopPropagation(),
  });
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    editingId = null;
    const value = input.value.trim() === derived ? '' : input.value.trim();
    if (save && value !== zone.label) {
      commit((s) => { s.zones.find((z) => z.id === zone.id).label = value; });
    } else {
      render();
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') finish(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
  return input;
}

function startEdit(id) {
  editingId = id;
  render();
  const input = list.querySelector('.label-input');
  input.focus();
  input.select();
}

function removeZone(id) {
  const index = settings.zones.findIndex((z) => z.id === id);
  commit((s) => {
    s.zones.splice(index, 1);
    if (s.primaryId === id) s.primaryId = s.zones[0].id;
  });
  const labels = list.querySelectorAll('.label');
  labels[Math.min(index, labels.length - 1)]?.focus();
}

function togglePrefs(open) {
  if (open) {
    if (search.open) closeSearch();
    prefs.show();
  } else {
    prefs.hide();
  }
  prefsButton.textContent = t(open ? 'done' : 'settings');
  prefsButton.setAttribute('aria-expanded', String(open));
}

function openSearch() {
  if (prefs.open) togglePrefs(false);
  search.show();
  addButton.setAttribute('aria-expanded', 'true');
}

function closeSearch() {
  search.hide();
  addButton.setAttribute('aria-expanded', 'false');
  addButton.focus();
}

function addZone(timeZone) {
  if (settings.zones.length >= MAX_ZONES) return;
  closeSearch();
  commit((s) => { s.zones.push({ id: newZoneId(), timeZone, label: '' }); });
}

function render() {
  updaters = [];
  replaceKeepingFocus(list, ...settings.zones.map(zoneRow));
  addButton.disabled = settings.zones.length >= MAX_ZONES;
  if (addButton.disabled && search.open) closeSearch();
  prefs.sync(settings);
  tick();
}

function tick() {
  const now = new Date();
  for (const update of updaters) update(now);
  search.refresh();
}

function scheduleTick() {
  setTimeout(() => {
    tick();
    scheduleTick();
  }, msUntilNextMinute(new Date()) + 20);
}

async function boot() {
  document.documentElement.lang = locale;
  document.title = t('extName');
  settings = await loadSettings();
  app.append(list, search.el, prefs.el, h('footer', { class: 'footer' }, addButton, prefsButton));
  render();
  scheduleTick();
  onSettingsChanged((next) => {
    settings = next;
    if (editingId === null) render();
  });
}

boot();
