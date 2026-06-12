const MAX_LEVELS = 5;

function toEngineLevels(levels) {
  const out = [];
  for (let i = 0; i < Math.min(levels.length, MAX_LEVELS); i++) {
    out.push({ price: levels[i].price || 0, quantity: levels[i].quantity || 0 });
  }
  return out;
}

export function toEngineQuote(marketQuote) {
  const bid = toEngineLevels(marketQuote.depth?.buy || []);
  const ask = toEngineLevels(marketQuote.depth?.sell || []);
  return {
    ltp: marketQuote.ltp || 0,
    volume: marketQuote.volume || 0,
    bid,
    ask,
    bidLevels: bid.length,
    askLevels: ask.length,
    timestampMs: marketQuote.timestampMs || Date.now(),
  };
}

export function decodeFeedQuote(feed) {
  const ff = feed?.fullFeed?.marketFF || feed?.fullFeed?.indexFF;
  if (!ff) return null;

  const ltpc = ff.ltpc || {};
  const level = ff.marketLevel?.bidAskQuote || [];
  const ohlcList = ff.marketOHLC?.ohlc || [];
  const dayOhlc = ohlcList.find((o) => o.interval === '1d') || ohlcList[0] || {};

  const buy = level.slice(0, MAX_LEVELS).map((q) => ({
    price: q.bidP || 0,
    quantity: Number(q.bidQ || 0),
  }));
  const sell = level.slice(0, MAX_LEVELS).map((q) => ({
    price: q.askP || 0,
    quantity: Number(q.askQ || 0),
  }));

  return {
    ltp: ltpc.ltp || 0,
    open: dayOhlc.open || 0,
    high: dayOhlc.high || 0,
    low: dayOhlc.low || 0,
    close: ltpc.cp || dayOhlc.close || 0,
    volume: Number(ff.vtt || dayOhlc.vol || 0),
    oi: Number(ff.oi || 0),
    depth: { buy, sell },
    timestampMs: Number(feed?.currentTs || Date.now()),
  };
}
