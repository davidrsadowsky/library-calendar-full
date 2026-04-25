'use strict';

/**
 * Kids Library Calendar
 * Fetches children's event schedules from 6 Westchester County libraries
 * and generates calendar.html — open it in any browser.
 *
 * Usage:
 *   node fetch_calendars.js
 *
 * To enable Mount Kisco (requires a one-time browser download):
 *   npm install playwright && npx playwright install chromium
 */

const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Library configuration
// ---------------------------------------------------------------------------

const LIBRARIES = {
  // --- Original 9 ---
  katonah:                { name: 'Katonah Village Library',                 color: '#3a86ff' },
  pound_ridge:            { name: 'Pound Ridge Library',                     color: '#06d6a0' },
  bedford_free:           { name: 'Bedford Free Library',                    color: '#fb5607' },
  bedford_hills:          { name: 'Bedford Hills Free Library',              color: '#8338ec' },
  north_castle:           { name: 'North Castle Library (Armonk)',           color: '#e07a5f' },
  mount_kisco:            { name: 'Mount Kisco Public Library',              color: '#f72585' },
  mount_pleasant:         { name: 'Mount Pleasant Library (Pleasantville)',  color: '#43aa8b' },
  chappaqua:              { name: 'Chappaqua Library',                       color: '#d4a017' },
  larchmont:              { name: 'Larchmont Public Library',                color: '#577590' },
  // --- New libraries ---
  ardsley:                { name: 'Ardsley Public Library',                  color: '#e63946' },
  briarcliff:             { name: 'Briarcliff Manor Public Library',         color: '#023e8a' },
  bronxville:             { name: 'Bronxville Public Library',               color: '#4a4e69' },
  croton:                 { name: 'Croton Free Library',                     color: '#f3722c' },
  dobbs_ferry:            { name: 'Dobbs Ferry Public Library',              color: '#f8961e' },
  eastchester:            { name: 'Eastchester Public Library',              color: '#f9c74f' },
  field_library:          { name: 'The Field Library (Peekskill)',           color: '#90be6d' },
  greenburgh:             { name: 'Greenburgh Public Library',               color: '#264653' },
  harrison_halperin:      { name: 'Harrison Library (Halperin)',             color: '#6a994e' },
  harrison_west:          { name: 'Harrison Library (West Harrison)',        color: '#5a7d4e' },
  hastings:               { name: 'Hastings Public Library',                 color: '#bc6c25' },
  hendrick_hudson:        { name: 'Hendrick Hudson Free Library',            color: '#7b2fff' },
  irvington:              { name: 'Irvington Public Library',                color: '#b5838d' },
  lewisboro:              { name: 'Lewisboro Library (South Salem)',         color: '#6d6875' },
  mamaroneck:             { name: 'Mamaroneck Public Library',              color: '#d62828' },
  mount_pleasant_valhalla:{ name: 'Mount Pleasant Library (Valhalla)',       color: '#48cae4' },
  mount_vernon:           { name: 'Mount Vernon Public Library',             color: '#0096c7' },
  new_rochelle_main:      { name: 'New Rochelle Library (Main)',             color: '#2b9348' },
  new_rochelle_huguenot:  { name: 'New Rochelle Library (Huguenot)',        color: '#80b918' },
  north_white_plains:     { name: 'North Castle Library (White Plains)',     color: '#4cc9f0' },
  ossining:               { name: 'Ossining Public Library',                 color: '#9d4edd' },
  pelham:                 { name: 'Town of Pelham Public Library',           color: '#ffbe0b' },
  port_chester:           { name: 'Port Chester-Rye Brook Library',          color: '#52b788' },
  ruth_keeler:            { name: 'Ruth Keeler Memorial Library',            color: '#7209b7' },
  rye:                    { name: 'Rye Free Reading Room',                   color: '#3a0ca3' },
  scarsdale:              { name: 'Scarsdale Public Library',                color: '#4361ee' },
  tuckahoe:               { name: 'Tuckahoe Public Library',                 color: '#f77f00' },
  warner:                 { name: 'Warner Library (Tarrytown)',              color: '#e76f51' },
  white_plains:           { name: 'White Plains Public Library',             color: '#3d405b' },
  yorktown:               { name: 'John C. Hart Library (Yorktown)',         color: '#c9184a' },
  yonkers_riverfront:     { name: 'Yonkers Library (Riverfront)',           color: '#ff6b6b' },
  yonkers_will:           { name: 'Yonkers Library (Will)',                  color: '#ffd166' },
  yonkers_crestwood:      { name: 'Yonkers Library (Crestwood)',            color: '#02c39a' },
};

const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // replace with your GA4 Measurement ID

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0.0.0 Safari/537.36',
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTH_MAP = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = [
  'Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday',
];

/**
 * Normalize a time range string to consistent format: "10:30am – 11:00am"
 * Handles mixed capitalisation ("AM"/"am"), optional spaces before AM/PM,
 * and various separators (-, –, —).
 */
function normalizeTimeStr(timeStr) {
  if (!timeStr) return '';
  return timeStr
    .replace(/(\d{1,2}:\d{2})\s*([ap]m)\b/gi, (_, t, ampm) => t + ampm.toLowerCase())
    .replace(/\s*[-–—]+\s*/g, ' – ')
    .trim();
}

/** Convert the start time of a normalised time string to minutes since midnight for sorting. */
function parseStartMinutes(timeStr) {
  if (!timeStr) return 9999;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (!m) return 9999;
  let hour = parseInt(m[1]);
  const min  = parseInt(m[2]);
  const ampm = m[3].toLowerCase();
  if (ampm === 'am' && hour === 12) hour = 0;
  if (ampm === 'pm' && hour !== 12) hour += 12;
  return hour * 60 + min;
}

/** Parse "April 25, 2026" or "Friday, April 25, 2026" → Date (local midnight). */
function parseDateStr(str) {
  const m = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTH_MAP[m[1].toLowerCase()];
  if (!month) return null;
  return new Date(parseInt(m[3]), month - 1, parseInt(m[2]));
}

/** Date → "YYYY-MM-DD" string for comparison/dedup. */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Today at local midnight. */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Next n month starts as [year, month] arrays. */
function getMonths(n = 3) {
  const result = [];
  let d = new Date(today().getFullYear(), today().getMonth(), 1);
  for (let i = 0; i < n; i++) {
    result.push([d.getFullYear(), d.getMonth() + 1]);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return result;
}

/** Format a Date for display in the HTML. */
function formatDate(d) {
  const isToday    = dateKey(d) === dateKey(today());
  const isTomorrow = dateKey(d) === dateKey(new Date(today().getFullYear(), today().getMonth(), today().getDate() + 1));
  const base = `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  if (isToday)    return `Today — ${base}`;
  if (isTomorrow) return `Tomorrow — ${base}`;
  return base;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.log(`    [warn] ${url}\n           ${e.message}`);
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Scrapers
// ---------------------------------------------------------------------------

// --- 1. librarycalendar.com / Drupal library_calendar (Katonah, Pound Ridge, Bedford Hills)

const LC_BASES = {
  katonah:                 'https://katonah.librarycalendar.com',
  pound_ridge:             'https://poundridge.librarycalendar.com',
  bedford_hills:           'https://www.bedfordhillsfreelibrary.org',
  mount_pleasant:          'https://mountpleasant.librarycalendar.com',
  mount_pleasant_valhalla: 'https://mountpleasant.librarycalendar.com',
  chappaqua:               'https://www.chappaqualibrary.org',
  larchmont:               'https://larchmont.librarycalendar.com',
  bronxville:              'https://bronxvillepl.librarycalendar.com',
  hendrick_hudson:         'https://hendrickhudson.librarycalendar.com',
  ossining:                'https://ossining.librarycalendar.com',
  warner:                  'https://warnerlib.librarycalendar.com',
  yorktown:                'https://yorktown.librarycalendar.com',
  croton:                  'https://www.crotonfreelibrary.org',
  scarsdale:               'https://www.scarsdalelibrary.org',
  new_rochelle_main:       'https://newrochelle.librarycalendar.com',
  new_rochelle_huguenot:   'https://newrochelle.librarycalendar.com',
  yonkers_riverfront:      'https://www.ypl.org',
  yonkers_will:            'https://www.ypl.org',
  yonkers_crestwood:       'https://www.ypl.org',
};

function parseLcCalendar(html, libraryKey, options = {}) {
  // Shared parser for the Drupal library_calendar module (list/upcoming view).
  // Date lives in aria-label: '... on Friday, April 25, 2026 @ 10:00am'
  // options.branchFilter: if set, skip events whose branch text doesn't include this string
  const events = [];
  if (!html) return events;

  const $      = cheerio.load(html);
  const cutoff = today();

  $('article.event-card, article.lc-event').each((_, el) => {
    const $el  = $(el);
    const link = $el.find('a[aria-label]').first();
    if (!link.length) return;

    const aria      = link.attr('aria-label') || '';
    const dateMatch = aria.match(/on ([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/);
    if (!dateMatch) return;

    const eventDate = parseDateStr(dateMatch[1]);
    if (!eventDate || eventDate < cutoff) return;

    // Branch filter: skip events not at the requested branch (e.g. Pleasantville only)
    if (options.branchFilter) {
      const branchText = $el.find('.lc-event__branch').text();
      if (!branchText.includes(options.branchFilter)) return;
    }

    // Extract the quoted event name from the aria-label when available
    const titleMatch = aria.match(/[“”](.+?)[“”]/);
    const title = titleMatch ? titleMatch[1] : link.text().trim();
    if (!title) return;

    let href = link.attr('href') || '';
    if (href.startsWith('/')) href = (LC_BASES[libraryKey] || '') + href;

    // Primary: dedicated time element. Fallback: full date+time string like
    // “Thursday, April 23, 2026 at 10:30am - 11:00am” — extract the part after “at”.
    let timeStr = $el.find('.lc-event-info-item--time').first().text().trim();
    if (!timeStr) {
      const dtText = $el.find('.lc-list-event-info-item--date, .lc-list-event-info-item--time')
        .first().text().trim();
      const atMatch = dtText.match(/\bat\s+(.+)$/i);
      if (atMatch) timeStr = atMatch[1].trim();
    }
    timeStr = timeStr.replace(/\s+/g, ' ');

    events.push({ date: eventDate, time: timeStr, title, url: href, library: libraryKey, category: options.category || 'kids' });
  });

  return events;
}

// Fetch the list/upcoming view, paginating up to maxPages pages.
// Stops early when a page yields no events within the 3-month window.
async function scrapeLcListView(baseUrl, libraryKey, options = {}, maxPages = 3) {
  const cutoffDate = new Date(today().getFullYear(), today().getMonth() + 3, 1);
  const allEvents  = [];

  for (let page = 0; page < maxPages; page++) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${sep}page=${page}`;
    const html = await fetchHtml(url);
    if (!html) break;

    const batch = parseLcCalendar(html, libraryKey, options);
    allEvents.push(...batch);

    if (batch.length === 0) break;
    if (batch.every(e => e.date >= cutoffDate)) break;
    await sleep(400);
  }

  return allEvents;
}

