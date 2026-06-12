#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "rift/ewma.hpp"
#include "rift/math.hpp"

namespace rift {

struct ClassifiedVolume {
    std::int64_t buy;
    std::int64_t sell;
};

class VolumeClassifier {
public:
    void reset(double volatility_alpha = 2.0 / 51.0,
               double sigma_floor_fraction = 0.25,
               double min_tick_size = 0.01) {
        volatility_alpha_ = volatility_alpha;
        sigma_floor_fraction_ = sigma_floor_fraction;
        min_tick_size_ = min_tick_size;
        dp_volatility_.reset(volatility_alpha);
        last_mid_ = 0.0;
        last_volume_ = 0;
        has_reference_ = false;
    }

    ClassifiedVolume classify(double mid_price, double spread,
                              std::int64_t cumulative_volume) {
        if (!has_reference_) {
            last_mid_ = mid_price;
            last_volume_ = cumulative_volume;
            has_reference_ = true;
            return {0, 0};
        }

        std::int64_t volume_delta = cumulative_volume - last_volume_;
        if (volume_delta < 0) volume_delta = 0;

        double price_change = mid_price - last_mid_;
        dp_volatility_.push(price_change);

        last_mid_ = mid_price;
        last_volume_ = cumulative_volume;

        if (volume_delta == 0) return {0, 0};

        double sigma = std::sqrt(dp_volatility_.variance());
        double floor = std::max(spread, min_tick_size_) * sigma_floor_fraction_;
        if (sigma < floor) sigma = floor;
        if (sigma <= 0.0) return {volume_delta - volume_delta / 2, volume_delta / 2};

        double z = price_change / sigma;
        double buy_fraction = normal_cdf(z);

        std::int64_t buy = std::llround(static_cast<double>(volume_delta) * buy_fraction);
        buy = std::clamp<std::int64_t>(buy, 0, volume_delta);
        std::int64_t sell = volume_delta - buy;
        return {buy, sell};
    }

    double price_change_sigma() const {
        return std::sqrt(dp_volatility_.variance());
    }

private:
    double volatility_alpha_ = 2.0 / 51.0;
    double sigma_floor_fraction_ = 0.25;
    double min_tick_size_ = 0.01;

    EwmaVariance dp_volatility_;
    double last_mid_ = 0.0;
    std::int64_t last_volume_ = 0;
    bool has_reference_ = false;
};

}
