/** Prefix a path with the Astro base URL */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export interface EventItem {
  date: string;
  endDate?: string;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  link?: string;
  /** Poster for this edition, e.g. /images/brochure/open-dag-2026.jpg */
  poster?: string;
  /** Alt text for the poster; falls back to the event title. */
  posterAlt?: string;
}

export interface Poster {
  src: string;
  alt: string;
}

export const daysShort = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

export const months = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

export const monthsShort = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const typeLabels: Record<string, string> = {
  clubavond: 'Clubavond',
  expositie: 'Expositie',
  excursie: 'Excursie',
  opendag: 'Open dag',
  beurs: 'Beurs',
  overig: 'Overig',
};

/**
 * The clock the agenda runs on. The site is built wherever the build happens
 * to run (GitHub Actions is UTC), so the club's own time zone is fixed here
 * rather than taken from the machine.
 */
const SITE_TIMEZONE = 'Europe/Amsterdam';

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/**
 * Calendar day as YYYY-MM-DD and clock time as HH:MM in the site's time zone,
 * matching the formats used in events.json.
 */
function siteClock(d: Date): { day: string; time: string } {
  const p: Record<string, string> = {};
  for (const { type, value } of clockFormat.formatToParts(d)) p[type] = value;
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * Events that have not finished yet, soonest first.
 *
 * An event stays in the list through its own day (or, for a range, through
 * its endDate) and drops out the day after, so the head of the list is always
 * the next event. An event with an endTime drops out as soon as that time has
 * passed on its last day, so the evening after an open day already points at
 * whatever comes next. Days and times are compared as strings rather than Date
 * objects: parsing "2026-09-12" yields UTC midnight, which lands on the wrong
 * side of a local midnight in negative UTC offsets and would retire an event a
 * day early.
 *
 * `today` is injectable so the rollover can be tested at a fixed moment.
 */
export function upcomingEvents(events: EventItem[], limit?: number, today: Date = new Date()): EventItem[] {
  const now = siteClock(today);
  const stillOn = (e: EventItem) => {
    const lastDay = e.endDate || e.date;
    if (lastDay !== now.day) return lastDay > now.day;
    return !e.endTime || e.endTime > now.time;
  };
  const upcoming = events.filter(stillOn).sort((a, b) => a.date.localeCompare(b.date));
  return limit === undefined ? upcoming : upcoming.slice(0, limit);
}

/**
 * Posters of the events still to come, soonest first.
 *
 * The agenda is the authority here too: a poster hangs off its event, so the
 * standee orders itself by date and a poster retires with its edition instead
 * of having to be pulled from a hand-kept list. Order is left-to-right in the
 * fan, which puts the next event on the left and on top.
 */
export function eventPosters(events: EventItem[], today: Date = new Date()): Poster[] {
  return upcomingEvents(events, undefined, today)
    .filter(e => e.poster)
    .map(e => ({ src: e.poster!, alt: e.posterAlt ?? `Poster van ${e.title}` }));
}

/** Compact date label: "12 sep", or "14–17 mei" for a range within one month. */
export function eventDateLabel(event: EventItem): string {
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : null;
  if (!end || end.getTime() === start.getTime()) {
    return `${start.getDate()} ${monthsShort[start.getMonth()]}`;
  }
  if (end.getMonth() === start.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${monthsShort[start.getMonth()]}`;
  }
  return `${start.getDate()} ${monthsShort[start.getMonth()]} – ${end.getDate()} ${monthsShort[end.getMonth()]}`;
}

/** Full date for the "Wanneer" field: "8 november 2026, 10:00-15:00". */
export function eventWhen(event: EventItem): string {
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : null;
  const day = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;

  let when: string;
  if (!end || end.getTime() === start.getTime()) {
    when = `${day(start)} ${start.getFullYear()}`;
  } else if (end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth()) {
    when = `${start.getDate()}–${day(end)} ${end.getFullYear()}`;
  } else {
    when = `${day(start)} – ${day(end)} ${end.getFullYear()}`;
  }

  const time = [event.startTime, event.endTime].filter(Boolean).join('–');
  return time ? `${when}, ${time}` : when;
}
