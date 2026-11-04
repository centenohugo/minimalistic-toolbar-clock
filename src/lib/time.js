// Pure time helpers shared by the service worker and the popup. No chrome.*
// APIs here, so everything can be tested with node:test.

import { CITIES, AREAS } from './places.js';

// ICU still reports some zones by their legacy ids; map them to the current
// ones so city names and search use modern spellings.
const LEGACY_IDS = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

// Spanish spellings (already normalized) of the IANA city, by modern id.
const EXONYMS = {
  'America/New_York': ['nueva york'],
  'America/Mexico_City': ['ciudad de mexico'],
  'America/Santiago': ['santiago de chile'],
  'America/Havana': ['la habana'],
  'Europe/London': ['londres'],
  'Europe/Lisbon': ['lisboa'],
  'Europe/Rome': ['roma'],
  'Europe/Warsaw': ['varsovia'],
  'Europe/Stockholm': ['estocolmo'],
  'Europe/Copenhagen': ['copenhague'],
  'Europe/Brussels': ['bruselas'],
  'Europe/Vienna': ['viena'],
  'Europe/Prague': ['praga'],
  'Europe/Athens': ['atenas'],
  'Europe/Istanbul': ['estambul'],
  'Europe/Moscow': ['moscu'],
  'Africa/Cairo': ['el cairo'],
  'Africa/Johannesburg': ['johannesburgo'],
  'Asia/Jerusalem': ['jerusalen'],
  'Asia/Tehran': ['teheran'],
  'Asia/Kolkata': ['calcuta'],
  'Asia/Jakarta': ['yakarta'],
  'Asia/Singapore': ['singapur'],
  'Asia/Seoul': ['seul'],
  'Asia/Tokyo': ['tokio'],
  'Australia/Sydney': ['sidney'],
  'Pacific/Honolulu': ['hawai'],
};

const formatters = new Map();

// Wall-clock fields of `date` in `timeZone`, 24 h, Latin digits.
function wallClock(date, timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', numberingSystem: 'latn',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(timeZone, fmt);
  }
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = Number(value);
  return p;
}

const pad = (n) => String(n).padStart(2, '0');
const canonical = (timeZone) => LEGACY_IDS[timeZone] || timeZone;
const lastSegment = (id) => id.split('/').pop().replace(/_/g, ' ');

