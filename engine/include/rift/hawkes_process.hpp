#pragma once

#include <cstdint>

#include "rift/math.hpp"

namespace rift {

class HawkesProcess {
public:
    void reset(double mu = 0.5, double alpha = 0.08, double beta = 0.1) {
        mu_ = mu;
        alpha_ = alpha;
        beta_ = beta;
        post_intensity_ = mu;
        last_timestamp_ = 0;
        initialized_ = false;
        last_intensity_ = mu;
    }

    double update(std::int64_t timestamp) {
        if (!initialized_) {
            post_intensity_ = mu_ + alpha_;
            last_timestamp_ = timestamp;
            initialized_ = true;
            last_intensity_ = mu_;
            return mu_;
        }

        double dt = static_cast<double>(timestamp - last_timestamp_);
        if (dt < 0.0) dt = 0.0;

        double decay = stable_exp(-beta_ * dt);
        double pre_intensity = mu_ + decay * (post_intensity_ - mu_);
        post_intensity_ = pre_intensity + alpha_;
        last_timestamp_ = timestamp;
        last_intensity_ = pre_intensity;
        return pre_intensity;
    }

    double intensity() const { return last_intensity_; }
    double baseline() const { return mu_; }
    double branching_ratio() const { return (beta_ > 0.0) ? alpha_ / beta_ : 0.0; }

    double clustering() const {
        if (mu_ <= 0.0) return 0.0;
        double excess = (last_intensity_ - mu_) / mu_;
        return excess < 0.0 ? 0.0 : (excess > 1.0 ? 1.0 : excess);
    }

private:
    double mu_ = 0.5;
    double alpha_ = 0.08;
    double beta_ = 0.1;
    double post_intensity_ = 0.5;
    double last_intensity_ = 0.5;
    std::int64_t last_timestamp_ = 0;
    bool initialized_ = false;
};

}
