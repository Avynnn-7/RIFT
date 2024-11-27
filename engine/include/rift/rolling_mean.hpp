#pragma once

#include "rift/ring_buffer.hpp"

namespace rift {

template <int Capacity>
class RollingMean {
public:
    void reset(int window) {
        window_ = (window < 1) ? 1 : (window > Capacity ? Capacity : window);
        sum_ = 0.0;
        length_ = 0;
        buffer_.clear();
    }

    void push(double value) {
        if (length_ == window_) {
            sum_ -= buffer_.newest(window_ - 1);
        } else {
            ++length_;
        }
        buffer_.push(value);
        sum_ += value;
    }

    double mean() const {
        return (length_ > 0) ? sum_ / static_cast<double>(length_) : 0.0;
    }

    int length() const { return length_; }
    int window() const { return window_; }

private:
    RingBuffer<double, Capacity> buffer_;
    double sum_ = 0.0;
    int window_ = 1;
    int length_ = 0;
};

}
