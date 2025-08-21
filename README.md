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
- **Border Crossing Mapping**: 52 precisely mapped border crossing points with geographic coordinates
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
- npm or yarn

### Setup
```bash
# Clone the repository
git clone [repository-url]
cd cumulus_2025

# Install dependencies
npm install

# Start the server
node server.js
```

The application will be available at `http://localhost:3000`

### Required Directory Structure
```
cumulus_2025/
├── border_images/
│   └── clouds_over_borders/        # Cloud detection images (border_N_YYYY-MM-DD_HH-mm-ss.jpg)
├── cumulus_reference/
│   ├── crossings.json              # Border crossing coordinates
│   ├── border_line.svg             # Border path SVG
│   ├── map_outline.svg             # Map outline SVG
│   └── MORAKANAclear.png          # Logo
├── index.html                      # Main webpage
├── script.js                       # Frontend application
├── styles.css                      # Styling
├── sentences.js                    # Text content
├── server.js                       # Backend server
└── border-monitor-cumulus-pure.js  # Cloud detection system
```

## Technical Implementation

### Border Crossing Mapping
The system maps 52 border crossing points to precise SVG coordinates using geographic transformation:
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
- **server.js**: Express/Socket.IO server with file watching
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
- **crossings.json**: 52 border crossing points with coordinates and metadata
- **border_line.svg**: Precise SVG path of Mexico-US border
- **map_outline.svg**: Continental outline for background context

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

## Cloud Detection Integration

The system integrates with `border-monitor-cumulus-pure.js` for cloud detection:
- **Image Format**: `border_N_YYYY-MM-DD_HH-mm-ss.jpg` (N = border crossing number)
- **Detection Logic**: Computer vision analysis of NOAA satellite imagery
- **File Watching**: Automatic detection of new images in `clouds_over_borders/` directory
- **Real-time Updates**: Immediate integration of new detections into the visualization

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