#!/usr/bin/env python3
"""
Cloud Detection ML - Final Version with City Light Filtering

Run periodically to test cloud detection under different lighting conditions.
Results are saved with timestamps for comparison.

Usage:
    python3 cloud_detection_ml_final.py
    python3 cloud_detection_ml_final.py --threshold 0.3
    python3 cloud_detection_ml_final.py --output my_results/
"""

import os
import json
import argparse
import numpy as np
from PIL import Image
import requests
from io import BytesIO
import cv2
from datetime import datetime

# Get script directory for relative paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

import torch
import torchvision.transforms as transforms
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights


class CloudDetectorML:
    """ML-based cloud detector with city light filtering"""

    def __init__(self, threshold=0.25, grid_size=20, patch_size=64):
        self.threshold = threshold
        self.grid_size = grid_size
        self.patch_size = patch_size

        # Load model
        print('Loading MobileNetV3 model...')
        weights = MobileNet_V3_Small_Weights.DEFAULT
        self.model = mobilenet_v3_small(weights=weights)
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                               std=[0.229, 0.224, 0.225])
        ])

    def is_city_light(self, center_patch, brightness):
        """Detect if a region is likely city lights rather than clouds"""
        r_mean = center_patch[:,:,0].mean()
        g_mean = center_patch[:,:,1].mean()
        b_mean = center_patch[:,:,2].mean()

        # Cities are orange/yellow (high R, medium G, low B)
        is_orange = (r_mean > g_mean * 1.1) and (r_mean > b_mean * 1.3)

        # Cities have high local variance (point lights)
        gray_patch = center_patch.mean(axis=2)
        local_variance = gray_patch.std()
        is_textured = local_variance > 40

        # Clouds tend to have more blue
        blue_ratio = b_mean / (r_mean + 1)
        is_cloud_color = blue_ratio > 0.8

        return is_orange, is_textured, is_cloud_color

    def generate_cloud_mask(self, image):
        """Generate cloud probability mask for an image"""
        if isinstance(image, np.ndarray):
            img_array = image
            image = Image.fromarray(image)
        else:
            img_array = np.array(image)

        h, w = img_array.shape[:2]
        prob_map = np.zeros((h, w), dtype=np.float32)
        count_map = np.zeros((h, w), dtype=np.float32)

        for cy in range(0, h, self.grid_size):
            for cx in range(0, w, self.grid_size):
                half = self.patch_size // 2
                x1 = max(0, cx - half)
                y1 = max(0, cy - half)
                x2 = min(w, cx + half)
                y2 = min(h, cy + half)

                patch = image.crop((x1, y1, x2, y2)).resize((224, 224), Image.LANCZOS)

                # Analyze center region
                cy1, cy2 = max(0, cy-10), min(h, cy+10)
                cx1, cx2 = max(0, cx-10), min(w, cx+10)
                center_patch = img_array[cy1:cy2, cx1:cx2]

                brightness = center_patch.mean() / 255.0

                # Check for city lights
                is_orange, is_textured, is_cloud_color = self.is_city_light(
                    center_patch, brightness
                )

                # Get ML features
                input_tensor = self.transform(patch).unsqueeze(0)
                with torch.no_grad():
                    features = self.model(input_tensor)
                    activation = features.abs().mean().item()

                # Calculate cloud probability
                cloud_prob = brightness * (1 - min(activation / 10, 1))

                # Apply city light penalties
                if is_orange:
                    cloud_prob *= 0.3
                if is_textured and brightness > 0.2:
                    cloud_prob *= 0.5
                if not is_cloud_color and brightness > 0.3:
                    cloud_prob *= 0.6

                # Boost cloud-like regions
                if is_cloud_color and not is_textured:
                    cloud_prob *= 1.2

                y_end = min(cy + self.grid_size, h)
                x_end = min(cx + self.grid_size, w)
                prob_map[cy:y_end, cx:x_end] += cloud_prob
                count_map[cy:y_end, cx:x_end] += 1

        prob_map = np.divide(prob_map, count_map, where=count_map > 0)
        prob_map = cv2.GaussianBlur(prob_map, (31, 31), 0)

        return prob_map

    def detect_at_points(self, image, points):
        """Detect clouds at specific points (border crossings)"""
        prob_map = self.generate_cloud_mask(image)

        results = []
        for idx, pt in enumerate(points):
            x, y = pt['x'], pt['y']
            # Use small neighborhood
            y1, y2 = max(0, y-3), min(prob_map.shape[0], y+3)
            x1, x2 = max(0, x-3), min(prob_map.shape[1], x+3)
            prob = prob_map[y1:y2, x1:x2].mean()

            results.append({
                'index': idx,
                'point': pt,
                'probability': float(prob),
                'is_cloud': prob > self.threshold
            })

        return results, prob_map


