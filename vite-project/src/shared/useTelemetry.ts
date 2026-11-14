import { useEffect, useState } from 'react';
import type { TelemetrySnapshot } from './telemetry';
import { apiURL } from './config';

export function useTelemetry(gameId: string, token: string) {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stopped = false, running = false;
    const controller = new AbortController();
    setSnapshot(undefined); setError('');
    async function poll() {
      if (running || stopped || !token) return;
      running = true;
      try {
        const response = await fetch(`${apiURL}/api/telemetry?gameId=${encodeURIComponent(gameId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error(response.status === 401 ? 'Access rejected' : 'Game data unavailable');
        const data: TelemetrySnapshot = await response.json();
        if (!stopped) { setSnapshot(data); setError(''); }
      } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : 'Game data unavailable'); }
      finally { running = false; }
    }
    void poll(); const timer = setInterval(() => void poll(), 2000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [gameId, token, version]);
  return { snapshot, error, refresh: () => setVersion(previous => previous + 1) };
}
