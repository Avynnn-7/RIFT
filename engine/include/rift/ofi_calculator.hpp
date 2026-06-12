#pragma once

#include <algorithm>
#include <cstdint>

#include "rift/ewma.hpp"
#include "rift/types.hpp"

namespace rift {

class OFICalculator {
public:
    void reset(double alpha = 2.0 / 31.0) {
        smoothed_.reset(alpha);
        has_prev_ = false;
        prev_bid_price_ = prev_ask_price_ = 0.0;
        prev_bid_qty_ = prev_ask_qty_ = 0;
    }

    OFIPoint update(double bid_price, std::int64_t bid_qty,
                    double ask_price, std::int64_t ask_qty) {
        OFIPoint point{0.0, bid_qty, ask_qty};

        if (!has_prev_) {
            store(bid_price, bid_qty, ask_price, ask_qty);
            has_prev_ = true;
            return point;
        }

        double bid_contrib =
            (bid_price > prev_bid_price_) ? static_cast<double>(bid_qty)
          : (bid_price < prev_bid_price_) ? -static_cast<double>(prev_bid_qty_)
          : static_cast<double>(bid_qty - prev_bid_qty_);

        double ask_contrib =
            (ask_price > prev_ask_price_) ? -static_cast<double>(prev_ask_qty_)
          : (ask_price < prev_ask_price_) ? static_cast<double>(ask_qty)
          : static_cast<double>(ask_qty - prev_ask_qty_);

        double ofi_event = bid_contrib - ask_contrib;

        double scale = std::max(0.5 * static_cast<double>(bid_qty + ask_qty), 1.0);
        double normalized = std::clamp(ofi_event / scale, -1.0, 1.0);

        smoothed_.push(normalized);
        store(bid_price, bid_qty, ask_price, ask_qty);

        point.normalized = normalized;
        return point;
    }

    double value() const { return smoothed_.value(); }

private:
    void store(double bid_price, std::int64_t bid_qty,
               double ask_price, std::int64_t ask_qty) {
        prev_bid_price_ = bid_price;
        prev_bid_qty_ = bid_qty;
        prev_ask_price_ = ask_price;
        prev_ask_qty_ = ask_qty;
    }

    Ewma smoothed_;
    bool has_prev_ = false;
    double prev_bid_price_ = 0.0;
    double prev_ask_price_ = 0.0;
    std::int64_t prev_bid_qty_ = 0;
    std::int64_t prev_ask_qty_ = 0;
};

}
