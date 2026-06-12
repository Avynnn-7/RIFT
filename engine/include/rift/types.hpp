#pragma once

#include <cstdint>

namespace rift {

constexpr int kMaxDepthLevels = 5;

struct DepthLevel {
    double price;
    std::int64_t quantity;
};

struct Quote {
    double ltp;
    std::int64_t volume;
    DepthLevel bid[kMaxDepthLevels];
    DepthLevel ask[kMaxDepthLevels];
    int bid_levels;
    int ask_levels;
    std::int64_t timestamp_ms;
};

struct VolumeBar {
    int bar_index;
    double open;
    double high;
    double low;
    double close;
    std::int64_t buy_volume;
    std::int64_t sell_volume;
    std::int64_t total_volume;
    double vpin;
};

struct OFIPoint {
    double normalized;
    std::int64_t bid_quantity;
    std::int64_t ask_quantity;
};

struct Spread {
    double spread_bps;
    double mid_price;
    double bid_depth_value;
    double ask_depth_value;
    double depth_imbalance;
};

enum SignalLevel : int {
    SIGNAL_AVOID = 0,
    SIGNAL_CAUTION = 1,
    SIGNAL_CLEAR = 2
};

struct AnalysisResult {
    double vpin;
    double ofi;
    double kyle_lambda;
    double amihud;
    double hawkes;
    double pin;

    double spread_bps;
    double mid_price;
    double depth_imbalance;
    double bid_depth_value;
    double ask_depth_value;

    int toxic_score;
    int crash_risk;

    int should_buy;
    int stoploss_safe;

    double compute_time_us;
    std::int64_t update_count;
    int bars_completed;
    double bar_progress;
};

}