async function scrapeKatonah() {
  const base = 'https://katonah.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[160]=160&age_groups[1]=1&age_groups[161]=161&age_groups[2]=2', 'katonah', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[4]=4', 'katonah', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapePoundRidge() {
  const base = 'https://poundridge.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[1]=1&age_groups[90]=90&age_groups[2]=2&age_groups[91]=91', 'pound_ridge', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[93]=93', 'pound_ridge', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeBedfordHills() {
  const base = 'https://www.bedfordhillsfreelibrary.org/events/upcoming';
  // tid-6=Adults & Seniors, tid-4=Teens
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[3]=3&age_groups[97]=97&age_groups[105]=105', 'bedford_hills', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[6]=6&age_groups[4]=4', 'bedford_hills', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeMountPleasant() {
  const base = 'https://mountpleasant.librarycalendar.com/events/list';
  // tid-2=Children (Main), tid-4=Adults (Main); branchFilter keeps only Pleasantville
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[2]=2', 'mount_pleasant', { category: 'kids', branchFilter: 'Main Library' }),
    scrapeLcListView(base + '?age_groups[4]=4', 'mount_pleasant', { category: 'adult', branchFilter: 'Main Library' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeChappaqua() {
  const base = 'https://www.chappaqualibrary.org/events/list';
  // tid-30=Kids, tid-32=Adults
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[30]=30', 'chappaqua', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[32]=32', 'chappaqua', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeLarchmont() {
  const base = 'https://larchmont.librarycalendar.com/events/list';
  // kids: tid-75,74,98,102,141,142; adults: tid-77
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[75]=75&age_groups[74]=74&age_groups[98]=98&age_groups[102]=102&age_groups[141]=141&age_groups[142]=142', 'larchmont', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[77]=77', 'larchmont', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}


// --- new librarycalendar.com sites

async function scrapeMountPleasantValhalla() {
  const base = 'https://mountpleasant.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[84]=84', 'mount_pleasant_valhalla', { category: 'kids', branchFilter: 'Branch Library' }),
    scrapeLcListView(base + '?age_groups[157]=157', 'mount_pleasant_valhalla', { category: 'adult', branchFilter: 'Branch Library' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeBronxville() {
  const base = 'https://bronxvillepl.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[213]=213&age_groups[148]=148&age_groups[153]=153&age_groups[195]=195', 'bronxville', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[4]=4&age_groups[152]=152&age_groups[196]=196', 'bronxville', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeHendrickHudson() {
  const base = 'https://hendrickhudson.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[1]=1&age_groups[2]=2', 'hendrick_hudson', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[3]=3&age_groups[4]=4', 'hendrick_hudson', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeOssining() {
  const base = 'https://ossining.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[75]=75&age_groups[76]=76', 'ossining', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[77]=77&age_groups[78]=78', 'ossining', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeWarner() {
  const base = 'https://warnerlib.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[1]=1&age_groups[2]=2&age_groups[145]=145&age_groups[146]=146&age_groups[94]=94&age_groups[5]=5', 'warner', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[3]=3&age_groups[4]=4&age_groups[107]=107&age_groups[108]=108', 'warner', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeYorktown() {
  const base = 'https://yorktown.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[2]=2', 'yorktown', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[3]=3&age_groups[4]=4', 'yorktown', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeCroton() {
  const base = 'https://www.crotonfreelibrary.org/events/upcoming';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[34]=34&age_groups[93]=93&age_groups[94]=94&age_groups[95]=95', 'croton', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[35]=35&age_groups[36]=36&age_groups[97]=97', 'croton', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeScarsdale() {
  const base = 'https://www.scarsdalelibrary.org/events/upcoming';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[556]=556', 'scarsdale', { category: 'kids' }),
    scrapeLcListView(base + '?age_groups[22]=22&age_groups[23]=23&age_groups[96]=96', 'scarsdale', { category: 'adult' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeNewRochelleMain() {
  const base = 'https://newrochelle.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[37]=37&age_groups[38]=38&age_groups[177]=177', 'new_rochelle_main', { category: 'kids', branchFilter: 'Main Library' }),
    scrapeLcListView(base + '?age_groups[39]=39&age_groups[40]=40&age_groups[41]=41', 'new_rochelle_main', { category: 'adult', branchFilter: 'Main Library' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeNewRochelleHuguenot() {
  const base = 'https://newrochelle.librarycalendar.com/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[37]=37&age_groups[38]=38&age_groups[177]=177', 'new_rochelle_huguenot', { category: 'kids', branchFilter: 'Huguenot' }),
    scrapeLcListView(base + '?age_groups[39]=39&age_groups[40]=40&age_groups[41]=41', 'new_rochelle_huguenot', { category: 'adult', branchFilter: 'Huguenot' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeYonkersRiverfront() {
  const base = 'https://www.ypl.org/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[178]=178&age_groups[179]=179', 'yonkers_riverfront', { category: 'kids', branchFilter: 'Riverfront' }),
    scrapeLcListView(base + '?age_groups[4]=4&age_groups[5]=5&age_groups[183]=183&age_groups[6]=6', 'yonkers_riverfront', { category: 'adult', branchFilter: 'Riverfront' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeYonkersWill() {
  const base = 'https://www.ypl.org/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[178]=178&age_groups[179]=179', 'yonkers_will', { category: 'kids', branchFilter: 'Will Library' }),
    scrapeLcListView(base + '?age_groups[4]=4&age_groups[5]=5&age_groups[183]=183&age_groups[6]=6', 'yonkers_will', { category: 'adult', branchFilter: 'Will Library' }),
  ]);
  return [...kids, ...adults];
}

async function scrapeYonkersCrestwood() {
  const base = 'https://www.ypl.org/events/list';
  const [kids, adults] = await Promise.all([
    scrapeLcListView(base + '?age_groups[178]=178&age_groups[179]=179', 'yonkers_crestwood', { category: 'kids', branchFilter: 'Crestwood' }),
    scrapeLcListView(base + '?age_groups[4]=4&age_groups[5]=5&age_groups[183]=183&age_groups[6]=6', 'yonkers_crestwood', { category: 'adult', branchFilter: 'Crestwood' }),
  ]);
  return [...kids, ...adults];
}


// --- 2. Bedford Free Library (WordPress + Events Manager plugin)

async function fetchBedfordFreePage(urlPath, year, month, category) {
  const url  = `https://bedfordfreelibrary.org${urlPath}?mo=${month}&yr=${year}`;
  const html = await fetchHtml(url);
  const events = [];
  if (!html) return events;

  const $      = cheerio.load(html);
  const cutoff = today();

  $('div.event-list-post, li.em-event, article.em-event').each((_, el) => {
    const $el = $(el);

    const titleEl = $el.find('h2 > a, .em-event-name a, h3 > a').first();
    const dateEl  = $el.find('h4.la-date, .em-event-date, .em-date').first();
    const timeEl  = $el.find('h4.le-temps, .em-event-time, .em-time').first();

    if (!titleEl.length) return;

    const title   = titleEl.text().trim();
    const href    = titleEl.attr('href') || '';
    const rawDate = dateEl.text().trim();
    const timeStr = timeEl.text().trim().replace(/\s+/g, ' ');

    if (!rawDate || !title) return;

    const eventDate = parseDateStr(`${rawDate}, ${year}`);
    if (!eventDate || eventDate < cutoff) return;

    events.push({ date: eventDate, time: timeStr, title, url: href, library: 'bedford_free', category });
  });

  return events;
}

async function scrapeBedfordFree(year, month) {
  const [kids, adults] = await Promise.all([
    fetchBedfordFreePage('/children/programs/', year, month, 'kids'),
    fetchBedfordFreePage('/adults/programs/', year, month, 'adult'),
  ]);
  return [...kids, ...adults];
}


// --- 3. MH Software connectDaily (North Castle Armonk + North White Plains)

async function scrapeMhSoftware(calendarId, libraryKey, year, month, typeMap = { kids: ['9', '22'], adult: ['7', '18'] }) {
  const url =
    `https://ncpl.mhsoftware.com/ViewNonBannerMonth.html` +
    `?calendar_id=${calendarId}&year=${year}&month=${month}`;
  const html = await fetchHtml(url);
  const events = [];
  if (!html) return events;

  const $      = cheerio.load(html);
  const cutoff = today();

  $('td').each((_, td) => {
    const $td = $(td);

    // Find the day number. connectDaily puts it in .MHVCDayNumber or a prominent text node.
    let dayNum = null;

    const dayEl = $td.find('.MHVCDayNumber, [class*="DayNumber"], [class*="dayNum"]').first();
    if (dayEl.length) {
      const n = parseInt(dayEl.text().trim(), 10);
      if (n >= 1 && n <= 31) dayNum = n;
    }

    if (dayNum === null) {
      // Fall back: look for a direct child whose sole text is a number 1-31
      $td.children().each((_, child) => {
        if (dayNum !== null) return;
        const text = $(child).clone().children().remove().end().text().trim();
        if (/^\d{1,2}$/.test(text)) {
          const n = parseInt(text, 10);
          if (n >= 1 && n <= 31) dayNum = n;
        }
      });
    }

    if (dayNum === null) return;

    let eventDate;
    try {
      eventDate = new Date(year, month - 1, dayNum);
      if (eventDate.getDate() !== dayNum) return; // invalid date (e.g. Feb 30)
    } catch (_) { return; }

    if (eventDate < cutoff) return;

    // item_type_id mapped per-calendar via typeMap argument
    $td.find('a.MHVCItemLink').each((_, a) => {
      const $a     = $(a);
      const typeId = $a.attr('data-item_type_id') || '';
      let category;
      if (typeMap.kids.includes(typeId))        category = 'kids';
      else if (typeMap.adult.includes(typeId))  category = 'adult';
      else return;

      const title   = $a.text().trim();
      const timeStr = ($a.attr('title') || '').trim();
      if (!title) return;

      const href      = $a.attr('href') || '';
      const popMatch  = href.match(/popItem\((\d+),(\d+)\)/);
      const eventUrl  = popMatch
        ? `https://ncpl.mhsoftware.com/ViewItem.html?integral=0&cal_item_id=${popMatch[1]}&dtwhen=${popMatch[2]}`
        : '';

      events.push({ date: eventDate, time: timeStr, title, url: eventUrl, library: libraryKey, category });
    });
  });

  return events;
}

async function scrapeNorthCastle(year, month) {
  return scrapeMhSoftware(2, 'north_castle', year, month);
}

async function scrapeNorthWhitePlains(year, month) {
  // White Plains branch uses different item_type_ids than Armonk
  // 13=Children, 15=Adult, 21/22/25=General programs (adult)
  return scrapeMhSoftware(5, 'north_white_plains', year, month, { kids: ['13'], adult: ['15', '21', '22', '25'] });
}


// --- 4. Mount Kisco (CalendarWiz via Playwright)

async function scrapeMountKisco(year, month) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (_) {
    return { events: [], playwrightMissing: true };
  }

  const url =
    `https://www.calendarwiz.com/calendars/calendar.php` +
    `?crd=mountkiscopubliclibrary&op=cal&month=${month}&year=${year}`;
  const events  = [];
  const cutoff  = today();
  const eventRe = /^\s*(\d{1,2}:\d{2}[ap]m)\s*-\s*(\d{1,2}:\d{2}[ap]m)\s+(.+)/i;

  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page    = await browser.newPage();
    await page.goto(url, { timeout: 30_000 });
    await page.waitForTimeout(2_000);

    // Build a map of category CSS classes → 'kids' or 'adult'
    const catClasses = await page.evaluate(() => {
      const select = document.querySelector('#catsellist');
      const result = { kids: ['cat97858'], adult: ['cat97859', 'cat98089'] }; // fallbacks
      if (!select) return result;
      result.kids = []; result.adult = [];
      for (const opt of select.options) {
        const t = opt.text.toLowerCase();
        if (t.includes('kids') || t.includes('family')) result.kids.push(`cat${opt.value}`);
        else if (t.includes('adult') || t.includes('teen')) result.adult.push(`cat${opt.value}`);
      }
      return result;
    });

    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    function parseMkEvents($td, catClassList, category, eventDate) {
      catClassList.forEach(cls => {
        $td.find(`a.${cls}`).each((_, a) => {
          const text  = $(a).text().trim();
          const match = text.match(eventRe);
          if (!match) return;

          let title = match[3].replace(/\s*@\s*.+$/, '').trim();
          if (!title) return;

          const onclick  = $(a).attr('onclick') || '';
          const idMatch  = onclick.match(/epopup\('(\d+)'\)/);
          const eventUrl = idMatch
            ? `https://www.calendarwiz.com/calendars/popup.php?op=view&id=${idMatch[1]}&crd=mountkiscopubliclibrary`
            : '';

          events.push({ date: eventDate, time: `${match[1]} – ${match[2]}`, title, url: eventUrl, library: 'mount_kisco', category });
        });
      });
    }

    // CalendarWiz day cells have id="day_YYYYMMDD"
    $('td[id^="day_"]').each((_, td) => {
      const $td     = $(td);
      const dayId   = $td.attr('id') || '';
      const dateStr = dayId.replace('day_', '');
      if (dateStr.length !== 8) return;

      const eventDate = new Date(
        parseInt(dateStr.slice(0, 4)),
        parseInt(dateStr.slice(4, 6)) - 1,
        parseInt(dateStr.slice(6, 8))
      );
      if (isNaN(eventDate.getTime()) || eventDate < cutoff) return;

      parseMkEvents($td, catClasses.kids, 'kids', eventDate);
      parseMkEvents($td, catClasses.adult, 'adult', eventDate);
    });

  } catch (e) {
    console.log(`    [error] Mount Kisco: ${e.message}`);
  }

  return { events, playwrightMissing: false };
}


// ---------------------------------------------------------------------------
// --- 5. LibCal / Springshare (JSON AJAX endpoint — no browser needed)
//
// Each LibCal site exposes a public AJAX list endpoint:
//   /ajax/calendar/list?c=CAL_ID&date=0000-00-00&perpage=100&page=N
// Returns JSON with total_results, results[], each with ymd, start, end,
// title, url, audiences[], categories.

async function scrapeLibCalAjax(subdomain, calId, libraryKey) {
  const cutoff  = today();
  const events  = [];
  const headers = { ...FETCH_HEADERS, 'X-Requested-With': 'XMLHttpRequest' };

  let page = 1;
  while (true) {
    const url = `https://${subdomain}.libcal.com/ajax/calendar/list?c=${calId}&date=0000-00-00&perpage=100&page=${page}`;
    let j;
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) break;
      j = await r.json();
    } catch (e) {
      console.log(`    [warn] LibCal ${libraryKey} page ${page}: ${e.message}`);
      break;
    }
    if (!j.results?.length) break;

    for (const e of j.results) {
      const ymd = String(e.ymd || '');
      if (ymd.length !== 8) continue;
      const eventDate = new Date(
        parseInt(ymd.slice(0, 4)),
        parseInt(ymd.slice(4, 6)) - 1,
        parseInt(ymd.slice(6, 8))
      );
      if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;

      const audNames = (e.audiences || []).map(a => a.name.toLowerCase());
      const catStr   = (e.categories || '').toLowerCase();
      let category   = 'both';
      if (audNames.length) {
        const hasKids  = audNames.some(a => /child|kid|family|baby|toddler|preschool/.test(a));
        const hasAdult = audNames.some(a => /adult|senior|teen|tween/.test(a));
        if (hasKids && !hasAdult)  category = 'kids';
        else if (!hasKids && hasAdult) category = 'adult';
        else category = 'both';
      } else if (catStr) {
        if (/child|kid|family|baby|toddler|preschool|school.age/.test(catStr)) category = 'kids';
        else if (/adult|senior|teen|tween|book.club|film/.test(catStr))         category = 'adult';
      }

      const timeStr = e.start && e.end ? `${e.start} – ${e.end}` : (e.start || '');
      const title   = (e.title || '').trim();
      if (!title) continue;

      events.push({ date: eventDate, time: timeStr, title, url: e.url || '', library: libraryKey, category });
    }

    const totalPages = Math.ceil((j.total_results || 0) / 100);
    if (page >= totalPages) break;
    page++;
    await sleep(300);
  }

  return events;
}

async function scrapeEastchester() { return scrapeLibCalAjax('eastchesterlibrary', 19731, 'eastchester'); }
async function scrapeGreenburgh()  { return scrapeLibCalAjax('greenburghlibrary',  7925,  'greenburgh'); }
async function scrapeIrvington()   { return scrapeLibCalAjax('irvingtonlibrary',   19269, 'irvington'); }
async function scrapeTuckahoe()    { return scrapeLibCalAjax('tuckahoelibrary',    7699,  'tuckahoe'); }
async function scrapeRye()         { return scrapeLibCalAjax('ryelibrary',         17843, 'rye'); }


// --- 6. Tribe Events / The Events Calendar (WordPress)

async function scrapeTribeEvents(baseUrl, libraryKey, kidsSlugs, adultSlugs) {
  const cutoff  = today();

  async function fetchTribePage(url, category, depth = 0) {
    if (depth >= 3) return [];
    const html = await fetchHtml(url);
    if (!html) return [];
    const $      = cheerio.load(html);
    const events = [];

    // Support both legacy and modern Tribe Events markup
    const sel = 'article.tribe-events-calendar-list__event, article[class*="tribe_events"], article[class*="tribe-event"]';
    $(sel).each((_, el) => {
      const $el     = $(el);
      const titleEl = $el.find('[class*=event-title] a, h2 a, h3 a, .tribe-event-url, .tribe-events-list-event-title a').first();
      const title   = titleEl.text().trim();
      const href    = titleEl.attr('href') || '';
      if (!title) return;

      // Prefer time[datetime] (modern markup), fall back to text parsing
      const timeEl   = $el.find('time[datetime]').first();
      const datetime = timeEl.attr('datetime') || '';
      let eventDate  = datetime ? new Date(datetime.slice(0, 10) + 'T00:00:00') : null;
      if (!eventDate || isNaN(eventDate.getTime())) {
        const dateText = $el.find('.tribe-events-schedule, .tribe-events-start-datetime, .tribe-event-date-start').first().text().trim();
        eventDate = parseDateStr(dateText);
      }
      if (!eventDate || isNaN(eventDate.getTime()) || eventDate < cutoff) return;

      let timeStr = $el.find('.tribe-events-schedule, .tribe-events-divider, .tribe-event-date-start').first().text().trim().replace(/\s+/g, ' ');
      // Strip date prefix: "April 28 @ 3:45 pm - 4:45 pm" → "3:45 pm - 4:45 pm"
      if (timeStr.includes('@')) timeStr = timeStr.split('@').slice(1).join('@').trim();

      events.push({ date: new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()), time: timeStr, title, url: href, library: libraryKey, category });
    });

    const nextUrl = $('a.tribe-events-nav-next, .tribe-events-c-nav__next').attr('href');
    if (nextUrl && events.length > 0) {
      const nextEvs = await fetchTribePage(nextUrl, category, depth + 1);
      events.push(...nextEvs);
    }
    return events;
  }

  const batches = await Promise.all([
    ...kidsSlugs.map(s => fetchTribePage(baseUrl + s, 'kids')),
    ...adultSlugs.map(s => fetchTribePage(baseUrl + s, 'adult')),
  ]);
  return batches.flat();
}

async function scrapeMamaroneck() {
  return scrapeTribeEvents('https://www.mamaronecklibrary.org', 'mamaroneck',
    ['/events/category/children/list'],
    ['/events/category/adult/list']);
}

async function scrapeLewisboro() {
  const cutoff   = today();
  const events   = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  function fmt12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
  }

  for (const [catSlug, category] of [['child', 'kids'], ['adult', 'adult']]) {
    try {
      let page = 1;
      while (true) {
        const url = `https://lewisborolibrary.org/wp-json/tribe/events/v1/events?categories=${catSlug}&per_page=50&start_date=${todayStr}&page=${page}`;
        const r   = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) break;
        const j = await r.json();
        if (!j.events?.length) break;

        for (const e of j.events) {
          const eventDate = new Date(e.start_date.slice(0, 10) + 'T00:00:00');
          if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;
          const timeStr = e.start_date.slice(11, 16)
            ? fmt12(e.start_date.slice(11, 16)) + (e.end_date ? ' – ' + fmt12(e.end_date.slice(11, 16)) : '')
            : '';
          const title = e.title.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c));
          events.push({ date: eventDate, time: timeStr, title, url: e.url || '', library: 'lewisboro', category });
        }
        if (page >= (j.total_pages || 1)) break;
        page++;
        await sleep(300);
      }
    } catch (e) {
      console.log(`    [error] Lewisboro (${catSlug}): ${e.message}`);
    }
  }
  return events;
}

async function scrapeBriarcliff() {
  // Uses Tribe Events REST API (calendar page is JS-rendered, no static event articles)
  const cutoff   = today();
  const events   = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  function fmt12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
  }

  try {
    let page = 1;
    while (true) {
      const url = `https://briarcliffmanorlibrary.org/wp-json/tribe/events/v1/events?per_page=50&start_date=${todayStr}&page=${page}`;
      const r   = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) break;
      const j = await r.json();
      if (!j.events?.length) break;

      for (const e of j.events) {
        const cats = (e.categories || []).map(c => c.name.toLowerCase());
        if (cats.some(c => c.includes('board'))) continue;
        let category = 'both';
        if (cats.some(c => /child|famil|kid/.test(c))) category = 'kids';
        else if (cats.some(c => /adult|teen|senior/.test(c))) category = 'adult';

        const eventDate = new Date(e.start_date.slice(0, 10) + 'T00:00:00');
        if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;

        const timeStr = e.start_date.slice(11, 16)
          ? fmt12(e.start_date.slice(11, 16)) + (e.end_date ? ' – ' + fmt12(e.end_date.slice(11, 16)) : '')
          : '';
        const title = e.title.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c));
        events.push({ date: eventDate, time: timeStr, title, url: e.url || '', library: 'briarcliff', category });
      }
      if (page >= (j.total_pages || 1)) break;
      page++;
      await sleep(300);
    }
  } catch (e) {
    console.log(`    [error] Briarcliff: ${e.message}`);
  }
  return events;
}

async function scrapeDobbsFerry() {
  // Events Manager plugin — pages use .em-item with img[alt] for title and "Month DD" date format
  const cutoff = today();
  const events = [];
  const yr     = new Date().getFullYear();

  function parseDFDate(raw) {
    const text = raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    // "March 30" — try current year then next year
    for (const y of [yr, yr + 1]) {
      const d = parseDateStr(text + ', ' + y);
      if (d && d >= cutoff) return d;
    }
    return null;
  }

  // Kids page + general calendar (deduplicated by generateHtml)
  const pages = [
    ['https://dobbsferrylibrary.org/youth-services/calendar-for-young-people/', null],
    ['https://dobbsferrylibrary.org/programs-2/calendar/', null],
  ];

  for (const [url] of pages) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('.em-event, .em-item').each((_, el) => {
      const $el  = $(el);
      const title = $el.find('.em-item-image img').first().attr('alt') || '';
      if (!title || title.length < 3) return;

      const href    = $el.find('a.em-item-read-more, a[href*="/events/"]').last().attr('href') || '';
      const dateRaw = $el.find('.em-event-date, .em-event-meta-datetime').first().text();
      const eventDate = parseDFDate(dateRaw);
      if (!eventDate) return;

      const timeStr = $el.find('.em-event-time').first().text().replace(/\s+/g, ' ').trim();

      const catText = $el.find('.em-event-categories a').map((_, a) => $(a).text().toLowerCase()).get().join(' ');
      let category = 'both';
      if (/child|kid|preschool|family|baby|elementary|toddler|school age|youth/.test(catText)) category = 'kids';
      else if (/^adult|adult$|senior|teen|tween|book group|film/.test(catText)) category = 'adult';
      else if (catText.includes('all ages')) category = 'both';

      events.push({ date: eventDate, time: timeStr, title, url: href, library: 'dobbs_ferry', category });
    });
    await sleep(400);
  }
  return events;
}


