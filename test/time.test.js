import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  systemTimeZone, resolveTimeZone, getTimeParts, formatTime, formatDate, offsetFrom, formatUtcOffset,
  zoneName, dayDelta, cityName, displayLabel, searchTimeZones, searchPlaces, placeKey, msUntilNextMinute,
} from '../src/lib/time.js';
import { CITIES, AREAS } from '../src/lib/places.js';

const at = (iso) => new Date(iso);
// ICU separates the day period with narrow or regular no-break spaces.
const spaces = (s) => s.replace(/\s/g, ' ');

test('systemTimeZone and resolveTimeZone', () => {
  assert.equal(typeof systemTimeZone(), 'string');
  assert.equal(resolveTimeZone({ timeZone: null }), systemTimeZone());
  assert.equal(resolveTimeZone({ timeZone: 'Asia/Tokyo' }), 'Asia/Tokyo');
});

test('getTimeParts in 24 h pads hours and never shows 24', () => {
  assert.deepEqual(getTimeParts(at('2026-01-01T00:30:00Z'), 'UTC', false),
    { hours: '00', minutes: '30', dayPeriod: null });
  assert.deepEqual(getTimeParts(at('2026-01-01T09:05:00Z'), 'UTC', false),
    { hours: '09', minutes: '05', dayPeriod: null });
  assert.deepEqual(getTimeParts(at('2026-01-01T23:59:59Z'), 'UTC', false),
    { hours: '23', minutes: '59', dayPeriod: null });
});

test('getTimeParts in 12 h handles midnight and noon', () => {
  assert.deepEqual(getTimeParts(at('2026-01-01T00:05:00Z'), 'UTC', true),
    { hours: '12', minutes: '05', dayPeriod: 'am' });
  assert.deepEqual(getTimeParts(at('2026-01-01T12:00:00Z'), 'UTC', true),
    { hours: '12', minutes: '00', dayPeriod: 'pm' });
  assert.deepEqual(getTimeParts(at('2026-01-01T21:07:00Z'), 'UTC', true),
    { hours: '09', minutes: '07', dayPeriod: 'pm' });
});

test('formatTime in 24 h, 12 h and with the locale day period', () => {
  const date = at('2026-01-01T14:35:00Z');
  assert.equal(formatTime(date, 'UTC', { hour12: false }), '14:35');
  assert.equal(formatTime(date, 'UTC', { hour12: true }), '02:35');
  assert.equal(spaces(formatTime(date, 'UTC', { hour12: true, withDayPeriod: true, locale: 'en' })), '02:35 PM');
  assert.equal(spaces(formatTime(date, 'UTC', { hour12: true, withDayPeriod: true, locale: 'es' })), '02:35 p. m.');
  assert.equal(formatTime(date, 'UTC', { hour12: false, withDayPeriod: true }), '14:35');
});

test('formatDate gives the date in the zone, not the system one', () => {
  // Auckland 2026-01-16, Los Angeles 2026-01-15.
  const date = at('2026-01-15T20:00:00Z');
  assert.equal(spaces(formatDate(date, 'Pacific/Auckland', 'es')), 'vie, 16 ene');
  assert.equal(spaces(formatDate(date, 'America/Los_Angeles', 'es')), 'jue, 15 ene');
  assert.equal(spaces(formatDate(date, 'America/Los_Angeles', 'en')), 'Thu, Jan 15');
});

test('half-hour and 45-minute zones', () => {
  const date = at('2026-01-01T09:05:00Z');
  assert.equal(formatTime(date, 'Asia/Kolkata', { hour12: false }), '14:35');
  assert.equal(formatTime(date, 'Asia/Kathmandu', { hour12: false }), '14:50');
  assert.equal(offsetFrom(date, 'Asia/Kolkata', 'UTC'), 330);
  assert.equal(offsetFrom(date, 'Asia/Kathmandu', 'Asia/Kolkata'), 15);
  assert.equal(offsetFrom(date, 'UTC', 'Asia/Kathmandu'), -345);
});

test('offsetFrom follows DST in the weeks the US and EU disagree', () => {
  const madridVsNy = (iso) => offsetFrom(at(iso), 'Europe/Madrid', 'America/New_York');
  assert.equal(madridVsNy('2026-03-01T12:00:00Z'), 360);
  assert.equal(madridVsNy('2026-03-15T12:00:00Z'), 300); // US already on DST
  assert.equal(madridVsNy('2026-04-05T12:00:00Z'), 360);
  assert.equal(madridVsNy('2026-10-28T12:00:00Z'), 300); // EU already off DST
  assert.equal(madridVsNy('2026-11-05T12:00:00Z'), 360);
  // Right across the US switch: 2026-03-08 07:00Z.
  assert.equal(offsetFrom(at('2026-03-08T06:59:00Z'), 'America/New_York', 'UTC'), -300);
  assert.equal(offsetFrom(at('2026-03-08T07:00:00Z'), 'America/New_York', 'UTC'), -240);
});

