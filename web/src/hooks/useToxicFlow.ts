import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisSnapshot } from '../types/contracts';

const POLL_INTERVAL_MS = 1500;

interface Options {
  symbol: string;
  exchange?: string;
  enabled?: boolean;
}

interface ToxicFlowState {
  data: AnalysisSnapshot | null;
  error: string | null;
  loading: boolean;
}

export function useToxicFlow({ symbol, exchange = 'NSE_EQ', enabled = true }: Options) {
  const [state, setState] = useState<ToxicFlowState>({ data: null, error: null, loading: false });
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!symbol) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `/api/toxic-flow?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`,
        { signal: controller.signal }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setState((s) => ({ ...s, error: json.error || `HTTP ${res.status}`, loading: false }));
        return;
      }
      setState({ data: json as AnalysisSnapshot, error: null, loading: false });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState((s) => ({ ...s, error: (err as Error).message, loading: false }));
    }
  }, [symbol, exchange]);

  useEffect(() => {
    if (!enabled || !symbol) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    fetchData();
    const timer = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [symbol, exchange, enabled, fetchData]);

  return state;
}
