import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisSnapshot, ServerMessage, Transport } from '../types/contracts';

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

interface ConnectionState {
  connected: boolean;
  transport: Transport | 'disconnected';
  engine: string;
}

type SnapshotHandler = (symbol: string, snapshot: AnalysisSnapshot) => void;

const HTTP_POLL_MS = 2000;
const MAX_RECONNECT = 5;

export function useWebSocket(onSnapshot: SnapshotHandler) {
  const [state, setState] = useState<ConnectionState>({
    connected: false,
    transport: 'disconnected',
    engine: 'unknown',
  });

  const socketRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onSnapshot);

  const subscriptions = useRef<Map<string, string>>(new Map());
  const reconnectCount = useRef(0);
  const httpFallback = useRef(false);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const connectRef = useRef<() => void>(() => {});

  const pollOnce = useCallback(async (symbol: string, exchange: string) => {
    try {
      const res = await fetch(
        `/api/toxic-flow?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`
      );
      const json = await res.json();
      if (json.success) {
        handlerRef.current(symbol, json as AnalysisSnapshot);
      }
    } catch {
      /* transient fetch error */
    }
  }, []);

  const startPoll = useCallback(
    (symbol: string, exchange: string) => {
      const key = `${symbol}:${exchange}`;
      if (pollTimers.current.has(key)) return;
      pollOnce(symbol, exchange);
      pollTimers.current.set(key, setInterval(() => pollOnce(symbol, exchange), HTTP_POLL_MS));
    },
    [pollOnce]
  );

  const stopPoll = useCallback((symbol: string, exchange: string) => {
    const key = `${symbol}:${exchange}`;
    const timer = pollTimers.current.get(key);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(key);
    }
  }, []);

  const stopAllPolls = useCallback(() => {
    for (const timer of pollTimers.current.values()) clearInterval(timer);
    pollTimers.current.clear();
  }, []);

  const connect = useCallback(() => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      httpFallback.current = true;
      setState((s) => ({ ...s, connected: false, transport: 'http-poll' }));
      for (const [symbol, exchange] of subscriptions.current) startPoll(symbol, exchange);
      return;
    }

    socket.onopen = () => {
      reconnectCount.current = 0;
      httpFallback.current = false;
      stopAllPolls();
      setState((s) => ({ ...s, connected: true, transport: 'websocket' }));
      if (subscriptions.current.size > 0) {
        const symbols = [...subscriptions.current.entries()].map(([symbol, exchange]) => ({
          symbol,
          exchange,
        }));
        socket.send(JSON.stringify({ type: 'subscribe', symbols }));
      }
    };

    socket.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'update') {
        handlerRef.current(msg.symbol, msg.data);
      } else if (msg.type === 'connected') {
        setState((s) => ({ ...s, engine: msg.engine }));
      }
    };

    socket.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      if (reconnectCount.current < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectCount.current, 8000);
        reconnectCount.current += 1;
        setTimeout(() => connectRef.current(), delay);
      } else {
        httpFallback.current = true;
        setState((s) => ({ ...s, transport: 'http-poll' }));
        for (const [symbol, exchange] of subscriptions.current) startPoll(symbol, exchange);
      }
    };

    socket.onerror = () => {};
    socketRef.current = socket;
  }, [startPoll, stopAllPolls]);

  useEffect(() => {
    handlerRef.current = onSnapshot;
    connectRef.current = connect;
  });

  const subscribe = useCallback(
    (symbol: string, exchange = 'NSE_EQ') => {
      subscriptions.current.set(symbol, exchange);
      if (httpFallback.current) {
        startPoll(symbol, exchange);
        return;
      }
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'subscribe', symbols: [{ symbol, exchange }] }));
      }
    },
    [startPoll]
  );

  const unsubscribe = useCallback(
    (symbol: string, exchange = 'NSE_EQ') => {
      subscriptions.current.delete(symbol);
      stopPoll(symbol, exchange);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'unsubscribe', symbols: [symbol], exchange }));
      }
    },
    [stopPoll]
  );

  useEffect(() => {
    const timer = setTimeout(() => connectRef.current(), 0);
    return () => {
      clearTimeout(timer);
      stopAllPolls();
      socketRef.current?.close();
    };
  }, [stopAllPolls]);

  return { state, subscribe, unsubscribe };
}
