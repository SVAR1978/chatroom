import os
import uuid
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, render_template, request

from compare_images import (
    compare_images,
    detect_contours_and_boxes,
    preprocess_for_contours,
    resize_with_letterbox,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "web" / "static" / "uploads"
RESULTS_DIR = BASE_DIR / "web" / "static" / "results"
TEMPLATES_DIR = BASE_DIR / "web" / "templates"
STATIC_DIR = BASE_DIR / "web" / "static"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, template_folder=str(TEMPLATES_DIR), static_folder=str(STATIC_DIR))


def _unique_name(prefix: str, original_filename: str) -> str:
    ext = Path(original_filename).suffix.lower() or ".png"
    return f"{prefix}_{uuid.uuid4().hex}{ext}"


def _draw_analysis_overlay(image_path: Path, out_path: Path, target_size: tuple[int, int]) -> None:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    resized = resize_with_letterbox(image, target_size)
    binary = preprocess_for_contours(resized)
    contours, boxes = detect_contours_and_boxes(binary)

    # Draw contours in green to show detected object boundaries.
    overlay = resized.copy()
    cv2.drawContours(overlay, contours, -1, (50, 220, 140), 2)

    # Draw axis-aligned bounding boxes in orange for localization.
    for x, y, w, h in boxes:
        cv2.rectangle(overlay, (x, y), (x + w, y + h), (40, 180, 255), 2)

    cv2.imwrite(str(out_path), overlay)


def _save_variant(image: "cv2.typing.MatLike", prefix: str, variant: str, ext: str = ".png") -> Path:
    """Save an image variant into the results folder with a unique name."""
    path = RESULTS_DIR / f"{prefix}_{variant}_{uuid.uuid4().hex}{ext}"
    cv2.imwrite(str(path), image)
    return path


def _kb(path: Path) -> float:
    """Return file size in KB for reporting compression results."""
    return round(path.stat().st_size / 1024.0, 2)


def _compression_match_score(reference: np.ndarray, compressed_path: Path) -> dict[str, float]:
    """Score how closely a compressed image matches the reference image."""
    compressed = cv2.imread(str(compressed_path), cv2.IMREAD_COLOR)
    if compressed is None:
        return {
            "score_percent": 0.0,
            "pixel_similarity_percent": 0.0,
            "psnr_db": 0.0,
            "mae": 255.0,
        }

    if compressed.shape[:2] != reference.shape[:2]:
        compressed = cv2.resize(
            compressed,
            (reference.shape[1], reference.shape[0]),
            interpolation=cv2.INTER_AREA,
        )

    mae = float(np.mean(cv2.absdiff(reference, compressed)))
    pixel_similarity = max(0.0, 100.0 * (1.0 - (mae / 255.0)))

    psnr_db = float(cv2.PSNR(reference, compressed))
    if np.isinf(psnr_db):
        psnr_db = 99.0

    psnr_scaled = min(psnr_db, 50.0) / 50.0 * 100.0

    # Weighted score favors direct pixel similarity while keeping PSNR influence.
    score_percent = (0.7 * pixel_similarity) + (0.3 * psnr_scaled)

    return {
        "score_percent": round(score_percent, 2),
        "pixel_similarity_percent": round(pixel_similarity, 2),
        "psnr_db": round(psnr_db, 2),
        "mae": round(mae, 2),
    }