// --- 7. White Plains (Communico JSON API — plain fetch, no browser)

async function scrapeWhitePlains() {
  const cutoff  = today();
  const events  = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const base    = 'https://calendar.whiteplainslibrary.org/eeventcaldata?event_type=0&req=';

  for (const [ageGroup, category] of [['Children', 'kids'], ['Adults', 'adult']]) {
    const req = JSON.stringify({ private: false, date: todayStr, days: 90, locations: [], ages: [ageGroup], types: [] });
    const url = base + encodeURIComponent(req);
    let evts;
    try {
      const r = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      evts = await r.json();
    } catch (e) {
      console.log(`    [warn] White Plains ${category}: ${e.message}`);
      continue;
    }

    for (const e of evts) {
      const rawStart = e.raw_start_time || '';         // "2026-04-24 11:00:00"
      const datePart = rawStart.slice(0, 10);
      if (!datePart.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
      const eventDate = new Date(datePart + 'T00:00:00');
      if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;

      const title   = (e.title || '').trim();
      if (!title) continue;
      const timeStr = e.start_time && e.end_time ? `${e.start_time} – ${e.end_time}` : (e.start_time || '');
      const href    = (e.url || '').replace(/([^:])\/\//g, '$1/');

      events.push({ date: eventDate, time: timeStr, title, url: href, library: 'white_plains', category });
    }
    await sleep(400);
  }
  return events;
}


// --- 8. Ardsley (Weebly — separate pages per audience)
// Dates appear in <strong> tags as: "Month DDth at H:MM AM: Event Title" (no year)

// Two patterns in <strong> tags (no year, ordinal days):
//   Pattern 1: "Month DDth at H:MM AM: Event Title" — all in one strong
//   Pattern 2: "Month DDth at H:MM AM" in strong 1, title in next strong sibling
// Date ranges like "March 23 through May 11" have no "at H:MM" → skipped.

const ARDSLEY_DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
const ARDSLEY_AT_TIME_RE = /\bat\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\s*:?\s*/i;

function parseArdsleyDate(text) {
  const m = text.match(ARDSLEY_DATE_RE);
  if (!m) return null;
  const yr = new Date().getFullYear();
  for (const y of [yr, yr + 1]) {
    const d = parseDateStr(`${m[1]} ${parseInt(m[2])}, ${y}`);
    if (d && d >= today()) return d;
  }
  return null;
}

async function scrapeArdsley() {
  const pages = [
    ['https://www.ardsleypubliclibrary.org/adults.html',          'adult'],
    ['https://www.ardsleypubliclibrary.org/teen-scene.html',      'adult'],
    ['https://www.ardsleypubliclibrary.org/preschool-place.html', 'kids'],
    ['https://www.ardsleypubliclibrary.org/school-age-kids.html', 'kids'],
  ];
  const events = [];

  for (const [url, category] of pages) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    $('nav, header, footer, script, style').remove();

    $('div.paragraph, p').each((_, el) => {
      $(el).find('strong, b').each((__, strong) => {
        const text = $(strong).text().replace(/\u200b|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 5) return;

        // Must have date AND time pattern — skips date-range notes like 'March 23 through May 11'
        const eventDate = parseArdsleyDate(text);
        if (!eventDate) return;
        const timeMatch = text.match(ARDSLEY_AT_TIME_RE);
        if (!timeMatch) return;
        const timeStr = timeMatch[1].trim();

        // Pattern 1: 'at H:MM AM: Title' all in one strong
        const afterTimeColon = text.match(/\bat\s+\d{1,2}(?::\d{2})?\s*[ap]m\s*:\s*(.+)/i);
        let title = afterTimeColon ? afterTimeColon[1].trim() : '';

        // Pattern 2: no colon after time — title is in the next strong sibling
        if (!title || title.length < 4) {
          const nextStrong = $(strong).nextAll('strong, b').first();
          title = nextStrong.text().replace(/\u200b|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        }

        if (!title || title.length < 4) return;
        if (/^click here/i.test(title)) return;

        events.push({ date: eventDate, time: timeStr, title, url, library: 'ardsley', category });
      });
    });
    await sleep(300);
  }

  // Deduplicate
  const seen = new Set();
  return events.filter(e => {
    const k = `${e.title}|${dateKey(e.date)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


// --- 9. Harrison Public Library (custom LibCal proxy API)
// Returns JSONP-wrapped JSON for a date range; branches filtered by category name

async function scrapeHarrisonBranch(branchCategory, libraryKey) {
  const cutoff  = today();
  const events  = [];
  const start   = new Date().toISOString().slice(0, 10) + 'T00:00:00-04:00';
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T00:00:00-04:00';
  const url     = `https://www.harrisonpl.org/asdk_asdiou/wp-content/themes/hpl-2016/api/v3/libcal/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(endDate)}`;

  let data;
  try {
    const r = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return events;
    const text = await r.text();
    const json = text.replace(/^\)\]\}',?\s*/, '');
    data = JSON.parse(json);
  } catch (e) {
    console.log(`    [error] Harrison ${libraryKey}: ${e.message}`);
    return events;
  }

  for (const e of (data.data || [])) {
    const cats = (e.extendedProps?.categories || []).map(c => c.name.trim().toUpperCase());
    if (!cats.includes(branchCategory)) continue;

    const eventDate = new Date(e.start.slice(0, 10) + 'T00:00:00');
    if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;

    const auds = (e.extendedProps?.audiences || []).map(a => a.name.toLowerCase());
    let category = 'both';
    if (auds.some(a => /kid|child/.test(a)) && !auds.some(a => /adult/.test(a))) category = 'kids';
    else if (auds.some(a => /adult|young adult/.test(a)) && !auds.some(a => /kid|child/.test(a))) category = 'adult';

    const startTime = e.start.slice(11, 16);
    const endTime   = e.end?.slice(11, 16);
    const fmt12 = t => {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const ap = h >= 12 ? 'pm' : 'am';
      return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
    };
    const timeStr = endTime ? `${fmt12(startTime)} – ${fmt12(endTime)}` : fmt12(startTime);
    const title   = (e.title || '').trim();
    if (!title) continue;

    events.push({ date: eventDate, time: timeStr, title, url: e.url || '', library: libraryKey, category });
  }
  return events;
}

async function scrapeHarrisonHalperin() { return scrapeHarrisonBranch('DOWNTOWN HARRISON', 'harrison_halperin'); }
async function scrapeHarrisonWest()     { return scrapeHarrisonBranch('WEST HARRISON',     'harrison_west'); }


// --- 10. Field Library (Peekskill) — Tribe Events REST API

async function scrapeFieldLibrary() {
  const cutoff   = today();
  const events   = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  function fmt12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am';
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
  }

  try {
    let page = 1;
    while (true) {
      const url = `https://www.thefieldlibrary.org/wp-json/tribe/events/v1/events?per_page=50&start_date=${todayStr}&page=${page}`;
      const r   = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) break;
      const j = await r.json();
      if (!j.events?.length) break;

      for (const e of j.events) {
        const cats = (e.categories || []).map(c => c.name.toLowerCase());
        let category = 'both';
        if (cats.some(c => /child|famil|kid/.test(c))) category = 'kids';
        else if (cats.some(c => /adult|senior|teen/.test(c))) category = 'adult';

        const eventDate = new Date(e.start_date.slice(0, 10) + 'T00:00:00');
        if (isNaN(eventDate.getTime()) || eventDate < cutoff) continue;

        const timeStr = e.start_date.slice(11, 16)
          ? fmt12(e.start_date.slice(11, 16)) + (e.end_date ? ' – ' + fmt12(e.end_date.slice(11, 16)) : '')
          : '';
        const title = (e.title || '').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c));
        events.push({ date: eventDate, time: timeStr, title, url: e.url || '', library: 'field_library', category });
      }
      if (page >= (j.total_pages || 1)) break;
      page++;
      await sleep(300);
    }
  } catch (e) {
    console.log(`    [error] Field Library: ${e.message}`);
  }
  return events;
}


