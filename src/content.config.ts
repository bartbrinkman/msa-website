import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Nieuwsberichten. One markdown file per bericht in src/content/nieuws/;
// the filename becomes the id. Astro validates every file against this schema
// at build time, so a missing title or a malformed date fails the build rather
// than rendering blank on the site.
//
// Note on dates: the project rule is that dates stay out of article copy. The
// `date` here is structured metadata used for sorting and the dateline; keep
// the body text itself undated so it does not go stale.
const nieuws = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/nieuws' }),
  schema: z.object({
    /** Headline shown on the card and the article page. */
    title: z.string(),
    /** Publication date, used for ordering and the dateline. */
    date: z.coerce.date(),
    /** One or two sentences for the card. */
    summary: z.string(),
    /** Optional image path under public/, e.g. /images/banen/bergen.jpg */
    image: z.string().optional(),
    /** Optional link to a related page, e.g. /banen/bergen */
    link: z.string().optional(),
    /** Set true to keep a bericht out of the build. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { nieuws };
