"""Calibrate and evaluate checker v2 (rows from vitar_checker_v2.py).

    python vitar_calibrate_v2.py [results/checker_v2/checker_v2_rows.csv] [out_dir]

Rules compared (each gets one threshold picked on the calibration half: maximize abstention on
should-abstain inputs subject to <= MAX_FALSE_ABSTAIN on full images):
  never abstain          the model as it is today
  abstain option         the model picks "Cannot be determined from the image" (no threshold)
  confidence             low C_orig
  order-averaged conf.   low C_perm
  combined               logistic regression on all five signals, fit on the calibration half

Reported on the held-out test half, with 95% bootstrap CIs resampled by image:
  abstention rate per input type, unsafe-answer rate (should-abstain inputs that get answered),
  over-deferral on full and random-masked images, accuracy of accepted answers, and a
  risk-coverage curve (risk = accepted answers that are wrong or should have been abstained on).
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

MAX_FALSE_ABSTAIN = 0.10
N_BOOT = 2000
FEATURES = ["C_orig", "C_perm", "consistency", "blind_gain", "p_abstain"]
SIGNAL_NAMES = {"C_orig": "low confidence", "C_perm": "low order-averaged confidence",
                "consistency": "answer changes when options are reordered",
                "blind_gain": "image doesn't support the answer more than the question alone",
                "p_abstain": "model leans toward 'cannot be determined'"}

rows_path = Path(sys.argv[1] if len(sys.argv) > 1 else "results/checker_v2/checker_v2_rows.csv")
out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else rows_path.parent)
d = pd.read_csv(rows_path)
d["bad"] = d["should_abstain"] | ~d["correct"]   # what an accepted answer must not be
calib, test = d[d.split == "calib"].copy(), d[d.split == "test"].copy()

# --- combined score: logistic regression on the calibration half ---------------------------
scaler = StandardScaler().fit(calib[FEATURES])
lr = LogisticRegression(C=1.0, max_iter=1000).fit(scaler.transform(calib[FEATURES]), calib["should_abstain"])
coefs = dict(zip(FEATURES, lr.coef_[0].round(3)))
for part in (calib, test):
    part["score_combined"] = lr.predict_proba(scaler.transform(part[FEATURES]))[:, 1]
    part["score_conf"] = -part["C_orig"]
    part["score_conf_perm"] = -part["C_perm"]

SCORES = {"confidence": "score_conf", "order-averaged confidence": "score_conf_perm", "combined": "score_combined"}


def pick_threshold(c, col):
    """Lowest threshold (most abstention) with <= MAX_FALSE_ABSTAIN on calibration full images."""
    full = np.sort(c.loc[c.condition == "full", col].values)
    # abstain if score > t; allow at most floor(MAX * n) full images above t
    k = int(np.floor(MAX_FALSE_ABSTAIN * len(full)))
    return float(full[len(full) - k - 1]) if k < len(full) else -np.inf


thresholds = {name: pick_threshold(calib, col) for name, col in SCORES.items()}
for part in (calib, test):
    part["abstain_never"] = False
    part["abstain_option"] = part["abstain_pick"].astype(bool)
    for name, col in SCORES.items():
        part[f"abstain_{name}"] = part[col] > thresholds[name]
RULES = ["never", "option"] + list(SCORES)


def metrics(t, rule):
    a = t[f"abstain_{rule}"]
    m = {f"abstain[{c}]": float(a[t.condition == c].mean()) for c in sorted(t.condition.unique())}
    neg = t.should_abstain
    m["unsafe_answer_rate"] = float((~a[neg]).mean())                    # should-abstain inputs answered
    m["over_deferral_full"] = float(a[t.condition == "full"].mean())
    m["over_deferral_rand"] = float(a[t.condition == "rand"].mean())
    acc = ~a & ~neg
    m["accuracy_accepted_answerable"] = float(t.loc[acc, "correct"].mean()) if acc.any() else np.nan
    m["coverage_answerable"] = float((~a[~neg]).mean())
    return m


def bootstrap(t, rule, rng):
    """95% CI per metric, resampling images (all inputs for an image move together)."""
    groups = t.image_group.unique()
    by_group = {g: idx for g, idx in t.groupby("image_group").groups.items()}
    samples = []
    for _ in range(N_BOOT):
        pick = rng.choice(groups, len(groups))
        samples.append(metrics(t.loc[np.concatenate([by_group[g] for g in pick])], rule))
    s = pd.DataFrame(samples)
    return {k: [float(s[k].quantile(0.025)), float(s[k].quantile(0.975))] for k in s.columns}


rng = np.random.default_rng(0)
report = {
    "n_rows": {"calib": int(len(calib)), "test": int(len(test))},
    "n_questions": {"calib": int(calib.ds_index.nunique()), "test": int(test.ds_index.nunique())},
    "inputs_per_condition_test": test.condition.value_counts().to_dict(),
    "logreg_coefficients_standardized": coefs,
    "thresholds": thresholds,
    "test": {r: {"value": metrics(test, r), "ci95": bootstrap(test, r, rng)} for r in RULES},
    "mean_signals_test": test.groupby("condition")[FEATURES + ["correct"]].mean().round(3).to_dict(orient="index"),
}

# --- risk-coverage curve on the test half -------------------------------------------------
fig, ax = plt.subplots(figsize=(6.5, 4.5))
aurc = {}
for name, col in list(SCORES.items()) + [("abstain option (p)", "p_abstain")]:
    s = test[col].values
    order = np.argsort(s)                      # accept least-suspicious first
    bad = test["bad"].values[order]
    cov = np.arange(1, len(s) + 1) / len(s)
    risk = np.cumsum(bad) / np.arange(1, len(s) + 1)
    aurc[name] = float(risk.mean())
    ax.plot(cov, risk, label=f"{name} (AURC {aurc[name]:.3f})")
ax.axhline(test["bad"].mean(), color="gray", ls="--", label=f"no check ({test['bad'].mean():.3f})")
ax.set_xlabel("Coverage (share of inputs answered)")
ax.set_ylabel("Risk (answered but wrong or should have abstained)")
ax.set_title("Risk–coverage, test half (lower is better)")
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(out_dir / "risk_coverage.png", dpi=150)
report["aurc_test"] = aurc

# --- per-deferral explanation for the combined rule ---------------------------------------
z = scaler.transform(test[FEATURES]) * lr.coef_[0]          # contribution of each signal to the abstain score
test["main_reason"] = [SIGNAL_NAMES[FEATURES[i]] for i in z.argmax(1)]
test.loc[~test["abstain_combined"], "main_reason"] = ""
test.to_csv(out_dir / "checker_v2_test_decisions.csv", index=False)
report["main_reason_counts_test"] = test.loc[test.abstain_combined, "main_reason"].value_counts().to_dict()

(out_dir / "checker_v2_report.json").write_text(json.dumps(report, indent=2))
pd.set_option("display.width", 250)
table = pd.DataFrame({r: report["test"][r]["value"] for r in RULES}).T.round(3)
table.to_csv(out_dir / "checker_v2_test_table.csv")
print("coefficients (standardized; + means pushes toward abstain):", coefs)
print("thresholds:", {k: round(v, 3) for k, v in thresholds.items()})
print("\nTEST HALF\n" + table.to_string())
print("\nAURC:", {k: round(v, 3) for k, v in aurc.items()})
print("main reasons:", report["main_reason_counts_test"])
