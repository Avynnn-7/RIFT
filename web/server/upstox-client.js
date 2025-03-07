const INDEX_INSTRUMENTS = {
  NIFTY: 'NSE_INDEX|Nifty 50',
  BANKNIFTY: 'NSE_INDEX|Nifty Bank',
  FINNIFTY: 'NSE_INDEX|Nifty Fin Service',
  MIDCPNIFTY: 'NSE_INDEX|NIFTY MID SELECT',
  SENSEX: 'BSE_INDEX|SENSEX',
  BANKEX: 'BSE_INDEX|BANKEX',
};

const API_HOST = 'https://api.upstox.com';

function bearer(token) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

async function upstoxFetch(endpoint, token, version = 'v2') {
  const res = await fetch(`${API_HOST}/${version}${endpoint}`, {
    headers: { Authorization: bearer(token), Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstox API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function resolveInstrumentKey(symbol, exchange, token) {
  if (exchange === 'NSE_INDEX' || exchange === 'BSE_INDEX') {
    const key = INDEX_INSTRUMENTS[symbol];
    if (key) return key;
    throw new Error(`Unknown index: ${symbol}`);
  }

  const exch = exchange === 'BSE_EQ' ? 'BSE' : 'NSE';
  const endpoint = `/instruments/search?query=${encodeURIComponent(symbol)}&exchanges=${exch}&segments=EQ&records=5`;
  const data = await upstoxFetch(endpoint, token);
  const results = data?.data || [];
  if (results.length === 0) {
    throw new Error(`No instrument found for ${symbol} on ${exchange}.`);
  }
  const exact = results.find(
    (r) =>
      r.trading_symbol?.toUpperCase() === symbol.toUpperCase() ||
      r.name?.toUpperCase() === symbol.toUpperCase()
  );
  return (exact || results[0]).instrument_key;
}

export async function searchInstruments(query, token, exchangeFilter) {
  if (!query || query.length < 1) return [];
  let params = `query=${encodeURIComponent(query)}&segments=EQ&records=15`;
  if (exchangeFilter === 'NSE' || exchangeFilter === 'NSE_EQ') params += '&exchanges=NSE';
  else if (exchangeFilter === 'BSE' || exchangeFilter === 'BSE_EQ') params += '&exchanges=BSE';

  const data = await upstoxFetch(`/instruments/search?${params}`, token);
  return (data?.data || []).map((r) => ({
    symbol: r.trading_symbol,
    name: r.name,
    exchange: r.segment || r.exchange || 'NSE_EQ',
    instrumentKey: r.instrument_key,
    instrumentType: r.instrument_type || 'EQ',
  }));
}

function mapDepth(levels) {
  return (levels || []).map((l) => ({
    price: l.price || 0,
    quantity: l.quantity || 0,
    orders: l.orders || 0,
  }));
}

export function normalizeRestQuote(raw) {
  return {
    ltp: raw.last_price || raw.ohlc?.close || 0,
    open: raw.ohlc?.open || 0,
    high: raw.ohlc?.high || 0,
    low: raw.ohlc?.low || 0,
    close: raw.ohlc?.close || 0,
    volume: raw.volume || 0,
    oi: raw.oi || 0,
    depth: {
      buy: mapDepth(raw.depth?.buy),
      sell: mapDepth(raw.depth?.sell),
    },
    timestampMs: Date.now(),
  };
}

export async function fetchQuoteWithDepth(instrumentKey, token) {
  const data = await upstoxFetch(
    `/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
    token
  );
  const quote = Object.values(data?.data || {})[0];
  if (!quote) throw new Error('No quote data returned');
  return normalizeRestQuote(quote);
}

export async function authorizeMarketFeed(token) {
  const res = await fetch(`${API_HOST}/v3/feed/market-data-feed/authorize`, {
    headers: { Authorization: bearer(token), Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feed authorize ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.data?.authorizedRedirectUri;
  if (!url) throw new Error('No authorized WebSocket URL returned');
  return url;
}