def fetch_noaa_image():
    """Fetch current border image from NOAA"""
    url = (
        'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/'
        'Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&'
        'bbox=-13041000%2C3871000%2C-10845000%2C2961000&'
        'imageSR=102100&bboxSR=102100&size=1000%2C500'
    )
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content)).resize(
        (1000, 500), Image.LANCZOS
    ).convert('RGB')
    return image


def create_visualization(image, prob_map, results, threshold):
    """Create visualization with mask overlay and marked points"""
    img_array = np.array(image)
    img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

    # Create cloud mask
    cloud_mask = (prob_map > threshold).astype(np.uint8) * 255

    # Create overlay
    mask_colored = np.zeros_like(img_bgr)
    mask_colored[:, :, 0] = cloud_mask
    mask_colored[:, :, 2] = cloud_mask

    alpha = 0.35
    overlay = img_bgr.copy()
    mask_bool = cloud_mask > 0
    overlay[mask_bool] = cv2.addWeighted(
        img_bgr, 1-alpha, mask_colored, alpha, 0
    )[mask_bool]

    # Draw contours
    contours, _ = cv2.findContours(
        cloud_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    cv2.drawContours(overlay, contours, -1, (0, 255, 255), 2)

    # Mark border crossing points
    for r in results:
        x, y = r['point']['x'], r['point']['y']
        color = (255, 0, 0) if r['is_cloud'] else (0, 255, 0)
        cv2.circle(overlay, (x, y), 5, color, -1)
        cv2.circle(overlay, (x, y), 6, (255, 255, 255), 1)

    # Add info
    clouds_detected = sum(1 for r in results if r['is_cloud'])
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cv2.putText(overlay, f'{timestamp} | Threshold: {threshold} | Clouds: {clouds_detected}/{len(results)}',
                (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)

    return overlay, cloud_mask


def main():
    parser = argparse.ArgumentParser(description='ML Cloud Detection')
    parser.add_argument('--threshold', '-t', type=float, default=0.25,
                        help='Cloud detection threshold (default: 0.25)')
    parser.add_argument('--output', '-o', default='cloud_detection_results',
                        help='Output directory')
    parser.add_argument('--points', '-p',
                        default=os.path.join(SCRIPT_DIR, 'public/images/frontera.json'),
                        help='Border crossing points JSON')
    parser.add_argument('--minimal', action='store_true',
                        help='Only save overlay and original (skip mask and report)')
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    # Load points
    with open(args.points) as f:
        points = json.load(f)['points']

    # Fetch image
    print('Fetching NOAA satellite image...')
    image = fetch_noaa_image()

    # Run detection
    detector = CloudDetectorML(threshold=args.threshold)
    print(f'Running cloud detection (threshold={args.threshold})...')
    results, prob_map = detector.detect_at_points(image, points)

    # Create visualization
    overlay, mask = create_visualization(image, prob_map, results, args.threshold)

    # Save results
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    image.save(f'{args.output}/original_{timestamp}.jpg')
    cv2.imwrite(f'{args.output}/overlay_{timestamp}.jpg', overlay)

    clouds_detected = sum(1 for r in results if r['is_cloud'])

    if not args.minimal:
        cv2.imwrite(f'{args.output}/mask_{timestamp}.png', mask)

        # Save JSON report (convert numpy types)
        def convert_numpy(obj):
            if isinstance(obj, (np.bool_, np.integer)):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, dict):
                return {k: convert_numpy(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy(i) for i in obj]
            return obj

        report = {
            'timestamp': datetime.now().isoformat(),
            'threshold': args.threshold,
            'total_points': len(results),
            'clouds_detected': clouds_detected,
            'results': convert_numpy(results)
        }
        with open(f'{args.output}/report_{timestamp}.json', 'w') as f:
            json.dump(report, f, indent=2)

    # Print summary
    print(f'\n{"="*50}')
    print(f'RESULTS - {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'{"="*50}')
    print(f'Threshold: {args.threshold}')
    print(f'Clouds detected: {clouds_detected}/{len(results)}')
    print(f'\nSaved to {args.output}/')
    print(f'  - overlay_{timestamp}.jpg')
    print(f'  - original_{timestamp}.jpg')
    if not args.minimal:
        print(f'  - mask_{timestamp}.png')
        print(f'  - report_{timestamp}.json')

    return {'clouds_detected': clouds_detected, 'total_points': len(results)}


if __name__ == '__main__':
    main()