test('formatUtcOffset', () => {
  assert.equal(formatUtcOffset(0), 'UTC+0');
  assert.equal(formatUtcOffset(480), 'UTC+8');
  assert.equal(formatUtcOffset(-180), 'UTC−3');
  assert.equal(formatUtcOffset(330), 'UTC+5:30');
  assert.equal(formatUtcOffset(-570), 'UTC−9:30');
  assert.equal(formatUtcOffset(345), 'UTC+5:45');
});

test('formatUtcOffset of a zone at a given instant', () => {
  const offset = (iso, tz) => formatUtcOffset(offsetFrom(at(iso), tz, 'UTC'));
  assert.equal(offset('2026-10-30T02:00:00Z', 'Asia/Hong_Kong'), 'UTC+8');
  assert.equal(offset('2026-07-01T12:00:00Z', 'Europe/Madrid'), 'UTC+2');
  assert.equal(offset('2026-12-01T12:00:00Z', 'Europe/Madrid'), 'UTC+1');
});

test('zoneName gives the official, capitalized name for the date and locale', () => {
  const winter = at('2026-12-01T12:00:00Z');
  const summer = at('2026-07-01T12:00:00Z');
  assert.equal(zoneName(winter, 'Asia/Hong_Kong', 'es'), 'Hora estándar de Hong Kong');
  assert.equal(zoneName(winter, 'Asia/Hong_Kong', 'en'), 'Hong Kong Standard Time');
  assert.equal(zoneName(winter, 'Europe/Madrid', 'es'), 'Hora estándar de Europa central');
  assert.equal(zoneName(summer, 'Europe/Madrid', 'es'), 'Hora de verano de Europa central');
  assert.equal(zoneName(summer, 'America/New_York', 'en'), 'Eastern Daylight Time');
});

test('dayDelta across the date line', () => {
  // Auckland 2026-01-16 09:00, Los Angeles 2026-01-15 12:00.
  const date = at('2026-01-15T20:00:00Z');
  assert.equal(dayDelta(date, 'Pacific/Auckland', 'America/Los_Angeles'), 1);
  assert.equal(dayDelta(date, 'America/Los_Angeles', 'Pacific/Auckland'), -1);
  assert.equal(offsetFrom(date, 'Pacific/Auckland', 'America/Los_Angeles'), 1260);
  // Auckland 2026-01-15 23:00, Los Angeles 2026-01-15 02:00.
  assert.equal(dayDelta(at('2026-01-15T10:00:00Z'), 'Pacific/Auckland', 'America/Los_Angeles'), 0);
  assert.equal(dayDelta(date, 'UTC', 'UTC'), 0);
});

