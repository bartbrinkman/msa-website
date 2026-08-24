# Modelspoorclub Alkmaar — Website

Website van de [Modelspoorclub Alkmaar (MSA)](https://www.modelspoorclubalkmaar.nl/).

## Tech stack

- [Astro](https://astro.build/) — static site generator
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- GitHub Pages — hosting
- GitHub Actions — automatic deploy on push to `main`

## Local development

```bash
npm install
npx astro dev
```

Site runs at `http://localhost:4321`.

## Build

```bash
npx astro build
```

Output goes to `dist/`.

## Deploy

Push to `main` — GitHub Actions builds and deploys to **two** targets automatically:

| Workflow | Target | Base path |
| --- | --- | --- |
| `deploy.yml` | GitHub Pages — <https://bartbrinkman.github.io/msa-website/> | `/msa-website` |
| `deploy-ftp.yml` | The live site — <https://www.modelspoorclubalkmaar.nl/> | `/` |

To deploy manually: Actions tab > pick the workflow > Run workflow.

The base path and canonical URL come from the `BASE_PATH` and `SITE_URL` env vars
(see `astro.config.mjs`); the Pages defaults apply when they are unset.

### FTP credentials

`deploy-ftp.yml` uploads over FTPS using three repository secrets — never commit
these to the repo:

| Secret | Value |
| --- | --- |
| `FTP_SERVER` | `ftp.modelspoorclubalkmaar.nl` |
| `FTP_USERNAME` | the hosting account name |
| `FTP_PASSWORD` | the hosting account password |

Rotate them with `gh secret set FTP_PASSWORD` or under Settings > Secrets and
variables > Actions.

### The upload never deletes

The upload runs `lftp mirror` **without** `--delete`, so a deploy only ever adds
or overwrites. Nothing on the host is removed — including the old PHP site,
which still sits in `/httpdocs/` alongside the generated pages. Removing those
leftovers is a manual job, done deliberately rather than by a deploy.

It uploads in two passes, because Astro rewrites every file on every build and
so every local timestamp is newer than the server's:

1. `--ignore-time` compares by size instead, so the ~74MB of images and
   content-hashed assets only move when they actually change.
2. The HTML is small (~330KB) and its size can stay identical across a real edit
   (`8 november` → `9 november`), so it is pushed unconditionally with
   `--ignore-size`.

The host serves a shared-hosting certificate (`CN=ns1.supersnel2.net`) that does
not match the domain, so certificate verification is off. The transfer is still
TLS-encrypted; only the identity check is relaxed.

## Content maintenance

### Pages

All pages live in `src/pages/`. Most are `.astro` files with inline HTML content. Use the Astro dev tool or edit the text directly.

### Banen (layouts)

Layout data is shared between the homepage and the banen overview via `src/content/banen.json`. Edit this file to change titles, descriptions, or scales — both pages update automatically.

Individual layout detail pages are in `src/pages/banen/`.

### Agenda (events)

Edit `src/content/events.json`. Each event has:

```json
{
  "date": "2026-10-25",
  "endDate": "2026-10-26",
  "title": "Open Dag MSA",
  "description": "Alle banen te bezichtigen",
  "location": "Koornlaan 23, Alkmaar",
  "type": "expositie",
  "link": "/activiteiten/..."
}
```

Event types: `expositie` (green), `excursie` (amber), `opendag` (blue), `beurs` (violet).

Past events are automatically hidden.

### Images

Images are in `public/images/`, organized by layout or activity. To add photos to a carousel, edit the `images` array in the relevant `.astro` page.

### Styling

- Colors: `src/styles/global.css` (`@theme` block)
- Heading font: Gabarito (Google Fonts)
- Body font: Inter (Google Fonts)
- Layouts: `src/layouts/Base.astro` (shared header/footer), `src/layouts/Page.astro` (content pages with hero)

## Project structure

```
src/
  content/          # JSON data files (banen, events)
  components/       # Reusable components (Calendar, Carousel, LayoutCard)
  layouts/          # Page layouts (Base, Page)
  pages/            # All routes
    banen/          # Individual layout pages
    activiteiten/   # Activity pages
  styles/           # Global CSS
public/
  images/           # All images, organized by section
```

## TODO