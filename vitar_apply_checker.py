"""Apply the fitted checker v2 (weights + threshold from the calibration half) to new signal rows.

    python vitar_apply_checker.py results/checker_v2/demo_signals.csv
Refits the logistic regression exactly as vitar_calibrate_v2.py does (deterministic), then scores the
given rows and writes <input>_decisions.csv with score, abstain and main reason.
"""
import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

F = ["C_orig", "C_perm", "consistency", "blind_gain", "p_abstain"]
REASON = {"C_orig": "low confidence", "C_perm": "low order-averaged confidence",
          "consistency": "answer changes when options are reordered",
          "blind_gain": "image doesn't support the answer more than the question alone",
          "p_abstain": "model leans toward 'cannot be determined'"}

cal = pd.read_csv("results/checker_v2/checker_v2_rows.csv").query("split == 'calib'")
sc = StandardScaler().fit(cal[F])
lr = LogisticRegression(C=1.0, max_iter=1000).fit(sc.transform(cal[F]), cal["should_abstain"])
thr = json.load(open("results/checker_v2/checker_v2_report.json"))["thresholds"]["combined"]

src = Path(sys.argv[1])
d = pd.read_csv(src)
d["score"] = lr.predict_proba(sc.transform(d[F]))[:, 1]
d["abstain"] = d["score"] > thr
z = sc.transform(d[F]) * lr.coef_[0]
d["reason"] = [REASON[F[i]] if a else "" for i, a in zip(z.argmax(1), d["abstain"])]
d.to_csv(src.with_name(src.stem + "_decisions.csv"), index=False)
print(f"threshold {thr:.3f}")
pd.set_option("display.width", 250)
print(d[["ds_index", "condition", "pred_idx", "gt_idx", "C_perm", "consistency", "p_abstain", "score", "abstain", "reason"]]
      .round(2).to_string(index=False))
