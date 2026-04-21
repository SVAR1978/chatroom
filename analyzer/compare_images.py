import argparse
import json
from typing import Any

import cv2
import numpy as np


def load_image(path: str) -> np.ndarray:
    """Load an image from disk and fail fast if it cannot be read."""
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image at path: {path}")
    return image


def resize_with_letterbox(image: np.ndarray, target_size: tuple[int, int]) -> np.ndarray:
    """Resize image to target size while preserving aspect ratio via letterboxing."""
    target_w, target_h = target_size
    h, w = image.shape[:2]

    scale = min(target_w / w, target_h / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))

    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    pad_w = target_w - new_w
    pad_h = target_h - new_h
    left = pad_w // 2
    right = pad_w - left
    top = pad_h // 2
    bottom = pad_h - top

    letterboxed = cv2.copyMakeBorder(
        resized,
        top,
        bottom,
        left,
        right,
        borderType=cv2.BORDER_CONSTANT,
        value=(0, 0, 0),
    )
    return letterboxed


def preprocess_for_contours(image: np.ndarray) -> np.ndarray:
    """Create a clean binary map for contour extraction."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Otsu thresholding creates a stable foreground mask across varied lighting.
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Morphological closing fills small gaps so contour regions are less fragmented.
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
    return binary


def detect_contours_and_boxes(binary: np.ndarray) -> tuple[list[np.ndarray], list[tuple[int, int, int, int]]]:
    """Detect external contours and derive axis-aligned bounding boxes."""
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[tuple[int, int, int, int]] = [cv2.boundingRect(cnt) for cnt in contours]
    return contours, boxes


def contour_iou(contours_a: list[np.ndarray], contours_b: list[np.ndarray], shape: tuple[int, int]) -> float:
    """Compute IoU between two contour sets by rasterizing them into masks."""
    h, w = shape
    mask_a = np.zeros((h, w), dtype=np.uint8)
    mask_b = np.zeros((h, w), dtype=np.uint8)

    if contours_a:
        cv2.drawContours(mask_a, contours_a, contourIdx=-1, color=255, thickness=cv2.FILLED)
    if contours_b:
        cv2.drawContours(mask_b, contours_b, contourIdx=-1, color=255, thickness=cv2.FILLED)

    inter = np.logical_and(mask_a > 0, mask_b > 0).sum()
    union = np.logical_or(mask_a > 0, mask_b > 0).sum()
    if union == 0:
        return 0.0
    return float(inter / union)


def merge_boxes(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int] | None:
    """Merge a list of boxes into a single enclosing box (x, y, w, h)."""
    if not boxes:
        return None

    x_min = min(x for x, _, _, _ in boxes)
    y_min = min(y for _, y, _, _ in boxes)
    x_max = max(x + w for x, _, w, _ in boxes)
    y_max = max(y + h for _, y, _, h in boxes)
    return x_min, y_min, x_max - x_min, y_max - y_min


def box_iou(box_a: tuple[int, int, int, int] | None, box_b: tuple[int, int, int, int] | None) -> float:
    """Compute IoU between two axis-aligned bounding boxes."""
    if box_a is None or box_b is None:
        return 0.0

    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh

    inter_x1 = max(ax, bx)
    inter_y1 = max(ay, by)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = aw * ah
    area_b = bw * bh
    union = area_a + area_b - inter_area
    if union <= 0:
        return 0.0
    return float(inter_area / union)


def compute_orb_matches(
    image_a: np.ndarray,
    image_b: np.ndarray,
    ratio_thresh: float = 0.75,
) -> dict[str, Any]:
    """Detect ORB keypoints/descriptors and filter matches with Lowe's ratio test."""
    gray_a = cv2.cvtColor(image_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(image_b, cv2.COLOR_BGR2GRAY)

    orb = cv2.ORB_create(nfeatures=2000)
    keypoints_a, descriptors_a = orb.detectAndCompute(gray_a, None)
    keypoints_b, descriptors_b = orb.detectAndCompute(gray_b, None)

    good_matches: list[cv2.DMatch] = []

    if descriptors_a is not None and descriptors_b is not None and len(descriptors_a) > 0 and len(descriptors_b) > 0:
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        knn_matches = matcher.knnMatch(descriptors_a, descriptors_b, k=2)

        # Lowe's ratio test keeps only distinctive matches.
        for pair in knn_matches:
            if len(pair) < 2:
                continue
            m, n = pair
            if m.distance < ratio_thresh * n.distance:
                good_matches.append(m)

    min_kp = min(len(keypoints_a), len(keypoints_b)) if keypoints_a and keypoints_b else 0
    match_ratio = float(len(good_matches) / min_kp) if min_kp > 0 else 0.0
    avg_distance = float(np.mean([m.distance for m in good_matches])) if good_matches else 0.0

    return {
        "keypoints_a": keypoints_a,
        "keypoints_b": keypoints_b,
        "good_matches": good_matches,
        "num_keypoints_a": len(keypoints_a),
        "num_keypoints_b": len(keypoints_b),
        "num_good_matches": len(good_matches),
        "keypoint_match_ratio": match_ratio,
        "average_match_distance": avg_distance,
    }


def draw_and_save_matches(
    image_a: np.ndarray,
    keypoints_a: list[cv2.KeyPoint],
    image_b: np.ndarray,
    keypoints_b: list[cv2.KeyPoint],
    matches: list[cv2.DMatch],
    out_path: str,
    max_draw: int = 100,
) -> str:
    """Draw side-by-side keypoint matches and save visualization image."""
    matches_to_draw = sorted(matches, key=lambda m: m.distance)[:max_draw]

    vis = cv2.drawMatches(
        image_a,
        keypoints_a,
        image_b,
        keypoints_b,
        matches_to_draw,
        None,
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS,
    )
    cv2.imwrite(out_path, vis)
    return out_path


def compare_images(original_path: str, generated_path: str, output_path: str, target_size: tuple[int, int]) -> dict[str, Any]:
    """Run the full comparison pipeline and return structured metrics."""
    # Step 1: Load and resize both images to a common frame.
    original = load_image(original_path)
    generated = load_image(generated_path)
    original_resized = resize_with_letterbox(original, target_size)
    generated_resized = resize_with_letterbox(generated, target_size)

    # Step 2 + 3: ORB feature detection + BFMatcher (Lowe's ratio test).
    orb_result = compute_orb_matches(original_resized, generated_resized)

    # Step 4: Contour detection and bounding boxes from thresholded binary masks.
    binary_original = preprocess_for_contours(original_resized)
    binary_generated = preprocess_for_contours(generated_resized)
    contours_original, boxes_original = detect_contours_and_boxes(binary_original)
    contours_generated, boxes_generated = detect_contours_and_boxes(binary_generated)

    # Step 5: IoU for contours (mask IoU) and for merged bounding boxes.
    c_iou = contour_iou(contours_original, contours_generated, shape=(target_size[1], target_size[0]))
    merged_box_original = merge_boxes(boxes_original)
    merged_box_generated = merge_boxes(boxes_generated)
    b_iou = box_iou(merged_box_original, merged_box_generated)

    # Step 6: Compute an overall original-vs-generated similarity score.
    mae = float(np.mean(cv2.absdiff(original_resized, generated_resized)))
    pixel_similarity_percent = max(0.0, 100.0 * (1.0 - (mae / 255.0)))

    psnr_db = float(cv2.PSNR(original_resized, generated_resized))
    if np.isinf(psnr_db):
        psnr_db = 99.0
    psnr_scaled_percent = min(psnr_db, 50.0) / 50.0 * 100.0

    keypoint_score_percent = min(orb_result["keypoint_match_ratio"] * 100.0, 100.0)
    contour_score_percent = c_iou * 100.0
    box_score_percent = b_iou * 100.0

    overall_match_score_percent = (
        0.30 * pixel_similarity_percent
        + 0.20 * psnr_scaled_percent
        + 0.30 * keypoint_score_percent
        + 0.10 * contour_score_percent
        + 0.10 * box_score_percent
    )

    # Step 7: Draw match visualization and save.
    saved_vis_path = draw_and_save_matches(
        original_resized,
        orb_result["keypoints_a"],
        generated_resized,
        orb_result["keypoints_b"],
        orb_result["good_matches"],
        output_path,
    )

    # Step 8: Return structured metrics payload.
    result = {
        "inputs": {
            "original_image": original_path,
            "generated_image": generated_path,
            "target_size": {"width": target_size[0], "height": target_size[1]},
        },
        "keypoints": {
            "num_keypoints_original": orb_result["num_keypoints_a"],
            "num_keypoints_generated": orb_result["num_keypoints_b"],
            "num_good_matches": orb_result["num_good_matches"],
            "keypoint_match_ratio": orb_result["keypoint_match_ratio"],
            "average_match_distance": orb_result["average_match_distance"],
            "lowe_ratio_threshold": 0.75,
        },
        "contours": {
            "num_contours_original": len(contours_original),
            "num_contours_generated": len(contours_generated),
            "contour_iou": c_iou,
        },
        "bounding_boxes": {
            "num_boxes_original": len(boxes_original),
            "num_boxes_generated": len(boxes_generated),
            "merged_box_original": merged_box_original,
            "merged_box_generated": merged_box_generated,
            "bounding_box_iou": b_iou,
        },
        "image_similarity": {
            "overall_match_score_percent": round(overall_match_score_percent, 2),
            "pixel_similarity_percent": round(pixel_similarity_percent, 2),
            "psnr_db": round(psnr_db, 2),
            "mae": round(mae, 2),
            "component_scores_percent": {
                "keypoint_score": round(keypoint_score_percent, 2),
                "contour_score": round(contour_score_percent, 2),
                "bounding_box_score": round(box_score_percent, 2),
                "psnr_scaled_score": round(psnr_scaled_percent, 2),
            },
            "weights": {
                "pixel_similarity": 0.30,
                "psnr_scaled": 0.20,
                "keypoints": 0.30,
                "contours": 0.10,
                "bounding_boxes": 0.10,
            },
        },
        "outputs": {
            "match_visualization": saved_vis_path,
        },
    }
    return result


def parse_args() -> argparse.Namespace:
    """Parse command-line args for easy local execution."""
    parser = argparse.ArgumentParser(description="Compare two images using ORB, contour IoU, and box IoU.")
    parser.add_argument("--original", required=True, help="Path to original image")
    parser.add_argument("--generated", required=True, help="Path to generated image")
    parser.add_argument(
        "--output",
        default="match_visualization.png",
        help="Path to save side-by-side keypoint match visualization",
    )
    parser.add_argument("--width", type=int, default=640, help="Target resize width")
    parser.add_argument("--height", type=int, default=640, help="Target resize height")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    metrics = compare_images(
        original_path=args.original,
        generated_path=args.generated,
        output_path=args.output,
        target_size=(args.width, args.height),
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
