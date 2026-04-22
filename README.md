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

Push to `main` — GitHub Actions builds and deploys automatically.

To deploy manually: Actions tab > "Deploy to GitHub Pages" > Run workflow.

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
