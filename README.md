# RIFT — Real-Time Informed Flow Tracker

## 1. Project Overview

RIFT is a market-microstructure analytics system that estimates the toxicity of
order flow and the short-horizon risk of liquidity dislocation for a traded
instrument. It consumes Level-2 quote and trade data, maintains a set of
online microstructure estimators, and produces a continuously updated vector of
microstructure statistics together with two bounded composite indicators: a
flow-toxicity score and a crash-risk score.

The system is organized into two strictly separated layers. The numerical layer
(`engine/`) is a header-only C++17 library that contains all estimation and
aggregation logic and is compiled both natively and to WebAssembly. The service
layer (`web/`) handles data acquisition, transport, and presentation, and
contains no analytics.

## 2. Mathematical Objective

Let the observable state at update $t$ be a quote
$q_t = (p_t, V_t, \{(b_i, q^b_i)\}, \{(a_i, q^a_i)\}, \tau_t)$ consisting of the
last traded price $p_t$, cumulative traded volume $V_t$, up to five bid and ask
levels, and an exchange timestamp $\tau_t$.

The objective is to estimate, recursively and in $O(1)$ amortized time per
update, a set of latent microstructure quantities that characterize the
information content and fragility of the current order flow:

- the probability that volume is imbalanced toward informed traders (VPIN, PIN),
- the price impact of order flow (Kyle's $\lambda$),
- illiquidity per unit of traded value (Amihud),
- order-flow pressure at the top of book (OFI),
- temporal clustering of events (Hawkes intensity),

and to map these onto two bounded indicators
$\text{toxic} \in \{0,\dots,100\}$ and $\text{crash} \in \{0,\dots,100\}$.

## 3. Methodology

### 3.1 Volume clock and bar construction

Estimators that depend on a notion of "trade activity" are computed on a
**volume clock** rather than a wall-clock interval. Incoming volume is
accumulated until a fixed threshold $V^\*$ (the bar volume) is reached, at which
point a volume bar is emitted. Sampling in volume time stabilizes the
distribution of price increments and is the sampling scheme under which VPIN is
defined (Easley, López de Prado, O'Hara, 2012). The threshold is calibrated
once from observed traded volume.

### 3.2 Bulk volume classification

Trade-level buy/sell labels are not available, so signed volume is estimated by
**bulk volume classification** (BVC). For a volume increment $\Delta V_t$ with
mid-price change $\Delta m_t$, the buy fraction is

$$
f^{\text{buy}}_t = \Phi\!\left(\frac{\Delta m_t}{\sigma_t}\right),
\qquad
V^{\text{buy}}_t = \Delta V_t \, f^{\text{buy}}_t,
\quad
V^{\text{sell}}_t = \Delta V_t \,(1 - f^{\text{buy}}_t),
$$

where $\Phi$ is the standard normal CDF and $\sigma_t$ is the standard deviation
of mid-price increments. $\sigma_t$ is tracked by an exponentially weighted
variance estimator and floored at a fraction of the prevailing spread (or the
minimum tick) to prevent division instability in quiescent periods. This is the
Gaussian BVC scheme of Easley, López de Prado, O'Hara (2012, 2016);
$\Phi$ is evaluated with the Abramowitz–Stegun rational approximation.

### 3.3 VPIN

The per-bar order imbalance is $|V^{\text{buy}} - V^{\text{sell}}| / V^\*$.
VPIN is the mean imbalance over a rolling window of $n$ bars:

$$
\text{VPIN}_t = \frac{1}{n}\sum_{k=t-n+1}^{t}
\frac{\left|V^{\text{buy}}_k - V^{\text{sell}}_k\right|}{V^\*}.
$$

**Quantity estimated:** the expected fraction of volume originating from
informed (one-sided) trading. **Assumption:** volume-time sampling produces
bars of approximately equal information content.

### 3.4 Order flow imbalance (OFI)

Top-of-book order flow imbalance follows Cont, Kukanov, Stoikov (2014). For
consecutive best quotes the bid and ask contributions are

$$
e^b_t =
\begin{cases}
q^b_t & p^b_t > p^b_{t-1}\\
q^b_t - q^b_{t-1} & p^b_t = p^b_{t-1}\\
-q^b_{t-1} & p^b_t < p^b_{t-1}
\end{cases}
\qquad
e^a_t =
\begin{cases}
-q^a_{t-1} & p^a_t > p^a_{t-1}\\
q^a_t - q^a_{t-1} & p^a_t = p^a_{t-1}\\
q^a_t & p^a_t < p^a_{t-1}
\end{cases}
$$

The raw event is $\text{OFI}_t = e^b_t - e^a_t$, normalized by half the top-of-book
depth and clipped to $[-1, 1]$, then exponentially smoothed. **Quantity
estimated:** net signed pressure of limit-order activity at the best quotes.

### 3.5 Kyle's lambda

Price impact is estimated from the linear model of Kyle (1985),

$$
\Delta m_t = \lambda \, x_t + \varepsilon_t,
\qquad
x_t = V^{\text{buy}}_t - V^{\text{sell}}_t,
$$

where $x_t$ is signed order flow. $\lambda$ is the regression slope, estimated
by an exponentially weighted recursive least-squares update (a decayed Welford
covariance accumulator with decay $\gamma = 0.98$), so that the estimate adapts
to regime changes without storing history. The slope is reported only after the
effective sample size exceeds a minimum. **Quantity estimated:** marginal
permanent price impact per unit of signed flow.

### 3.6 Amihud illiquidity

Following Amihud (2002), illiquidity is the absolute return per unit of traded
value:

$$
\text{ILLIQ}_t = \frac{|r_t|}{p_t \,\Delta V_t}\,\kappa,
\qquad r_t = \frac{p_t - p_{t-1}}{p_{t-1}},
$$

with a fixed scale $\kappa = 10^6$. The series is exponentially smoothed; the
unsmoothed instantaneous value is retained for spike detection in the crash
indicator. **Quantity estimated:** price sensitivity to traded value.

### 3.7 Hawkes intensity

Event clustering is modeled by a self-exciting Hawkes process (Hawkes, 1971)
with a single exponential kernel:

$$
\lambda(t) = \mu + \sum_{t_i < t} \alpha \, e^{-\beta (t - t_i)}.
$$

Between events the intensity decays toward the baseline $\mu$; each event adds
$\alpha$. The conditional intensity is propagated recursively from the
inter-event time $\Delta t$. The branching ratio is $n = \alpha/\beta$. A
bounded clustering measure is reported as the normalized excess intensity
$\max(0, \min(1, (\lambda - \mu)/\mu))$. **Quantity estimated:** the degree of
temporal self-excitation in the event stream.

### 3.8 PIN

The probability of informed trading is estimated under the sequential trade
model of Easley, Kiefer, O'Hara, Paperman (1996). On each period an information
event occurs with probability $\alpha$; conditional on an event, the signal is
bad with probability $\delta$. Uninformed buys and sells arrive as independent
Poisson processes with rates $\varepsilon_b, \varepsilon_s$; informed traders
add rate $\mu$ on the informed side. For observed buy/sell counts $(B, S)$ the
likelihood per period is the three-component mixture

$$
\mathcal{L}(B,S) =
(1-\alpha)\,P_b P_s
+ \alpha\delta\, P_b\, \tilde P_s
+ \alpha(1-\delta)\, \tilde P_b\, P_s,
$$

with Poisson factors $P_\cdot$ at the uninformed rates and $\tilde P_\cdot$ at
the informed-augmented rates. Parameters
$\theta = (\alpha, \delta, \mu, \varepsilon_b, \varepsilon_s)$ are obtained by
maximum likelihood over a rolling window using the Easley factorization with the
log-sum-exp transform for numerical stability, optimized by Nelder–Mead from a
grid of starting points. The reported quantity is

$$
\text{PIN} = \frac{\alpha\mu}{\alpha\mu + \varepsilon_b + \varepsilon_s}.
$$

**Assumptions:** stationary Poisson arrivals within the estimation window and
independence of buy/sell uninformed flow. **Distinction from theory:** the
optimizer is a bounded-iteration derivative-free search on a short window, so
the estimate is a windowed approximation to the MLE rather than a global
optimum.

### 3.9 Composite indicators

The microstructure features are combined through fixed-coefficient logistic
links. Each feature $x_i$ is scaled to a reference level and clamped to $[0,1]$,
and the score is

$$
\text{score} = \left\lfloor 100 \cdot
\sigma\!\Big(\beta_0 + \textstyle\sum_i \beta_i x_i\Big)
\right\rceil,
\qquad \sigma(u) = \frac{1}{1+e^{-u}}.
$$

The toxicity score aggregates VPIN, OFI, $\lambda$, Amihud, Hawkes clustering,
PIN, and spread. The crash-risk score aggregates the empirical percentile of
the current VPIN (from an online histogram), the spread, and the Amihud spike
ratio relative to its smoothed baseline. **Distinction from theory:** the
coefficients $\beta_i$ are fixed expert weights, not parameters estimated from
labeled outcomes; the scores are monotone aggregators, not calibrated
probabilities.

## 4. Key Assumptions

- Sampling in volume time yields bars of comparable information content.
- Signed volume can be inferred from standardized mid-price increments (BVC);
  no trade-level aggressor flag is required.
- Mid-price increments are approximately Gaussian conditional on $\sigma_t$ for
  the purpose of classification.
- Price impact is linear in signed order flow over the estimation window
  (Kyle).
- Order arrivals are locally Poisson and buy/sell uninformed flows are
  independent within the PIN window.
- Event clustering is captured by a single-exponential Hawkes kernel with fixed
  $(\mu, \alpha, \beta)$.
- Estimator parameters (windows, decays, kernel constants, score weights) are
  configuration inputs, not learned online.

## 5. System Workflow

```
market data ─▶ quote normalization ─▶ engine.process(quote)
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                               ▼
   volume clock + BVC            top-of-book OFI               recursive estimators
   (bars, VPIN, PIN)                                       (Kyle, Amihud, Hawkes)
            └─────────────────────────────┼─────────────────────────────┘
                                          ▼
                          logistic aggregation (toxic, crash)
                                          ▼
                         AnalysisResult ─▶ transport ─▶ client
```

Each quote drives a single synchronous pass through the engine. Estimators
update in place from their prior sufficient statistics; only bar history, the
VPIN window, the PIN window, and the VPIN histogram retain bounded buffers. The
result vector is serialized and pushed to subscribers over a streaming
transport, with a polling path as fallback.

## 6. Technical Overview (Brief)

- **Engine:** header-only C++17 (`namespace rift`), one class per estimator,
  fixed-width integer counts, no dynamic allocation in the hot path. Ring
  buffers have power-of-two capacity for masked indexing. The same source is
  compiled natively for testing and to WebAssembly via a C-ABI binding that
  exchanges fixed-offset `double` buffers.
- **Service:** a Node.js process loads the WebAssembly module, maintains one
  engine session per subscribed instrument, ingests market data, and serves
  results over WebSocket/HTTP. A browser client renders the result vector.
- **Computational considerations:** all estimators are recursive and amortized
  $O(1)$ per update except the PIN MLE, which runs a bounded Nelder–Mead search
  over a short window when a bar completes; transcendental functions use bounded
  rational or clamped approximations to avoid overflow.

## 7. Limitations

- BVC is a statistical proxy for true aggressor classification and degrades when
  mid-price increments are non-Gaussian or near zero.
- Kyle's $\lambda$ assumes linear impact and is sensitive to the decay constant;
  it is a local, adaptive estimate, not a structural calibration.
- PIN is estimated on a short rolling window with a local optimizer; convergence
  to the global MLE is not guaranteed and estimates are noisy for sparse flow.
- The Hawkes kernel is fixed and single-exponential; it does not adapt $\mu$,
  $\alpha$, or $\beta$ to the data and cannot represent multi-scale excitation.
- The composite scores use fixed weights and are not probability-calibrated
  against realized toxicity or crash events.
- Depth-derived features use up to five levels; behavior beyond the visible book
  is not modeled.

## 8. References

- Amihud, Y. (2002). *Illiquidity and stock returns: cross-section and
  time-series effects.* Journal of Financial Markets, 5(1).
- Cont, R., Kukanov, A., Stoikov, S. (2014). *The price impact of order book
  events.* Journal of Financial Econometrics, 12(1).
- Easley, D., Kiefer, N., O'Hara, M., Paperman, J. (1996). *Liquidity,
  information, and infrequently traded stocks.* Journal of Finance, 51(4).
- Easley, D., López de Prado, M., O'Hara, M. (2012). *Flow toxicity and
  liquidity in a high-frequency world.* Review of Financial Studies, 25(5).
- Easley, D., López de Prado, M., O'Hara, M. (2016). *Discerning information
  from trade data.* Journal of Financial Economics, 120(2).
- Hawkes, A. G. (1971). *Spectra of some self-exciting and mutually exciting
  point processes.* Biometrika, 58(1).
- Kyle, A. S. (1985). *Continuous auctions and insider trading.* Econometrica,
  53(6).
