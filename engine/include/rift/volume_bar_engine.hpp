#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "rift/ring_buffer.hpp"
#include "rift/rolling_mean.hpp"
#include "rift/types.hpp"

namespace rift {

constexpr int kBarHistoryCapacity = 256;
constexpr int kVpinWindowCapacity = 64;

class VolumeBarEngine {
public:
    void reset(std::int64_t bar_volume, int vpin_window = 50) {
        bar_volume_ = (bar_volume > 0) ? bar_volume : 1;
        bars_.clear();
        vpin_mean_.reset(vpin_window);
        bar_count_ = 0;
        has_open_ = false;
        acc_open_ = acc_high_ = acc_low_ = acc_close_ = 0.0;
        acc_buy_ = acc_sell_ = acc_total_ = 0;
    }

    int update(double price, std::int64_t buy_volume, std::int64_t sell_volume) {
        if (buy_volume < 0) buy_volume = 0;
        if (sell_volume < 0) sell_volume = 0;

        if (!has_open_) {
            acc_open_ = acc_high_ = acc_low_ = price;
            has_open_ = true;
        } else {
            acc_high_ = std::max(acc_high_, price);
            acc_low_ = std::min(acc_low_, price);
        }
        acc_close_ = price;
        acc_buy_ += buy_volume;
        acc_sell_ += sell_volume;
        acc_total_ += buy_volume + sell_volume;

        int completed = 0;
        while (acc_total_ >= bar_volume_) {
            const std::int64_t v = bar_volume_;
            double buy_fraction = static_cast<double>(acc_buy_) / static_cast<double>(acc_total_);
            std::int64_t bar_buy = std::llround(static_cast<double>(v) * buy_fraction);

            std::int64_t lo = std::max<std::int64_t>(0, v - acc_sell_);
            std::int64_t hi = std::min<std::int64_t>(v, acc_buy_);
            bar_buy = std::clamp(bar_buy, lo, hi);
            std::int64_t bar_sell = v - bar_buy;

            VolumeBar bar;
            bar.bar_index = bar_count_++;
            bar.open = acc_open_;
            bar.high = acc_high_;
            bar.low = acc_low_;
            bar.close = acc_close_;
            bar.buy_volume = bar_buy;
            bar.sell_volume = bar_sell;
            bar.total_volume = v;
            bar.vpin = std::abs(static_cast<double>(bar_buy - bar_sell)) / static_cast<double>(v);

            bars_.push(bar);
            vpin_mean_.push(bar.vpin);

            acc_buy_ -= bar_buy;
            acc_sell_ -= bar_sell;
            acc_total_ -= v;

            acc_open_ = acc_high_ = acc_low_ = acc_close_;
            ++completed;
        }
        return completed;
    }

    double vpin() const { return vpin_mean_.mean(); }
    int bars_completed() const { return bar_count_; }
    int vpin_sample_count() const { return vpin_mean_.length(); }

    double bar_progress() const {
        return static_cast<double>(acc_total_) / static_cast<double>(bar_volume_);
    }

    const RingBuffer<VolumeBar, kBarHistoryCapacity>& bars() const { return bars_; }

private:
    std::int64_t bar_volume_ = 1;

    RingBuffer<VolumeBar, kBarHistoryCapacity> bars_;
    RollingMean<kVpinWindowCapacity> vpin_mean_;
    int bar_count_ = 0;

    bool has_open_ = false;
    double acc_open_ = 0.0;
    double acc_high_ = 0.0;
    double acc_low_ = 0.0;
    double acc_close_ = 0.0;
    std::int64_t acc_buy_ = 0;
    std::int64_t acc_sell_ = 0;
    std::int64_t acc_total_ = 0;
};

}
