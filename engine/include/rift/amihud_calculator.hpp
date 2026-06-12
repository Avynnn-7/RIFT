#pragma once

#include <cmath>
#include <cstdint>

#include "rift/ewma.hpp"

namespace rift {

class AmihudCalculator {
public:
    void reset(double alpha = 2.0 / 51.0, double scale = 1e6) {
        smoothed_.reset(alpha);
        scale_ = scale;
        has_prev_ = false;
        prev_price_ = 0.0;
        prev_volume_ = 0;
        last_illiquidity_ = 0.0;
    }

    double update(double price, std::int64_t cumulative_volume) {
        if (!has_prev_) {
            prev_price_ = price;
            prev_volume_ = cumulative_volume;
            has_prev_ = true;
            return smoothed_.value();
        }

        std::int64_t volume_delta = cumulative_volume - prev_volume_;
        double abs_return = (prev_price_ > 0.0)
            ? std::abs((price - prev_price_) / prev_price_)
            : 0.0;

        if (volume_delta > 0 && price > 0.0 && prev_price_ > 0.0) {
            double dollar_volume = price * static_cast<double>(volume_delta);
            double illiquidity = abs_return / dollar_volume * scale_;
            last_illiquidity_ = illiquidity;
            smoothed_.push(illiquidity);
        }

        prev_price_ = price;
        prev_volume_ = cumulative_volume;
        return smoothed_.value();
    }

    double value() const { return smoothed_.value(); }
    double last_illiquidity() const { return last_illiquidity_; }
    bool initialized() const { return smoothed_.initialized(); }

private:
    Ewma smoothed_;
    double scale_ = 1e6;
    double last_illiquidity_ = 0.0;
    bool has_prev_ = false;
    double prev_price_ = 0.0;
    std::int64_t prev_volume_ = 0;
};

}
