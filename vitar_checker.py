"""Confidence + grounding abstention checker on ViTAR-16K.

For each input image we compute:
  C  = confidence: probability of the model's top answer, renormalized over the option letters.
  G  = grounding: the model names the box it used for its answer; we gray out that box and re-score
       the same answer. G = log p(answer | input) - log p(answer | pointed box masked).
       Large G: the answer depended on the region it pointed to. G near 0: it didn't.
  abstain option: we also add "Cannot be determined from the image" as an extra option and record
       whether the model picks it.

Inputs scored per example (only questions the model answers correctly on the full image):
  full  - original image                       -> should answer
  evid  - annotated lesion box grayed out      -> should abstain
  rand  - same-size random box grayed out      -> should answer (control: occlusion alone isn't a reason to abstain)

Run on Colab (loads helpers from vitar_abstention.py without starting its screen):
    (echo RUN_SCREEN=False; cat vitar_abstention.py vitar_checker.py) | colab exec -s vlm
Then poll CSTATE. Output: /content/results/checker/checker_rows.csv. Calibrate with vitar_calibrate.py.
"""
import hashlib

N_CANDIDATES = 300                     # first N shuffled classification questions (seed 0)
CHECK_OUT = OUT_DIR / "checker"


def renorm_logp(lp, letters):
    """Log-probs renormalized over the given option letters."""
    a = np.array([lp[L] for L in letters])
    lse = a.max() + np.log(np.exp(a - a.max()).sum())
    return {L: lp[L] - lse for L in letters}


def iou(a, b):
    if a is None or b is None:
        return np.nan
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else np.nan