/** IANA name of the system time zone. */
export function systemTimeZone() {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Time zone to use for a stored zone: its own, or the system one when null.
 * @param {{ timeZone: string|null }} zone
 * @returns {string}
 */
export function resolveTimeZone(zone) {
  return zone.timeZone || systemTimeZone();
}

/**
 * Hours and minutes in a zone, ready to draw.
 * Hours always have two digits ("09"), also in 12 h, which adds dayPeriod.
 * @param {Date} date
 * @param {string} timeZone
 * @param {boolean} hour12
 * @returns {{ hours: string, minutes: string, dayPeriod: 'am'|'pm'|null }}
 */
export function getTimeParts(date, timeZone, hour12) {
  const { hour, minute } = wallClock(date, timeZone);
  return {
    hours: pad(hour12 ? hour % 12 || 12 : hour),
    minutes: pad(minute),
    dayPeriod: hour12 ? (hour < 12 ? 'am' : 'pm') : null,
  };
}

/**
 * Time as text. "14:35" in 24 h; "02:35" in 12 h, or the locale's full
 * 12 h form ("02:35 p. m.", "02:35 PM") when withDayPeriod is true.
 * @param {Date} date
 * @param {string} timeZone
 * @param {{ hour12: boolean, withDayPeriod?: boolean, locale?: string }} options
 * @returns {string}
 */
export function formatTime(date, timeZone, { hour12, withDayPeriod = false, locale } = {}) {
  if (hour12 && withDayPeriod) {
    return new Intl.DateTimeFormat(locale, {
      timeZone, hourCycle: 'h12', hour: '2-digit', minute: '2-digit',
    }).format(date);
  }
  const { hours, minutes } = getTimeParts(date, timeZone, hour12);
  return `${hours}:${minutes}`;
}

/**
 * Short date in a zone, in the locale's own order: "jue, 5 nov", "Thu, Nov 5".
 * @param {Date} date
 * @param {string} timeZone
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDate(date, timeZone, locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).format(date);
}

/**
 * Minutes that `timeZone` is ahead of `baseTimeZone` at `date` (negative if behind).
 * @returns {number}
 */
export function offsetFrom(date, timeZone, baseTimeZone) {
  const asUtc = (p) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const diff = asUtc(wallClock(date, timeZone)) - asUtc(wallClock(date, baseTimeZone));
  return Math.round(diff / 60000);
}

/**
 * Offset from UTC as shown in the popup: "UTC+8", "UTC−3", "UTC+5:30", "UTC+0".
 * Uses the real minus sign (U+2212).
 * @param {number} minutes  From offsetFrom(date, timeZone, 'UTC').
 * @returns {string}
 */
export function formatUtcOffset(minutes) {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `UTC${sign}${h}:${pad(m)}` : `UTC${sign}${h}`;
}

/**
 * Official name of the zone at `date`, in `locale`, capitalized:
 * "Hora estándar de Hong Kong", "Eastern Daylight Time". Null when the
 * runtime only knows it as a bare offset ("GMT+3").
 * @param {Date} date
 * @param {string} timeZone
 * @param {string} [locale]
 * @returns {string|null}
 */
export function zoneName(date, timeZone, locale) {
  const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'long' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value;
  if (!name || /^(GMT|UTC)([+−-]|$)/.test(name)) return null;
  return name[0].toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * Calendar day of `timeZone` relative to `baseTimeZone` at `date`: -1, 0 or 1.
 * @returns {-1|0|1}
 */
export function dayDelta(date, timeZone, baseTimeZone) {
  const day = (p) => Date.UTC(p.year, p.month - 1, p.day);
  return Math.sign(day(wallClock(date, timeZone)) - day(wallClock(date, baseTimeZone)));
}

/**
 * Human city name from an IANA id: "America/New_York" -> "New York",
 * "America/Argentina/Buenos_Aires" -> "Buenos Aires".
 * @param {string} timeZone
 * @returns {string}
 */
export function cityName(timeZone) {
  return lastSegment(canonical(timeZone));
}

/**
 * Label to show for a zone: the custom label, else the city name, else
 * `localLabel` for the system zone.
 * @param {{ timeZone: string|null, label: string }} zone
 * @param {string} localLabel
 * @returns {string}
 */
export function displayLabel(zone, localLabel) {
  const custom = (zone.label || '').trim();
  if (custom) return custom;
  return zone.timeZone ? cityName(zone.timeZone) : localLabel;
}

// Lowercase, no diacritics, "_", "-" and "/" as spaces.
function normalize(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function defaultTimeZones() {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes('UTC') ? zones : [...zones, 'UTC'];
}

// 0: a city name starts with the query, 1: a word does, 2: anywhere, -1: no match.
function matchRank(timeZone, q) {
  const modern = canonical(timeZone);
  const cities = [cityName(timeZone), lastSegment(timeZone)].map(normalize)
    .concat(EXONYMS[modern] || []);
  const keys = cities.concat(normalize(timeZone), normalize(modern));
  if (cities.some((c) => c.startsWith(q))) return 0;
  if (keys.some((k) => ` ${k}`.includes(` ${q}`))) return 1;
  if (keys.some((k) => k.includes(q))) return 2;
  return -1;
}

// IANA ids matching the normalized query q, best first.
function rankedTimeZones(q, timeZones) {
  const seen = new Set();
  const hits = [];
  for (const id of timeZones) {
    if (seen.has(canonical(id))) continue;
    seen.add(canonical(id));
    const rank = matchRank(id, q);
    if (rank >= 0) hits.push({ id, rank, city: normalize(cityName(id)) });
  }
  return hits.sort((a, b) => a.rank - b.rank || (a.city < b.city ? -1 : a.city > b.city ? 1 : 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Up to `limit` IANA ids matching `query`, case- and accent-insensitive,
 * matching city or region; city prefix matches first. Also matches common
 * Spanish exonyms ("Nueva York", "Londres", "Tokio").
 * @param {string} query
 * @param {{ limit?: number, timeZones?: string[] }} [options]
 * @returns {string[]}
 */
export function searchTimeZones(query, { limit = 5, timeZones = defaultTimeZones() } = {}) {
  const q = normalize(query || '');
  if (!q) return [];
  return rankedTimeZones(q, timeZones).slice(0, limit).map((h) => h.id);
}

// -1: the name is the query, 0: starts with it, 1: a word does, 2: anywhere, null: no match.
function nameRank(name, q) {
  const n = normalize(name);
  if (n === q) return -1;
  if (n.startsWith(q)) return 0;
  if (n.includes(` ${q}`)) return 1;
  return n.includes(q) ? 2 : null;
}

/**
 * Identifies a place in the zone list: one zone can appear under several
 * names ("New York", "Miami"), but each name only once.
 * @param {string} timeZone
 * @param {string} name  Name shown for it.
 * @returns {string}
 */
export function placeKey(timeZone, name) {
  return `${canonical(timeZone)}|${name}`;
}

/**
 * @typedef {Object} Place
 * @property {string} timeZone  IANA id.
 * @property {string} name      Name to show: the zone's city, or the city searched.
 * @property {string} region    Second text: the state or country searched, else the IANA region.
 * @property {string} label     Label for a zone added from here; empty keeps the derived one.
 */

/**
 * Up to `limit` places matching `query`: time zones, major cities that share
 * one ("Miami") and states or countries, which expand to their zones ("Texas").
 * Exact names come first. Mere substrings only count when nothing else matches.
 * @param {string} query
 * @param {{ limit?: number, timeZones?: string[] }} [options]
 * @returns {Place[]}
 */
export function searchPlaces(query, { limit = 8, timeZones = defaultTimeZones() } = {}) {
  const q = normalize(query || '');
  if (!q) return [];
  const iana = (id) => (id.includes('/') ? id.split('/')[0].replace(/_/g, ' ') : '');
  const hits = [];

  for (const { id, rank, city } of rankedTimeZones(q, timeZones)) {
    hits.push({ rank: city === q ? -1 : rank, sort: city, timeZone: id, name: cityName(id), region: iana(id), label: '' });
  }
  for (const [names, zones] of AREAS) {
    const matches = names.map((name) => [nameRank(name, q), name]).filter(([rank]) => rank !== null);
    if (!matches.length) continue;
    const [rank, name] = matches.reduce((best, m) => (m[0] < best[0] ? m : best));
    for (const timeZone of zones) {
      hits.push({ rank, sort: normalize(name), timeZone, name: cityName(timeZone), region: name, label: '' });
    }
  }
  for (const [timeZone, names] of Object.entries(CITIES)) {
    for (const name of names) {
      const rank = nameRank(name, q);
      if (rank !== null) hits.push({ rank, sort: normalize(name), timeZone, name, region: iana(timeZone), label: name });
    }
  }

  const best = Math.min(...hits.map((hit) => hit.rank));
  const seen = new Set();
  return hits
    .filter((hit) => hit.rank < 2 || best === 2)
    // Stable: a state's zones keep their order, and a zone beats a city of the same name.
    .sort((a, b) => a.rank - b.rank || (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
    .filter((hit) => {
      const key = placeKey(hit.timeZone, hit.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ timeZone, name, region, label }) => ({ timeZone, name, region, label }));
}

/**
 * Milliseconds from `date` to the start of the next minute.
 * @param {Date} date
 * @returns {number}
 */
export function msUntilNextMinute(date) {
  const intoMinute = ((date.getTime() % 60000) + 60000) % 60000;
  return 60000 - intoMinute;
}
