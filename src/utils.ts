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

/** Events that have not finished yet, soonest first. Evaluated at build time. */
export function upcomingEvents(events: EventItem[], limit?: number): EventItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter(e => new Date(e.endDate || e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return limit === undefined ? upcoming : upcoming.slice(0, limit);
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
