import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import dotenv from 'dotenv';
import protobuf from 'protobufjs';
import { WebSocketServer, WebSocket } from 'ws';

import { loadEngine, isEngineLoaded } from './engine/index.js';
import {
  resolveInstrumentKey,
  searchInstruments,
  fetchQuoteWithDepth,
  authorizeMarketFeed,
} from './upstox-client.js';
import { decodeFeedQuote } from './quote-adapter.js';
import {
  ensureState,
  getState,
  forEachState,
  processMarketQuote,
} from './analysis-service.js';
import { POLL_FALLBACK_MS, FEED_RECONNECT_MS } from './config.js';

dotenv.config();

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, '..', 'dist');
const protoPath = join(here, 'proto', 'MarketDataFeedV3.proto');
const PORT = process.env.PORT || 3001;

function token() {
  return process.env.UPSTOX_ACCESS_TOKEN || null;
}

const instrumentKeyCache = new Map();

async function resolveAndCache(symbol, exchange) {
  const k = `${symbol}:${exchange}`;
  if (instrumentKeyCache.has(k)) return instrumentKeyCache.get(k);
  const t = token();
  if (!t) throw new Error('UPSTOX_ACCESS_TOKEN is not configured');
  const instrumentKey = await resolveInstrumentKey(symbol, exchange, t);
  instrumentKeyCache.set(k, instrumentKey);
  return instrumentKey;
}

let FeedResponse = null;
async function loadProtoSchema() {
  const root = await protobuf.load(protoPath);
  FeedResponse = root.lookupType(
    'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse'
  );
}

let feedWs = null;
let feedConnected = false;
let feedReconnectTimer = null;
const subscribedKeys = new Set();

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(state, snapshot) {
  for (const client of state.subscribers) {
    safeSend(client, { type: 'update', symbol: state.symbol, exchange: state.exchange, data: snapshot });
  }
}

function pushQuote(instrumentKey, marketQuote, transport) {
  if (!marketQuote || marketQuote.ltp <= 0) return;
  forEachState((state) => {
    if (state.instrumentKey !== instrumentKey || state.subscribers.size === 0) return;
    const snapshot = processMarketQuote(state, marketQuote, transport);
    broadcast(state, snapshot);
  });
}

function handleFeedMessage(raw) {
  if (!(raw instanceof ArrayBuffer || Buffer.isBuffer(raw)) || !FeedResponse) return;
  let feedObj;
  try {
    const decoded = FeedResponse.decode(new Uint8Array(raw));
    feedObj = FeedResponse.toObject(decoded, { longs: Number, defaults: true });
  } catch {
    return;
  }
  if (!feedObj.feeds) return;
  for (const [instrumentKey, feed] of Object.entries(feedObj.feeds)) {
    const marketQuote = decodeFeedQuote(feed);
    if (marketQuote) pushQuote(instrumentKey, marketQuote, 'websocket');
  }
}

function subscribeFeed(instrumentKeys) {
  for (const k of instrumentKeys) subscribedKeys.add(k);
  if (!feedWs || feedWs.readyState !== WebSocket.OPEN) return;
  const message = JSON.stringify({
    guid: `rift-${Date.now()}`,
    method: 'sub',
    data: { mode: 'full_d5', instrumentKeys },
  });
  feedWs.send(Buffer.from(message));
}

function scheduleFeedReconnect() {
  if (feedReconnectTimer) return;
  feedReconnectTimer = setTimeout(() => {
    feedReconnectTimer = null;
    connectFeed();
  }, FEED_RECONNECT_MS);
}

async function connectFeed() {
  const t = token();
  if (!t) return;
  try {
    const url = await authorizeMarketFeed(t);
    feedWs = new WebSocket(url, { followRedirects: true });
    feedWs.binaryType = 'arraybuffer';

    feedWs.on('open', () => {
      feedConnected = true;
      if (subscribedKeys.size > 0) subscribeFeed([...subscribedKeys]);
    });
    feedWs.on('message', (data) => {
      try {
        handleFeedMessage(data);
      } catch {
        /* ignore malformed frame */
      }
    });
    feedWs.on('close', () => {
      feedConnected = false;
      feedWs = null;
      scheduleFeedReconnect();
    });
    feedWs.on('error', () => {});
  } catch {
    feedConnected = false;
    scheduleFeedReconnect();
  }
}

