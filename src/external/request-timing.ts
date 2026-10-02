export type TimedExternalAttempt<T> =
  | {
      ok: true;
      value: T;
      startedAt: string;
      finishedAt: string;
      durationMs: number;
    }
  | {
      ok: false;
      error: unknown;
      startedAt: string;
      finishedAt: string;
      durationMs: number;
    };

export async function measureExternalAttempt<T>(
  loader: () => Promise<T>,
  now: () => number = Date.now,
): Promise<TimedExternalAttempt<T>> {
  const startedMs = now();
  const startedAt = new Date(startedMs).toISOString();

  try {
    const value = await loader();

    const finishedMs = now();

    return {
      ok: true,
      value,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: Math.max(0, finishedMs - startedMs),
    };
  } catch (error) {
    const finishedMs = now();

    return {
      ok: false,
      error,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: Math.max(0, finishedMs - startedMs),
    };
  }
}
