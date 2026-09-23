// India has a fixed UTC+05:30 offset. 03:00 IST is 21:30 UTC on the previous date.
export function nextMaintenanceRun(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(21, 30, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// A single timer in the existing web process, not a new worker or paid job.
// Recursion schedules only after completion, preventing in-process overlaps.
export function startMaintenanceTimer(tick: () => Promise<unknown>, initialDelay = 30000, interval = 60000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      try { await tick(); }
      catch { console.error('Reporter maintenance check failed; will retry. No personal data is logged.'); }
      finally { if (!stopped) schedule(interval); }
    }, delay);
    timer.unref();
  };
  schedule(initialDelay);
  return () => { stopped = true; clearTimeout(timer); };
}
