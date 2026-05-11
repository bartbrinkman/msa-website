# MSA Website — conventions

See [OVERVIEW.md](OVERVIEW.md) for stack and structure.

## Content rules

- **Dates only in the calendar** ([src/content/events.json](src/content/events.json)). Never in article copy — it goes stale. Phrase narrative pages undated ("voor de jaarlijkse open dag", not "op 25 oktober 2026").
- **Calendar is public-facing only.** No werkavonden, laadlogistiek, bestuursvergaderingen, ALV, of opruimavonden. Test: would a visitor without club ties want to attend?
- **Link calendar events to their activity page** when one exists. If an event in [src/content/events.json](src/content/events.json) corresponds to a page under [src/pages/activiteiten/](src/pages/activiteiten/), set its `link` field. Check both directions when adding events or activity pages.