// --- 10. Pelham (Events Manager — no categories, tag all 'both')

const ABBR_MONTH = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

async function scrapePelham() {
  const cutoff  = today();
  const events  = [];
  const months  = getMonths(3);

  function parsePelhamDate(day, abbr) {
    const monthNum = ABBR_MONTH[abbr];
    if (!monthNum || !day) return null;
    const yr = new Date().getFullYear();
    for (const y of [yr, yr + 1]) {
      const d = new Date(y, monthNum - 1, parseInt(day));
      if (d >= cutoff) return d;
    }
    return null;
  }

  function slugToTitle(slug) {
    // Remove date patterns (YYYY-MM-DD) and trailing numeric suffix
    return slug
      .replace(/-?\d{4}-\d{2}-\d{2}/g, '')  // remove all date segments
      .replace(/-\d+$/, '')                   // remove trailing -N
      .replace(/-/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  const seen = new Set();
  for (const [year, month] of months) {
    const url = `https://www.pelhamlibrary.org/calendar/?mo=${month}&yr=${year}`;
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('.em-event, li.em-event').each((_, el) => {
      const $el   = $(el);
      const day   = $el.find('.date .day').text().trim();
      const abbr  = $el.find('.date .month').text().trim();
      const eventDate = parsePelhamDate(day, abbr);
      if (!eventDate) return;

      const href  = $el.find('a[href*="/programs/"], a[href*="/event/"], a.em-item-read-more').last().attr('href') || '';
      const slug  = href.split('/').filter(Boolean).pop() || '';
      const title = slugToTitle(slug);
      if (!title || title.length < 3) return;

      const key = `${title}|${dateKey(eventDate)}`;
      if (seen.has(key)) return;
      seen.add(key);

      const timeRaw = $el.find('.em-event-time').text().replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
      events.push({ date: eventDate, time: timeRaw, title, url: href, library: 'pelham', category: 'both' });
    });
    await sleep(400);
  }
  return events;
}


// --- 11. Hastings Public Library (SimpleCalendar WordPress plugin over Google Calendar)
// Uses admin-ajax.php POST to fetch each month's grid.

async function scrapeHastings() {
  const cutoff  = today();
  const events  = [];
  const months  = getMonths(3);
  const ajaxUrl = 'https://hastingslibrary.org/wp-admin/admin-ajax.php';
  const calId   = 3486;

  for (const [year, month] of months) {
    const body = `action=simcal_default_calendar_draw_grid&month=${month}&year=${year}&id=${calId}`;
    let html;
    try {
      const r = await fetch(ajaxUrl, {
        method: 'POST',
        headers: { ...FETCH_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      html = j.data || '';
    } catch (e) {
      console.log(`    [warn] Hastings ${year}/${month}: ${e.message}`);
      continue;
    }

    const $ = cheerio.load(html);
    $('li.simcal-event').each((_, el) => {
      const $el   = $(el);
      const title = $el.find('.simcal-event-title').first().text().trim();
      if (!title || title.length < 3) return;

      const dateContent = $el.find('.simcal-event-start-date').first().attr('content') || '';
      const datePart    = dateContent.slice(0, 10);
      if (!datePart.match(/^\d{4}-\d{2}-\d{2}$/)) return;
      const eventDate = new Date(datePart + 'T00:00:00');
      if (isNaN(eventDate.getTime()) || eventDate < cutoff) return;

      const startTime = dateContent.slice(11, 16);
      const fmt12 = t => {
        if (!t || t === '00:00') return '';
        const [h, m] = t.split(':').map(Number);
        const ap = h >= 12 ? 'pm' : 'am';
        return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
      };
      const timeStr = fmt12(startTime);

      const gcalLink = $el.find('a[href*="google.com/calendar/event"]').attr('href') || '';
      events.push({ date: eventDate, time: timeStr, title, url: gcalLink, library: 'hastings', category: 'both' });
    });
    await sleep(400);
  }

  // Deduplicate (recurring events appear on every occurrence)
  const seen = new Set();
  return events.filter(e => {
    const k = `${e.title}|${dateKey(e.date)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


// --- 12. Ruth Keeler Memorial Library (Tockify API)

async function scrapeRuthKeeler() {
  const cutoff = today();
  const events = [];
  const now    = Date.now();

  // Only adult calendar found; children's calname not public — tag all as 'both'
  for (const calname of ['rkmladult']) {
    let j;
    try {
      const r = await fetch(
        `https://api.tockify.com/api/ngevent?calname=${calname}&max=200&startDate=${now}`,
        { headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) }
      );
      if (!r.ok) continue;
      j = await r.json();
    } catch (e) {
      console.log(`    [warn] Ruth Keeler ${calname}: ${e.message}`);
      continue;
    }

    for (const e of (j.events || [])) {
      const startMs = e.when?.start?.millis;
      if (!startMs || startMs < now) continue;
      const eventDate = new Date(startMs);
      if (eventDate < cutoff) continue;
      const title = (e.content?.summary?.text || '').trim();
      if (!title) continue;
      const endMs    = e.when?.end?.millis;
      const fmt = ms => {
        const d = new Date(ms);
        let h = d.getHours(), m = d.getMinutes();
        const ap = h >= 12 ? 'pm' : 'am';
        h = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h}:${String(m).padStart(2,'0')}${ap}`;
      };
      const timeStr   = endMs ? `${fmt(startMs)} – ${fmt(endMs)}` : fmt(startMs);
      const eventUrl  = `https://tockify.com/rkmladult/detail/${e.eid.uid}/${e.eid.tid}`;
      events.push({ date: new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()), time: timeStr, title, url: eventUrl, library: 'ruth_keeler', category: 'adult' });
    }
    await sleep(300);
  }
  return events;
}


// --- 13. Port Chester-Rye Brook Library (Upto.com embedded calendar)
// The website embeds an Upto.com calendar (ID: S0OO). Each monthly page is
// server-rendered HTML at upto.com/embedded/plugin/S0OO/YYYY-MM-01.
// Events have data-duration="Day, Month DDth, H:MMam - H:MMpm" for date/time parsing.

const UPTO_MONTH_MAP = {
  January:1,February:2,March:3,April:4,May:5,June:6,
  July:7,August:8,September:9,October:10,November:11,December:12
};

async function scrapePortChester() {
  const cutoff = today();
  const events  = [];
  const months  = getMonths(3);
  const yr      = new Date().getFullYear();

  function parseUptoDuration(dur) {
    // "Mon, April 27th, 6:30pm - 7:30pm"  or  "Fri, May 1st, All Day"
    const m = dur.match(/,\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(.*)/);
    if (!m) return null;
    const monthNum = UPTO_MONTH_MAP[m[1]];
    if (!monthNum) return null;
    const day = parseInt(m[2]);
    const rest = m[3].trim();

    // Determine year
    let eventDate = null;
    for (const y of [yr, yr + 1]) {
      const d = new Date(y, monthNum - 1, day);
      if (d >= cutoff) { eventDate = d; break; }
    }
    if (!eventDate) return null;

    // Parse time range from remainder: "6:30pm - 7:30pm" or "All Day"
    const timeMatch = rest.match(/^(\d{1,2}:\d{2}(?:am|pm))\s*-\s*(\d{1,2}:\d{2}(?:am|pm))/i);
    let timeStr = timeMatch ? `${timeMatch[1]} – ${timeMatch[2]}` : '';
    if (!timeStr && /all.?day/i.test(rest)) timeStr = 'All day';

    return { eventDate, timeStr };
  }

  for (const [year, month] of months) {
    const url  = `https://upto.com/embedded/plugin/S0OO/${year}-${String(month).padStart(2,'0')}-01`;
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);

    $('li[data-duration]').each((_, li) => {
      const dur = $(li).attr('data-duration') || '';
      const parsed = parseUptoDuration(dur);
      if (!parsed) return;
      const { eventDate, timeStr } = parsed;

      // Use data-event-name for a clean title (avoids span.start-time stripping issues)
      const title = ($(li).attr('data-event-name') || '').trim();
      if (!title || title.length < 3) return;
      if (/library is closed|library closed/i.test(title)) return;

      const rawHref = $(li).find('a.source-1').first().attr('href') || '';
      const url2    = rawHref.startsWith('http') ? rawHref : 'https://upto.com' + rawHref;

      // Classify by title keywords — Upto.com has no audience field
      const t = title.toLowerCase();
      let category = 'both';
      if (/children|child|\bkids?\b|babies|baby|toddler|preschool|storytime|story\s+time|\blego\b|puppet|\bfamily\b|families|\byouth\b|school.age|elementary/.test(t)) category = 'kids';
      else if (/adult|senior|teen|tween|book\s*club|yoga|knitting|crochet|mahjong|mah.jong|film screen|lecture|mocktail|cocktail|\bwine\b|financial|medicare|insurance|\bcollege\b|career|\bjob\b|resume|genealog|esl|english as a|line danc/.test(t)) category = 'adult';

      events.push({ date: eventDate, time: timeStr, title, url: url2, library: 'port_chester', category });
    });
    await sleep(400);
  }

  // Deduplicate (border events appear in adjacent monthly views)
  const seen = new Set();
  return events.filter(e => {
    const k = `${e.title}|${dateKey(e.date)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


// --- 14. Mount Vernon Public Library (Events Manager — no category filtering available)
// Events are server-rendered. Date formats: "April 25, 2026" or "Jun. 1 2026 6:00pm"
// All events tagged 'both' since no audience separation exists in the HTML.

const MV_ABBR_MONTH = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };

function parseMountVernonDate(raw) {
  const text = raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  // Standard format: "April 25, 2026" — handled by parseDateStr
  let d = parseDateStr(text);
  if (d) return d;
  // Abbreviated format: "Jun. 1 2026" or "Jun. 1 2026 6:00pm"
  const m = text.match(/^([A-Za-z]{3})\.?\s+(\d{1,2})\s+(\d{4})/);
  if (m) {
    const mn = MV_ABBR_MONTH[m[1]];
    if (mn) return new Date(parseInt(m[3]), mn - 1, parseInt(m[2]));
  }
  return null;
}

async function scrapeMountVernon() {
  const cutoff = today();
  const events = [];
  const html   = await fetchHtml('https://mountvernonpubliclibrary.org/events/');
  if (!html) return events;

  const $ = cheerio.load(html);

  $('.em-event.em-item').each((_, el) => {
    const $el   = $(el);
    const titleEl = $el.find('h3.em-item-title a').first();
    const title   = titleEl.text().trim();
    const href    = titleEl.attr('href') || '';
    if (!title || title.toLowerCase().includes('library is closed') || title.length < 3) return;

    const dateRaw = $el.find('.em-event-date').first().text().replace(/\s+/g, ' ').trim();
    // Multi-day: "April 19, 2026 - April 25, 2026" — take start date only
    const dateStr  = dateRaw.split(/\s*-\s+/)[0].trim();
    const eventDate = parseMountVernonDate(dateStr);
    if (!eventDate || isNaN(eventDate.getTime()) || eventDate < cutoff) return;

    const timeStr = $el.find('.em-event-time, .em-item-meta-line.em-event-meta-datetime').not('.em-event-date').first()
      .text().replace(/\s+/g, ' ').trim();

    events.push({ date: eventDate, time: timeStr, title, url: href, library: 'mount_vernon', category: 'both' });
  });

  return events;
}


// HTML generation
// ---------------------------------------------------------------------------

function generateHtml(allEvents, mountKiscoMissing) {
  // Deduplicate — if same event appears in both kids and adult fetch, mark as 'both'
  const eventMap = new Map();
  for (const e of allEvents) {
    const key = `${e.library}|${e.title}|${dateKey(e.date)}`;
    if (eventMap.has(key)) {
      const ex = eventMap.get(key);
      if (ex.category !== e.category) ex.category = 'both';
    } else {
      eventMap.set(key, { ...e });
    }
  }
  const unique = [...eventMap.values()];

  // Normalise all time strings before sorting
  for (const e of unique) e.time = normalizeTimeStr(e.time);

  // Sort by date → start time (numeric) → title
  unique.sort((a, b) => {
    const dc = dateKey(a.date).localeCompare(dateKey(b.date));
    if (dc !== 0) return dc;
    return parseStartMinutes(a.time) - parseStartMinutes(b.time);
  });

  // Group by date
  const groups = new Map();
  for (const e of unique) {
    const k = dateKey(e.date);
    if (!groups.has(k)) groups.set(k, { date: e.date, events: [] });
    groups.get(k).events.push(e);
  }

  // Build day sections
  let daysHtml = '';
  for (const { date: d, events } of [...groups.values()].sort((a,b) => dateKey(a.date).localeCompare(dateKey(b.date)))) {
    let cards = '';
    for (const e of events) {
      const lib      = LIBRARIES[e.library];
      const timeHtml = e.time ? `<span class="ev-time">${e.time}</span>` : '';
      const titleHtml = e.url
        ? `<a class="ev-title" href="${e.url}" target="_blank" rel="noopener">${e.title}</a>`
        : `<span class="ev-title">${e.title}</span>`;
      cards += `<div class="event" data-lib="${e.library}" data-cat="${e.category || 'kids'}">${timeHtml}${titleHtml}<span class="badge" style="--c:${lib.color}">${lib.name}</span></div>\n`;
    }
    daysHtml += `<section class="day"><h2 class="day-hdr">${formatDate(d)}</h2>${cards}</section>\n`;
  }

  // Legend — alphabetical, clickable filter buttons
  const legend = Object.entries(LIBRARIES)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([key, l]) =>
      `<button class="badge filter-btn" data-lib="${key}" style="--c:${l.color}">${l.name}</button>`
    ).join('');

  const warning = mountKiscoMissing
    ? `<div class="warn"><strong>Mount Kisco not shown</strong> — Playwright is not installed.
       To add it, open Terminal and run:<br>
       <code>npm install playwright &amp;&amp; npx playwright install chromium</code></div>`
    : '';

  const now   = new Date().toLocaleString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit' });
  const total = unique.length;
  const empty = '<p class="empty">No upcoming events found.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Westchester Library Events Calendar</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #eef0f3;
  color: #1a1a1a;
  min-height: 100vh;
}
body::before {
  content: '';
  display: block;
  height: 4px;
  background: linear-gradient(90deg, #3a86ff, #f72585, #06d6a0, #ffbe0b, #8338ec);
}
header {
  background: #fafaf8;
  border-bottom: 1px solid #d8d8d8;
  padding: 18px 24px 14px;
}
h1 { font-size: 1.55rem; font-weight: 800; letter-spacing: -.02em; margin-bottom: 4px; color: #1d3461; }
.meta { font-size: .82rem; color: #666; margin-bottom: 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.legend.closed { display: none !important; }
.warn {
  margin-top: 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: .83rem;
  line-height: 1.5;
}
.warn code {
  background: #f5f5f5;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: .82rem;
}
main {
  max-width: 740px;
  margin: 24px auto;
  padding: 0 16px 48px;
}
.day {
  background: #fff;
  border-radius: 12px;
  margin-bottom: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,.09);
}
.day-hdr {
  font-size: .93rem;
  font-weight: 700;
  padding: 10px 16px;
  background: #f4f4f2;
  border-bottom: 1px solid #ececec;
  border-left: 4px solid #3a86ff;
  color: #1d3461;
}
.event {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #f3f3f3;
  flex-wrap: wrap;
}
.event:last-child { border-bottom: none; }
.event:hover { background: #f9f9f9; }
.ev-time {
  font-size: .8rem;
  color: #555;
  white-space: nowrap;
  min-width: 140px;
  flex-shrink: 0;
}
.ev-title {
  flex: 1;
  font-size: .92rem;
  color: #1a1a1a;
  text-decoration: none;
}
a.ev-title:hover { text-decoration: underline; }
.badge {
  display: inline-block;
  font-size: .68rem;
  font-weight: 700;
  color: #fff;
  background: var(--c, #888);
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.empty {
  text-align: center;
  color: #888;
  padding: 48px 16px;
  font-size: 1rem;
}
@media (max-width: 520px) {
  .ev-time { min-width: 0; width: 100%; }
}
.filter-btn {
  cursor: pointer;
  border: none;
  transition: background .15s, color .15s;
}
.filter-btn.off {
  background: #aaa !important;
  color: #fff !important;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.filter-label {
  font-size: .82rem;
  font-weight: 700;
  color: #333;
  white-space: nowrap;
}
.cat-filter {
  display: flex;
  gap: 6px;
}
.cat-btn {
  font-size: .82rem;
  font-weight: 600;
  border: 2px solid #ccc;
  border-radius: 20px;
  padding: 4px 14px;
  background: none;
  cursor: pointer;
  color: #555;
  transition: background .15s, color .15s, border-color .15s;
}
.cat-btn.active { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
.filter-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.ctrl-btn {
  font-size: .75rem;
  font-weight: 600;
  background: none;
  border: 1px solid #aaa;
  border-radius: 20px;
  padding: 3px 10px;
  cursor: pointer;
  color: #333;
}
.ctrl-btn:hover { background: #f0f0f0; }
.lib-toggle-btn {
  font-size: .75rem;
  background: none;
  border: 1px solid #aaa;
  border-radius: 20px;
  padding: 3px 12px;
  cursor: pointer;
  color: #333;
  font-weight: 600;
}
.lib-toggle-btn:hover { background: #f0f0f0; }
.event.hidden { display: none; }
.day.hidden { display: none; }
@media (max-width: 640px) {
  header { padding: 12px 16px 10px; }
  h1 { font-size: 1.2rem; }
  .meta { font-size: .75rem; margin-bottom: 6px; }
  .cat-btn { padding: 5px 14px; min-height: 36px; }
  .ctrl-btn { padding: 4px 10px; min-height: 32px; }
  .lib-toggle-btn { padding: 4px 12px; min-height: 32px; }
  main { margin: 10px auto; padding: 0 10px 32px; }
  .day { margin-bottom: 10px; border-radius: 8px; }
  .day-hdr { padding: 8px 12px; font-size: .88rem; }
  .event { padding: 8px 12px; gap: 6px; }
  .ev-time { min-width: 0; width: 100%; }
  .badge { font-size: .65rem; }
  .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; }
  .filter-btn { font-size: .68rem; padding: 3px 8px; min-height: 0; border-radius: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
${GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX' ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_MEASUREMENT_ID}');
</script>` : ''}
</head>
<body>
<header>
  <h1>Westchester Library Events Calendar</h1>
  <p class="meta">
    Updated: ${now} &nbsp;·&nbsp; ${total} upcoming event${total !== 1 ? 's' : ''}
  </p>
  <p class="meta" style="margin-top:-8px;margin-bottom:10px;">
    Use <strong>Kids</strong> / <strong>Adults</strong> to filter by audience. Toggle libraries on or off using the buttons below.
  </p>
  <div class="filter-row">
    <span class="filter-label">Events:</span>
    <div class="cat-filter">
      <button class="cat-btn active" data-cat="all">All</button>
      <button class="cat-btn" data-cat="kids">Kids</button>
      <button class="cat-btn" data-cat="adult">Adults</button>
    </div>
  </div>
  <div class="filter-row">
    <span class="filter-label">Libraries:</span>
    <div class="filter-controls">
      <button class="ctrl-btn" id="btn-all">Select All</button>
      <button class="ctrl-btn" id="btn-none">Deselect All</button>
      <button class="lib-toggle-btn" id="btn-toggle-libs">Hide</button>
    </div>
  </div>
  <div class="legend" id="lib-legend">${legend}</div>
  ${warning}
</header>
<main>
  ${unique.length ? daysHtml : empty}
</main>
<script>
const filterBtns = document.querySelectorAll('.filter-btn');
let catMode = 'all';

function updateDays() {
  document.querySelectorAll('.day').forEach(day => {
    const anyVisible = [...day.querySelectorAll('.event')].some(e => !e.classList.contains('hidden'));
    day.classList.toggle('hidden', !anyVisible);
  });
}

function applyFilters() {
  document.querySelectorAll('.event').forEach(ev => {
    const libOff = document.querySelector('.filter-btn[data-lib="' + ev.dataset.lib + '"]')?.classList.contains('off');
    const cat    = ev.dataset.cat;
    const catOk  = catMode === 'all' || cat === catMode || cat === 'both';
    ev.classList.toggle('hidden', libOff || !catOk);
  });
  updateDays();
}

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('off');
    applyFilters();
  });
});

