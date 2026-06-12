#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

#include "rift/math.hpp"
#include "rift/ring_buffer.hpp"

namespace rift {

constexpr int kPinWindowCapacity = 64;

struct PinPeriod {
    double buy;
    double sell;
};

class PinEstimator {
public:
    using Params = std::array<double, 5>;

    void reset(int window = 50, int min_periods = 15) {
        window_ = std::clamp(window, 1, kPinWindowCapacity);
        min_periods_ = std::max(min_periods, 5);
        periods_.clear();
        length_ = 0;
        pin_ = 0.0;
        initialized_ = false;
    }

    double update(std::int64_t buy_volume, std::int64_t sell_volume) {
        if (length_ < window_) ++length_;
        periods_.push(PinPeriod{static_cast<double>(buy_volume),
                                static_cast<double>(sell_volume)});
        if (length_ >= min_periods_) {
            pin_ = estimate();
            initialized_ = true;
        }
        return pin_;
    }

    double value() const { return pin_; }
    bool initialized() const { return initialized_; }

private:
    static double log_sum_exp3(double a, double b, double c) {
        double m = std::max(a, std::max(b, c));
        return m + std::log(std::exp(a - m) + std::exp(b - m) + std::exp(c - m));
    }

    void decode(const Params& p, double& alpha, double& delta,
                double& mu, double& eps_b, double& eps_s) const {
        alpha = std::clamp(logistic(p[0]), 1e-6, 1.0 - 1e-6);
        delta = std::clamp(logistic(p[1]), 1e-6, 1.0 - 1e-6);
        mu = stable_exp(std::clamp(p[2], -20.0, 20.0));
        eps_b = stable_exp(std::clamp(p[3], -20.0, 20.0));
        eps_s = stable_exp(std::clamp(p[4], -20.0, 20.0));
        if (mu < 1e-9) mu = 1e-9;
        if (eps_b < 1e-9) eps_b = 1e-9;
        if (eps_s < 1e-9) eps_s = 1e-9;
    }

    double negative_log_likelihood(const Params& p) const {
        double alpha, delta, mu, eps_b, eps_s;
        decode(p, alpha, delta, mu, eps_b, eps_s);

        double log_alpha = std::log(alpha);
        double log_1m_alpha = std::log(1.0 - alpha);
        double log_delta = std::log(delta);
        double log_1m_delta = std::log(1.0 - delta);
        double log_ratio_b = std::log((eps_b + mu) / eps_b);
        double log_ratio_s = std::log((eps_s + mu) / eps_s);
        double log_eps_b = std::log(eps_b);
        double log_eps_s = std::log(eps_s);

        double total = 0.0;
        for (int i = 0; i < length_; ++i) {
            const PinPeriod& period = periods_.newest(i);
            double b = period.buy;
            double s = period.sell;

            double t1 = log_1m_alpha;
            double t2 = log_alpha + log_delta - mu + s * log_ratio_s;
            double t3 = log_alpha + log_1m_delta - mu + b * log_ratio_b;

            double mixture = log_sum_exp3(t1, t2, t3);
            double base = -eps_b - eps_s + b * log_eps_b + s * log_eps_s;
            total += base + mixture;
        }
        return -total;
    }

