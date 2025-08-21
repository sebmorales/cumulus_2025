#!/usr/bin/env node

/**
 * Pure Cumulus.py-based Border Cloud Monitor
 * Direct implementation of cumulus.py cloud detection logic in Node.js
 * No weather API - pure RGB threshold detection like the original
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration exactly matching cumulus.py approach
const CONFIG = {
  // CORRECTED: Proper bounds to cover ALL border crossings (-117.04°W to -97.47°W)
  border_img: 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-13129234%2C2884188%2C-10750644%2C3958039&imageSR=102100&bboxSR=102100&size=1000%2C500',
  
  // Corrected bounding box that covers all crossings with proper alignment
  bprderBB: [-13129234, 3958039, -10750644, 2884188], // [minX, maxY, maxX, minY]
  
  crossingsFile: './cumulus_reference/crossings.json',
  outputDir: './border_images',
  imageSize: {
    width: 1000,
    height: 500
  },
  
  // Pure cumulus.py detection parameters
  cloudDetection: {
    limit: 148,                    // RGB threshold lowered 5% (128 * 0.95 ≈ 122)
    sampleRadius: 10,               // Pixels to check around each crossing
    confidenceHigh: 75,           // High confidence for clear cloud detection
    confidenceMedium: 55,         // Medium confidence 
    confidenceLow: 35,            // Low confidence
    // City lights vs clouds differentiation
    cityLightMinBrightness: 148,  // Minimum brightness for city light detection
    redDominanceThreshold: 45,    // Red channel must be this much higher than blue/green
    yellowOrangeBoost: 35         // Additional red advantage when combined with high green
  },
  
  markerSize: 10,
  colors: {
    cloudy: '#0066FF',            // Blue for clouds
    clear: '#00FF00',             // Green for clear
    cityLight: '#FF0000',         // Red for city lights
    cloudyStroke: '#0044CC',
    clearStroke: '#00CC00',
    cityLightStroke: '#CC0000'
  }
};

/**
 * Convert lat/lon to pixel coordinates (matching cumulus.py logic)
 */
function latLonToPixel(lat, lon) {
  // Convert lat/lon to Web Mercator coordinates
  const x_merc = lon * 20037508.34 / 180;
  let y_merc = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y_merc = y_merc * 20037508.34 / 180;
  
  // Convert to pixel coordinates using the bounding box
  const [minX, maxY, maxX, minY] = CONFIG.bprderBB;
  
  const pixel_x = Math.round(((x_merc - minX) / (maxX - minX)) * CONFIG.imageSize.width);
  const pixel_y = Math.round(((maxY - y_merc) / (maxY - minY)) * CONFIG.imageSize.height);
  
  return { x: pixel_x, y: pixel_y };
}

/**
 * Download image
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Extract RGB values from JPEG buffer (simplified approach)
 */
function samplePixelRGB(imageBuffer, centerX, centerY, radius) {
  try {
    // Find JPEG data start
    const hex = imageBuffer.toString('hex');
    let dataStart = 1000;
    for (let i = 0; i < hex.length - 4; i += 2) {
      const marker = hex.substr(i, 4);
      if (marker === 'ffda') {
        dataStart = (i / 2) + 2;
        break;
      }
    }
    
    const imageData = imageBuffer.slice(dataStart);
    const totalPixels = CONFIG.imageSize.width * CONFIG.imageSize.height;
    const byteRatio = imageData.length / totalPixels;
    
    const samples = [];
    
    // Sample pixels in a small area around the center point (like cumulus.py)
    for (let dy = -radius; dy <= radius; dy += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        const sampleX = centerX + dx;
        const sampleY = centerY + dy;
        
        if (sampleX >= 0 && sampleX < CONFIG.imageSize.width && 
            sampleY >= 0 && sampleY < CONFIG.imageSize.height) {
          
          const pixelIndex = sampleY * CONFIG.imageSize.width + sampleX;
          const estimatedBytePos = Math.floor(pixelIndex * byteRatio);
          
          if (estimatedBytePos < imageData.length - 2) {
            const r = imageData[estimatedBytePos];
            const g = imageData[estimatedBytePos + 1];
            const b = imageData[estimatedBytePos + 2];
            samples.push({ r, g, b });
          }
        }
      }
    }
    
    return samples;
    
  } catch (error) {
    return [];
  }
}