@torch.no_grad()
def point_region(question, options, letter, image):
    """Ask the model for the box supporting its answer. Returns (pixel box in `image` coords or None, raw text).

    Qwen2.5-VL outputs absolute coordinates in the resized image it actually saw
    (image_grid_thw patches x 14 px), so we scale back to the original size.
    """
    text = dict(options)[letter]
    q = (f"{question}\nThe answer is {letter}) {text}. Output the bounding box of the image region that "
         'supports this answer in JSON format: {"bbox_2d": [x1, y1, x2, y2]}.')
    messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": q}]}]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = processor(text=[prompt], images=[image], return_tensors="pt").to(model.device)
    out = model.generate(**inputs, max_new_tokens=64, do_sample=False, temperature=None, top_p=None, top_k=None)
    raw = processor.tokenizer.decode(out[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    nums = re.findall(r"-?\d+(?:\.\d+)?", raw.split("bbox_2d", 1)[-1])
    if len(nums) < 4:
        return None, raw
    x0, y0, x1, y1 = map(float, nums[:4])
    W, H = image.size
    if max(x0, y0, x1, y1) <= 1.0:            # normalized output, just in case
        sx, sy = W, H
    else:
        _, gh, gw = inputs["image_grid_thw"][0].tolist()
        sx, sy = W / (gw * 14), H / (gh * 14)
    box = (max(0, round(min(x0, x1) * sx)), max(0, round(min(y0, y1) * sy)),
           min(W, round(max(x0, x1) * sx)), min(H, round(max(y0, y1) * sy)))
    if box[2] - box[0] < 2 or box[3] - box[1] < 2:
        return None, raw
    return box, raw


def check_input(prefix, q, options, letters, gt, ab_q, ab, image):
    """C, G and the abstain-option choice for one input image. Returns (flat dict, renormalized log-probs)."""
    s = score_letters(q, letters, gt, image)
    s_ab = score_letters(ab_q, letters + [ab], gt, image, ab)
    pred = s["pred"]
    rn = renorm_logp(s["logp"], letters)

    box, raw = point_region(q, options, pred, image)
    if box is None:
        G = logp_after = np.nan
    else:
        s2 = score_letters(q, letters, gt, mask_evidence(image, box))
        logp_after = renorm_logp(s2["logp"], letters)[pred]
        G = rn[pred] - logp_after

    row = {
        "pred": pred, "C": s["conf"], "p_gt": s["p_gt"], "logp_pred": rn[pred],
        "G": G, "logp_pred_after_point_mask": logp_after,
        "pointed_box": json.dumps(box), "point_raw": raw,
        "pointed_frac": ((box[2] - box[0]) * (box[3] - box[1]) / (image.size[0] * image.size[1])) if box else np.nan,
        "ab_pred": s_ab["pred"], "p_abstain": s_ab["p_abstain"],
        "logp_json": json.dumps(s["logp"]),
    }
    return {f"{prefix}_{k}": v for k, v in row.items()}, rn, box


CSTATE = {"done": 0, "total": None, "kept": 0, "finished": False, "error": None, "started": time.time()}


def run_checker():
    try:
        CHECK_OUT.mkdir(parents=True, exist_ok=True)
        questions = ds["question"]
        idx = [i for i, q in enumerate(questions)
               if parse_options(q) and question_type(q, parse_options(q)) == "classification"]
        random.seed(SEED)
        random.shuffle(idx)
        idx = idx[:N_CANDIDATES]
        CSTATE["total"] = len(idx)
        rng = random.Random(SEED + 1)
        rows = []

        for i in idx:
            ex = ds[i]
            q, gt = ex["question"], ex["answer"].strip().upper()
            options = parse_options(q)
            letters = [L for L, _ in options]
            row = {"ds_index": i, "question": q, "gt": gt, "kept": False, "reject": ""}
            box = pick_evidence_box(q, ex["bbox"] or [])

            if gt not in letters:
                row["reject"] = "unparsed"
            elif box is None or (box[2] - box[0]) * (box[3] - box[1]) > MAX_BOX_FRAC:
                row["reject"] = "box"
            else:
                img = ex["image"].convert("RGB")
                row["image_group"] = hashlib.md5(img.tobytes()).hexdigest()[:12]  # for the by-image split
                row["box_frac"] = (box[2] - box[0]) * (box[3] - box[1])
                px_box = to_pixels(box, img.size)
                row["gt_box_px"] = json.dumps(px_box)
                ab_q, ab = add_abstain_option(q, options)
                row["abstain_letter"] = ab

                # Cheap first pass: skip the expensive pointing step for questions answered wrong.
                if score_letters(q, letters, gt, img)["pred"] != gt:
                    row["reject"] = "wrong_on_full"
                    rows.append(row)
                    CSTATE["done"] += 1
                    continue

                full, rn_full, full_box = check_input("full", q, options, letters, gt, ab_q, ab, img)
                row.update(full)
                row["full_point_iou_gt"] = iou(full_box, px_box)  # sanity check on the pointing

                rand_box = random_box_outside(img.size, px_box, rng)
                if row["full_pred"] != gt:
                    row["reject"] = "wrong_on_full"
                elif rand_box is None:
                    row["reject"] = "no_control_box"
                else:
                    row["kept"] = True
                    row["rand_box_px"] = json.dumps(rand_box)
                    evid, rn_evid, _ = check_input("evid", q, options, letters, gt, ab_q, ab, mask_evidence(img, px_box))
                    rand, _, _ = check_input("rand", q, options, letters, gt, ab_q, ab, mask_evidence(img, rand_box))
                    row.update(evid)
                    row.update(rand)
                    # Oracle grounding with the annotated box (not usable at test time; for reference only).
                    row["full_G_oracle"] = rn_full[row["full_pred"]] - rn_evid[row["full_pred"]]
                    CSTATE["kept"] += 1

            rows.append(row)
            CSTATE["done"] += 1
            if CSTATE["done"] % 25 == 0:
                pd.DataFrame(rows).to_csv(CHECK_OUT / "checker_rows.csv", index=False)

        pd.DataFrame(rows).to_csv(CHECK_OUT / "checker_rows.csv", index=False)
    except Exception:
        CSTATE["error"] = traceback.format_exc()
    finally:
        CSTATE["finished"] = True
        CSTATE["elapsed_s"] = round(time.time() - CSTATE["started"])


threading.Thread(target=run_checker, daemon=True).start()
print("started checker thread")