let pollTimer = null;
function startPollFallback() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (feedConnected) return;
    const active = [];
    forEachState((state) => {
      if (state.subscribers.size > 0) active.push(state);
    });
    if (active.length === 0) return;
    const t = token();
    if (!t) return;
    for (const state of active) {
      const marketQuote = await fetchQuoteWithDepth(state.instrumentKey, t).catch(() => null);
      if (!marketQuote) continue;
      const snapshot = processMarketQuote(state, marketQuote, 'http-poll');
      broadcast(state, snapshot);
    }
  }, POLL_FALLBACK_MS);
}

const app = express();
app.use(express.static(staticDir));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    engine: isEngineLoaded() ? 'wasm' : 'unavailable',
    feed: feedConnected ? 'connected' : 'disconnected',
    clients: wss?.clients?.size || 0,
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/search', async (req, res) => {
  const { q, exchange } = req.query;
  if (!q) return res.json({ success: true, results: [] });
  const t = token();
  if (!t) return res.status(500).json({ success: false, error: 'Token not configured' });
  try {
    const results = await searchInstruments(String(q), t, exchange);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/quote', async (req, res) => {
  const { symbol, exchange = 'NSE_EQ' } = req.query;
  if (!symbol) return res.status(400).json({ success: false, error: 'symbol required' });
  const t = token();
  if (!t) return res.status(500).json({ success: false, error: 'Token not configured' });
  try {
    const upper = String(symbol).toUpperCase();
    const instrumentKey = await resolveAndCache(upper, String(exchange));
    const quote = await fetchQuoteWithDepth(instrumentKey, t);
    res.json({ success: true, symbol: upper, exchange, ...quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/toxic-flow', async (req, res) => {
  const { symbol, exchange = 'NSE_EQ' } = req.query;
  if (!symbol) return res.status(400).json({ success: false, error: 'symbol required' });
  const t = token();
  if (!t) return res.status(500).json({ success: false, error: 'Token not configured' });
  try {
    const upper = String(symbol).toUpperCase();
    const instrumentKey = await resolveAndCache(upper, String(exchange));
    const quote = await fetchQuoteWithDepth(instrumentKey, t);
    const state = ensureState(upper, String(exchange), instrumentKey);
    const snapshot = processMarketQuote(state, quote, 'http-poll');
    res.json({ success: true, ...snapshot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(staticDir, 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let clientId = 0;

async function subscribeClient(ws, symbol, exchange) {
  try {
    const instrumentKey = await resolveAndCache(symbol, exchange);
    const state = ensureState(symbol, exchange, instrumentKey);
    state.subscribers.add(ws);
    if (feedConnected) subscribeFeed([instrumentKey]);
    else subscribedKeys.add(instrumentKey);
    if (state.lastSnapshot) {
      safeSend(ws, { type: 'update', symbol, exchange, data: state.lastSnapshot });
    }
    return true;
  } catch (err) {
    safeSend(ws, { type: 'error', symbol, message: err.message });
    return false;
  }
}

function unsubscribeClient(ws, symbol, exchange) {
  const state = getState(symbol, exchange);
  if (state) state.subscribers.delete(ws);
}

function dropClient(ws) {
  forEachState((state) => state.subscribers.delete(ws));
}

wss.on('connection', (ws) => {
  const id = ++clientId;
  safeSend(ws, {
    type: 'connected',
    id,
    engine: isEngineLoaded() ? 'wasm' : 'unavailable',
    serverTimeMs: Date.now(),
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return safeSend(ws, { type: 'error', message: 'Invalid JSON' });
    }
    switch (msg.type) {
      case 'subscribe': {
        const subscribed = [];
        for (const s of msg.symbols || []) {
          const ok = await subscribeClient(ws, s.symbol, s.exchange || 'NSE_EQ');
          if (ok) subscribed.push(s.symbol);
        }
        safeSend(ws, { type: 'subscribed', symbols: subscribed });
        startPollFallback();
        break;
      }
      case 'unsubscribe': {
        for (const s of msg.symbols || []) {
          unsubscribeClient(ws, s, msg.exchange || 'NSE_EQ');
        }
        safeSend(ws, { type: 'unsubscribed', symbols: msg.symbols || [] });
        break;
      }
      default:
        safeSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => dropClient(ws));
  ws.on('error', () => {});

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

async function startup() {
  await loadEngine();
  await loadProtoSchema();
  await connectFeed();
  startPollFallback();
  server.listen(PORT, () => {
    process.stdout.write(`RIFT server listening on ${PORT}\n`);
  });
}

startup().catch((err) => {
  process.stderr.write(`Startup failed: ${err.message}\n`);
  process.exit(1);
});
