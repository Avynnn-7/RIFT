#pragma once

#include <cstdint>

namespace rift {

template <typename T, int Capacity>
class RingBuffer {
    static_assert(Capacity > 0 && (Capacity & (Capacity - 1)) == 0,
                  "Capacity must be a positive power of two");

public:
    void clear() {
        head_ = 0;
        count_ = 0;
    }

    void push(const T& item) {
        data_[head_ & kMask] = item;
        ++head_;
        if (count_ < Capacity) ++count_;
    }

    const T& newest(int offset = 0) const {
        return data_[(head_ - 1 - static_cast<std::uint64_t>(offset)) & kMask];
    }

    const T& oldest() const {
        return data_[(head_ - static_cast<std::uint64_t>(count_)) & kMask];
    }

    int size() const { return count_; }
    bool empty() const { return count_ == 0; }
    bool full() const { return count_ == Capacity; }
    static constexpr int capacity() { return Capacity; }

private:
    static constexpr std::uint64_t kMask = static_cast<std::uint64_t>(Capacity) - 1;

    T data_[Capacity]{};
    std::uint64_t head_ = 0;
    int count_ = 0;
};

}