    Params nelder_mead(Params start) const {
        constexpr int kMaxIter = 300;
        constexpr double kReflect = 1.0;
        constexpr double kExpand = 2.0;
        constexpr double kContract = 0.5;
        constexpr double kShrink = 0.5;
        constexpr double kTol = 1e-8;

        std::array<Params, 6> simplex;
        std::array<double, 6> value;

        simplex[0] = start;
        for (int i = 0; i < 5; ++i) {
            Params vertex = start;
            vertex[i] += (vertex[i] != 0.0) ? 0.5 : 0.25;
            simplex[i + 1] = vertex;
        }
        for (int i = 0; i < 6; ++i) value[i] = negative_log_likelihood(simplex[i]);

        for (int iter = 0; iter < kMaxIter; ++iter) {
            int best = 0, worst = 0, second = 0;
            for (int i = 1; i < 6; ++i) {
                if (value[i] < value[best]) best = i;
                if (value[i] > value[worst]) worst = i;
            }
            for (int i = 0; i < 6; ++i) {
                if (i != worst && value[i] > value[second]) second = i;
            }
            if (second == worst) second = best;

            if (std::abs(value[worst] - value[best]) <
                kTol * (std::abs(value[worst]) + std::abs(value[best]) + kTol)) {
                break;
            }

            Params centroid{};
            for (int i = 0; i < 6; ++i) {
                if (i == worst) continue;
                for (int d = 0; d < 5; ++d) centroid[d] += simplex[i][d];
            }
            for (int d = 0; d < 5; ++d) centroid[d] /= 5.0;

            Params reflected;
            for (int d = 0; d < 5; ++d)
                reflected[d] = centroid[d] + kReflect * (centroid[d] - simplex[worst][d]);
            double reflected_value = negative_log_likelihood(reflected);

            if (reflected_value < value[best]) {
                Params expanded;
                for (int d = 0; d < 5; ++d)
                    expanded[d] = centroid[d] + kExpand * (reflected[d] - centroid[d]);
                double expanded_value = negative_log_likelihood(expanded);
                if (expanded_value < reflected_value) {
                    simplex[worst] = expanded;
                    value[worst] = expanded_value;
                } else {
                    simplex[worst] = reflected;
                    value[worst] = reflected_value;
                }
            } else if (reflected_value < value[second]) {
                simplex[worst] = reflected;
                value[worst] = reflected_value;
            } else {
                Params contracted;
                for (int d = 0; d < 5; ++d)
                    contracted[d] = centroid[d] + kContract * (simplex[worst][d] - centroid[d]);
                double contracted_value = negative_log_likelihood(contracted);
                if (contracted_value < value[worst]) {
                    simplex[worst] = contracted;
                    value[worst] = contracted_value;
                } else {
                    for (int i = 0; i < 6; ++i) {
                        if (i == best) continue;
                        for (int d = 0; d < 5; ++d)
                            simplex[i][d] = simplex[best][d] +
                                            kShrink * (simplex[i][d] - simplex[best][d]);
                        value[i] = negative_log_likelihood(simplex[i]);
                    }
                }
            }
        }

        int best = 0;
        for (int i = 1; i < 6; ++i)
            if (value[i] < value[best]) best = i;
        return simplex[best];
    }

    double estimate() const {
        double mean_buy = 0.0, mean_sell = 0.0;
        for (int i = 0; i < length_; ++i) {
            const PinPeriod& period = periods_.newest(i);
            mean_buy += period.buy;
            mean_sell += period.sell;
        }
        mean_buy /= length_;
        mean_sell /= length_;

        double eps_b0 = std::max(mean_buy, 1.0);
        double eps_s0 = std::max(mean_sell, 1.0);
        double mu0 = std::max(std::abs(mean_buy - mean_sell), 1.0);

        const double alpha_grid[] = {0.1, 0.3, 0.5};
        const double delta_grid[] = {0.3, 0.5, 0.7};

        double best_nll = 1e300;
        double best_pin = 0.0;

        for (double alpha0 : alpha_grid) {
            for (double delta0 : delta_grid) {
                Params start;
                start[0] = std::log(alpha0 / (1.0 - alpha0));
                start[1] = std::log(delta0 / (1.0 - delta0));
                start[2] = std::log(mu0);
                start[3] = std::log(eps_b0);
                start[4] = std::log(eps_s0);

                Params solution = nelder_mead(start);
                double nll = negative_log_likelihood(solution);
                if (nll < best_nll) {
                    best_nll = nll;
                    double alpha, delta, mu, eps_b, eps_s;
                    decode(solution, alpha, delta, mu, eps_b, eps_s);
                    double denom = alpha * mu + eps_b + eps_s;
                    best_pin = (denom > 0.0) ? (alpha * mu) / denom : 0.0;
                }
            }
        }
        return std::clamp(best_pin, 0.0, 1.0);
    }

    RingBuffer<PinPeriod, kPinWindowCapacity> periods_;
    int window_ = 50;
    int min_periods_ = 15;
    int length_ = 0;
    double pin_ = 0.0;
    bool initialized_ = false;
};

}
