"""
Standalone Real-ESRGAN x2 upscaler using PyTorch directly.
No dependency on basicsr/realesrgan packages.

Usage:
    from upscale import upscale_image
    upscaled = upscale_image(pil_image)  # Returns PIL Image at 2x resolution
"""

import os
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, 'models', 'RealESRGAN_x2plus.pth')


# --- RRDBNet architecture (minimal, matches Real-ESRGAN x2plus weights) ---

class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, scale=2, num_feat=64,
                 num_block=23, num_grow_ch=32):
        super().__init__()
        self.scale = scale
        # x2plus uses pixel_unshuffle: 2x downscale, 3ch -> 12ch
        num_in_ch = num_in_ch * 4
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        # Two upsample layers (4x from unshuffled = 2x from original)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        # Pixel unshuffle: (B,3,H,W) -> (B,12,H/2,W/2)
        x = F.pixel_unshuffle(x, 2)
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


# --- Upscaler ---

_model = None

def _load_model():
    global _model
    if _model is not None:
        return _model

    model = RRDBNet(num_in_ch=3, num_out_ch=3, scale=2,
                    num_feat=64, num_block=23, num_grow_ch=32)

    state_dict = torch.load(MODEL_PATH, map_location='cpu')
    if 'params_ema' in state_dict:
        state_dict = state_dict['params_ema']
    elif 'params' in state_dict:
        state_dict = state_dict['params']

    model.load_state_dict(state_dict, strict=True)
    model.eval()
    _model = model
    return model


def upscale_image(img):
    """
    Upscale a PIL Image by 2x using Real-ESRGAN.

    Args:
        img: PIL Image (RGB)

    Returns:
        PIL Image at 2x resolution
    """
    model = _load_model()

    # PIL -> numpy -> tensor
    img_np = np.array(img).astype(np.float32) / 255.0
    h, w = img_np.shape[:2]

    # Pad to even dimensions (pixel_unshuffle requires divisible by 2)
    pad_h = h % 2
    pad_w = w % 2
    if pad_h or pad_w:
        img_np = np.pad(img_np, ((0, pad_h), (0, pad_w), (0, 0)), mode='reflect')

    # HWC -> CHW, add batch dim
    tensor = torch.from_numpy(img_np.transpose(2, 0, 1)).unsqueeze(0)

    with torch.no_grad():
        output = model(tensor)

    # Clamp and convert back
    output = output.squeeze(0).clamp(0, 1).numpy()
    output = (output.transpose(1, 2, 0) * 255.0).round().astype(np.uint8)

    # Crop padding (scaled by 2x)
    if pad_h or pad_w:
        output = output[:h * 2, :w * 2]

    return Image.fromarray(output)


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('Usage: python3 upscale.py <input_image> [output_image]')
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path.replace('.jpg', '_x2.jpg')

    print(f'Loading {input_path}...')
    img = Image.open(input_path).convert('RGB')
    print(f'Input size: {img.size}')

    print('Upscaling...')
    result = upscale_image(img)
    print(f'Output size: {result.size}')

    result.save(output_path, quality=95)
    print(f'Saved to {output_path}')