def _scan_analyze_and_compress(
    image_path: Path,
    prefix: str,
    target_size: tuple[int, int],
) -> dict[str, object]:
    """Generate scanned variants and compressed versions for a single uploaded image."""
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")

    resized = resize_with_letterbox(image, target_size)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 70, 140)

    # Thresholding acts as a simple scan-like binary segmentation.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, boxes = detect_contours_and_boxes(binary)

    analyzed = resized.copy()
    cv2.drawContours(analyzed, contours, -1, (50, 220, 140), 2)
    for x, y, w, h in boxes:
        cv2.rectangle(analyzed, (x, y), (x + w, y + h), (40, 180, 255), 2)

    gray_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    edges_bgr = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    binary_bgr = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    resized_path = _save_variant(resized, prefix, "resized")
    gray_path = _save_variant(gray_bgr, prefix, "grayscale")
    edges_path = _save_variant(edges_bgr, prefix, "edges")
    binary_path = _save_variant(binary_bgr, prefix, "binary")
    analyzed_path = _save_variant(analyzed, prefix, "analyzed")

    jpeg_path = RESULTS_DIR / f"{prefix}_compressed_{uuid.uuid4().hex}.jpg"
    webp_path = RESULTS_DIR / f"{prefix}_compressed_{uuid.uuid4().hex}.webp"
    cv2.imwrite(str(jpeg_path), resized, [cv2.IMWRITE_JPEG_QUALITY, 55])
    cv2.imwrite(str(webp_path), resized, [cv2.IMWRITE_WEBP_QUALITY, 55])

    jpeg_match = _compression_match_score(resized, jpeg_path)
    webp_match = _compression_match_score(resized, webp_path)

    return {
        "variants": {
            "resized": f"results/{resized_path.name}",
            "grayscale": f"results/{gray_path.name}",
            "edges": f"results/{edges_path.name}",
            "binary_scan": f"results/{binary_path.name}",
            "analyzed": f"results/{analyzed_path.name}",
            "compressed_jpeg": f"results/{jpeg_path.name}",
            "compressed_webp": f"results/{webp_path.name}",
        },
        "scan_metrics": {
            "detected_contours": len(contours),
            "detected_bounding_boxes": len(boxes),
            "compression_kb": {
                "resized_png": _kb(resized_path),
                "compressed_jpeg": _kb(jpeg_path),
                "compressed_webp": _kb(webp_path),
            },
            "compression_match_scores": {
                "jpeg_vs_source": jpeg_match,
                "webp_vs_source": webp_match,
            },
        },
    }


@app.get("/")
def index() -> str:
    return render_template("index.html", result=None, error=None)


@app.post("/analyze")
def analyze() -> str:
    original_file = request.files.get("original_image")
    generated_file = request.files.get("generated_image")

    if not original_file or not generated_file:
        return render_template(
            "index.html",
            result=None,
            error="Please upload both original and generated images.",
        )

    width = int(request.form.get("width", 640))
    height = int(request.form.get("height", 640))
    target_size = (max(64, width), max(64, height))

    original_name = _unique_name("original", original_file.filename)
    generated_name = _unique_name("generated", generated_file.filename)

    original_path = UPLOAD_DIR / original_name
    generated_path = UPLOAD_DIR / generated_name
    original_file.save(original_path)
    generated_file.save(generated_path)

    match_vis_name = f"matches_{uuid.uuid4().hex}.png"
    analyzed_original_name = f"analyzed_original_{uuid.uuid4().hex}.png"
    analyzed_generated_name = f"analyzed_generated_{uuid.uuid4().hex}.png"

    match_vis_path = RESULTS_DIR / match_vis_name
    analyzed_original_path = RESULTS_DIR / analyzed_original_name
    analyzed_generated_path = RESULTS_DIR / analyzed_generated_name

    try:
        metrics = compare_images(
            original_path=str(original_path),
            generated_path=str(generated_path),
            output_path=str(match_vis_path),
            target_size=target_size,
        )
        _draw_analysis_overlay(original_path, analyzed_original_path, target_size)
        _draw_analysis_overlay(generated_path, analyzed_generated_path, target_size)
        original_scan = _scan_analyze_and_compress(original_path, "original", target_size)
        generated_scan = _scan_analyze_and_compress(generated_path, "generated", target_size)
    except Exception as exc:
        return render_template("index.html", result=None, error=f"Analysis failed: {exc}")

    result = {
        "metrics": metrics,
        "images": {
            "original": f"uploads/{original_name}",
            "generated": f"uploads/{generated_name}",
            "analyzed_original": f"results/{analyzed_original_name}",
            "analyzed_generated": f"results/{analyzed_generated_name}",
            "match_visualization": f"results/{match_vis_name}",
        },
        "scan": {
            "original": original_scan,
            "generated": generated_scan,
        },
        "compression_match_with_original": original_scan["scan_metrics"]["compression_match_scores"],
    }

    return render_template("index.html", result=result, error=None)


if __name__ == "__main__":
    host = os.environ.get("ANALYZER_HOST", "0.0.0.0")
    port = int(os.environ.get("ANALYZER_PORT", "5050"))
    app.run(host=host, port=port, debug=True)
