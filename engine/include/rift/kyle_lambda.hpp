#pragma once

#include "rift/welford_regression.hpp"

namespace rift {

class KyleLambda {
public:
    void reset(double decay = 0.98, double min_samples = 5.0) {
        regression_.reset(decay);
        min_samples_ = min_samples;
    }

    double update(double signed_flow, double price_change) {
        regression_.push(signed_flow, price_change);
        return value();
    }

    double value() const {
        if (regression_.effective_sample_size() < min_samples_) return 0.0;
        return regression_.slope();
    }

    double effective_sample_size() const {
        return regression_.effective_sample_size();
    }

private:
    WelfordRegression regression_;
    double min_samples_ = 5.0;
};

}
