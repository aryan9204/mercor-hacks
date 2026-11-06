"""Checker v2: test-time abstention signals on the 119-question set (correct on the full image).

Should answer:   full image; random same-size region masked.
Should abstain:  evid      - annotated lesion box grayed out
                 evid_big  - lesion box scaled 2.5x around its center, grayed out
                 mismatch_cross - image from a different body area (e.g. a fundus image for a brain-tumor question)
                 mismatch_same  - (coordinate questions only) image from the same body area, so the
                                  named coordinates point at a different patient's anatomy

Signals (none needs the true answer or the lesion location):
  C_orig       top-option probability in the original option order
  C_perm       top-option probability averaged over up to 4 cyclic orderings of the options
               (mapped back to option text) - removes the letter-position bias
  consistency  share of orderings whose top option equals the averaged answer (the shuffle test)
  blind_gain   log p(answer | image) - log p(answer | no image), both order-averaged (the blind test)
  p_abstain    probability of an added "Cannot be determined from the image" option

Run on Colab (needs results/checker/checker_rows.csv uploaded to /content/checker_rows.csv):
    (echo RUN_SCREEN=False; cat vitar_abstention.py vitar_checker_v2.py) | colab exec -s vlm
Poll V2STATE. Output: /content/results/checker_v2/checker_v2_rows.csv (one row per question x input).
Calibrate with vitar_calibrate_v2.py.
"""
V2_OUT = OUT_DIR / "checker_v2"
K_PERM = 4
BIG_SCALE = 2.5
SRC_ROWS = Path("/content/checker_rows.csv")

MODALITIES = [
    ("fundus", r"fundus|glaucoma"), ("kidney", r"kidney"), ("breast", r"breast"),
    ("brain", r"glioma|meningioma|pituitary|brain"), ("spine", r"stenosis|spinal|\bL\d-[LS]\d"),
    ("dental", r"tooth|caries|filling"), ("nodule", r"nodule|thyroid"),
    ("liver", r"steatosis|liver|ballooning"), ("tumor_stage", r"early-stage|late-stage|malignant"),
]
COORD_RE = r"\(\s*[01](?:\.\d+)?\s*,\s*[01](?:\.\d+)?\s*\)"


def modality(q):
    for name, pat in MODALITIES:
        if re.search(pat, q, re.I):
            return name
    return "other"


def stem_of(question):
    return question[: re.search(r"\bA\)", question).start()].rstrip()


def build_question(stem, texts):
    return stem + " " + " ".join(f"{chr(65 + k)}) {t}" for k, t in enumerate(texts))


@torch.no_grad()
def option_probs(stem, texts, image):
    """Option probabilities under up to K_PERM cyclic orderings, mapped back to the original option index.
    Returns (order-averaged probs, per-ordering probs [K x n])."""
    n = len(texts)
    per = []
    for s in range(min(K_PERM, n)):
        order = [(k + s) % n for k in range(n)]           # position j shows original option order[j]
        inputs = make_inputs(build_question(stem, [texts[o] for o in order]), image).to(model.device)
        logp = torch.log_softmax(model(**inputs).logits[0, -1].float(), -1)
        a = np.array([logp[LETTER_IDS[chr(65 + j)]].item() for j in range(n)])
        p = np.exp(a - a.max())
        p /= p.sum()
        back = np.zeros(n)
        back[order] = p
        per.append(back)
    per = np.array(per)
    return per.mean(0), per


def signals(stem, texts, ab_q, letters, ab, gt, image, text_avg):
    avg, per = option_probs(stem, texts, image)
    pred = int(avg.argmax())
    s_ab = score_letters(ab_q, letters + [ab], gt, image, ab)
    return {
        "pred_idx": pred,
        "orig_pred_idx": int(per[0].argmax()),
        "C_orig": float(per[0].max()),
        "C_perm": float(avg.max()),
        "consistency": float((per.argmax(1) == pred).mean()),
        "blind_gain": float(np.log(avg[pred] + 1e-12) - np.log(text_avg[pred] + 1e-12)),
        "p_abstain": float(s_ab["p_abstain"]),
        "abstain_pick": bool(s_ab["pred"] == ab),
        "probs_json": json.dumps(avg.round(5).tolist()),
    }


