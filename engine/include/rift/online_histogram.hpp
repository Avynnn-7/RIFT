#pragma once

#include <algorithm>
#include <cstdint>

namespace rift {

template <int Bins>
class OnlineHistogram {
    static_assert(Bins > 0, "Bins must be positive");

public:
    void reset(double min_value, double max_value) {
        min_ = min_value;
        max_ = max_value;
        total_ = 0;
        for (int i = 0; i < Bins; ++i) bins_[i] = 0;
    }

    void push(double value) {
        ++bins_[index_of(value)];
        ++total_;
    }

    double cdf(double value) const {
        if (total_ == 0) return 0.5;
        double width = (max_ - min_) / Bins;
        if (width <= 0.0) return 0.5;

        double pos = (value - min_) / width;
        if (pos <= 0.0) return 0.0;
        int idx = static_cast<int>(pos);
        if (idx >= Bins) return 1.0;

        std::int64_t below = 0;
        for (int i = 0; i < idx; ++i) below += bins_[i];

        double frac = pos - idx;
        double interpolated = static_cast<double>(below) + bins_[idx] * frac;
        return interpolated / static_cast<double>(total_);
    }

    std::int64_t count() const { return total_; }

private:
    int index_of(double value) const {
        double width = (max_ - min_) / Bins;
        if (width <= 0.0) return 0;
        int idx = static_cast<int>((value - min_) / width);
        return std::clamp(idx, 0, Bins - 1);
    }

    double min_ = 0.0;
    double max_ = 1.0;
    std::int64_t bins_[Bins]{};
    std::int64_t total_ = 0;
};

}
