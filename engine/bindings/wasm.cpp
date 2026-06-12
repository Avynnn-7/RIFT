#include <algorithm>
#include <cmath>
#include <cstdint>

#include "rift/engine.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

constexpr int kMaxSessions = 64;
constexpr int kInputSize = 25;
constexpr int kOutputSize = 19;
constexpr int kBarStride = 9;
constexpr int kBarCapacity = 64;

struct Session {
    rift::RiftEngine engine;
    bool active = false;
    double input[kInputSize] = {};
    double output[kOutputSize] = {};
    double bars[kBarCapacity * kBarStride] = {};
    int bar_count = 0;
};

Session g_sessions[kMaxSessions];

rift::EngineConfig make_config(double bar_volume) {
    rift::EngineConfig config;
    if (bar_volume >= 1.0) {
        config.bar_volume = static_cast<std::int64_t>(std::llround(bar_volume));
    }
    return config;
}

rift::Quote read_quote(const double* in) {
    rift::Quote q{};
    q.ltp = in[0];
    q.volume = static_cast<std::int64_t>(std::llround(in[1]));
    q.timestamp_ms = static_cast<std::int64_t>(std::llround(in[2]));
    int bid_levels = static_cast<int>(in[3]);
    int ask_levels = static_cast<int>(in[4]);
    q.bid_levels = std::clamp(bid_levels, 0, rift::kMaxDepthLevels);
    q.ask_levels = std::clamp(ask_levels, 0, rift::kMaxDepthLevels);
    for (int i = 0; i < rift::kMaxDepthLevels; ++i) {
        q.bid[i].price = in[5 + i * 2];
        q.bid[i].quantity = static_cast<std::int64_t>(std::llround(in[6 + i * 2]));
        q.ask[i].price = in[15 + i * 2];
        q.ask[i].quantity = static_cast<std::int64_t>(std::llround(in[16 + i * 2]));
    }
    return q;
}

void write_result(double* out, const rift::AnalysisResult& r) {
    out[0] = r.vpin;
    out[1] = r.ofi;
    out[2] = r.kyle_lambda;
    out[3] = r.amihud;
    out[4] = r.hawkes;
    out[5] = r.pin;
    out[6] = r.spread_bps;
    out[7] = r.mid_price;
    out[8] = r.depth_imbalance;
    out[9] = r.bid_depth_value;
    out[10] = r.ask_depth_value;
    out[11] = static_cast<double>(r.toxic_score);
    out[12] = static_cast<double>(r.crash_risk);
    out[13] = static_cast<double>(r.should_buy);
    out[14] = static_cast<double>(r.stoploss_safe);
    out[15] = r.compute_time_us;
    out[16] = static_cast<double>(r.update_count);
    out[17] = static_cast<double>(r.bars_completed);
    out[18] = r.bar_progress;
}

void fill_bars(Session& s) {
    const auto& ring = s.engine.bars();
    int count = std::min(ring.size(), kBarCapacity);
    s.bar_count = count;
    for (int i = 0; i < count; ++i) {
        const rift::VolumeBar& bar = ring.newest(count - 1 - i);
        double* row = s.bars + i * kBarStride;
        row[0] = static_cast<double>(bar.bar_index);
        row[1] = bar.open;
        row[2] = bar.high;
        row[3] = bar.low;
        row[4] = bar.close;
        row[5] = static_cast<double>(bar.buy_volume);
        row[6] = static_cast<double>(bar.sell_volume);
        row[7] = static_cast<double>(bar.total_volume);
        row[8] = bar.vpin;
    }
}

bool valid(int handle) {
    return handle >= 0 && handle < kMaxSessions && g_sessions[handle].active;
}

}

extern "C" {

EMSCRIPTEN_KEEPALIVE int rift_create(double bar_volume) {
    for (int i = 0; i < kMaxSessions; ++i) {
        if (!g_sessions[i].active) {
            g_sessions[i].engine.reset(make_config(bar_volume));
            g_sessions[i].active = true;
            g_sessions[i].bar_count = 0;
            return i;
        }
    }
    return -1;
}

EMSCRIPTEN_KEEPALIVE void rift_reset(int handle, double bar_volume) {
    if (handle < 0 || handle >= kMaxSessions) return;
    g_sessions[handle].engine.reset(make_config(bar_volume));
    g_sessions[handle].active = true;
    g_sessions[handle].bar_count = 0;
}

EMSCRIPTEN_KEEPALIVE void rift_destroy(int handle) {
    if (handle < 0 || handle >= kMaxSessions) return;
    g_sessions[handle].active = false;
}

EMSCRIPTEN_KEEPALIVE double* rift_input(int handle) {
    if (handle < 0 || handle >= kMaxSessions) return nullptr;
    return g_sessions[handle].input;
}

EMSCRIPTEN_KEEPALIVE double* rift_output(int handle) {
    if (handle < 0 || handle >= kMaxSessions) return nullptr;
    return g_sessions[handle].output;
}

EMSCRIPTEN_KEEPALIVE double* rift_bars(int handle) {
    if (handle < 0 || handle >= kMaxSessions) return nullptr;
    return g_sessions[handle].bars;
}

EMSCRIPTEN_KEEPALIVE int rift_bars_count(int handle) {
    if (!valid(handle)) return 0;
    return g_sessions[handle].bar_count;
}

EMSCRIPTEN_KEEPALIVE int rift_process(int handle) {
    if (!valid(handle)) return -1;
    Session& s = g_sessions[handle];
    rift::Quote q = read_quote(s.input);
    rift::AnalysisResult r = s.engine.process(q);
    write_result(s.output, r);
    fill_bars(s);
    return 0;
}

}
