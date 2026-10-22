/**
 * Runs once when the Next.js server starts. Starts the nightly scheduler (a 30 second tick) in the Node.js runtime
 * only; the edge runtime has no file system or child processes.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test') return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
