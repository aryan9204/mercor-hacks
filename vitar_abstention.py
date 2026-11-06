"""ViTAR-16K abstention experiment: does the model still answer when the evidence is masked?

Pipeline (runs on a Colab GPU via `cat vitar_abstention.py | colab exec -s <name>`):
  1. Screen the classification questions (all of them, or N_SCREEN shuffled ones). Keep "good" examples that are
       - a classification-style question (masking the evidence makes it unanswerable, rather than
         changing the right answer the way it would for "is there a tumor?"),
       - answered correctly with the full image,
       - answered confidently (p(correct letter) >= CONF_MIN),
       - image-dependent (log p(correct) improves by >= IMAGE_GAIN_MIN over question-only).
  2. For good examples, score the answer letters under: full image, evidence masked, and a
     same-size random region masked (control); each with and without an extra
     "Cannot be determined from the image" option.
  3. Pick confidence thresholds below which the model should abstain.

Scoring: one forward pass per condition; we read the next-token log-probs of the option letters
(A, B, C, ...) at the point where the answer begins. "conf" is the probability of the top option,
renormalized over the valid letters.

The work runs in a background thread so the CLI call returns immediately (long `colab exec` calls
time out on the client). Poll STATE for progress. Outputs go to OUT_DIR.
"""
import json
import math
import random
import re
import threading
import time
import traceback
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image

MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
N_SCREEN = None                 # None = screen every classification question in the dataset
SEED = 0
OUT_DIR = Path("/content/results")

# "Good example" filters. Every underlying number is saved, so these can be changed afterwards.
CONF_MIN = 0.5                  # p(correct letter) on the full image (chance is 0.25 for 4 options)
IMAGE_GAIN_MIN = math.log(2)    # the image must at least double p(correct) vs. question-only
MAX_BOX_FRAC = 0.5              # skip examples whose evidence box covers most of the image

ABSTAIN_TEXT = "Cannot be determined from the image"
FILL = (124, 116, 104)          # same gray as the GQA notebook

INSTRUCTION = (
    "Answer the multiple-choice question with only the letter of the correct option. "
    "Do not explain.\n\n"
)

# ---------------------------------------------------------------------------
# Model and data (loaded once; kernel state persists between `colab exec` calls)
# ---------------------------------------------------------------------------
if "model" not in globals():
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto"
    )
    model.eval()
    processor = AutoProcessor.from_pretrained(MODEL_ID)

if "ds" not in globals():
    from datasets import load_dataset
    ds = load_dataset("jline/ViTAR-16K", split="train")

LETTER_IDS = {}
for L in "ABCDEF":
    ids = processor.tokenizer.encode(L, add_special_tokens=False)
    assert len(ids) == 1, f"letter {L} is not a single token: {ids}"
    LETTER_IDS[L] = ids[0]


# ---------------------------------------------------------------------------
# Question parsing
# ---------------------------------------------------------------------------
def parse_options(question):
    """[(letter, text), ...] for inline options like 'A) Glioma B) Meningioma'."""
    return [(m.group(1), m.group(2).strip())
            for m in re.finditer(r"\b([A-F])\)\s*(.*?)(?=\s*\b[A-F]\)|$)", question, re.S)]


def question_type(question, options):
    q = question.lower()
    texts = [t.lower() for _, t in options]
    # Yes/no questions, including ones with an extra escape option such as
    # "A) Yes (L4-L5 stenosis) B) No (L4-L5 normal) C) Image does not cover L4 segment".
    if len(texts) >= 2 and texts[0].startswith(("yes", "no")) and texts[1].startswith(("yes", "no")):
        return "yes_no"
    if any("[" in t for t in texts) or "bounding box" in q:
        return "localization"
    if q.startswith("how many"):
        return "counting"
    if any(w in q for w in ("x-coordinate", "y-coordinate", "position", "where", "which side", "located")):
        return "position"
    return "classification"


