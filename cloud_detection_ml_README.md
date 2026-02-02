# Cloud Detection ML

Machine learning-based cloud detection for NOAA satellite imagery of the US-Mexico border.

## Overview

This module provides an ML-based alternative to the traditional brightness threshold method used in `cumulus.py`. It uses a MobileNetV3 neural network to analyze satellite imagery and detect clouds while filtering out city lights.

## Features

- **ML-based detection**: Uses MobileNetV3 pretrained on ImageNet
- **City light filtering**: Distinguishes clouds from city lights using:
  - Color analysis (orange/yellow vs white/blue)
  - Texture analysis (point lights vs smooth clouds)
  - Blue ratio analysis
- **Full image mask**: Generates cloud probability heatmap for entire image
- **Border crossing detection**: Detects clouds at specific crossing points
- **Timestamped results**: Saves results for comparison over time

## Requirements

```bash
# Core dependencies
pip install torch torchvision
pip install numpy opencv-python pillow requests
```

Note: On systems with limited RAM (< 4GB), use CPU-only PyTorch:
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

## Files

| File | Description |
|------|-------------|
| `cloud_detection_ml_final.py` | Main script - run for cloud detection |
| `cloud_detection_ml.py` | Basic ML test harness |
| `cloud_detection_torchgeo.py` | TorchGeo-based detection (requires more RAM) |

## Usage

### Basic Usage

```bash
# Run with default settings (threshold=0.25)
python3 cloud_detection_ml_final.py

# Adjust threshold (lower = more sensitive)
python3 cloud_detection_ml_final.py --threshold 0.20

# Custom output directory
python3 cloud_detection_ml_final.py --output my_results/
```

### Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--threshold`, `-t` | 0.25 | Cloud detection threshold (0.0-1.0) |
| `--output`, `-o` | `cloud_detection_results` | Output directory |
| `--points`, `-p` | `public/images/frontera.json` | Border crossing points file |
| `--minimal` | false | Only save overlay and original (skip mask and report) |

### Output Files

Each run generates timestamped files:

```
cloud_detection_results/
├── overlay_20260202_120000.jpg   # Image with mask + marked points
├── original_20260202_120000.jpg  # Original NOAA image
├── mask_20260202_120000.png      # Binary cloud mask (skipped with --minimal)
└── report_20260202_120000.json   # Detection data (skipped with --minimal)
```

## Algorithm

### Cloud Probability Calculation

For each grid cell in the image:

1. **Brightness score**: `brightness = mean(R, G, B) / 255`
2. **ML activation**: Extract features using MobileNetV3
3. **Base probability**: `prob = brightness * (1 - activation/10)`

### City Light Filtering

Penalties applied to reduce false positives from city lights:

| Condition | Penalty |
|-----------|---------|
| Orange color (R > G*1.1 and R > B*1.3) | × 0.3 |
| High texture + bright | × 0.5 |
| Non-cloud color + bright | × 0.6 |
| Cloud-like color + smooth | × 1.2 (boost) |

### Detection Threshold

- Default: 0.25
- Lower values (0.15-0.20): More sensitive, catches thin clouds
- Higher values (0.30-0.40): Less sensitive, only dense clouds

## Integration with border-monitor-cumulus-pure.js

ML detection runs automatically with the Node.js server. Every time the server runs, it:

1. Runs RGB threshold detection (original method)
2. Automatically runs ML detection with `--minimal` flag
3. Saves ML results to `border_images/ml_detection/`
4. Prints a comparison of both methods

```bash
# Run server (ML detection is automatic)
node border-monitor-cumulus-pure.js

# To disable ML detection for a single run
node border-monitor-cumulus-pure.js --no-ml
```

### Output Location

ML detection results are saved to:
```
border_images/ml_detection/
├── overlay_20260202_120000.jpg   # Image with mask + marked points
└── original_20260202_120000.jpg  # Original NOAA image
```

## Standalone Usage

To run ML detection independently:

```bash
# Run with default settings
python3 cloud_detection_ml_final.py

# Run with minimal output (like the server does)
python3 cloud_detection_ml_final.py --minimal --output border_images/ml_detection
```

## Comparison with Brightness Threshold

Both methods run automatically when the server executes:

| Aspect | RGB Threshold | ML Detection |
|--------|---------------|--------------|
| Speed | Fast (~1 second) | Slower (~30 seconds) |
| RAM | Minimal | ~500MB |
| City lights | Basic filtering | Advanced filtering |
| Thin clouds | Often missed | Better detection |
| Edge cases | Predictable | Needs tuning |
| Output folder | `border_images/` | `border_images/ml_detection/` |

Example output:
```
📊 Comparison:
   RGB Threshold: 38 clouds detected
   ML Detection:  15 clouds detected
```

## Tuning Tips

1. **Too many false positives**: Increase threshold (0.30-0.40)
2. **Missing thin clouds**: Decrease threshold (0.15-0.20)
3. **City lights detected**: Verify color filtering is working
4. **Inconsistent results**: Compare day vs night images

## Troubleshooting

### Out of Memory
```
Killed (exit code 137)
```
Solution: Use CPU-only PyTorch or a machine with more RAM.

### Slow Performance
The first run downloads the model (~10MB). Subsequent runs are faster.

### Import Errors
```bash
pip install torch torchvision numpy opencv-python pillow requests
```

## License

Part of the Cumulus 2025 project.
