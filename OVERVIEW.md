# MSA Website — Session Handoff

## What was built

A complete rebuild of the [Modelspoorclub Alkmaar](https://www.modelspoorclubalkmaar.nl/) website using a modern static site stack. Content-first approach with markdown/Astro pages and shared JSON data — no CMS needed.

**Live preview:** https://bartbrinkman.github.io/msa-website/
**Repo:** https://github.com/bartbrinkman/msa-website

## Tech stack

- **Astro 6** — static site generator
- **Tailwind CSS v4** — styling
- **Google Fonts** — Gabarito (headings), Inter (body)
- **GitHub Pages** + **GitHub Actions** (`withastro/action@v6`) — hosting & CI

## Site structure (19 pages)

```
/                         Home (hero with bg image, info cards, layout grid)
/de-club                  Club history, 40-year anniversary, Darmstadt sister city
/banen/                   Overview split into Vaste banen / Modulebanen / Educatie
  alkmaarbaan             H0, iTrain, with carousel (17 photos)
  marklinbaan             Marklin 3-rail AC, iTrain, with carousel
  hoogovenbaan            Steel industry theme, with carousel
  nbaan                   N-schaal Eifel, with carousel
  modulebaan              45m Hoorn-Medemblik + 3 sub-modules
  bergen                  Bergen-Bergen aan Zee (in renovation)
  n-modulebaan            New N-scale module (in development)
  kinderbaan              Educational children's layout
/activiteiten/            Activity overview
  clubavonden             Thursday evenings
  modelspoordagen         NMD exhibition (with carousel)
  darmstadt               Annual museum trip (with carousel)
  kinderbaan              Children's educational activities
/agenda                   Calendar of upcoming events
/links                    Partner clubs, sponsors, model brands
/contact                  Address, hours, board, email
```

## Key components

- **Carousel** (`src/components/Carousel.astro`) — used on banen + activity pages. Features: prev/next buttons, dot indicators, touch/swipe, arrow key nav, click-to-fullscreen lightbox with Esc close
- **Calendar** (`src/components/Calendar.astro`) — groups events by month, filters past events, supports date ranges, color-coded type badges
- **LayoutCard** (`src/components/LayoutCard.astro`) — reusable card for the banen grid

## Content data sources (single source of truth)

- **`src/content/banen.json`** — all layouts with title, scale, description, category. Homepage + banen overview read from this
- **`src/content/events.json`** — agenda events with `date`, optional `endDate`, `type` (expositie/excursie/opendag/beurs), `location`, optional `link` to activity page

## Design

- **Color**: navy blue primary (`#001888`) in gradient headers, warm cream content bg
- **Typography**: Gabarito uppercase for all headings (font-medium), Inter for body
- **Hero sections**: gradient with optional background image (20% opacity overlay)
- **Logo**: Yellow MSA logo extracted from transparent banner, placed in header

## Deployment notes

### GitHub Pages setup (current)

- `astro.config.mjs` has `base: '/msa-website'` for the GitHub subpath
- All internal `href` and image `src` attributes use `asset()` helper from `src/utils.ts` (wraps `import.meta.env.BASE_URL` — this is Astro's documented manual-prefix pattern)
- Auto-deploys on push to `main`

### Switching to custom domain

When pointing `modelspoorclubalkmaar.nl` at GitHub Pages:

1. Remove `base: '/msa-website'` from `astro.config.mjs`
2. Update `site` back to `'https://www.modelspoorclubalkmaar.nl'`
3. `asset()` calls become no-ops (no changes needed in templates)
4. Add `public/CNAME` file with the domain
5. Configure DNS + custom domain in GitHub Pages settings

## Content from MSA documents (incorporated)

From the shared ALV notulen + jaaragenda 2026:

- **Board**: Mario Jonkhart, Hans Cornelissen, Cees Maulus, Remco Jansen, Maurits Kortenoeven
- **Hoogovenbaan**: now disconnected from Marklinbaan
- **Marklinbaan**: 15+ locs on iTrain, kabelbaan added
- **Bergen–Bergen aan Zee**: major renovation with new modules + digitalisering
- **N-modulebaan**: new project starting January 2026
- **Events 2026**: Darmstadt 14-17 mei, Bello Festival Hoorn, Open Monumentendag 12 sep (Grote Kerk), Open Dag MSA 25 okt, Ruilbeurs 8 nov (OSG Willem Blaeu)
- **NMD 2027**: 27-28 feb at OSG Willem Blaeu, Robonsbosweg 11
- **Koploper** removed (no longer in active use)

## Maintenance

See `README.md` for full instructions. Quick reference:

- **Add an event**: edit `src/content/events.json`
- **Update a layout**: edit `src/content/banen.json` + the corresponding page in `src/pages/banen/`
- **Add photos**: drop in `public/images/<section>/`, reference in the page's `images` array
- **Change styling**: `src/styles/global.css` (theme tokens in `@theme` block)

## Known quirks

- `asset()` helper is used throughout (`~30 files`) — this is the Astro-documented approach, not a workaround. Stays useful when switching domains.
- Modulebaan / N-modulebaan / Bergen pages don't have carousels yet (no photos available)
- `src/pages/banen/index.astro` could be generated from banen.json more aggressively (currently duplicates category headings)
