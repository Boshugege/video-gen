// npm run render -- <episode> [--draft] [--workers N] [--cover-t 12.5] [--burn-subs]
import { parseArgs, main } from './args.mjs';
import { renderEpisode } from '../core/render/index.mjs';

main(async () => {
  const { positional, flags } = parseArgs();
  await renderEpisode(positional[0], {
    draft: !!flags.draft,
    workers: flags.workers ? +flags.workers : undefined,
    coverT: flags['cover-t'] != null ? +flags['cover-t'] : null,
    burnSubtitles: !!flags['burn-subs'],
  });
});
