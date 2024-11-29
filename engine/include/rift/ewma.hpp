#pragma once

namespace rift {

class Ewma {
public:
    void reset(double alpha) {
        alpha_ = alpha;
        value_ = 0.0;
        initialized_ = false;
    }

    void push(double x) {
        if (!initialized_) {
            value_ = x;
            initialized_ = true;
            return;
        }
        value_ += alpha_ * (x - value_);
    }

    double value() const { return value_; }
    bool initialized() const { return initialized_; }

private:
    double alpha_ = 0.0;
    double value_ = 0.0;
    bool initialized_ = false;
};

class EwmaVariance {
public:
    void reset(double alpha) {
        alpha_ = alpha;
        mean_ = 0.0;
        variance_ = 0.0;
        initialized_ = false;
    }

    void push(double x) {
        if (!initialized_) {
            mean_ = x;
            variance_ = 0.0;
            initialized_ = true;
            return;
        }
        double diff = x - mean_;
        double increment = alpha_ * diff;
        mean_ += increment;
        variance_ = (1.0 - alpha_) * (variance_ + diff * increment);
    }

    double mean() const { return mean_; }
    double variance() const { return variance_; }
    bool initialized() const { return initialized_; }

private:
    double alpha_ = 0.0;
    double mean_ = 0.0;
    double variance_ = 0.0;
    bool initialized_ = false;
};

}