/**
 * Enhanced cumulus.py cloud detection logic with city light filtering and border crossing detection
 * Direct implementation of: if p_c[0] >= limit and p_c[1] >= limit and p_c[2] >= limit
 * Plus additional logic to distinguish city lights from clouds
 */
function detectClouds_Cumulus(pixelSamples) {
  if (!pixelSamples || pixelSamples.length === 0) {
    return {
      hasClouds: false,
      confidence: 0,
      analysis: 'No pixel data',
      details: { cloudPixels: 0, totalPixels: 0, avgRGB: [0, 0, 0], cityLightPixels: 0 }
    };
  }
  
  const { limit, cityLightMinBrightness, redDominanceThreshold, yellowOrangeBoost } = CONFIG.cloudDetection;
  let cloudPixels = 0;
  let cityLightPixels = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  
  // Apply enhanced cumulus.py logic for each pixel
  pixelSamples.forEach(pixel => {
    totalR += pixel.r;
    totalG += pixel.g;
    totalB += pixel.b;
    
    // Direct translation of cumulus.py line 87: if p_c[0] >= limit and p_c[1] >= limit and p_c[2] >= limit
    if (pixel.r >= limit && pixel.g >= limit && pixel.b >= limit) {
      
      // Enhanced city light detection: SPECIFICALLY check red vs blue
      // Key insight: Clouds tend to be blue-tinted (B > R), City lights are red-tinted (R > B)
      const redVsBlue = pixel.r - pixel.b;  // Positive = more red, Negative = more blue
      const avgBrightness = (pixel.r + pixel.g + pixel.b) / 3;
      
      // City light detection logic:
      // 1. Red channel must be significantly higher than blue channel (R > B)
      // 2. Minimum brightness to avoid noise
      // 3. This specifically catches orange/yellow city lights while preserving blue-tinted clouds
      let isCityLight = false;
      
      if (avgBrightness >= cityLightMinBrightness) {
        // CORE LOGIC: If red is significantly higher than blue = likely city light
        if (redVsBlue >= redDominanceThreshold) {
          isCityLight = true;
        }
        // Additional check for yellow lights (red + green both higher than blue)
        else if (redVsBlue >= (redDominanceThreshold - yellowOrangeBoost) && 
                 (pixel.g - pixel.b) >= (redDominanceThreshold - yellowOrangeBoost)) {
          isCityLight = true;
        }
      }
      
      // If red < blue (blue-tinted), it's likely a cloud, not a city light
      
      if (isCityLight) {
        cityLightPixels++;
        // Don't count as cloud pixel if it's likely a city light
      } else {
        cloudPixels++;
        // This is likely a real cloud (balanced RGB values)
      }
    }
  });
  
  const avgR = Math.round(totalR / pixelSamples.length);
  const avgG = Math.round(totalG / pixelSamples.length);
  const avgB = Math.round(totalB / pixelSamples.length);
  
  const cloudRatio = cloudPixels / pixelSamples.length;
  const cityLightRatio = cityLightPixels / pixelSamples.length;
  
  // Determine if clouds are present (enhanced cumulus.py approach)
  let hasClouds = false;
  let confidence = 0;
  let analysisNotes = [];
  
  // If we detected mostly city lights, reduce cloud confidence
  if (cityLightRatio > cloudRatio && cityLightPixels > 0) {
    analysisNotes.push('city lights detected');
    // Still check for clouds but with reduced confidence
    if (cloudRatio >= 0.2) {
      hasClouds = true;
      confidence = CONFIG.cloudDetection.confidenceLow;
    } else {
      hasClouds = false;
      confidence = Math.max(20, 100 - (avgR + avgG + avgB) / 3 / limit * 50);
    }
  } else {
    // Standard cumulus.py logic when no significant city lights
    if (cloudRatio >= 0.3) {
      hasClouds = true;
      confidence = CONFIG.cloudDetection.confidenceHigh;
    } else if (cloudRatio >= 0.15) {
      hasClouds = true;
      confidence = CONFIG.cloudDetection.confidenceMedium;
    } else if (cloudRatio > 0) {
      hasClouds = true;
      confidence = CONFIG.cloudDetection.confidenceLow;
    } else {
      hasClouds = false;
      confidence = Math.max(0, 100 - (avgR + avgG + avgB) / 3 / limit * 50);
    }
  }
  
  // Build analysis string with specific red vs blue comparison
  let analysis = `RGB(${avgR},${avgG},${avgB}) | ${cloudPixels}/${pixelSamples.length} pixels ≥${limit} | ${Math.round(cloudRatio * 100)}%`;
  if (cityLightPixels > 0) {
    const redVsBlue = avgR - avgB;  // Show specific R-B difference
    analysis += ` | ${cityLightPixels} city lights (R${redVsBlue >= 0 ? '+' : ''}${redVsBlue} vs B)`;
  }
  if (analysisNotes.length > 0) {
    analysis += ` | ${analysisNotes.join(', ')}`;
  }
  
  // Determine the primary detection type for visualization
  let detectionType = 'clear';
  if (cityLightRatio > cloudRatio && cityLightPixels > 0) {
    detectionType = 'cityLight';
  } else if (hasClouds) {
    detectionType = 'cloudy';
  }

  return {
    hasClouds,
    needsHighRes: hasClouds, // Request high-res image for ALL cloud detections
    confidence: Math.round(confidence),
    analysis,
    detectionType,
    details: {
      cloudPixels,
      cityLightPixels,
      totalPixels: pixelSamples.length,
      avgRGB: [avgR, avgG, avgB],
      cloudRatio: Math.round(cloudRatio * 100),
      cityLightRatio: Math.round(cityLightRatio * 100),
      threshold: limit
    }
  };
}

