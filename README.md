# Cumulus 2025

An interactive web-based visualization system for monitoring cloud migrations across the Mexico-US border, combining real-time satellite imagery with artistic interpretation of geopolitical boundaries.

## Overview

Cumulus presents a poetic perspective on borders by tracking atmospheric bodies that cross the Mexico-US boundary, indifferent to the political lines below. The installation employs computer vision to scan NOAA satellite imagery and identify clouds migrating across the border, offering viewers a "low-earth orbit perspective" where divisions dissolve and a shared atmosphere takes shape.

## Features

### Interactive Visualization
- **SVG Border Path**: Precise representation of the Mexico-US border with text flowing along the path
- **Map Outline**: Continental map outline with accompanying text placement
- **Hover Interactions**: Interactive zones trigger satellite images at specific border crossing locations
- **Connection Lines**: Visual lines connecting panel items to their corresponding satellite images
- **Responsive Design**: Adapts to different screen sizes with mobile support

### Real-time Cloud Detection
- **Live Updates**: Socket.IO-powered real-time updates when new cloud images are detected
- **Silent Integration**: New images appear without notifications, maintaining the contemplative experience
- **Border Crossing Mapping**: 51 precisely mapped border crossing points with geographic coordinates
- **ML Detection**: MobileNetV3-based cloud detection with city light filtering
- **Real-ESRGAN Upscaling**: Crossing images fetched at native NOAA resolution (272x453) and upscaled 2x to 544x906 using Real-ESRGAN
- **Image Persistence**: Smart timer management for image visibility and transitions

### User Interactions
- **Scroll Reveal**: Bottom panels appear when scrolling down, hide when returning to top
- **Panel Hover Effects**: Mouse interactions reveal satellite images with connecting lines
- **Keyboard Shortcuts**: Press 's' or 'S' to show all available cloud images simultaneously
- **Image Modes**: Multiple display modes (hover-triggered, panel-triggered, show-all)

### Technical Architecture
- **Node.js Backend**: Express server with Socket.IO for real-time communication
- **File System Monitoring**: Chokidar-based watching for new cloud detection images
- **SVG Path Manipulation**: Dynamic text placement along complex border and outline paths
- **Canvas-based Graphics**: Real-time line drawing with opacity management
- **Timer Management**: Sophisticated image persistence and fade-out logic

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Python 3.8+ with PyTorch (for ML cloud detection and image upscaling)
- npm or yarn

### Setup
```bash
# Clone the repository
git clone [repository-url]
cd cumulus_2025

# Install Node.js dependencies
npm install

# Install Python dependencies
pip3 install torch torchvision pillow opencv-python numpy requests

# Download Real-ESRGAN model weights
mkdir -p models
wget -O models/RealESRGAN_x2plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth

# Start the server
node cumulus_2025_server.js
```

The application will be available at `http://localhost:3000`

### Required Directory Structure
```
cumulus_2025/
├── public/images/
│   ├── crossings/                  # Upscaled crossing images (border_NN_YYYY-MM-DD_HH-mm-ss.jpg)
│   │   └── selection.json          # Current crossing selection metadata
│   ├── continente/                 # Continental satellite imagery archive
│   ├── frontera/                   # Border region imagery archive
│   ├── frontera.json               # Border crossing point coordinates
│   ├── clouds.jpg                  # Latest border satellite image
│   ├── clouds_ml.jpg               # ML detection overlay
│   └── clouds_cv.jpg               # CV analysis overlay
├── cumulus_reference/
│   ├── crossings.json              # Border crossing coordinates and metadata
│   ├── border_line.svg             # Border path SVG
│   ├── map_outline.svg             # Map outline SVG
│   └── MORAKANAclear.png          # Logo
├── models/
│   └── RealESRGAN_x2plus.pth      # Real-ESRGAN 2x upscaling weights
├── cumulus.py                      # Main cron job (fetch, detect, upscale, save)
├── cloud_detection_ml_final.py     # ML cloud detection module
├── upscale.py                      # Real-ESRGAN 2x upscaler
├── index.html                      # Main webpage
├── script.js                       # Frontend application
├── styles.css                      # Styling
├── sentences.js                    # Text content
└── cumulus_2025_server.js          # Express/Socket.IO server
```

## Technical Implementation

### Border Crossing Mapping
The system maps 51 border crossing points to precise SVG coordinates using geographic transformation:
- **Coordinate System**: Real-world lat/lon to SVG coordinate mapping
- **Geographic Bounds**: 25.88°N to 32.72°N, -117.04°W to -97.47°W
- **Path Distribution**: Non-linear scaling to account for border geography variations
- **Positioning Logic**: West-to-east ordering with latitude-based adjustments

### Real-time Image Updates
```javascript
// Example of real-time update handling
socket.on('images-updated', (data) => {
    if (data.type === 'added') {
        // Update specific image in show-all mode
        // Refresh panel data silently
    }
});
```

### Text Along Path
Dynamic text placement along both border and outline SVG paths:
- **Character Distribution**: Even spacing across entire path length
- **Rotation Calculation**: Tangent-based character rotation for natural flow
- **Multi-sentence Fitting**: Intelligent text fitting algorithm
- **Responsive Scaling**: Automatic repositioning on window resize