def add_abstain_option(question, options):
    """Append one more option, e.g. 'E) Cannot be determined from the image'. Returns (question, letter)."""
    letter = chr(ord(options[-1][0]) + 1)
    return f"{question} {letter}) {ABSTAIN_TEXT}", letter


# ---------------------------------------------------------------------------
# Boxes and masks (mask functions are the same as the GQA notebook's)
# ---------------------------------------------------------------------------
def pick_evidence_box(question, boxes):
    """The lesion box: the smallest box, preferring boxes that contain the point the question
    names, e.g. 'at image coordinates (0.4, 0.55)'. ViTAR often pairs a lesion box with a large
    organ box, and masking the organ box would hide most of the image."""
    boxes = [b for b in boxes if len(b) == 4 and b[2] > b[0] and b[3] > b[1]]
    if not boxes:
        return None
    area = lambda b: (b[2] - b[0]) * (b[3] - b[1])
    m = re.search(r"\(\s*([01](?:\.\d+)?)\s*,\s*([01](?:\.\d+)?)\s*\)", question)
    if m:
        x, y = float(m.group(1)), float(m.group(2))
        inside = [b for b in boxes if b[0] <= x <= b[2] and b[1] <= y <= b[3]]
        if inside:
            boxes = inside
    return min(boxes, key=area)


def to_pixels(box, size):
    W, H = size
    x0, y0, x1, y1 = box
    return (max(0, round(x0 * W)), max(0, round(y0 * H)), min(W, round(x1 * W)), min(H, round(y1 * H)))


def mask_evidence(img, box):
    out = img.copy()
    out.paste(FILL, box)
    return out


def random_box_outside(img_size, box, rng):
    """Random same-size box that doesn't overlap `box` (same algorithm as the GQA notebook)."""
    W, H = img_size
    l, u, r, b = box
    w, h = r - l, b - u
    mx0, mx1 = max(0, l - w + 1), min(W - w, r - 1)
    regions = [(0, l - w, 0, H - h), (r, W - w, 0, H - h), (mx0, mx1, 0, u - h), (mx0, mx1, b, H - h)]
    regions = [g for g in regions if g[0] <= g[1] and g[2] <= g[3]]
    if not regions:
        return None
    areas = [(g[1] - g[0] + 1) * (g[3] - g[2] + 1) for g in regions]
    x0, x1, y0, y1 = rng.choices(regions, weights=areas, k=1)[0]
    x, y = rng.randint(x0, x1), rng.randint(y0, y1)
    return (x, y, x + w, y + h)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def make_inputs(question, image=None):
    content = [{"type": "text", "text": INSTRUCTION + f"Q: {question}\nA:"}]
    if image is not None:
        content = [{"type": "image"}] + content
    messages = [{"role": "user", "content": content}]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    if image is not None:
        return processor(text=[prompt], images=[image], return_tensors="pt")
    return processor(text=[prompt], return_tensors="pt")


@torch.no_grad()
def score_letters(question, letters, gt, image=None, abstain_letter=None):
    """One forward pass; log-probs of each option letter as the first answer token."""
    inputs = make_inputs(question, image).to(model.device)
    logp = torch.log_softmax(model(**inputs).logits[0, -1].float(), -1)
    lp = {L: logp[LETTER_IDS[L]].item() for L in letters}

    arr = np.array(list(lp.values()))
    p = np.exp(arr - arr.max())
    p /= p.sum()
    probs = dict(zip(lp, p))
    pred = max(probs, key=probs.get)
    real = {L: v for L, v in probs.items() if L != abstain_letter}
    return {
        "logp": lp,                                    # raw (full-vocabulary) log-probs per letter
        "pred": pred,                                  # argmax letter (may be the abstain letter)
        "conf": max(real.values()),                    # top probability among the real options
        "p_gt": probs[gt],                             # renormalized p(correct letter)
        "logp_gt": lp[gt],                             # raw log p(correct letter)
        "entropy": float(-(p * np.log(p + 1e-12)).sum()),
        "p_abstain": probs.get(abstain_letter, np.nan),
        "letter_mass": float(np.exp(arr).sum()),       # how much probability went to option letters at all
    }


