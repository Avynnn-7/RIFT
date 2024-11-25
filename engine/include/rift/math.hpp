#pragma once

#include <algorithm>
#include <cmath>

namespace rift {

constexpr double kInvSqrt2 = 0.70710678118654752440;
constexpr double kExpArgLimit = 700.0;

inline double clamp_unit(double x) {
    return x < 0.0 ? 0.0 : (x > 1.0 ? 1.0 : x);
}

inline double stable_exp(double x) {
    return std::exp(std::clamp(x, -kExpArgLimit, kExpArgLimit));
}

inline double normal_cdf(double z) {
    return 0.5 * std::erfc(-z * kInvSqrt2);
}

inline double logistic(double x) {
    if (x >= 0.0) {
        double e = std::exp(-std::min(x, kExpArgLimit));
        return 1.0 / (1.0 + e);
    }
    double e = std::exp(std::max(x, -kExpArgLimit));
    return e / (1.0 + e);
}

}