test('cityName uses modern names for legacy ids', () => {
  assert.equal(cityName('America/New_York'), 'New York');
  assert.equal(cityName('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(cityName('America/Buenos_Aires'), 'Buenos Aires');
  assert.equal(cityName('Asia/Calcutta'), 'Kolkata');
  assert.equal(cityName('Europe/Kiev'), 'Kyiv');
  assert.equal(cityName('Asia/Saigon'), 'Ho Chi Minh');
  assert.equal(cityName('Asia/Katmandu'), 'Kathmandu');
  assert.equal(cityName('Asia/Rangoon'), 'Yangon');
  assert.equal(cityName('UTC'), 'UTC');
});

test('displayLabel prefers the custom label, then the city, then the local label', () => {
  assert.equal(displayLabel({ timeZone: 'Asia/Tokyo', label: '  Office ' }, 'Local'), 'Office');
  assert.equal(displayLabel({ timeZone: 'Asia/Tokyo', label: '   ' }, 'Local'), 'Tokyo');
  assert.equal(displayLabel({ timeZone: null, label: '' }, 'Local'), 'Local');
  assert.equal(displayLabel({ timeZone: null, label: 'Home' }, 'Local'), 'Home');
});

test('searchTimeZones matches cities, exonyms and accents in any case', () => {
  assert.deepEqual(searchTimeZones('tokio'), ['Asia/Tokyo']);
  assert.deepEqual(searchTimeZones('Nueva York'), ['America/New_York']);
  assert.deepEqual(searchTimeZones('sao'), ['America/Sao_Paulo', 'Africa/Sao_Tome']);
  assert.deepEqual(searchTimeZones('SÃO'), ['America/Sao_Paulo', 'Africa/Sao_Tome']);
  assert.deepEqual(searchTimeZones('buenos').map(cityName), ['Buenos Aires']);
  assert.deepEqual(searchTimeZones('londres'), ['Europe/London']);
  assert.deepEqual(searchTimeZones('utc'), ['UTC']);
});

test('searchTimeZones finds legacy ids by their modern name', () => {
  assert.deepEqual(searchTimeZones('kolkata').map(cityName), ['Kolkata']);
  assert.deepEqual(searchTimeZones('kyiv').map(cityName), ['Kyiv']);
});

test('searchTimeZones ranks city prefix, then word prefix, then substring', () => {
  const timeZones = ['Europe/Paris', 'America/New_York', 'Asia/Yerevan', 'Europe/Newcastle_Fake'];
  assert.deepEqual(searchTimeZones('new', { timeZones }), ['America/New_York', 'Europe/Newcastle_Fake']);
  assert.deepEqual(searchTimeZones('york', { timeZones }), ['America/New_York']);
  // "e": no city starts with it, "Europe" does, the rest only contain it.
  assert.deepEqual(searchTimeZones('e', { timeZones }),
    ['Europe/Newcastle_Fake', 'Europe/Paris', 'America/New_York', 'Asia/Yerevan']);
});

test('searchTimeZones limits, dedupes and ignores empty queries', () => {
  assert.deepEqual(searchTimeZones(''), []);
  assert.deepEqual(searchTimeZones('   '), []);
  assert.equal(searchTimeZones('a').length, 5);
  assert.equal(searchTimeZones('a', { limit: 12 }).length, 12);
  const timeZones = ['Asia/Calcutta', 'Asia/Kolkata', 'Asia/Calcutta'];
  assert.deepEqual(searchTimeZones('kolkata', { timeZones }), ['Asia/Calcutta']);
});

test('searchPlaces finds a city that shares a zone, under its own name', () => {
  assert.deepEqual(searchPlaces('miami'), [
    { timeZone: 'America/New_York', name: 'Miami', region: 'America', label: 'Miami' },
  ]);
  assert.equal(searchPlaces('Pekín')[0].timeZone, 'Asia/Shanghai');
  assert.equal(searchPlaces('bombay')[0].name, 'Bombay');
  assert.equal(searchPlaces('seattle')[0].timeZone, 'America/Los_Angeles');
  assert.equal(searchPlaces('houston')[0].timeZone, 'America/Chicago');
});

test('searchPlaces still finds time zones, without a label', () => {
  assert.deepEqual(searchPlaces('tokio'), [
    { timeZone: 'Asia/Tokyo', name: 'Tokyo', region: 'Asia', label: '' },
  ]);
  assert.equal(searchPlaces('utc')[0].region, '');
});

test('searchPlaces expands states and countries to their zones, main one first', () => {
  const zones = (q) => searchPlaces(q).filter((p) => p.region !== 'America').map((p) => p.timeZone);
  assert.deepEqual(zones('texas'), ['America/Chicago', 'America/Denver']);
  assert.deepEqual(zones('Tejas'), ['America/Chicago', 'America/Denver']);
  assert.deepEqual(zones('california'), ['America/Los_Angeles']);
  const us = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
  assert.deepEqual(zones('estados unidos'), us);
  assert.deepEqual(zones('EEUU'), us);
  assert.deepEqual(searchPlaces('texas')[0],
    { timeZone: 'America/Chicago', name: 'Chicago', region: 'Texas', label: '' });
});

test('searchPlaces drops mere substrings when something better matches', () => {
  const cities = searchPlaces('usa').map((p) => p.name);
  assert.ok(cities.includes('New York'));
  assert.ok(!cities.includes('Jerusalem'));
  // Only substrings: they stay.
  assert.deepEqual(searchPlaces('usak').map((p) => p.name), ['Lusaka']);
});

test('searchPlaces tells apart places with the same name', () => {
  const zones = searchPlaces('washington').map((p) => p.timeZone);
  assert.ok(zones.includes('America/New_York')); // the city
  assert.ok(zones.includes('America/Los_Angeles')); // the state
  const georgia = searchPlaces('georgia').map((p) => p.timeZone);
  assert.deepEqual(georgia.slice(0, 2).sort(), ['America/New_York', 'Asia/Tbilisi']);
});

test('searchPlaces does not repeat a place', () => {
  const places = searchPlaces('new york');
  assert.equal(places.filter((p) => p.timeZone === 'America/New_York' && p.name === 'New York').length, 1);
  assert.deepEqual(searchPlaces(''), []);
  assert.deepEqual(searchPlaces('   '), []);
});

test('placeKey treats legacy and modern ids alike, and names apart', () => {
  assert.equal(placeKey('Asia/Calcutta', 'Kolkata'), placeKey('Asia/Kolkata', 'Kolkata'));
  assert.notEqual(placeKey('America/New_York', 'Miami'), placeKey('America/New_York', 'New York'));
});

test('search data only uses valid zones, and areas fit the suggestion limit', () => {
  const ids = [...Object.keys(CITIES), ...AREAS.flatMap(([, zones]) => zones)];
  for (const timeZone of ids) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone }), timeZone);
  for (const [names, zones] of AREAS) assert.ok(zones.length <= 8, names[0]);
});

test('msUntilNextMinute stays within (0, 60000]', () => {
  assert.equal(msUntilNextMinute(at('2026-01-01T10:00:00.000Z')), 60000);
  assert.equal(msUntilNextMinute(at('2026-01-01T10:00:59.999Z')), 1);
  assert.equal(msUntilNextMinute(at('2026-01-01T10:00:30.000Z')), 30000);
  assert.equal(msUntilNextMinute(at('1969-12-31T23:59:30.000Z')), 30000);
});
