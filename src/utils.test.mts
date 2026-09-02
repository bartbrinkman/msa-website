import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingEvents, eventDateLabel, eventPosters, type EventItem } from './utils.ts';

const EVENTS: EventItem[] = [
  { date: '2026-05-14', endDate: '2026-05-17', title: 'Excursie Darmstadt' },
  { date: '2026-09-12', title: 'Open Monumentendag' },
  { date: '2026-10-25', title: 'Open Dag MSA' },
];

const on = (day: string) => upcomingEvents(EVENTS, undefined, new Date(`${day}T12:00:00`));
const nextOn = (day: string) => on(day)[0]?.title ?? null;

test('the head of the list is the next event', () => {
  assert.equal(nextOn('2026-01-01'), 'Excursie Darmstadt');
});

test('an event still shows on its own day', () => {
  assert.equal(nextOn('2026-09-12'), 'Open Monumentendag');
});

test('it rolls over to the next event the day after', () => {
  assert.equal(nextOn('2026-09-11'), 'Open Monumentendag');
  assert.equal(nextOn('2026-09-12'), 'Open Monumentendag');
  assert.equal(nextOn('2026-09-13'), 'Open Dag MSA');
});

test('a multi-day event survives until its endDate passes', () => {
  assert.equal(nextOn('2026-05-14'), 'Excursie Darmstadt', 'first day');
  assert.equal(nextOn('2026-05-16'), 'Excursie Darmstadt', 'middle day');
  assert.equal(nextOn('2026-05-17'), 'Excursie Darmstadt', 'last day');
  assert.equal(nextOn('2026-05-18'), 'Open Monumentendag', 'day after');
});

test('the list empties once everything is past, rather than showing a stale event', () => {
  assert.deepEqual(on('2026-10-26'), []);
});

test('rollover holds in a negative UTC offset', () => {
  // Parsing "2026-09-12" gives UTC midnight; in UTC-8 that is still 11 Sept
  // locally, which used to retire the event a day early.
  const prev = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.equal(nextOn('2026-09-12'), 'Open Monumentendag');
    assert.equal(nextOn('2026-09-13'), 'Open Dag MSA');
  } finally {
    process.env.TZ = prev;
  }
});

const POSTER_EVENTS: EventItem[] = [
  { date: '2026-10-25', title: 'Open Dag MSA', poster: '/a.jpg' },
  { date: '2026-09-12', title: 'Open Monumentendag' },
  { date: '2027-02-27', title: 'Modelspoordagen', poster: '/c.jpg', posterAlt: 'Eigen alt' },
  { date: '2026-11-08', title: 'Ruilbeurs', poster: '/b.jpg' },
];

const postersOn = (day: string) => eventPosters(POSTER_EVENTS, new Date(`${day}T12:00:00`));

test('posters run soonest first, whatever order the agenda is written in', () => {
  assert.deepEqual(postersOn('2026-09-01').map(p => p.src), ['/a.jpg', '/b.jpg', '/c.jpg']);
});

test('an event without a poster does not leave a gap in the fan', () => {
  // Open Monumentendag is the next event but has no poster.
  assert.equal(postersOn('2026-09-01').length, 3);
});

test('a poster retires with its own edition', () => {
  assert.deepEqual(postersOn('2026-10-26').map(p => p.src), ['/b.jpg', '/c.jpg']);
  assert.deepEqual(postersOn('2027-03-01'), []);
});

test('alt text falls back to the event title but an explicit one wins', () => {
  const [openDag, , modelspoordagen] = postersOn('2026-09-01');
  assert.equal(openDag.alt, 'Poster van Open Dag MSA');
  assert.equal(modelspoordagen.alt, 'Eigen alt');
});

test('date labels cover single days, ranges, and cross-month ranges', () => {
  assert.equal(eventDateLabel({ date: '2026-09-12', title: '' }), '12 sep');
  assert.equal(eventDateLabel({ date: '2026-05-14', endDate: '2026-05-17', title: '' }), '14–17 mei');
  assert.equal(eventDateLabel({ date: '2026-05-30', endDate: '2026-06-02', title: '' }), '30 mei – 2 jun');
});
