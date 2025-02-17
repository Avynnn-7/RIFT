#pragma once

#include <algorithm>
#include <chrono>
#include <cstdint>

#include "rift/amihud_calculator.hpp"
#include "rift/hawkes_process.hpp"
#include "rift/kyle_lambda.hpp"
#include "rift/ofi_calculator.hpp"
#include "rift/online_histogram.hpp"
#include "rift/pin_estimator.hpp"
#include "rift/scorer.hpp"
#include "rift/types.hpp"
#include "rift/volume_bar_engine.hpp"
#include "rift/volume_classifier.hpp"

namespace rift {

constexpr int kVpinHistogramBins = 32;

struct EngineConfig {
    std::int64_t bar_volume = 5000;
    int vpin_window = 50;

    double volatility_alpha = 2.0 / 51.0;
    double sigma_floor_fraction = 0.25;
    double min_tick_size = 0.01;

    double ofi_alpha = 2.0 / 31.0;
    double amihud_alpha = 2.0 / 51.0;
    double amihud_scale = 1e6;

    double kyle_decay = 0.98;
    double kyle_min_samples = 5.0;

    double hawkes_mu = 0.5;
    double hawkes_alpha = 0.08;
    double hawkes_beta = 0.1;

    int pin_window = 50;
    int pin_min_periods = 15;

    int signal_clear_below = 30;
    int signal_caution_below = 60;

    ToxicScoreConfig toxic_score;
    CrashRiskConfig crash_risk;
};

class RiftEngine {
public:
    void reset(const EngineConfig& config = EngineConfig()) {
        config_ = config;

        classifier_.reset(config.volatility_alpha, config.sigma_floor_fraction,
                          config.min_tick_size);
        bars_.reset(config.bar_volume, config.vpin_window);
        ofi_.reset(config.ofi_alpha);
        amihud_.reset(config.amihud_alpha, config.amihud_scale);
        kyle_.reset(config.kyle_decay, config.kyle_min_samples);
        hawkes_.reset(config.hawkes_mu, config.hawkes_alpha, config.hawkes_beta);
        pin_.reset(config.pin_window, config.pin_min_periods);
        scorer_.reset(config.toxic_score, config.crash_risk);
        vpin_histogram_.reset(0.0, 1.0);

        has_last_mid_ = false;
        last_mid_ = 0.0;
        update_count_ = 0;
    }

    AnalysisResult process(const Quote& q) {
        auto start = std::chrono::high_resolution_clock::now();

        double best_bid = q.bid[0].price;
        double best_ask = q.ask[0].price;
        double mid = (best_bid + best_ask) * 0.5;
        if (mid <= 0.0) mid = q.ltp;
        double spread = best_ask - best_bid;
        if (spread < 0.0) spread = 0.0;
        double spread_bps = (mid > 0.0) ? (spread / mid) * 10000.0 : 0.0;

        ClassifiedVolume classified = classifier_.classify(mid, spread, q.volume);

        int completed = bars_.update(q.ltp, classified.buy, classified.sell);
        for (int i = completed - 1; i >= 0; --i) {
            const VolumeBar& bar = bars_.bars().newest(i);
            vpin_histogram_.push(bar.vpin);
            pin_.update(bar.buy_volume, bar.sell_volume);
        }

        double vpin = bars_.vpin();

        OFIPoint ofi_point = ofi_.update(best_bid, q.bid[0].quantity,
                                         best_ask, q.ask[0].quantity);
        double ofi = ofi_.value();

        double amihud = amihud_.update(q.ltp, q.volume);

        double price_change = has_last_mid_ ? (mid - last_mid_) : 0.0;
        double signed_flow = static_cast<double>(classified.buy - classified.sell);
        double kyle = kyle_.update(signed_flow, price_change);

        hawkes_.update(q.timestamp_ms);
        double hawkes_clustering = hawkes_.clustering();

        double pin = pin_.value();

        double bid_depth_value = 0.0;
        double ask_depth_value = 0.0;
        for (int i = 0; i < q.bid_levels && i < kMaxDepthLevels; ++i)
            bid_depth_value += q.bid[i].price * static_cast<double>(q.bid[i].quantity);
        for (int i = 0; i < q.ask_levels && i < kMaxDepthLevels; ++i)
            ask_depth_value += q.ask[i].price * static_cast<double>(q.ask[i].quantity);
        double depth_total = bid_depth_value + ask_depth_value;
        double depth_imbalance = (depth_total > 0.0)
            ? (bid_depth_value - ask_depth_value) / depth_total
            : 0.0;

        int toxic_score = scorer_.toxic_score(vpin, ofi, kyle, amihud,
                                              hawkes_clustering, pin, spread_bps);

        double vpin_cdf = (vpin_histogram_.count() > 0)
            ? vpin_histogram_.cdf(vpin)
            : 0.0;
        int crash_risk = scorer_.crash_risk(vpin_cdf, spread_bps,
                                            amihud_.last_illiquidity(), amihud);

        last_mid_ = mid;
        has_last_mid_ = true;
        ++update_count_;

        auto end = std::chrono::high_resolution_clock::now();
        double compute_us =
            std::chrono::duration<double, std::micro>(end - start).count();

        AnalysisResult result;
        result.vpin = vpin;
        result.ofi = ofi;
        result.kyle_lambda = kyle;
        result.amihud = amihud;
        result.hawkes = hawkes_clustering;
        result.pin = pin;
        result.spread_bps = spread_bps;
        result.mid_price = mid;
        result.depth_imbalance = depth_imbalance;
        result.bid_depth_value = bid_depth_value;
        result.ask_depth_value = ask_depth_value;
        result.toxic_score = toxic_score;
        result.crash_risk = crash_risk;
        result.should_buy = signal_from_score(toxic_score);
        result.stoploss_safe = signal_from_score(crash_risk);
        result.compute_time_us = compute_us;
        result.update_count = update_count_;
        result.bars_completed = bars_.bars_completed();
        result.bar_progress = bars_.bar_progress();
        (void)ofi_point;
        return result;
    }

    const RingBuffer<VolumeBar, kBarHistoryCapacity>& bars() const {
        return bars_.bars();
    }

private:
    int signal_from_score(int score) const {
        if (score < config_.signal_clear_below) return SIGNAL_CLEAR;
        if (score < config_.signal_caution_below) return SIGNAL_CAUTION;
        return SIGNAL_AVOID;
    }

    EngineConfig config_;

    VolumeClassifier classifier_;
    VolumeBarEngine bars_;
    OFICalculator ofi_;
    AmihudCalculator amihud_;
    KyleLambda kyle_;
    HawkesProcess hawkes_;
    PinEstimator pin_;
    ToxicScorer scorer_;
    OnlineHistogram<kVpinHistogramBins> vpin_histogram_;

    bool has_last_mid_ = false;
    double last_mid_ = 0.0;
    std::int64_t update_count_ = 0;
};

}