def flat(prefix, s):
    out = {f"{prefix}_{k}": v for k, v in s.items() if k != "logp"}
    out[f"{prefix}_logp_json"] = json.dumps(s["logp"])
    return out


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
def threshold_table(good):
    """Abstain when conf < tau. Should abstain: evidence masked. Should answer: full image and the
    random-region control (the control is the fairer comparison: the same amount of image is hidden)."""
    from sklearn.metrics import roc_auc_score

    rows = []
    for tau in np.round(np.arange(0.05, 1.0001, 0.05), 2):
        rows.append({
            "tau": tau,
            "abstain_rate_evidence_masked": float((good["evid_conf"] < tau).mean()),
            "answer_rate_full": float((good["full_conf"] >= tau).mean()),
            "answer_rate_random_masked": float((good["rand_conf"] >= tau).mean()),
        })
    table = pd.DataFrame(rows)
    # Youden's J against the random-mask control: abstain on masked + answer on control - 1.
    table["youden_vs_random"] = table["abstain_rate_evidence_masked"] + table["answer_rate_random_masked"] - 1
    table["youden_vs_full"] = table["abstain_rate_evidence_masked"] + table["answer_rate_full"] - 1

    def auroc(pos, neg):  # higher score = should abstain, so score = -conf
        y = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
        return float(roc_auc_score(y, np.r_[-pos, -neg]))

    best = table.loc[table["youden_vs_random"].idxmax()]
    keep95 = table[table["answer_rate_random_masked"] >= 0.95]
    summary = {
        "n_good": int(len(good)),
        "auroc_conf_masked_vs_random": auroc(good["evid_conf"].values, good["rand_conf"].values),
        "auroc_conf_masked_vs_full": auroc(good["evid_conf"].values, good["full_conf"].values),
        "best_tau_youden_vs_random": float(best["tau"]),
        "at_best_tau": best.to_dict(),
        "highest_tau_keeping_95pct_random_answers": float(keep95["tau"].max()) if len(keep95) else None,
        "abstain_option_chosen": {
            "full": float((good["full_ab_pred"] == good["abstain_letter"]).mean()),
            "evidence_masked": float((good["evid_ab_pred"] == good["abstain_letter"]).mean()),
            "random_masked": float((good["rand_ab_pred"] == good["abstain_letter"]).mean()),
        },
        "still_answers_when_masked": float((good["evid_ab_pred"] != good["abstain_letter"]).mean()),
        "accuracy": {
            "full": float((good["full_pred"] == good["gt"]).mean()),
            "evidence_masked": float((good["evid_pred"] == good["gt"]).mean()),
            "random_masked": float((good["rand_pred"] == good["gt"]).mean()),
        },
        "mean_conf": {k: float(good[f"{k}_conf"].mean()) for k in ("full", "evid", "rand")},
        "mean_logp_gt": {k: float(good[f"{k}_logp_gt"].mean()) for k in ("full", "evid", "rand", "qonly")},
        "filters": {"CONF_MIN": CONF_MIN, "IMAGE_GAIN_MIN": IMAGE_GAIN_MIN, "MAX_BOX_FRAC": MAX_BOX_FRAC,
                    "N_SCREEN": N_SCREEN, "SEED": SEED},
    }
    return table, summary


# ---------------------------------------------------------------------------
# Main loop (background thread)
# ---------------------------------------------------------------------------
STATE = {"done": 0, "total": None, "good": 0, "finished": False, "error": None, "started": time.time()}