def scaled_box(box, size, scale):
    W, H = size
    x0, y0, x1, y1 = box
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * scale / 2, (y1 - y0) * scale / 2
    return (max(0, round(cx - hw)), max(0, round(cy - hh)), min(W, round(cx + hw)), min(H, round(cy + hh)))


V2STATE = {"done": 0, "total": None, "finished": False, "error": None, "started": time.time()}


def run_v2():
    try:
        V2_OUT.mkdir(parents=True, exist_ok=True)
        src = pd.read_csv(SRC_ROWS)
        src = src[src["kept"] == True].reset_index(drop=True)  # noqa: E712
        src["modality"] = src["question"].map(modality)
        src["has_coords"] = src["question"].str.contains(COORD_RE)

        # Same by-image split as vitar_calibrate.py; mismatch donors come from the same split.
        groups = np.array(sorted(src["image_group"].unique()), dtype=object)
        np.random.default_rng(0).shuffle(groups)
        calib = set(groups[: len(groups) // 2])
        src["split"] = np.where(src["image_group"].isin(calib), "calib", "test")

        rng = random.Random(SEED + 2)
        V2STATE["total"] = len(src)
        out = []
        for _, r in src.iterrows():
            ex = ds[int(r["ds_index"])]
            img = ex["image"].convert("RGB")
            q, gt = r["question"], r["gt"]
            options = parse_options(q)
            letters = [L for L, _ in options]
            texts = [t for _, t in options]
            stem = stem_of(q)
            ab_q, ab = add_abstain_option(q, options)
            gt_idx = letters.index(gt)
            box = tuple(json.loads(r["gt_box_px"]))
            rand_box = tuple(json.loads(r["rand_box_px"]))
            big = scaled_box(box, img.size, BIG_SCALE)

            same_split = src[(src["split"] == r["split"]) & (src["image_group"] != r["image_group"])]
            cross = same_split[same_split["modality"] != r["modality"]]
            same = same_split[same_split["modality"] == r["modality"]]
            inputs = {
                "full": (img, False),
                "rand": (mask_evidence(img, rand_box), False),
                "evid": (mask_evidence(img, box), True),
                "evid_big": (mask_evidence(img, big), True),
            }
            donors = {}
            if len(cross):
                donors["mismatch_cross"] = cross.iloc[rng.randrange(len(cross))]
            if r["has_coords"] and len(same):
                donors["mismatch_same"] = same.iloc[rng.randrange(len(same))]
            for name, d in donors.items():
                inputs[name] = (ds[int(d["ds_index"])]["image"].convert("RGB"), True)

            text_avg, _ = option_probs(stem, texts, None)  # question only, shared by all inputs
            for cond, (image, should_abstain) in inputs.items():
                row = {
                    "ds_index": int(r["ds_index"]), "image_group": r["image_group"], "split": r["split"],
                    "modality": r["modality"], "question": q, "gt_idx": gt_idx, "n_options": len(texts),
                    "condition": cond, "should_abstain": should_abstain,
                    "donor_ds_index": int(donors[cond]["ds_index"]) if cond in donors else -1,
                    "big_box_frac": (big[2] - big[0]) * (big[3] - big[1]) / (img.size[0] * img.size[1]),
                }
                row.update(signals(stem, texts, ab_q, letters, ab, gt, image, text_avg))
                row["correct"] = row["pred_idx"] == gt_idx
                out.append(row)
            V2STATE["done"] += 1
            if V2STATE["done"] % 10 == 0:
                pd.DataFrame(out).to_csv(V2_OUT / "checker_v2_rows.csv", index=False)
        pd.DataFrame(out).to_csv(V2_OUT / "checker_v2_rows.csv", index=False)
    except Exception:
        V2STATE["error"] = traceback.format_exc()
    finally:
        V2STATE["finished"] = True
        V2STATE["elapsed_s"] = round(time.time() - V2STATE["started"])


threading.Thread(target=run_v2, daemon=True).start()
print("started checker v2 thread")