/**
 * Load border crossings
 */
function loadCrossings() {
  try {
    const data = fs.readFileSync(CONFIG.crossingsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load crossings data: ${error.message}`);
  }
}

/**
 * Create output directory
 */
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
}

/**
 * Generate timestamp
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
}

/**
 * Calculate bounds for high-resolution image centered on border crossing
 */
function calculateHighResBounds(lat, lon, width = 240, height = 400) {
  // Convert lat/lon to Web Mercator coordinates
  const centerX = lon * 20037508.34 / 180;
  let centerY = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  centerY = centerY * 20037508.34 / 180;
  
  // Calculate the current image resolution (meters per pixel)
  const [minX, maxY, maxX, minY] = CONFIG.bprderBB;
  const imageWidth = maxX - minX;
  const imageHeight = maxY - minY;
  const metersPerPixelX = imageWidth / CONFIG.imageSize.width;
  const metersPerPixelY = imageHeight / CONFIG.imageSize.height;
  
  // For high-res image, use the better resolution of the two axes
  const bestResolution = Math.min(metersPerPixelX, metersPerPixelY);
  
  // Calculate bounds for high-res image
  const halfWidth = (width * bestResolution) / 2;
  const halfHeight = (height * bestResolution) / 2;
  
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minY: centerY - halfHeight,
    maxY: centerY + halfHeight,
    width,
    height
  };
}

/**
 * Generate NOAA high-resolution image URL for specific border crossing
 */
function generateHighResImageUrl(lat, lon, width = 240, height = 400) {
  const bounds = calculateHighResBounds(lat, lon, width, height);
  
  const url = `https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=${bounds.minX}%2C${bounds.minY}%2C${bounds.maxX}%2C${bounds.maxY}&imageSR=102100&bboxSR=102100&size=${width}%2C${height}`;
  
  return {
    url,
    bounds,
    center: { lat, lon }
  };
}

/**
 * Request and save high-resolution image for border crossing
 */
async function requestHighResImage(crossing, timestamp, borderNumber) {
  try {
    console.log(`🔍 Requesting high-res image for border ${borderNumber} (${crossing.name})...`);
    
    const { url, bounds, center } = generateHighResImageUrl(
      crossing.coordinates.lat, 
      crossing.coordinates.lon, 
      240, 
      400
    );
    
    const imageBuffer = await downloadImage(url);
    
    // Create clouds_over_borders directory
    const cloudsDir = path.join(CONFIG.outputDir, 'clouds_over_borders');
    if (!fs.existsSync(cloudsDir)) {
      fs.mkdirSync(cloudsDir, { recursive: true });
      console.log(`Created directory: ${cloudsDir}`);
    }
    
    // Clean up existing images for this border number
    const existingFiles = fs.readdirSync(cloudsDir).filter(file => 
      file.startsWith(`border_${borderNumber}_`) && file.endsWith('.jpg')
    );
    
    for (const existingFile of existingFiles) {
      const existingPath = path.join(cloudsDir, existingFile);
      fs.unlinkSync(existingPath);
      console.log(`🗑️  Removed old image: ${existingFile}`);
    }
    
    const filename = `border_${borderNumber}_${timestamp}.jpg`;
    const filepath = path.join(cloudsDir, filename);
    
    fs.writeFileSync(filepath, imageBuffer);
    
    console.log(`✅ Saved high-res image: clouds_over_borders/${filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
    
    return {
      success: true,
      filename,
      filepath,
      relativePath: `clouds_over_borders/${filename}`,
      url,
      bounds,
      center,
      size: imageBuffer.length,
      borderNumber
    };
    
  } catch (error) {
    console.error(`❌ Failed to get high-res image for border ${borderNumber} (${crossing.name}): ${error.message}`);
    return {
      success: false,
      error: error.message,
      crossing: crossing.name,
      borderNumber
    };
  }
}

/**
 * Create SVG overlay with markers (like cumulus.py circles)
 */
function createSVGOverlay(results, timestamp) {
  const cloudyResults = results.filter(r => r.detectionType === 'cloudy');
  const clearResults = results.filter(r => r.detectionType === 'clear');
  const cityLightResults = results.filter(r => r.detectionType === 'cityLight');
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CONFIG.imageSize.width}" height="${CONFIG.imageSize.height}" 
     xmlns="http://www.w3.org/2000/svg">
  
  <defs>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: white; }
      .info { font-family: Arial, sans-serif; font-size: 10px; fill: white; }
      .marker-text { font-family: Arial, sans-serif; font-size: 8px; font-weight: bold; fill: white; }
    </style>
  </defs>
  
  <!-- Background for info -->
  <rect x="10" y="10" width="500" height="100" fill="rgba(0,0,0,0.8)" rx="5"/>
  
  <!-- Title and info -->
  <text x="20" y="30" class="title">Pure Cumulus.py Cloud Detection (3-Color System)</text>
  <text x="20" y="50" class="info">RGB Threshold: ${CONFIG.cloudDetection.limit} | Red dominance: ${CONFIG.cloudDetection.redDominanceThreshold}</text>
  <text x="20" y="65" class="info">🔵 Clouds: ${cloudyResults.length} | 🟢 Clear: ${clearResults.length} | 🔴 City Lights: ${cityLightResults.length}</text>
  <text x="20" y="80" class="info">Total: ${results.length} | Timestamp: ${timestamp}</text>
  
  <!-- Legend -->
  <circle cx="30" cy="95" r="6" fill="${CONFIG.colors.cloudy}" stroke="${CONFIG.colors.cloudyStroke}" stroke-width="2"/>
  <text x="45" y="100" class="info">Clouds</text>
  <circle cx="120" cy="95" r="6" fill="${CONFIG.colors.clear}" stroke="${CONFIG.colors.clearStroke}" stroke-width="2"/>
  <text x="135" y="100" class="info">Clear</text>
  <circle cx="200" cy="95" r="6" fill="${CONFIG.colors.cityLight}" stroke="${CONFIG.colors.cityLightStroke}" stroke-width="2"/>
  <text x="215" y="100" class="info">City Lights</text>
  
  <!-- Crossing markers -->
  ${results.map((result, index) => {
    let color, strokeColor, statusText;
    switch(result.detectionType) {
      case 'cloudy':
        color = CONFIG.colors.cloudy;
        strokeColor = CONFIG.colors.cloudyStroke;
        statusText = 'CLOUDY';
        break;
      case 'cityLight':
        color = CONFIG.colors.cityLight;
        strokeColor = CONFIG.colors.cityLightStroke;
        statusText = 'CITY LIGHTS';
        break;
      default:
        color = CONFIG.colors.clear;
        strokeColor = CONFIG.colors.clearStroke;
        statusText = 'CLEAR';
    }
    const x = result.pixel.x;
    const y = result.pixel.y;
    
    if (x >= 0 && x <= CONFIG.imageSize.width && y >= 0 && y <= CONFIG.imageSize.height) {
      return `
  <!-- ${result.name} -->
  <circle cx="${x}" cy="${y}" r="${CONFIG.markerSize}" 
          fill="${color}" 
          stroke="${strokeColor}" 
          stroke-width="3" 
          opacity="0.9">
    <title>${result.name} - ${statusText} (${result.confidence}%)
Location: ${result.coordinates.lat.toFixed(4)}, ${result.coordinates.lon.toFixed(4)}
Analysis: ${result.analysis}</title>
  </circle>
  <text x="${x}" y="${y + 3}" text-anchor="middle" class="marker-text">${index + 1}</text>`;
    }
    return '';
  }).join('')}
  
</svg>`;
  
  return svg;
}

/**
 * Create status image by combining satellite image with SVG overlay
 */
function createStatusImage(imageBuffer, results, timestamp) {
  // For now, save the SVG overlay - in a full implementation, 
  // we'd use a library like sharp or canvas to combine them
  const svgContent = createSVGOverlay(results, timestamp);
  const svgPath = path.join(CONFIG.outputDir, `status_overlay_${timestamp}.svg`);
  fs.writeFileSync(svgPath, svgContent);
  
  // Save the satellite image
  const imagePath = path.join(CONFIG.outputDir, `border_${timestamp}.jpg`);
  fs.writeFileSync(imagePath, imageBuffer);
  
  // Create HTML status page that combines both
  const statusHTML = `<!DOCTYPE html>
<html>
<head>
    <title>Border Cloud Status - ${timestamp}</title>
    <style>
        body { margin: 0; padding: 20px; background: #1a1a1a; color: white; font-family: Arial, sans-serif; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: #ff6b6b; margin-bottom: 10px; }
        .stats { display: flex; gap: 20px; justify-content: center; margin: 20px 0; }
        .stat { background: rgba(255,255,255,0.1); padding: 15px 25px; border-radius: 10px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; }
        .cloudy .stat-number { color: #0066FF; }
        .clear .stat-number { color: #00FF00; }
        .citylight .stat-number { color: #FF0000; }
        .total .stat-number { color: #ffa502; }
        .image-container { position: relative; text-align: center; margin: 20px 0; }
        .satellite-image { max-width: 100%; border: 2px solid #333; border-radius: 8px; }
        .overlay { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); pointer-events: none; }
        .method-info { background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #ff6b6b; }
        .cloud-list { background: rgba(255,77,87,0.1); padding: 20px; border-radius: 10px; margin: 20px 0; }
        .cloud-item { background: rgba(255,255,255,0.05); padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 3px solid #ff4757; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛰️ Border Cloud Detection Status</h1>
            <p>Pure cumulus.py Implementation | ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="stats">
            <div class="stat total">
                <div class="stat-number">${results.length}</div>
                <div>Total Crossings</div>
            </div>
            <div class="stat cloudy">
                <div class="stat-number">${results.filter(r => r.detectionType === 'cloudy').length}</div>
                <div>Clouds</div>
            </div>
            <div class="stat clear">
                <div class="stat-number">${results.filter(r => r.detectionType === 'clear').length}</div>
                <div>Clear</div>
            </div>
            <div class="stat citylight">
                <div class="stat-number">${results.filter(r => r.detectionType === 'cityLight').length}</div>
                <div>City Lights</div>
            </div>
        </div>
        
        <div class="method-info">
            <h3>🎯 Detection Method: Pure cumulus.py Implementation (3-Color System)</h3>
            <p><strong>RGB Threshold:</strong> ${CONFIG.cloudDetection.limit} (if p_c[0] >= limit and p_c[1] >= limit and p_c[2] >= limit)</p>
            <p><strong>Logic:</strong> Direct translation of cumulus.py cloud detection from line 87</p>
            <p><strong>City Light Detection:</strong> Red dominance threshold: ${CONFIG.cloudDetection.redDominanceThreshold}</p>
            <p><strong>Markers:</strong> 🔵 Blue = Clouds | 🟢 Green = Clear | 🔴 Red = City Lights</p>
            <p><strong>No Weather API:</strong> Pure satellite RGB analysis only</p>
        </div>
        
        <div class="image-container">
            <img src="border_${timestamp}.jpg" alt="Satellite Image" class="satellite-image">
            <svg class="overlay" width="${CONFIG.imageSize.width}" height="${CONFIG.imageSize.height}">
                ${results.map((result, index) => {
                  let color, strokeColor, statusText;
                  switch(result.detectionType) {
                    case 'cloudy':
                      color = CONFIG.colors.cloudy;
                      strokeColor = CONFIG.colors.cloudyStroke;
                      statusText = 'CLOUDY';
                      break;
                    case 'cityLight':
                      color = CONFIG.colors.cityLight;
                      strokeColor = CONFIG.colors.cityLightStroke;
                      statusText = 'CITY LIGHTS';
                      break;
                    default:
                      color = CONFIG.colors.clear;
                      strokeColor = CONFIG.colors.clearStroke;
                      statusText = 'CLEAR';
                  }
                  const x = result.pixel.x;
                  const y = result.pixel.y;
                  
                  if (x >= 0 && x <= CONFIG.imageSize.width && y >= 0 && y <= CONFIG.imageSize.height) {
                    return `<circle cx="${x}" cy="${y}" r="${CONFIG.markerSize}" 
                            fill="${color}" stroke="${strokeColor}" stroke-width="3" opacity="0.9">
                            <title>${result.name} - ${statusText} (${result.confidence}%)</title>
                            </circle>
                            <text x="${x}" y="${y + 3}" text-anchor="middle" 
                            style="font-family: Arial; font-size: 8px; font-weight: bold; fill: white;">${index + 1}</text>`;
                  }
                  return '';
                }).join('')}
            </svg>
        </div>
        
        <!-- Clouds Section -->
        ${results.filter(r => r.detectionType === 'cloudy').length > 0 ? `
        <div class="cloud-list" style="border-left: 4px solid #0066FF;">
            <h3>☁️ Detected Cloud Locations</h3>
            ${results.filter(r => r.detectionType === 'cloudy').map((result, index) => `
            <div class="cloud-item" style="border-left: 3px solid #0066FF;">
                <strong>${result.name}</strong>, ${result['US State']} 
                <br><small>Confidence: ${result.confidence}% | ${result.analysis}</small>
            </div>
            `).join('')}
        </div>
        ` : ``}
        
        <!-- City Lights Section -->
        ${results.filter(r => r.detectionType === 'cityLight').length > 0 ? `
        <div class="cloud-list" style="background: rgba(255,77,87,0.1); border-left: 4px solid #FF0000;">
            <h3>🌃 Detected City Light Locations</h3>
            ${results.filter(r => r.detectionType === 'cityLight').map((result, index) => `
            <div class="cloud-item" style="border-left: 3px solid #FF0000;">
                <strong>${result.name}</strong>, ${result['US State']} 
                <br><small>Confidence: ${result.confidence}% | ${result.analysis}</small>
            </div>
            `).join('')}
        </div>
        ` : ``}
        
        <!-- Clear Conditions Section -->
        ${results.filter(r => r.detectionType === 'clear').length > 0 ? `
        <div class="cloud-list" style="background: rgba(0,255,0,0.1); border-left: 4px solid #00FF00;">
            <h3>☀️ Clear Conditions</h3>
            <p>Locations with clear skies detected using cumulus.py RGB threshold method.</p>
        </div>
        ` : ``}
        
        ${results.filter(r => r.detectionType === 'cloudy').length === 0 && results.filter(r => r.detectionType === 'cityLight').length === 0 ? `
        <div class="cloud-list">
            <h3>☀️ All Clear</h3>
            <p>No significant cloud activity or city lights detected using the cumulus.py RGB threshold method.</p>
        </div>
        ` : ``}
    </div>
</body>
</html>`;
  
  const statusPath = path.join(CONFIG.outputDir, `status_${timestamp}.html`);
  fs.writeFileSync(statusPath, statusHTML);
  
  return {
    imagePath,
    svgPath,
    statusPath
  };
}

/**
 * Pure cumulus.py cloud detection for all crossings
 */
function detectClouds_CumulusStyle(imageBuffer, crossings) {
  console.log('🎯 Starting pure cumulus.py-style cloud detection...');
  console.log(`   📖 RGB threshold: ${CONFIG.cloudDetection.limit} (direct from cumulus.py logic)`);
  
  const results = [];
  
  crossings.forEach((crossing, index) => {
    const pixel = latLonToPixel(crossing.coordinates.lat, crossing.coordinates.lon);
    
    // Check bounds
    if (pixel.x < 0 || pixel.x >= CONFIG.imageSize.width || 
        pixel.y < 0 || pixel.y >= CONFIG.imageSize.height) {
      results.push({
        ...crossing,
        pixel,
        hasClouds: false,
        confidence: 0,
        analysis: 'Outside bounds',
        details: null
      });
      return;
    }
    
    // Sample RGB values around the crossing point
    const pixelSamples = samplePixelRGB(imageBuffer, pixel.x, pixel.y, CONFIG.cloudDetection.sampleRadius);
    
    // Apply pure cumulus.py detection logic
    const detection = detectClouds_Cumulus(pixelSamples);
    
    results.push({
      ...crossing,
      pixel,
      hasClouds: detection.hasClouds,
      needsHighRes: detection.needsHighRes,
      confidence: detection.confidence,
      analysis: detection.analysis,
      detectionType: detection.detectionType || 'clear',
      details: detection.details
    });
    
    if ((index + 1) % 10 === 0 || index === crossings.length - 1) {
      console.log(`   ✓ Processed ${index + 1}/${crossings.length} crossings`);
    }
  });
  
  return results;
}

/**
 * Save results including high-res images
 */
function saveResults(imageBuffer, results, timestamp, highResResults = []) {
  const paths = createStatusImage(imageBuffer, results, timestamp);
  
  // Save JSON data with high-res info
  const dataPath = path.join(CONFIG.outputDir, `data_${timestamp}.json`);
  const data = {
    timestamp,
    generated: new Date().toISOString(),
    method: 'pure-cumulus-py',
    rgbThreshold: CONFIG.cloudDetection.limit,
    inspiration: 'Direct implementation of cumulus.py RGB detection logic',
    results,
    highResResults,
    summary: {
      total: results.length,
      cloudy: results.filter(r => r.detectionType === 'cloudy').length,
      clear: results.filter(r => r.detectionType === 'clear').length,
      cityLights: results.filter(r => r.detectionType === 'cityLight').length,
      borderCrossings: results.filter(r => r.needsHighRes).length,
      highResImages: highResResults.filter(r => r.success).length,
      cloudyPercentage: Math.round(results.filter(r => r.detectionType === 'cloudy').length / results.length * 100),
      clearPercentage: Math.round(results.filter(r => r.detectionType === 'clear').length / results.length * 100),
      cityLightPercentage: Math.round(results.filter(r => r.detectionType === 'cityLight').length / results.length * 100),
      averageConfidence: Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length)
    }
  };
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  
  console.log(`✅ Saved status image: ${path.basename(paths.statusPath)}`);
  console.log(`✅ Saved satellite image: ${path.basename(paths.imagePath)}`);
  console.log(`✅ Saved data: ${path.basename(dataPath)}`);
  
  if (highResResults.length > 0) {
    const successfulHighRes = highResResults.filter(r => r.success);
    console.log(`✅ Saved ${successfulHighRes.length} high-resolution images`);
  }
  
  return paths;
}

/**
 * Main function - pure cumulus.py approach
 */
async function monitorBorderClouds_CumulusStyle() {
  try {
    console.log('🐍 Starting Pure Cumulus.py Border Cloud Monitoring...\n');
    console.log('📖 Direct implementation of cumulus.py RGB threshold logic');
    console.log('🚫 No weather API - pure satellite RGB analysis only\n');
    
    ensureOutputDir();
    
    console.log('📍 Loading border crossings data...');
    const crossings = loadCrossings();
    console.log(`   ✓ Loaded ${crossings.length} border crossings\n`);
    
    console.log('📡 Downloading satellite image...');
    const imageBuffer = await downloadImage(CONFIG.border_img);
    console.log(`   ✓ Downloaded: ${(imageBuffer.length / 1024).toFixed(1)} KB\n`);
    
    // Pure cumulus.py detection
    const results = detectClouds_CumulusStyle(imageBuffer, crossings);
    console.log('');
    
    const timestamp = getTimestamp();
    
    // Check for border crossings that need high-resolution images
    // Get top 2 borders with highest cloud confidence + 3 random from remaining
    const cloudsDetected = results.filter(r => r.needsHighRes);
    const sortedByConfidence = cloudsDetected.sort((a, b) => b.confidence - a.confidence);
    
    let crossingsNeedingHighRes = [];
    
    if (sortedByConfidence.length > 0) {
      // Take top 2 with highest confidence
      const top2 = sortedByConfidence.slice(0, Math.min(2, sortedByConfidence.length));
      crossingsNeedingHighRes.push(...top2);
      
      // From the remaining, pick 3 random ones
      const remaining = sortedByConfidence.slice(2);
      if (remaining.length > 0) {
        const shuffled = remaining.sort(() => Math.random() - 0.5);
        const random3 = shuffled.slice(0, Math.min(3, shuffled.length));
        crossingsNeedingHighRes.push(...random3);
      }
    }
    
    const highResResults = [];
    
    if (crossingsNeedingHighRes.length > 0) {
      console.log(`🔍 Found ${cloudsDetected.length} borders with clouds detected`);
      console.log(`📸 Requesting high-resolution images for ${crossingsNeedingHighRes.length} crossings (top 2 + 3 random)...\n`);
      
      for (const crossing of crossingsNeedingHighRes) {
        // Find the border number (index + 1 from the original crossings array)
        const borderNumber = results.findIndex(r => r.name === crossing.name) + 1;
        console.log(`  📸 Requesting image for border ${borderNumber} (${crossing.name}) - ${crossing.confidence}% confidence`);
        const highResResult = await requestHighResImage(crossing, timestamp, borderNumber);
        highResResults.push(highResResult);
        
        // Longer delay between requests to avoid API limits
        if (crossingsNeedingHighRes.indexOf(crossing) < crossingsNeedingHighRes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
        }
      }
      
      console.log(`\n✅ Completed high-resolution image requests\n`);
    } else {
      console.log('ℹ️  No clouds detected at any borders - no high-res images needed\n');
    }
    
    console.log('💾 Generating status outputs...');
    const paths = saveResults(imageBuffer, results, timestamp, highResResults);
    
    const cloudy = results.filter(r => r.detectionType === 'cloudy').length;
    const clear = results.filter(r => r.detectionType === 'clear').length;
    const cityLights = results.filter(r => r.detectionType === 'cityLight').length;
    const borderCrossings = results.filter(r => r.needsHighRes).length;
    const highResSuccess = highResResults.filter(r => r.success).length;
    const avgConfidence = Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length);
    
    console.log('\n' + '='.repeat(80));
    console.log('🐍 PURE CUMULUS.PY 3-COLOR CLOUD MONITORING COMPLETE');
    console.log('='.repeat(80));
    console.log(`📅 Timestamp: ${timestamp}`);
    console.log(`🎯 Method: Pure cumulus.py RGB threshold (${CONFIG.cloudDetection.limit})`);
    console.log(`📖 Logic: if p_c[0] >= ${CONFIG.cloudDetection.limit} and p_c[1] >= ${CONFIG.cloudDetection.limit} and p_c[2] >= ${CONFIG.cloudDetection.limit}`);
    console.log(`🔍 City Light Detection: Red dominance >= ${CONFIG.cloudDetection.redDominanceThreshold}`);
    console.log(`📍 Total crossings: ${results.length}`);
    console.log(`🔵 Cloudy conditions: ${cloudy} (${Math.round(cloudy/results.length*100)}%)`);
    console.log(`🟢 Clear conditions: ${clear} (${Math.round(clear/results.length*100)}%)`);
    console.log(`🔴 City light detections: ${cityLights} (${Math.round(cityLights/results.length*100)}%)`);
    console.log(`🌐 Borders with clouds detected: ${cloudsDetected.length}`);
    console.log(`📸 High-res images captured: ${highResSuccess}/${crossingsNeedingHighRes.length}`);
    console.log(`🎯 Average confidence: ${avgConfidence}%`);
    console.log(`📁 Status page: ${path.basename(paths.statusPath)}`);
    console.log('='.repeat(80));
    
    // Show cloudy locations
    const cloudyResults = results.filter(r => r.detectionType === 'cloudy');
    if (cloudyResults.length > 0) {
      console.log('\n☁️  Detected Cloud Locations:');
      cloudyResults.forEach((result, i) => {
        const isInSelected = crossingsNeedingHighRes.some(r => r.name === result.name);
        const highResStatus = isInSelected ? ' [HIGH-RES REQUESTED]' : result.needsHighRes ? ' [SKIPPED - NOT SELECTED]' : '';
        console.log(`${i + 1}. ${result.name}: ${result.confidence}% | ${result.analysis}${highResStatus}`);
      });
    } else {
      console.log('\n☀️  All crossings show clear conditions');
    }
    
    // Show city light locations if any
    const cityLightResults = results.filter(r => r.detectionType === 'cityLight');
    if (cityLightResults.length > 0) {
      console.log('\n🌃 Detected City Light Locations:');
      cityLightResults.forEach((result, i) => {
        console.log(`${i + 1}. ${result.name}: ${result.confidence}% | ${result.analysis}`);
      });
    }
    
    console.log(`\n🌐 Open status page: file://${path.resolve(paths.statusPath)}`);
    
    return {
      success: true,
      timestamp,
      cloudy,
      clear,
      cityLights,
      borderCrossings,
      highResImages: highResSuccess,
      avgConfidence,
      method: 'pure-cumulus-py-3color',
      statusPath: paths.statusPath,
      highResResults
    };
    
  } catch (error) {
    console.error('❌ Error during pure cumulus.py monitoring:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run if called directly
if (require.main === module) {
  monitorBorderClouds_CumulusStyle()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        console.error('\n❌ Pure cumulus.py monitoring failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { monitorBorderClouds_CumulusStyle, CONFIG };