document.getElementById('btn-all').addEventListener('click', () => {
  filterBtns.forEach(b => b.classList.remove('off'));
  applyFilters();
});

document.getElementById('btn-none').addEventListener('click', () => {
  filterBtns.forEach(b => b.classList.add('off'));
  applyFilters();
});

// Toggle library list (mobile: starts open, user can collapse; desktop: always visible)
const libLegend    = document.getElementById('lib-legend');
const libToggleBtn = document.getElementById('btn-toggle-libs');
libToggleBtn.addEventListener('click', () => {
  const isClosed = libLegend.classList.toggle('closed');
  libToggleBtn.textContent = isClosed ? 'Show' : 'Hide';
});

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    catMode = btn.dataset.cat;
    applyFilters();
  });
});
</script>
</body>
</html>`;
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const months    = getMonths(3);
  const allEvents = [];
  let   mountKiscoMissing = false;

  // librarycalendar.com / Drupal sites — internal pagination, called once
  const lcScrapers = [
    ['Katonah Village Library',              scrapeKatonah],
    ['Pound Ridge Library',                  scrapePoundRidge],
    ['Bedford Hills Free Library',           scrapeBedfordHills],
    ['Mount Pleasant Library (Pleasantville)', scrapeMountPleasant],
    ['Mount Pleasant Library (Valhalla)',    scrapeMountPleasantValhalla],
    ['Chappaqua Library',                    scrapeChappaqua],
    ['Larchmont Public Library',             scrapeLarchmont],
    ['Bronxville Public Library',            scrapeBronxville],
    ['Hendrick Hudson Free Library',         scrapeHendrickHudson],
    ['Ossining Public Library',              scrapeOssining],
    ['Warner Library (Tarrytown)',           scrapeWarner],
    ['John C. Hart Library (Yorktown)',      scrapeYorktown],
    ['Croton Free Library',                  scrapeCroton],
    ['Scarsdale Public Library',             scrapeScarsdale],
    ['New Rochelle Library (Main)',          scrapeNewRochelleMain],
    ['New Rochelle Library (Huguenot)',      scrapeNewRochelleHuguenot],
    ['Yonkers Library (Riverfront)',         scrapeYonkersRiverfront],
    ['Yonkers Library (Will)',               scrapeYonkersWill],
    ['Yonkers Library (Crestwood)',          scrapeYonkersCrestwood],
  ];
  for (const [name, scraper] of lcScrapers) {
    console.log(`Fetching ${name}...`);
    const evs = await scraper();
    allEvents.push(...evs);
    console.log(`  → ${evs.length} events`);
  }

  // Sites that loop through months
  const monthScrapers = [
    ['Bedford Free Library',             scrapeBedfordFree],
    ['North Castle Library (Armonk)',    scrapeNorthCastle],
    ['North Castle Library (White Plains)', scrapeNorthWhitePlains],
  ];
  for (const [name, scraper] of monthScrapers) {
    console.log(`Fetching ${name}...`);
    let count = 0;
    for (const [year, month] of months) {
      const evs = await scraper(year, month);
      allEvents.push(...evs);
      count += evs.length;
      await sleep(400);
    }
    console.log(`  → ${count} events`);
  }

  console.log('Fetching Mount Kisco Public Library (headless browser)...');
  let mkCount = 0;
  for (const [year, month] of months) {
    const { events: mkEvs, playwrightMissing } = await scrapeMountKisco(year, month);
    if (playwrightMissing) {
      mountKiscoMissing = true;
      console.log('  → Playwright not installed; Mount Kisco skipped');
      console.log('     To enable: npm install playwright && npx playwright install chromium');
      break;
    }
    allEvents.push(...mkEvs);
    mkCount += mkEvs.length;
    await sleep(400);
  }
  if (!mountKiscoMissing) console.log(`  → ${mkCount} events`);

  // Tribe Events / Mamaroneck, Lewisboro, Briarcliff, Dobbs Ferry
  const tribeScrapers = [
    ['Mamaroneck Public Library',       scrapeMamaroneck],
    ['Lewisboro Library (South Salem)', scrapeLewisboro],
    ['Briarcliff Manor Library',        scrapeBriarcliff],
    ['Dobbs Ferry Public Library',      scrapeDobbsFerry],
  ];
  for (const [name, scraper] of tribeScrapers) {
    console.log(`Fetching ${name}...`);
    const evs = await scraper();
    allEvents.push(...evs);
    console.log(`  → ${evs.length} events`);
  }

  // Ardsley (flat Weebly pages)
  console.log('Fetching Ardsley Public Library...');
  { const evs = await scrapeArdsley(); allEvents.push(...evs); console.log(`  → ${evs.length} events`); }

  // LibCal sites (JSON AJAX — no browser needed)
  const libCalSites = [
    ['Eastchester Public Library', scrapeEastchester],
    ['Greenburgh Public Library',  scrapeGreenburgh],
    ['Irvington Public Library',   scrapeIrvington],
    ['Tuckahoe Public Library',    scrapeTuckahoe],
    ['Rye Free Reading Room',      scrapeRye],
  ];
  for (const [name, scraper] of libCalSites) {
    console.log(`Fetching ${name}...`);
    const evs = await scraper();
    allEvents.push(...evs);
    console.log(`  → ${evs.length} events`);
  }

  // White Plains (Communico JSON API)
  console.log('Fetching White Plains Public Library...');
  { const evs = await scrapeWhitePlains(); allEvents.push(...evs); console.log(`  → ${evs.length} events`); }

  // Field Library (Tribe REST API), Ruth Keeler (Tockify), Harrison (custom API), Hastings (SimpleCalendar)
  for (const [name, scraper] of [
    ['The Field Library (Peekskill)',    scrapeFieldLibrary],
    ['Ruth Keeler Memorial Library',     scrapeRuthKeeler],
    ['Harrison Library (Halperin)',      scrapeHarrisonHalperin],
    ['Harrison Library (West Harrison)', scrapeHarrisonWest],
    ['Hastings Public Library',          scrapeHastings],
  ]) {
    console.log(`Fetching ${name}...`);
    const evs = await scraper();
    allEvents.push(...evs);
    console.log(`  → ${evs.length} events`);
  }

  console.log('Fetching Town of Pelham Public Library...');
  { const evs = await scrapePelham(); allEvents.push(...evs); console.log(`  → ${evs.length} events`); }

  // Port Chester + Mount Vernon
  for (const [name, scraper] of [
    ['Port Chester-Rye Brook Library', scrapePortChester],
    ['Mount Vernon Public Library',    scrapeMountVernon],
  ]) {
    console.log(`Fetching ${name}...`);
    const evs = await scraper();
    allEvents.push(...evs);
    console.log(`  → ${evs.length} events`);
  }

  console.log(`\nTotal events: ${allEvents.length}`);

  const outputPath = path.join(__dirname, 'index.html');
  fs.writeFileSync(outputPath, generateHtml(allEvents, mountKiscoMissing), 'utf8');
  console.log(`Calendar saved → ${outputPath}`);

  try {
    execSync(`open "${outputPath}"`);
  } catch (_) {}
}

main().catch(console.error);
