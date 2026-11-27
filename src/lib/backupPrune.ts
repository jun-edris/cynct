// Which old backups to delete. Pure, so it can be tested without the file system.
import { addDays } from './money';

/** Backups older than this many days are deleted, in the app and in your backup folder. */
export const KEEP_DAYS = 30;
/** Always keep at least this many of the newest, even if they're old (e.g. you didn't open the app for a while). */
export const KEEP_MIN = 3;

/** Which backup files are past KEEP_DAYS. Takes file names or URIs; ignores anything that isn't a dated Cynct backup. */
export function expiredBackups(names: string[], today: string, days = KEEP_DAYS): string[] {
  const dated = names.map(n => ({ n, d: /(?:cynct|bahay)-(\d{4}-\d{2}-\d{2})(?: ?\(\d+\))?\.json$/.exec(decodeURIComponent(n))?.[1] ?? null }))
    .filter((x): x is { n: string; d: string } => x.d !== null)
    .sort((a, b) => b.d.localeCompare(a.d));
  const cutoff = addDays(today, -days);
  return dated.slice(KEEP_MIN).filter(x => x.d < cutoff).map(x => x.n);
}
