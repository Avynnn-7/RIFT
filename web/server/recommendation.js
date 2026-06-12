export function buildRecommendation(result) {
  const score = result.toxicScore;
  const crash = result.crashRisk;
  const vpin = result.vpin;
  const ofi = result.ofi;
  const lambda = result.kyleLambda;
  const pin = result.pin;

  if (score <= 25) {
    return {
      label: 'SAFE',
      action: 'Normal market conditions. No signs of informed flow.',
      details: 'Order flow is balanced. Standard position sizing is appropriate.',
      toxicScore: score,
      crashRisk: crash,
    };
  }
  if (score <= 50) {
    return {
      label: 'CAUTION',
      action: 'Mixed signals. Some unusual activity detected.',
      details: `Order flow shows ${ofi > 0 ? 'buy' : 'sell'} side pressure. Reduce size and tighten stops.`,
      toxicScore: score,
      crashRisk: crash,
    };
  }
  if (score <= 70) {
    return {
      label: 'TOXIC',
      action: 'Significant toxic flow. Informed participants likely active.',
      details: `VPIN at ${(vpin * 100).toFixed(1)}%. Price impact is ${lambda > 2 ? 'high' : 'moderate'}. Avoid new positions.`,
      toxicScore: score,
      crashRisk: crash,
    };
  }
  if (score <= 85) {
    return {
      label: 'DANGER',
      action: 'Extreme toxic flow. High adverse selection risk.',
      details: `PIN estimate ${(pin * 100).toFixed(1)}%. Flow is heavily skewed. Exit positions; stop-loss slippage risk is high.`,
      toxicScore: score,
      crashRisk: crash,
    };
  }
  return {
    label: 'CRASH RISK',
    action: 'Critical: flash-crash conditions detected.',
    details: 'VPIN at extreme levels and liquidity contracting. Exit exposure.',
    toxicScore: score,
    crashRisk: crash,
  };
}
