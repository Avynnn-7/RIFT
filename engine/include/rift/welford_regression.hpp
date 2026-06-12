#pragma once

namespace rift {

class WelfordRegression {
public:
    void reset(double decay = 1.0) {
        decay_ = decay;
        weight_ = 0.0;
        mean_x_ = 0.0;
        mean_y_ = 0.0;
        cov_ = 0.0;
        var_x_ = 0.0;
    }

    void push(double x, double y) {
        weight_ = weight_ * decay_ + 1.0;
        cov_ *= decay_;
        var_x_ *= decay_;

        double dx = x - mean_x_;
        mean_x_ += dx / weight_;
        double dy = y - mean_y_;
        mean_y_ += dy / weight_;

        cov_ += dx * (y - mean_y_);
        var_x_ += dx * (x - mean_x_);
    }

    double slope() const {
        return (var_x_ > kEpsilon) ? cov_ / var_x_ : 0.0;
    }

    double intercept() const {
        return mean_y_ - slope() * mean_x_;
    }

    double variance_x() const {
        return (weight_ > 0.0) ? var_x_ / weight_ : 0.0;
    }

    double effective_sample_size() const { return weight_; }

private:
    static constexpr double kEpsilon = 1e-12;

    double decay_ = 1.0;
    double weight_ = 0.0;
    double mean_x_ = 0.0;
    double mean_y_ = 0.0;
    double cov_ = 0.0;
    double var_x_ = 0.0;
};

}
