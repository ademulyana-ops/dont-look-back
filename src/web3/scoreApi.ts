export interface StartedRun {
  sessionId: string;
}

export interface SignedRun {
  timeMs: number;
  signature: string;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export function startRun(address: string): Promise<StartedRun> {
  return postJson('/api/start', { address });
}

export function reportKeyProgress(
  sessionId: string,
  insertedCount: number
): Promise<{ insertedCount: number }> {
  return postJson('/api/progress', { sessionId, insertedCount });
}

export function finishRun(
  sessionId: string,
  insertedCount: number
): Promise<SignedRun> {
  return postJson('/api/finish', { sessionId, insertedCount });
}
