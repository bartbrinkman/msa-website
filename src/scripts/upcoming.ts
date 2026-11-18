// Keeps the "next event" bits of a page current between deploys.
//
// The site is static and only rebuilt on a push, so whatever was upcoming at
// build time stays in the HTML until the next one. Each list therefore renders
// every event that was still to come at build time, each tagged with when it
// ends (data-until, see eventUntil), and this script shows the ones that are
// still on, by the same rule upcomingEvents() uses at build time.
//
//   [data-upcoming]                 a list; data-skip / data-limit pick which of
//                                   the still-on items to show (default: all)
//   [data-until]                    one event in such a list
//   [data-upcoming-hide-empty]      hidden once none of its events show
//   [data-countdown]                filled with "Over 12 dagen" etc., from its
//                                   data-date / data-end-date
//
// Without JavaScript the build-time state shows as rendered.
import { siteNow, eventCountdown } from '../utils';

function refresh() {
  const now = new Date();
  const stamp = siteNow(now);

  document.querySelectorAll<HTMLElement>('[data-upcoming]').forEach((list) => {
    const skip = Number(list.dataset.skip ?? 0);
    const limit = Number(list.dataset.limit ?? Infinity);
    let rank = 0;
    list.querySelectorAll<HTMLElement>('[data-until]').forEach((item) => {
      const on = item.dataset.until! > stamp;
      item.hidden = !(on && rank >= skip && rank < skip + limit);
      if (on) rank++;
    });
  });

  document.querySelectorAll<HTMLElement>('[data-upcoming-hide-empty]').forEach((box) => {
    const items = box.querySelectorAll<HTMLElement>('[data-until]');
    box.hidden = !Array.from(items).some((item) => !item.hidden);
  });

  document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
    const { date, endDate } = el.dataset;
    if (date) el.textContent = eventCountdown({ date, endDate }, now);
  });
}

refresh();
// A page left open (a tab, a screen at the open day) rolls over on its own.
setInterval(refresh, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
