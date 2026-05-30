// 1-bit BMP generator for the two e-paper displays.
//
// Produces /home/morakana/cumulus/public/images/{continente,nubes_frontera}_1360x480.bmp
// to replace the corresponding output of /home/morakana/cumulus/cumulus.py.
//
// Pipeline (per BMP):
//   1. Fetch NOAA satellite tile at 480×1360 (portrait, upside-down)
//   2. sharp: rotate 180 → composite caption strip → rotate -90 (landscape 1360×480)
//   3. Floyd-Steinberg dither to 1-bit
//   4. Write monochrome BMP (MSB-first, bottom-up rows)

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const BORDER_BBOX = [-13050000, 4050000, -10750000, 2900000]; // matches cumulus.py
const CONTINENTAL_BBOX = '-13961794,5951224,-3167246,-5132306';
const NOAA_BASE = 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage';
const W = 480;   // portrait width (request size)
const H = 1360;  // portrait height (request size)
const CAPTION_H = 22;

function fetchUrl(url, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('NOAA fetch timeout')));
    });
}

function captionSvg(width, height, text, { stripY = null, flipText = false } = {}) {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const y0 = stripY != null ? stripY : (height - CAPTION_H);
    const baselineY = y0 + 15;
    // flipText rotates the text 180° around the strip center so glyphs appear
    // upside-down in source coords — that becomes bottom-to-top in landscape
    // after the final 90° rotation.
    const textXml = flipText
        ? `<text x="${width - 5}" y="${baselineY}" font-family="sans-serif" font-size="12" fill="#ffffff" text-anchor="end" transform="rotate(180 ${width / 2} ${y0 + CAPTION_H / 2})">${esc}</text>`
        : `<text x="5" y="${baselineY}" font-family="sans-serif" font-size="12" fill="#ffffff">${esc}</text>`;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<rect x="0" y="${y0}" width="${width}" height="${CAPTION_H}" fill="#000000"/>` +
        textXml +
        `</svg>`
    );
}

function floydSteinberg(gray, w, h) {
    const a = new Int16Array(gray.length);
    for (let i = 0; i < gray.length; i++) a[i] = gray[i];
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            const i = row + x;
            const old = a[i];
            const nw = old < 128 ? 0 : 255;
            a[i] = nw;
            const err = old - nw;
            if (x + 1 < w)              a[i + 1]     += (err * 7) >> 4;
            if (x > 0 && y + 1 < h)     a[i + w - 1] += (err * 3) >> 4;
            if (y + 1 < h)              a[i + w]     += (err * 5) >> 4;
            if (x + 1 < w && y + 1 < h) a[i + w + 1] += (err * 1) >> 4;
        }
    }
    const out = Buffer.alloc(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = a[i] < 128 ? 0 : 255;
    return out;
}

function writeBmp1bit(gray, w, h, outPath) {
    const rowBytes = Math.ceil(w / 8);
    const padded = (rowBytes + 3) & ~3;
    const pixelDataSize = padded * h;
    const fileHeaderSize = 14;
    const infoHeaderSize = 40;
    const colorTableSize = 8;
    const dataOffset = fileHeaderSize + infoHeaderSize + colorTableSize;
    const fileSize = dataOffset + pixelDataSize;

    const buf = Buffer.alloc(fileSize);
    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(0, 6);
    buf.writeUInt32LE(dataOffset, 10);
    buf.writeUInt32LE(infoHeaderSize, 14);
    buf.writeInt32LE(w, 18);
    buf.writeInt32LE(h, 22);     // positive → bottom-up rows
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(1, 28);
    buf.writeUInt32LE(0, 30);    // BI_RGB
    buf.writeUInt32LE(pixelDataSize, 34);
    buf.writeInt32LE(2835, 38);  // 72 DPI
    buf.writeInt32LE(2835, 42);
    buf.writeUInt32LE(0, 46);
    buf.writeUInt32LE(0, 50);
    // Color table (BGRA): 0 = black, 1 = white
    buf[54] = 0;   buf[55] = 0;   buf[56] = 0;   buf[57] = 0;
    buf[58] = 255; buf[59] = 255; buf[60] = 255; buf[61] = 0;

    for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * w;
        const dstRow = dataOffset + y * padded;
        for (let x = 0; x < w; x++) {
            if (gray[srcRow + x] >= 128) {
                buf[dstRow + (x >> 3)] |= 1 << (7 - (x & 7));
            }
        }
    }
    fs.writeFileSync(outPath, buf);
}

async function processToLandscapeBmp(noaaBuf, captionText, outPath, {
    flip180 = false,
    cropTopPx = 0,
    cropBottomPx = 0,
    emptyRightPx = 0,
    captionAtBoundary = false,
    captionFlipped = false,
    overlayLandscape = [],
} = {}) {
    // NOAA tile is portrait 480×1360. We flip 180 to right it, composite the
    // caption strip, then rotate ±90 to land 1360×480 landscape.
    //   flip180=false → rotate -90 CCW (caption ends on landscape-right)
    //   flip180=true  → rotate +90 CW  (caption ends on landscape-left)
    // cropTopPx/cropBottomPx drop polar bands from the raw NOAA tile.
    // emptyRightPx reserves white space on the landscape-right (for the
    // future US-Mex border overlay). Content gets scaled to fit the
    // remaining area.
    // captionAtBoundary places the caption right where image meets empty.
    let pre = sharp(noaaBuf);
    if (cropTopPx > 0 || cropBottomPx > 0 || emptyRightPx > 0) {
        const rawContentH = H - cropTopPx - cropBottomPx;
        const targetContentH = H - emptyRightPx;
        const contentBuf = await pre
            .extract({ left: 0, top: cropTopPx, width: W, height: rawContentH })
            .resize(W, targetContentH, { fit: 'fill' })
            .toBuffer();
        if (emptyRightPx > 0) {
            // Empty must land on landscape-right.
            //   flip180=true  (+90 CW): buffer-top → landscape-right → pad NOAA-bottom
            //   flip180=false (-90 CCW): buffer-bottom → landscape-right → pad NOAA-top
            const padSide = flip180 ? 'bottom' : 'top';
            pre = sharp(await sharp(contentBuf)
                .extend({ [padSide]: emptyRightPx, background: '#ffffff' })
                .png()
                .toBuffer()
            );
        } else {
            pre = sharp(contentBuf);
        }
    }
    // Caption position in buffer coords (after the rotate 180 below).
    //   captionAtBoundary + flip180=true:  strip at y=emptyRightPx (top of content)
    //   captionAtBoundary + flip180=false: strip at y=H-emptyRightPx-CAPTION_H
    //   otherwise: default to buffer bottom (lands on landscape-right with flip180=false,
    //              landscape-left with flip180=true).
    let stripY;
    if (captionAtBoundary && emptyRightPx > 0) {
        stripY = flip180 ? emptyRightPx : (H - emptyRightPx - CAPTION_H);
    } else {
        stripY = H - CAPTION_H;
    }
    const caption = captionSvg(W, H, captionText, { stripY, flipText: captionFlipped });
    // Two stages because chaining a post-composite rotate makes sharp
    // resolve dims in an order that rejects same-size composite layers.
    const captioned = await pre
        .rotate(180)
        .composite([{ input: caption }])
        .png()
        .toBuffer();
    let landscape = await sharp(captioned)
        .rotate(flip180 ? 90 : -90)
        .png()
        .toBuffer();
    if (overlayLandscape.length > 0) {
        landscape = await sharp(landscape)
            .composite(overlayLandscape)
            .png()
            .toBuffer();
    }
    const gray = await sharp(landscape)
        .grayscale()
        .raw()
        .toBuffer();
    const dithered = floydSteinberg(gray, H, W);
    writeBmp1bit(dithered, H, W, outPath);
}

async function generateContinenteBmp(outPath) {
    const url = `${NOAA_BASE}?f=image&bbox=${CONTINENTAL_BBOX}&imageSR=102100&bboxSR=102100&size=${W},${H}`;
    const png = await fetchUrl(url);
    const ts = new Date().toLocaleString('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).replace(',', '');

    // Build US-Mex border overlay (latest ML detection JPG) and caption 2
    // for the empty space on the landscape-right. With emptyRightPx=350 and
    // CAPTION_H=22, the empty area in landscape is x=1010..1359 (after
    // caption 1 at x=988..1009). Layout: border fills x=1010..1337
    // (328 wide), caption 2 at x=1338..1359.
    const BORDER_H = 480;
    const CAP_W = 22;
    const CAP_H = 480;
    const GAP_PX = 1;
    // Find the most recent ML overlay image in border_images/ml_detection/.
    const overlayDir = path.join(__dirname, 'border_images', 'ml_detection');
    let latestOverlayPath = null;
    if (fs.existsSync(overlayDir)) {
        const candidates = fs.readdirSync(overlayDir)
            .filter(f => f.startsWith('overlay_') && f.endsWith('.jpg'))
            .map(f => ({ f, mtime: fs.statSync(path.join(overlayDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        if (candidates.length > 0) {
            latestOverlayPath = path.join(overlayDir, candidates[0].f);
            console.log(`[bmp] picked overlay: ${candidates[0].f} (mtime ${new Date(candidates[0].mtime).toISOString()})`);
        }
    }
    // Preserve the source aspect — width derived from BORDER_H + source ratio.
    // Source (e.g., 2000×1000) → rotated 90° has natural aspect = srcH/srcW.
    // For BORDER_H tall, width = BORDER_H * (srcH/srcW).
    let borderRotated;
    let borderW;
    if (latestOverlayPath) {
        const meta = await sharp(latestOverlayPath).metadata();
        borderW = Math.round(BORDER_H * meta.height / meta.width);
        // Resize to (BORDER_H wide × borderW tall) — matches source aspect, no distortion.
        // Then rotate -90 CCW → (borderW wide × BORDER_H tall).
        borderRotated = await sharp(latestOverlayPath)
            .resize(BORDER_H, borderW, { fit: 'fill' })
            .rotate(-90)
            .png()
            .toBuffer();
    } else {
        borderW = 240;
        borderRotated = Buffer.from(
            `<svg width="${borderW}" height="${BORDER_H}" xmlns="http://www.w3.org/2000/svg">` +
            `<rect width="${borderW}" height="${BORDER_H}" fill="#ffffff"/>` +
            `</svg>`
        );
    }
    // Layout chained from the right edge: | BORDER | CAP2 |. CAP3 was removed
    // because both MORAKANA + CUMULUS now live in the left info bar.
    const CAP2_LEFT = 1360 - CAP_W;
    const BORDER_LEFT = CAP2_LEFT - borderW;
    const EMPTY_RIGHT_PX = 1360 - BORDER_LEFT;
    const caption2Text = `Mexico - United States Border    ${ts}`;
    // Caption 2: right-justified — end of text anchored at the top of the strip.
    const caption2Svg = Buffer.from(
        `<svg width="${CAP_W}" height="${CAP_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${CAP_W}" height="${CAP_H}" fill="#000000"/>` +
        `<text x="15" y="15" transform="rotate(-90, 15, 15)" font-family="sans-serif" font-size="12" fill="#ffffff" text-anchor="end">${caption2Text}</text>` +
        `</svg>`
    );
    // Left info bar: MORAKANA pinned to the bottom (left-justified — START
    // of text at strip-bottom) and CUMULUS - <year> pinned to the top
    // (right-justified — END of text at strip-top). The bar is wider than a
    // regular caption strip so there's no white gap before the continent.
    const INFO_FONT = 17; // 20% bigger than the previous 14pt
    const year = new Date().getFullYear();
    const MORAKANA_W = 32;
    const TOP_MARGIN = 13;     // pulled closer to top of strip → more right-justified
    const BOTTOM_MARGIN = 17;  // net -3 from base 20 (down 5, then up 2)
    const TEXT_X = 23;         // net +3 from base 20 (right 5, then left 2)
    const morakanaSvg = Buffer.from(
        `<svg width="${MORAKANA_W}" height="${CAP_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${MORAKANA_W}" height="${CAP_H}" fill="#000000"/>` +
        `<text x="${TEXT_X}" y="${CAP_H - BOTTOM_MARGIN}" transform="rotate(-90, ${TEXT_X}, ${CAP_H - BOTTOM_MARGIN})" font-family="sans-serif" font-size="${INFO_FONT}" fill="#ffffff">MORAKANA</text>` +
        `<text x="${TEXT_X}" y="${TOP_MARGIN}" transform="rotate(-90, ${TEXT_X}, ${TOP_MARGIN})" font-family="sans-serif" font-size="${INFO_FONT}" fill="#ffffff" text-anchor="end">CUMULUS - ${year}</text>` +
        `</svg>`
    );

    await processToLandscapeBmp(png, `American Continent    ${ts}`, outPath, {
        flip180: true,
        cropTopPx: 200,
        cropBottomPx: 300,
        emptyRightPx: EMPTY_RIGHT_PX,
        captionAtBoundary: true,
        captionFlipped: true,
        overlayLandscape: [
            { input: morakanaSvg, left: 0, top: 0 },
            { input: borderRotated, left: BORDER_LEFT, top: 0 },
            { input: caption2Svg, left: CAP2_LEFT, top: 0 },
        ],
    });
}

function pickRecentCrossing(crossingsDir, hoursWindow = 2) {
    if (!fs.existsSync(crossingsDir)) return null;
    const cutoff = Date.now() - hoursWindow * 3600 * 1000;
    const recent = [];
    let mostRecent = null;
    for (const fn of fs.readdirSync(crossingsDir)) {
        const m = fn.match(/^border_(\d+)_/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        const stat = fs.statSync(path.join(crossingsDir, fn));
        if (stat.mtimeMs >= cutoff) recent.push(idx);
        if (!mostRecent || stat.mtimeMs > mostRecent.mtime) {
            mostRecent = { idx, mtime: stat.mtimeMs };
        }
    }
    if (recent.length > 0) return recent[Math.floor(Math.random() * recent.length)];
    return mostRecent ? mostRecent.idx : null;
}

// Last crossing that generateCrossingBmp picked. Exposed via getLedState so
// an external LED controller can light the same crossing the BMP is showing.
let lastSelectedCrossing = null;
let lastSelectedAt = null;

function getLedState(crossingsDir, hoursWindow = 2) {
    const indices = new Set();
    if (fs.existsSync(crossingsDir)) {
        const cutoff = Date.now() - hoursWindow * 3600 * 1000;
        for (const fn of fs.readdirSync(crossingsDir)) {
            const m = fn.match(/^border_(\d+)_/);
            if (!m) continue;
            const stat = fs.statSync(path.join(crossingsDir, fn));
            if (stat.mtimeMs >= cutoff) indices.add(parseInt(m[1], 10));
        }
    }
    return {
        selected: lastSelectedCrossing,
        selectedAt: lastSelectedAt,
        withClouds: [...indices].sort((a, b) => a - b),
        hoursWindow,
        updatedAt: new Date().toISOString(),
    };
}

// EPSG:3857 / NOAA 102100 (Web Mercator)
function lonLatToMerc(lon, lat) {
    const R = 6378137;
    return {
        x: R * lon * Math.PI / 180,
        y: R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
    };
}

async function generateCrossingBmp(outPath, crossingsDir, crossings) {
    const idx = pickRecentCrossing(crossingsDir, 2);
    if (idx == null || !crossings[idx]) {
        throw new Error('no recent crossing available');
    }
    lastSelectedCrossing = idx;
    lastSelectedAt = new Date().toISOString();
    const c = crossings[idx];
    const { lat, lon } = c.coordinates;
    const { x: cx, y: cy } = lonLatToMerc(lon, lat);
    // Window: 575 km wide (matches cumulus.py zoom=4 on the border bbox),
    // height scaled to the 480×1360 tile aspect so NOAA doesn't stretch.
    const halfW = (BORDER_BBOX[2] - BORDER_BBOX[0]) / 8;
    const halfH = halfW * (H / W);
    const bbox = [cx - halfW, cy - halfH, cx + halfW, cy + halfH];
    const url = `${NOAA_BASE}?f=image&bbox=${bbox.join(',')}&imageSR=102100&bboxSR=102100&size=${W},${H}`;
    const png = await fetchUrl(url);
    // Pre-rotate 180 so the satellite content lands right-side-up; the
    // caption position is unaffected because it's composited later.
    const flipped = await sharp(png).rotate(180).png().toBuffer();
    const ts = new Date().toLocaleString('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).replace(',', '');
    const message = ` Clouds Crossing: ${lat.toFixed(3)}, ${lon.toFixed(3)}    ${ts}`;
    await processToLandscapeBmp(flipped, message, outPath, { flip180: true });
}

module.exports = {
    generateContinenteBmp,
    generateCrossingBmp,
    pickRecentCrossing,
    getLedState,
};