def run():
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        # Pick classification questions from the text alone (no image decoding), then shuffle.
        questions = ds["question"]
        idx = [i for i, q in enumerate(questions)
               if parse_options(q) and question_type(q, parse_options(q)) == "classification"]
        random.seed(SEED)
        random.shuffle(idx)
        if N_SCREEN is not None:
            idx = idx[:N_SCREEN]
        STATE["total"] = len(idx)
        rng = random.Random(SEED + 1)  # separate RNG for the random-region control
        rows = []

        for i in idx:
            ex = ds[i]
            q, gt = ex["question"], ex["answer"].strip().upper()
            options = parse_options(q)
            letters = [L for L, _ in options]
            row = {"ds_index": i, "question": q, "gt": gt, "n_options": len(options),
                   "qtype": question_type(q, options) if options else "unparsed", "good": False, "reject": ""}

            box = pick_evidence_box(q, ex["bbox"] or [])
            row["box_norm"] = json.dumps(box)
            row["box_frac"] = (box[2] - box[0]) * (box[3] - box[1]) if box else np.nan

            if row["qtype"] != "classification" or gt not in letters:
                row["reject"] = "qtype" if gt in letters else "unparsed"
            elif box is None or row["box_frac"] > MAX_BOX_FRAC:
                row["reject"] = "box"
            else:
                img = ex["image"].convert("RGB")
                full = score_letters(q, letters, gt, img)
                qonly = score_letters(q, letters, gt, None)
                row.update(flat("full", full))
                row.update(flat("qonly", qonly))
                row["image_gain"] = full["logp_gt"] - qonly["logp_gt"]

                if full["pred"] != gt:
                    row["reject"] = "wrong"
                elif full["p_gt"] < CONF_MIN:
                    row["reject"] = "low_conf"
                elif row["image_gain"] < IMAGE_GAIN_MIN:
                    row["reject"] = "not_image_dependent"
                else:
                    px_box = to_pixels(box, img.size)
                    rand_box = random_box_outside(img.size, px_box, rng)
                    if rand_box is None:
                        row["reject"] = "no_control_box"
                    else:
                        row["good"] = True
                        row["box_px"], row["rand_box_px"] = json.dumps(px_box), json.dumps(rand_box)
                        evid_img, rand_img = mask_evidence(img, px_box), mask_evidence(img, rand_box)
                        ab_q, ab = add_abstain_option(q, options)
                        row["abstain_letter"] = ab
                        row.update(flat("evid", score_letters(q, letters, gt, evid_img)))
                        row.update(flat("rand", score_letters(q, letters, gt, rand_img)))
                        row.update(flat("full_ab", score_letters(ab_q, letters + [ab], gt, img, ab)))
                        row.update(flat("evid_ab", score_letters(ab_q, letters + [ab], gt, evid_img, ab)))
                        row.update(flat("rand_ab", score_letters(ab_q, letters + [ab], gt, rand_img, ab)))
                        STATE["good"] += 1

            rows.append(row)
            STATE["done"] += 1
            if STATE["done"] % 50 == 0:
                pd.DataFrame(rows).to_csv(OUT_DIR / "vitar_screen.csv", index=False)  # checkpoint

        df = pd.DataFrame(rows)
        df.to_csv(OUT_DIR / "vitar_screen.csv", index=False)
        good = df[df["good"]].copy()
        good.to_csv(OUT_DIR / "vitar_good_examples.csv", index=False)

        if good.empty:
            raise RuntimeError("no examples passed the filters; loosen CONF_MIN / IMAGE_GAIN_MIN")
        table, summary = threshold_table(good)
        summary["screen_counts"] = {
            "reject": df["reject"].replace("", "kept").value_counts().to_dict(),
        }
        table.to_csv(OUT_DIR / "vitar_thresholds.csv", index=False)
        (OUT_DIR / "vitar_summary.json").write_text(json.dumps(summary, indent=2, default=float))
    except Exception:
        STATE["error"] = traceback.format_exc()
    finally:
        STATE["finished"] = True
        STATE["elapsed_s"] = round(time.time() - STATE["started"])


# Set RUN_SCREEN = False before this file to load only the helpers (vitar_checker.py does this).
if globals().get("RUN_SCREEN", True):
    threading.Thread(target=run, daemon=True).start()
    print("started screening thread")
