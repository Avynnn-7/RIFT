#pragma once

#include "rift/math.hpp"

namespace rift {

struct ToxicScoreConfig {
    double intercept = -2.5;
    double w_vpin = 3.5;
    double w_ofi = 2.8;
    double w_kyle = 2.0;
    double w_amihud = 1.5;
    double w_hawkes = 1.8;
    double w_pin = 1.5;
    double w_spread = 1.0;

    double scale_vpin = 0.6;
    double scale_ofi = 0.5;
    double scale_kyle = 20.0;
    double scale_amihud = 100.0;
    double scale_pin = 0.5;
    double scale_spread_bps = 50.0;
};

struct CrashRiskConfig {
    double intercept = -2.0;
    double w_vpin_cdf = 4.0;
    double w_spread = 2.5;
    double w_amihud_spike = 2.0;

    double scale_spread_bps = 30.0;
    double amihud_spike_multiple = 3.0;
};

class ToxicScorer {
public:
    void reset(const ToxicScoreConfig& toxic = ToxicScoreConfig(),
               const CrashRiskConfig& crash = CrashRiskConfig()) {
        toxic_ = toxic;
        crash_ = crash;
    }

    int toxic_score(double vpin, double ofi, double kyle, double amihud,
                    double hawkes_clustering, double pin, double spread_bps) const {
        double v = clamp_unit(vpin / toxic_.scale_vpin);
        double o = clamp_unit(std::abs(ofi) / toxic_.scale_ofi);
        double k = clamp_unit(std::abs(kyle) / toxic_.scale_kyle);
        double a = clamp_unit(amihud / toxic_.scale_amihud);
        double h = clamp_unit(hawkes_clustering);
        double p = clamp_unit(pin / toxic_.scale_pin);
        double s = clamp_unit(spread_bps / toxic_.scale_spread_bps);

        double logit = toxic_.intercept
                     + toxic_.w_vpin * v
                     + toxic_.w_ofi * o
                     + toxic_.w_kyle * k
                     + toxic_.w_amihud * a
                     + toxic_.w_hawkes * h
                     + toxic_.w_pin * p
                     + toxic_.w_spread * s;

        return to_percent(logistic(logit));
    }

    int crash_risk(double vpin_cdf, double spread_bps,
                   double amihud_instant, double amihud_baseline) const {
        double c = clamp_unit(vpin_cdf);
        double s = clamp_unit(spread_bps / crash_.scale_spread_bps);

        double spike = 0.0;
        if (amihud_baseline > 0.0) {
            spike = clamp_unit(amihud_instant /
                               (amihud_baseline * crash_.amihud_spike_multiple));
        }

        double logit = crash_.intercept
                     + crash_.w_vpin_cdf * c
                     + crash_.w_spread * s
                     + crash_.w_amihud_spike * spike;

        return to_percent(logistic(logit));
    }

private:
    static int to_percent(double probability) {
        int value = static_cast<int>(std::lround(probability * 100.0));
        return value < 0 ? 0 : (value > 100 ? 100 : value);
    }

    ToxicScoreConfig toxic_;
    CrashRiskConfig crash_;
};

}