### Image Display Modes
1. **Hover Mode**: Temporary images on border crossing hover (15-second fade)
2. **Panel Mode**: Persistent images triggered from bottom panels
3. **Show-all Mode**: All available images displayed simultaneously (press 's')

## File Structure & Dependencies

### Core Files
- **index.html**: Main webpage structure
- **script.js**: Frontend application (CloudMigrationApp class)
- **styles.css**: Complete styling including responsive design
- **sentences.js**: Text content for border and outline paths
- **cumulus_2025_server.js**: Express/Socket.IO server with file watching
- **cumulus.py**: Main cron job script
- **cloud_detection_ml_final.py**: ML cloud detection with MobileNetV3
- **upscale.py**: Standalone Real-ESRGAN x2 upscaler (PyTorch, no external dependencies)
- **package.json**: Node.js dependencies

### Key Dependencies
```json
{
  "express": "^4.18.2",
  "socket.io": "^4.7.2", 
  "chokidar": "^3.5.3",
  "cors": "^2.8.5"
}
```

### Data Files
- **crossings.json**: 51 border crossing points with coordinates and metadata
- **border_line.svg**: Precise SVG path of Mexico-US border
- **map_outline.svg**: Continental outline for background context
- **RealESRGAN_x2plus.pth**: Pre-trained Real-ESRGAN weights (64MB)

## Usage

### Basic Navigation
1. **Initial View**: Border visualization with flowing text
2. **Scroll Down**: Reveal information panels and recent cloud detections
3. **Hover Interactions**: Mouse over crossing names to see satellite images
4. **Connection Lines**: Visual lines connect panel text to images

### Keyboard Shortcuts
- **'s' or 'S'**: Toggle show-all mode (display all available cloud images)
- **'s' again**: Exit show-all mode and return to normal interaction

### Panel Interactions
- **Left Panel**: Recent cloud detections with timestamps
- **Right Panel**: Project description and artistic context
- **Hover Effects**: Panel items trigger images with connection lines
- **Persistence**: Images remain visible until panels are closed

## Cloud Detection Pipeline

The cron job (`cumulus.py`) runs the full detection and imaging pipeline:

1. **Fetch**: Downloads latest NOAA GOES GeoColor satellite imagery (MERGED East+West)
2. **Duplicate Check**: Compares with previous image to skip unchanged frames
3. **ML Detection**: Runs MobileNetV3-based cloud detection (`cloud_detection_ml_final.py`) at each of the 51 border crossing points, with city light filtering to reduce false positives
4. **Crossing Selection**: Selects up to 9 crossings by probability with geographic spread enforcement (minimum pixel distance between selections)
5. **Image Capture**: Fetches high-resolution satellite crops at native NOAA resolution (272x453, ~1km/px) for each selected crossing
6. **Upscaling**: Upscales crossing images 2x using Real-ESRGAN (`upscale.py`) to 544x906
7. **Deduplication**: Skips saving if the new image is >99.5% similar to the existing one for that crossing
8. **Website Update**: Saves images to `public/images/crossings/` with metadata in `selection.json`, triggering live updates via Socket.IO

## Development Features

### Real-time Development
- **File Watching**: Server automatically detects new cloud images
- **Socket.IO**: Instant updates without page refresh
- **Error Handling**: Graceful fallbacks for missing images or network issues

### Performance Optimizations
- **Efficient Line Drawing**: Canvas-based connection lines with opacity management
- **Smart Image Loading**: On-demand loading with error fallbacks
- **Timer Management**: Coordinated image persistence and cleanup
- **Responsive Updates**: Only update specific images rather than full reloads

## Artistic Context

Cumulus embodies the "Overview Effect" - the cognitive shift experienced by astronauts when viewing Earth from space. The project contrasts:
- **Fluidity of Nature**: Clouds moving freely across political boundaries
- **Fixity of Politics**: Human-constructed borders invisible from above
- **Shared Atmosphere**: Universal sky that connects rather than divides
- **Grounded Perspective**: Earth-based observation offering a planetary viewpoint

## Technical Architecture Decisions

### Why Socket.IO?
Real-time updates create a living, breathing visualization that responds to actual cloud movements without user intervention.

### Why SVG Paths?
Precise geographic representation with scalable text placement along complex border geometry.

### Why Canvas for Lines?
Performance-optimized drawing with dynamic opacity for smooth interactive feedback.

### Why Silent Updates?
Maintains the contemplative, artistic experience without disruptive notifications.

## Browser Compatibility

- **Modern Browsers**: Chrome, Firefox, Safari, Edge (latest versions)
- **Mobile Support**: Responsive design with touch interactions
- **SVG Support**: Required for border path visualization
- **Canvas Support**: Required for connection lines
- **ES6 Features**: Modern JavaScript (classes, async/await, arrow functions)

## Contributing

The system is designed for artistic installation use. For modifications:
1. Maintain the contemplative user experience
2. Preserve geographic accuracy of border mapping
3. Keep real-time updates silent and non-intrusive
4. Test across different screen sizes and devices

## License

Developed for the Cumulus art installation project.

---

*"Clouds drift freely across rivers, deserts, walls, and coastlines, indifferent to the boundaries below."*