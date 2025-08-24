// Load custom sentences
let CUSTOM_SENTENCES = [];

// Configuration
const CONFIG = {
    HOVER_ZONE_SIZE: 40, // Base size in pixels, can be tuned
    TEXT_CHANGE_INTERVAL: 3000, // Change text every 3 seconds
    SENTENCES: [
        "Borders are man made",
        "Have you ever been denied passage?",
        "Could you see this from outer space?",
        "What does it mean for a body to move across?",
        "To whom and what do this lines apply?",
        "Where would you be rightn now if you could simply just go and be?"
    ]
};

class CloudMigrationApp {
    constructor() {
        this.crossingsData = null;
        this.borderPath = null;
        this.outlinePath = null; // Map outline path
        this.pathLength = 0;
        this.outlinePathLength = 0; // Map outline path length
        this.pathPoints = [];
        this.outlinePathPoints = []; // Map outline path points
        this.currentSentence = '';
        this.visibleImages = [];
        this.textChangeInterval = null;
        this.drawnLines = new Map(); // Track drawn lines with their opacity state
        this.currentHoveredCrossing = null; // Track which crossing is currently being hovered
        this.socket = null; // Socket.IO connection
        this.showAllMode = false; // Track if "S" key mode is active
        this.isDragging = false; // Track if user is dragging
        this.lastTouchTime = 0; // Throttle touch events
        this.touchThrottleDelay = 100; // Minimum ms between touch reveals
        this.panelsVisible = false; // Track panel visibility state
        this.touchStartPos = null; // Track initial touch position
        this.dragThreshold = 10; // Minimum pixels to consider it a drag
        this.currentZoom = 1; // Current zoom level
        this.minZoom = 0.5; // Minimum zoom out
        this.maxZoom = 3; // Maximum zoom in
        this.lastPinchDistance = 0; // Track pinch distance
        this.zoomCenter = { x: 0, y: 0 }; // Center point for zoom
        this.borderAnalysisVisible = false; // Track border analysis image visibility
        this.borderAnalysisElement = null; // Track border analysis DOM element
        
        this.init();
    }

    async init() {
        // Use sentences from sentences.js if available, otherwise fallback to CONFIG
        if (typeof sentences !== 'undefined') {
            CONFIG.SENTENCES = sentences;
        }
        
        await this.loadData();
        this.setupSVG();
        await this.createCoordinateMapping();
        // this.addCoordinateMarkers(); // Add debug markers - hidden
        this.createHoverZones();
        this.setupTextDisplay();
        this.setupScrollReveal();
        this.setupConnectionCanvas();
        this.initializeSocketIO();
        this.setupKeyboardListeners();
        this.setupTouchDragListeners();
        // this.setupPinchZoom(); // Disabled for now
    }

    async loadData() {
        try {
            // Load crossings data
            const response = await fetch('./cumulus_reference/crossings.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch crossings data: ${response.status}`);
            }
            this.crossingsData = await response.json();
            console.log(`Loaded ${this.crossingsData.length} border crossings`);
            
            // Load and setup map outline SVG
            const mapOutlineResponse = await fetch('./cumulus_reference/map_outline_extended.svg');
            if (mapOutlineResponse.ok) {
                const mapOutlineText = await mapOutlineResponse.text();
                const parser = new DOMParser();
                const mapOutlineDoc = parser.parseFromString(mapOutlineText, 'image/svg+xml');
                const mapOutlinePathElement = mapOutlineDoc.querySelector('path');
                
                if (mapOutlinePathElement) {
                    const mapOutlineSvg = document.getElementById('map-outline-svg');
                    const newMapOutlinePath = mapOutlinePathElement.cloneNode(true);
                    mapOutlineSvg.appendChild(newMapOutlinePath);
                    this.outlinePath = newMapOutlinePath;
                    console.log('Map outline SVG loaded successfully');
                }
            }
            
            // Load and setup border line SVG
            const svgResponse = await fetch('./cumulus_reference/border_line.svg');
            if (!svgResponse.ok) {
                throw new Error(`Failed to fetch border SVG: ${svgResponse.status}`);
            }
            const svgText = await svgResponse.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const pathElement = svgDoc.querySelector('path');
            
            if (!pathElement) {
                throw new Error('No path element found in border SVG');
            }
            
            // Insert the path into our SVG
            const borderSvg = document.getElementById('border-svg');
            const newPath = pathElement.cloneNode(true);
            borderSvg.appendChild(newPath);
            
            this.borderPath = newPath;
            console.log('Border SVG loaded successfully');
        } catch (error) {
            console.error('Failed to load data:', error);
            // Set empty array to prevent null errors
            this.crossingsData = [];
        }
    }

    setupSVG() {
        if (!this.borderPath) return;
        
        // Get the total length of the border path
        this.pathLength = this.borderPath.getTotalLength();
        
        // Sample points along the border path for text placement
        const numSamples = Math.floor(this.pathLength / 8); // One sample every 8 units
        this.pathPoints = [];
        
        for (let i = 0; i <= numSamples; i++) {
            const distance = (i / numSamples) * this.pathLength;
            const point = this.borderPath.getPointAtLength(distance);
            
            // Get tangent for text rotation
            const tangentPoint = this.borderPath.getPointAtLength(Math.min(distance + 1, this.pathLength));
            const angle = Math.atan2(tangentPoint.y - point.y, tangentPoint.x - point.x) * 180 / Math.PI;
            
            this.pathPoints.push({
                x: point.x,
                y: point.y,
                angle: angle,
                distance: distance
            });
        }
        
        // Setup outline path if available
        if (this.outlinePath) {
            this.outlinePathLength = this.outlinePath.getTotalLength();
            
            // Sample points along the outline path for text placement
            const outlineNumSamples = Math.floor(this.outlinePathLength / 10); // One sample every 10 units (slightly more spread out)
            this.outlinePathPoints = [];
            
            for (let i = 0; i <= outlineNumSamples; i++) {
                const distance = (i / outlineNumSamples) * this.outlinePathLength;
                const point = this.outlinePath.getPointAtLength(distance);
                
                // Get tangent for text rotation
                const tangentPoint = this.outlinePath.getPointAtLength(Math.min(distance + 1, this.outlinePathLength));
                const angle = Math.atan2(tangentPoint.y - point.y, tangentPoint.x - point.x) * 180 / Math.PI;
                
                this.outlinePathPoints.push({
                    x: point.x,
                    y: point.y,
                    angle: angle,
                    distance: distance
                });
            }
        }
    }

    async createCoordinateMapping() {
        if (!this.crossingsData || !Array.isArray(this.crossingsData) || !this.borderPath) {
            console.error('Missing crossings data or border path for coordinate mapping');
            return;
        }
        
        // Load frontera points for better mapping
        try {
            const fronteraResponse = await fetch('/public/images/frontera.json');
            const fronteraData = await fronteraResponse.json();
            this.fronteraPoints = fronteraData.points;
            console.log(`Loaded ${this.fronteraPoints.length} frontera points`);
        } catch (error) {
            console.warn('Could not load frontera.json, using fallback mapping:', error);
            this.fronteraPoints = null;
        }
        
        if (this.fronteraPoints && this.fronteraPoints.length === this.crossingsData.length) {
            console.log(`✅ Using frontera-based coordinate mapping (${this.fronteraPoints.length} points)`);
            this.createFronteraBasedMapping();
        } else {
            console.log(`❌ Using GPS-based coordinate mapping (frontera: ${this.fronteraPoints?.length || 'null'}, crossings: ${this.crossingsData.length})`);
            this.createGPSBasedMapping();
        }
    }

    createFronteraBasedMapping() {
        // Direct pixel-to-SVG mapping without using the border path
        // The frontera.json coordinates are pixels on a 1000x500 satellite image
        // We'll map these directly to the SVG canvas dimensions
        
        const sourceImageWidth = 1000;  // Original satellite image width
        const sourceImageHeight = 500;  // Original satellite image height
        
        // Get SVG canvas dimensions from the border SVG
        const borderSvg = document.getElementById('border-svg');
        const viewBox = borderSvg.viewBox.baseVal;
        const svgWidth = viewBox.width;   // Should be 1398
        const svgHeight = viewBox.height; // Should be 553
        
        console.log(`📏 SVG dimensions: ${svgWidth} x ${svgHeight}`);
        console.log(`📏 Source image dimensions: ${sourceImageWidth} x ${sourceImageHeight}`);
        
        this.crossingsData.forEach((crossing, index) => {
            if (index < this.fronteraPoints.length) {
                const fronteraPoint = this.fronteraPoints[index];
                
                // Direct pixel-to-SVG coordinate mapping
                // Scale the frontera pixel coordinates to match SVG dimensions
                const svgX = (fronteraPoint.x / sourceImageWidth) * svgWidth;
                const svgY = (fronteraPoint.y / sourceImageHeight) * svgHeight;
                
                // Convert to approximate GPS for reference
                const lonProgress = fronteraPoint.x / sourceImageWidth;
                const latProgress = 1 - (fronteraPoint.y / sourceImageHeight); // Flip Y axis
                
                const gpsBounds = {
                    west: -117.04, east: -97.47, north: 32.54, south: 25.88
                };
                
                const estimatedLon = gpsBounds.west + (gpsBounds.east - gpsBounds.west) * lonProgress;
                const estimatedLat = gpsBounds.south + (gpsBounds.north - gpsBounds.south) * latProgress;
                
                // Store coordinates
                crossing.fronteraPixel = fronteraPoint;
                crossing.fronteraGPS = { lat: estimatedLat, lon: estimatedLon };
                crossing.svgX = svgX;
                crossing.svgY = svgY;
                crossing.index = index;
                
                console.log(`🗺️ ${index+1}: ${crossing.name}`);
                console.log(`   Frontera Pixel: (${fronteraPoint.x}, ${fronteraPoint.y})`);
                console.log(`   Direct SVG: (${Math.round(svgX)}, ${Math.round(svgY)})`);
                console.log(`   Estimated GPS: (${estimatedLat.toFixed(3)}, ${estimatedLon.toFixed(3)})`);
                console.log(`   Original GPS: (${crossing.coordinates.lat.toFixed(3)}, ${crossing.coordinates.lon.toFixed(3)})`);
            }
        });
        
        console.log(`🎯 Mapped ${this.crossingsData.length} crossings using direct frontera-to-SVG mapping`);
    }

    createGPSBasedMapping() {
        // Fallback to original GPS-based mapping
        
        // Get coordinate bounds from crossings data
        const lats = this.crossingsData.map(c => c.coordinates.lat);
        const lons = this.crossingsData.map(c => c.coordinates.lon);
        
        const minLat = Math.min(...lats);  // ~25.88° (south)
        const maxLat = Math.max(...lats);  // ~32.72° (north) 
        const minLon = Math.min(...lons);  // ~-117.04° (west)
        const maxLon = Math.max(...lons);  // ~-97.47° (east)
        
        console.log(`Border bounds: ${minLat.toFixed(2)}°N to ${maxLat.toFixed(2)}°N, ${minLon.toFixed(2)}°W to ${maxLon.toFixed(2)}°W`);
        
        // Map each crossing to a position along the SVG path based on geographic position
        this.crossingsData.forEach((crossing, originalIndex) => {
            // Calculate longitude-based progress (primary positioning)
            const lonProgress = (crossing.coordinates.lon - minLon) / (maxLon - minLon);
            
            // Apply non-linear scaling to better match border geography
            let adjustedProgress = lonProgress;
            
            if (lonProgress < 0.3) {
                adjustedProgress = lonProgress * 0.85;
            } else if (lonProgress > 0.7) {
                adjustedProgress = 0.3 + (lonProgress - 0.3) * 1.1;
            }
            
            adjustedProgress = Math.max(0, Math.min(1, adjustedProgress));
            
            const pathDistance = adjustedProgress * this.pathLength;
            const pathPoint = this.borderPath.getPointAtLength(pathDistance);
            
            // Apply latitude-based adjustment for north-south positioning
            const latNormalized = (crossing.coordinates.lat - minLat) / (maxLat - minLat);
            let latAdjustment = 0;
            
            if (crossing.coordinates.lon < -110) {
                latAdjustment = (latNormalized - 0.5) * 15;
            } else if (crossing.coordinates.lon > -105) {
                latAdjustment = (latNormalized - 0.5) * 25;
            } else {
                latAdjustment = (latNormalized - 0.5) * 20;
            }
            
            crossing.svgX = pathPoint.x;
            crossing.svgY = pathPoint.y + latAdjustment;
            crossing.pathDistance = pathDistance;
            crossing.index = originalIndex;
            crossing.lonProgress = lonProgress;
            crossing.adjustedProgress = adjustedProgress;
            crossing.latNormalized = latNormalized;
            
            console.log(`${crossing.name}: ${crossing.coordinates.lat.toFixed(3)}°N, ${crossing.coordinates.lon.toFixed(3)}°W → ${(adjustedProgress * 100).toFixed(1)}% along path → SVG(${Math.round(crossing.svgX)}, ${Math.round(crossing.svgY)})`);
        });
        
        console.log(`Mapped ${this.crossingsData.length} crossings to SVG coordinates using GPS-based mapping`);
    }

    async getRecentCloudDetections() {
        console.log('Loading real cloud detections from server...');
        
        try {
            // Get actual image files from crossings directory
            // Add cache busting to ensure fresh data on each reload
            const cacheBuster = Date.now();
            const response = await fetch(`/api/crossings-list?_=${cacheBuster}`);
            
            if (response.ok) {
                const imageFiles = await response.json();
                console.log(`API returned ${imageFiles.length} image files:`, imageFiles);
                
                if (imageFiles.length > 0) {
                    const detections = this.parseImageFilenames(imageFiles);
                    console.log(`Parsed ${detections.length} valid detections from ${imageFiles.length} files`);
                    return detections;
                } else {
                    console.log('No cloud detection images found in crossings directory');
                    return this.createMockDetections(); // Fallback to mock data
                }
            } else {
                console.log(`API response not OK: ${response.status} ${response.statusText}`);
                const responseText = await response.text();
                console.log('Response body:', responseText);
            }
        } catch (error) {
            console.log('Cloud images API error:', error);
            console.log('This might be a server connection issue or CORS problem');
        }

        // Fallback: show some mock data for testing if real API fails
        console.log('Falling back to mock data - real images not accessible');
        return this.createMockDetections();
    }

    createMockDetections() {
        // Create some mock recent detections for testing
        const mockDetections = [];
        const now = new Date();
        
        // Use first few crossings as mock data
        this.crossingsData.slice(0, 10).forEach((crossing, index) => {
            const hoursAgo = index * 3 + 1; // 1h, 4h, 7h ago, etc.
            const detectionTime = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000));
            
            mockDetections.push({
                crossingIndex: crossing.index,
                crossingName: crossing.name,
                borderNumber: crossing.index + 1,
                timestamp: detectionTime.toISOString(),
                timeAgo: this.formatTimeAgo(hoursAgo),
                filename: `border_${crossing.index + 1}_${detectionTime.getFullYear()}-${String(detectionTime.getMonth() + 1).padStart(2, '0')}-${String(detectionTime.getDate()).padStart(2, '0')}_${String(detectionTime.getHours()).padStart(2, '0')}-${String(detectionTime.getMinutes()).padStart(2, '0')}-${String(detectionTime.getSeconds()).padStart(2, '0')}.jpg`,
                hasImage: true,
                isMock: true
            });
        });
        
        return mockDetections.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    parseImageFilenames(imageFiles) {
        // Parse actual image filenames like "border_16_2025-08-20_00-50-19.jpg"
        // IMPORTANT: Image timestamps are in UTC, need to handle timezone correctly
        const detections = [];
        
        imageFiles.forEach(filename => {
            // Match the exact format: border_16_2025-08-20_00-50-19.jpg
            const match = filename.match(/border_(\d+)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.jpg/);
            if (match) {
                const borderNumber = parseInt(match[1]);
                const timestampStr = match[2];
                
                // Convert "2025-08-20_00-50-19" to proper UTC date
                const [datePart, timePart] = timestampStr.split('_');
                const [year, month, day] = datePart.split('-');
                const [hour, minute, second] = timePart.split('-');
                
                // Create UTC timestamp - filename contains UTC time
                const timestamp = new Date(Date.UTC(
                    parseInt(year), 
                    parseInt(month) - 1, 
                    parseInt(day), 
                    parseInt(hour), 
                    parseInt(minute), 
                    parseInt(second)
                ));
                
                const crossing = this.crossingsData[borderNumber - 1];
                if (crossing) {
                    const now = new Date();
                    const timeDiffMs = now.getTime() - timestamp.getTime();
                    const timeDiffHours = Math.floor(timeDiffMs / (60 * 60 * 1000));
                    
                    detections.push({
                        crossingIndex: borderNumber - 1,
                        crossingName: crossing.name,
                        borderNumber: borderNumber,
                        timestamp: timestamp.toISOString(),
                        timeAgo: this.formatTimeAgo(timeDiffHours),
                        filename: filename,
                        hasImage: true
                    });
                    
                    console.log(`Found: ${filename} → Border ${borderNumber} (${crossing.name})`);
                    console.log(`  UTC Time: ${timestamp.toISOString()}`);
                    console.log(`  Local Time: ${timestamp.toLocaleString()}`);
                    console.log(`  Time Ago: ${this.formatTimeAgo(timeDiffHours)}`);
                }
            } else {
                console.log(`Filename format not recognized: ${filename}`);
            }
        });

        // Sort by timestamp (most recent first)
        return detections.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    formatTimeAgo(hoursAgo) {
        if (hoursAgo < 1) return 'Just now';
        if (hoursAgo < 24) return `${hoursAgo}h ago`;
        const daysAgo = Math.floor(hoursAgo / 24);
        return `${daysAgo}d ago`;
    }

    calculateMaxPanelEntries() {
        const leftPanel = document.getElementById('left-panel');
        if (!leftPanel) return 20; // fallback

        // Get panel dimensions
        const panelRect = leftPanel.getBoundingClientRect();
        const panelHeight = panelRect.height;
        
        // Estimate item height (font-size 14px + line-height 1 + padding)
        const itemHeight = 14 * 1 + 16; // 14px font + 8px top + 8px bottom padding
        
        // Calculate how many items can fit
        const maxItems = Math.floor(panelHeight / itemHeight);
        
        // Return at least 5, but not more than 50
        return Math.max(5, Math.min(50, maxItems));
    }

    addCoordinateMarkers() {
        const svg = document.getElementById('border-svg');
        if (!svg || !this.crossingsData) return;

        // Remove existing markers if they exist
        const existingMarkers = document.getElementById('coordinate-markers');
        if (existingMarkers) {
            existingMarkers.remove();
        }

        // Create a group for coordinate markers with high z-index
        const markersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        markersGroup.id = 'coordinate-markers';
        markersGroup.style.zIndex = '1001'; // Above satellite images
        
        this.crossingsData.forEach((crossing, index) => {
            // Create red dot for each crossing (larger for visibility)
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', crossing.svgX);
            circle.setAttribute('cy', crossing.svgY);
            circle.setAttribute('r', '5'); // Larger radius
            circle.setAttribute('fill', 'red');
            circle.setAttribute('stroke', 'white');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('opacity', '0.9');
            
            // Add tooltip with crossing info
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${index + 1}: ${crossing.name} (${crossing.coordinates.lat.toFixed(4)}, ${crossing.coordinates.lon.toFixed(4)})`;
            circle.appendChild(title);
            
            // Add number label with better visibility
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', crossing.svgX + 8);
            text.setAttribute('y', crossing.svgY + 4);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', 'red');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('stroke', 'white');
            text.setAttribute('stroke-width', '0.5');
            text.setAttribute('paint-order', 'stroke fill');
            text.textContent = index + 1;
            
            markersGroup.appendChild(circle);
            markersGroup.appendChild(text);
        });
        
        svg.appendChild(markersGroup);
        console.log(`Added ${this.crossingsData.length} debug coordinate markers to SVG`);
    }

    createHoverZones() {
        if (!this.crossingsData || !Array.isArray(this.crossingsData)) {
            console.error('Crossings data not loaded or invalid');
            return;
        }
        
        const hoverZonesContainer = document.getElementById('hover-zones');
        const hoverContainer = document.getElementById('border-container');
        
        this.crossingsData.forEach((crossing, index) => {
            const zone = document.createElement('div');
            zone.className = 'hover-zone';
            zone.dataset.crossingIndex = index;
            
            // Set size (tunable) - larger on mobile for better touch targets
            const isMobile = window.innerWidth <= 768;
            const size = isMobile ? 44 : CONFIG.HOVER_ZONE_SIZE;
            zone.style.width = `${size}px`;
            zone.style.height = `${size}px`;
            
            // Position will be updated on resize
            this.positionHoverZone(zone, crossing);
            
            // Add hover event for desktop and touch event for mobile
            zone.addEventListener('mouseenter', () => this.showSatelliteImage(crossing, zone));
            zone.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Prevent default touch behavior
                this.showSatelliteImage(crossing, zone);
            });
            zone.addEventListener('click', () => this.showSatelliteImage(crossing, zone));
            
            hoverZonesContainer.appendChild(zone);
        });
        
        // Update positions on window resize
        window.addEventListener('resize', () => this.updateHoverZonePositions());
    }

    positionHoverZone(zone, crossing) {
        const borderSvg = document.getElementById('border-svg');
        const svgRect = borderSvg.getBoundingClientRect();
        const containerRect = document.getElementById('border-container').getBoundingClientRect();
        
        // Get SVG viewBox
        const viewBox = borderSvg.viewBox.baseVal;
        const scaleX = svgRect.width / viewBox.width;
        const scaleY = svgRect.height / viewBox.height;
        
        // Get current zone size (could be mobile or desktop size)
        const zoneSize = parseInt(zone.style.width) || CONFIG.HOVER_ZONE_SIZE;
        
        // Calculate position relative to container
        const x = (crossing.svgX * scaleX) + (svgRect.left - containerRect.left) - (zoneSize / 2);
        const y = (crossing.svgY * scaleY) + (svgRect.top - containerRect.top) - (zoneSize / 2);
        
        zone.style.left = `${x}px`;
        zone.style.top = `${y}px`;
    }

    updateHoverZonePositions() {
        const zones = document.querySelectorAll('.hover-zone');
        zones.forEach(zone => {
            const index = parseInt(zone.dataset.crossingIndex);
            const crossing = this.crossingsData[index];
            this.positionHoverZone(zone, crossing);
        });
    }

    updateSatelliteImagePositions() {
        // Images now scale with border container, no manual repositioning needed
        // Keep method for compatibility but it's no longer actively used
    }

    showSatelliteImage(crossing, zone) {
        // Create image element
        const img = document.createElement('img');
        img.className = 'satellite-image';
        
        // Use specific border cloud image from public/images/crossings/
        const borderNumber = crossing.index.toString().padStart(2, '0');
        // Get the most recent image for this border
        img.src = `/api/crossing-image/${borderNumber}`;
        img.alt = `Satellite image at ${crossing.name}`;
        
        // Position image centered on the crossing coordinates
        const zoneRect = zone.getBoundingClientRect();
        const containerRect = document.getElementById('images-container').getBoundingClientRect();
        
        // Center the image on the crossing point - no offsets
        // The image should be centered exactly where the hover zone is
        const centerX = zoneRect.left - containerRect.left + (zoneRect.width / 2);
        const centerY = zoneRect.top - containerRect.top + (zoneRect.height / 2);
        
        // Position image so its center aligns with the crossing center
        img.style.left = `${centerX}px`;
        img.style.top = `${centerY}px`;
        img.style.transform = 'translate(-50%, -50%)'; // Center the image on the coordinates
        
        // Add error handling for missing images
        img.onerror = () => {
            console.warn(`Could not load image for crossing ${crossing.index.toString().padStart(2, '0')}: ${crossing.name}`);
            img.src = './cumulus_reference/1_cumulus_landing.png'; // Fallback to reference image
        };
        
        // Add to border container so it scales with zoom
        const imgContainer = document.getElementById('border-container');
        imgContainer.appendChild(img);
        
        // Animate in
        setTimeout(() => {
            img.classList.add('visible');
        }, 50);
        
        // Store reference with timer
        const imageData = {
            element: img,
            crossing: crossing,
            fadeTimer: null
        };
        
        // Start 15-second timer for fade-out
        imageData.fadeTimer = setTimeout(() => {
            img.classList.add('fade-out');
            // Remove from visible images array after fade completes
            setTimeout(() => {
                const index = this.visibleImages.indexOf(imageData);
                if (index > -1) {
                    this.visibleImages.splice(index, 1);
                }
                if (img.parentNode) {
                    img.parentNode.removeChild(img);
                }
            }, 2000); // Wait for 2s fade transition to complete
        }, 15000); // 15 seconds
        
        this.visibleImages.push(imageData);
    }

    showPanelTriggeredImage(crossing) {
        // Check if image is already visible from panel interaction
        const existingPanelImage = this.visibleImages.find(img => 
            img.crossing.index === crossing.index && img.triggeredFromPanel
        );
        if (existingPanelImage) return;

        // Create image element
        const img = document.createElement('img');
        img.className = 'satellite-image panel-triggered';
        
        // Use specific border cloud image
        const borderNumber = crossing.index.toString().padStart(2, '0');
        img.src = `/api/crossing-image/${borderNumber}`;
        img.alt = `Satellite image at ${crossing.name}`;
        
        // Position image centered exactly on the crossing's SVG coordinates
        const imageContainer = document.getElementById('border-container');
        const containerRect = imageContainer.getBoundingClientRect();
        const borderSvg = document.getElementById('border-svg');
        const svgRect = borderSvg.getBoundingClientRect();
        
        // Get SVG viewBox for scaling
        const viewBox = borderSvg.viewBox.baseVal;
        const scaleX = svgRect.width / viewBox.width;
        const scaleY = svgRect.height / viewBox.height;
        
        // Calculate exact center position of the crossing
        const centerX = (crossing.svgX * scaleX) + (svgRect.left - containerRect.left);
        const centerY = (crossing.svgY * scaleY) + (svgRect.top - containerRect.top);
        
        // Position image so its center aligns with the crossing coordinates
        img.style.left = `${centerX}px`;
        img.style.top = `${centerY}px`;
        img.style.transform = 'translate(-50%, -50%)'; // Center the image on the coordinates
        
        // Add error handling for missing images
        img.onerror = () => {
            console.warn(`Could not load image for crossing ${crossing.index.toString().padStart(2, '0')}: ${crossing.name}`);
            img.src = './cumulus_reference/1_cumulus_landing.png';
        };
        
        // Add to border container so it scales with zoom
        const imgContainer = document.getElementById('border-container');
        imgContainer.appendChild(img);
        
        // Animate in
        setTimeout(() => {
            img.classList.add('visible');
        }, 50);
        
        // Store reference (no auto-hide timer while panel is visible)
        const imageData = {
            element: img,
            crossing: crossing,
            triggeredFromPanel: true,
            fadeTimer: null,
            persistentTimer: null // Timer that starts when panels are hidden
        };
        
        this.visibleImages.push(imageData);
    }

    hidePanelTriggeredImage(crossing) {
        const imageIndex = this.visibleImages.findIndex(img => 
            img.crossing.index === crossing.index && img.triggeredFromPanel
        );
        
        if (imageIndex > -1) {
            const imageData = this.visibleImages[imageIndex];
            imageData.element.classList.remove('visible');
            
            // Remove after fade transition
            setTimeout(() => {
                if (imageData.element.parentNode) {
                    imageData.element.parentNode.removeChild(imageData.element);
                }
                this.visibleImages.splice(imageIndex, 1);
            }, 500); // Wait for fade transition
        }
    }

    togglePanelTriggeredImage(crossing) {
        const existingImage = this.visibleImages.find(img => 
            img.crossing.index === crossing.index && img.triggeredFromPanel
        );
        
        if (existingImage) {
            this.hidePanelTriggeredImage(crossing);
        } else {
            this.showPanelTriggeredImage(crossing);
        }
    }

    setupTextDisplay() {
        this.displayTextAlongPath();
        this.displayTextAlongOutline();
    }

    displayTextAlongPath() {
        const textContainer = document.getElementById('border-text');
        textContainer.innerHTML = ''; // Clear existing text
        
        // Try to fit multiple sentences
        let textToDisplay = this.fitMultipleSentences();
        this.currentText = textToDisplay;
        
        // Keep all characters including spaces, but render spaces as smaller gaps
        const chars = [];
        for (let i = 0; i < textToDisplay.length; i++) {
            const char = textToDisplay[i];
            chars.push(char);
        }
        
        // Calculate character spacing to use the entire path length
        const totalChars = chars.length;
        let spacing = this.pathLength / totalChars; // Divide entire path length by character count
        
        // Place each character along the path, evenly distributed
        for (let i = 0; i < totalChars; i++) {
            const char = chars[i];
            const distance = (i + 0.5) * spacing; // Center each character in its segment
            const point = this.borderPath.getPointAtLength(Math.min(distance, this.pathLength));
            
            // Get angle for rotation
            const nextPoint = this.borderPath.getPointAtLength(Math.min(distance + 5, this.pathLength));
            const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;
            
            // Create character element
            const charElement = document.createElement('span');
            charElement.className = 'border-char';
            charElement.textContent = char;
            charElement.style.left = `${point.x}px`;
            charElement.style.top = `${point.y}px`;
            charElement.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            
            textContainer.appendChild(charElement);
        }
        
        console.log(`Displaying: "${textToDisplay}" (${totalChars} characters)`);
        
        // Update positions on resize
        this.updateTextPositions();
    }
    
    fitMultipleSentences() {
        // Estimate how many characters we can fit at font size 12
        // Be more aggressive - roughly 8 path units per character
        const estimatedCapacity = Math.floor(this.pathLength / 8);
        
        // Shuffle sentences to get variety each page load
        const shuffled = [...CONFIG.SENTENCES].sort(() => Math.random() - 0.5);
        
        let result = '';
        let sentenceIndex = 0;
        
        // Keep adding sentences (repeating if necessary) until we fill the capacity
        while (true) {
            const currentSentence = shuffled[sentenceIndex % shuffled.length];
            const testString = result + (result ? ' ' : '') + currentSentence;
            
            // Remove spaces for character count (only visible chars matter for spacing)
            const charCount = testString.replace(/\s/g, '').length;
            
            if (charCount <= estimatedCapacity) {
                result = testString;
                sentenceIndex++;
            } else {
                // If we can't fit another sentence, we're done
                break;
            }
            
            // Safety check to prevent infinite loop (though unlikely with reasonable content)
            if (sentenceIndex > shuffled.length * 20) {
                break;
            }
        }
        
        // If we couldn't fit any complete sentence, take the shortest one
        if (!result) {
            result = shuffled.reduce((shortest, current) => 
                current.length < shortest.length ? current : shortest
            );
        }
        
        return result;
    }

    displayTextAlongOutline() {
        if (!this.outlinePath || !this.outlinePathLength) return;
        
        const textContainer = document.getElementById('outline-text');
        textContainer.innerHTML = ''; // Clear existing text
        
        // Use sentences_outline from sentences.js if available
        let outlineSentences = CONFIG.SENTENCES; // fallback
        if (typeof sentences_outline !== 'undefined') {
            outlineSentences = sentences_outline;
        }
        
        // Try to fit multiple sentences along the outline
        let textToDisplay = this.fitMultipleSentencesOutline(outlineSentences);
        
        // Keep all characters including spaces, but render spaces as smaller gaps
        const chars = [];
        for (let i = 0; i < textToDisplay.length; i++) {
            const char = textToDisplay[i];
            chars.push(char);
        }
        
        // Calculate character spacing to use the entire outline path length
        const totalChars = chars.length;
        let spacing = this.outlinePathLength / totalChars; // Divide entire path length by character count
        
        // Place each character along the outline path, evenly distributed
        for (let i = 0; i < totalChars; i++) {
            const char = chars[i];
            const distance = (i + 0.5) * spacing; // Center each character in its segment
            const point = this.outlinePath.getPointAtLength(Math.min(distance, this.outlinePathLength));
            
            // Get angle for rotation
            const nextPoint = this.outlinePath.getPointAtLength(Math.min(distance + 5, this.outlinePathLength));
            const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;
            
            // Create character element
            const charElement = document.createElement('span');
            charElement.className = 'outline-char';
            charElement.textContent = char;
            charElement.style.left = `${point.x}px`;
            charElement.style.top = `${point.y}px`;
            charElement.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            
            textContainer.appendChild(charElement);
        }
        
        console.log(`Displaying outline text: "${textToDisplay}" (${totalChars} characters)`);
        
        // Update positions on resize
        this.updateOutlineTextPositions();
    }
    
    fitMultipleSentencesOutline(outlineSentences) {
        // Estimate how many characters we can fit at font size 10 (2 points smaller)
        // Be more aggressive - roughly 10 path units per character (larger spacing for outline)
        const estimatedCapacity = Math.floor(this.outlinePathLength / 10);
        
        // Shuffle sentences to get variety each page load
        const shuffled = [...outlineSentences].sort(() => Math.random() - 0.5);
        
        let result = '';
        let sentenceIndex = 0;
        
        // Keep adding sentences (repeating if necessary) until we fill the capacity
        while (true) {
            const currentSentence = shuffled[sentenceIndex % shuffled.length];
            const testString = result + (result ? ' ' : '') + currentSentence;
            
            // Remove spaces for character count (only visible chars matter for spacing)
            const charCount = testString.replace(/\s/g, '').length;
            
            if (charCount <= estimatedCapacity) {
                result = testString;
                sentenceIndex++;
            } else {
                // If we can't fit another sentence, we're done
                break;
            }
            
            // Safety check to prevent infinite loop
            if (sentenceIndex > shuffled.length * 20) {
                break;
            }
        }
        
        // If we couldn't fit any complete sentence, take the shortest one
        if (!result) {
            result = shuffled.reduce((shortest, current) => 
                current.length < shortest.length ? current : shortest
            );
        }
        
        return result;
    }
    
    updateOutlineTextPositions() {
        if (!this.outlinePath) return;
        
        const mapOutlineSvg = document.getElementById('map-outline-svg');
        const svgRect = mapOutlineSvg.getBoundingClientRect();
        const containerRect = document.getElementById('border-container').getBoundingClientRect();
        
        const viewBox = mapOutlineSvg.viewBox.baseVal;
        const scaleX = svgRect.width / viewBox.width;
        const scaleY = svgRect.height / viewBox.height;
        
        const chars = document.querySelectorAll('.outline-char');
        const totalChars = chars.length;
        let spacing = this.outlinePathLength / totalChars; // Same logic as displayTextAlongOutline
        
        chars.forEach((char, index) => {
            const distance = (index + 0.5) * spacing; // Same logic as displayTextAlongOutline
            const point = this.outlinePath.getPointAtLength(Math.min(distance, this.outlinePathLength));
            
            const x = (point.x * scaleX) + (svgRect.left - containerRect.left);
            const y = (point.y * scaleY) + (svgRect.top - containerRect.top);
            
            const transform = char.style.transform.match(/rotate\([^)]+\)/)[0];
            char.style.left = `${x}px`;
            char.style.top = `${y}px`;
            char.style.transform = `translate(-50%, -50%) ${transform}`;
        });
    }

    updateTextPositions() {
        const borderSvg = document.getElementById('border-svg');
        const svgRect = borderSvg.getBoundingClientRect();
        const containerRect = document.getElementById('border-container').getBoundingClientRect();
        
        const viewBox = borderSvg.viewBox.baseVal;
        const scaleX = svgRect.width / viewBox.width;
        const scaleY = svgRect.height / viewBox.height;
        
        const chars = document.querySelectorAll('.border-char');
        const totalChars = chars.length;
        let spacing = this.pathLength / totalChars; // Same logic as displayTextAlongPath
        
        chars.forEach((char, index) => {
            const distance = (index + 0.5) * spacing; // Same logic as displayTextAlongPath
            const point = this.borderPath.getPointAtLength(Math.min(distance, this.pathLength));
            
            const x = (point.x * scaleX) + (svgRect.left - containerRect.left);
            const y = (point.y * scaleY) + (svgRect.top - containerRect.top);
            
            const transform = char.style.transform.match(/rotate\([^)]+\)/)[0];
            char.style.left = `${x}px`;
            char.style.top = `${y}px`;
            char.style.transform = `translate(-50%, -50%) ${transform}`;
        });
    }


    async setupScrollReveal() {
        if (!this.crossingsData || !Array.isArray(this.crossingsData)) {
            console.error('Crossings data not available for scroll reveal setup');
            return;
        }
        
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const crossingsList = document.getElementById('crossings-list');
        
        // Update panel title
        // const panelTitle = leftPanel.querySelector('h2');
        // if (panelTitle) {
        //     panelTitle.textContent = 'Recent Cloud Detections';
        // }
        
        // Get recent cloud detections instead of showing all crossings
        console.log('Loading recent cloud detections...');
        const allRecentCloudCrossings = await this.getRecentCloudDetections();
        console.log('Recent cloud detections loaded:', allRecentCloudCrossings);
        
        // Calculate how many entries can fit in the panel
        const maxEntries = this.calculateMaxPanelEntries();
        const recentCloudCrossings = allRecentCloudCrossings.slice(0, maxEntries);
        
        console.log(`Showing ${recentCloudCrossings.length} of ${allRecentCloudCrossings.length} recent cloud detections (max that fit: ${maxEntries})`);
        
        // Clear existing list
        crossingsList.innerHTML = '';
        
        if (recentCloudCrossings.length === 0) {
            console.log('No recent cloud detections to display');
            const li = document.createElement('li');
            li.innerHTML = '<div class="plain-text-info">No recent cloud detections available</div>';
            crossingsList.appendChild(li);
            return;
        }
        
        // Populate crossings list with recent cloud detections
        recentCloudCrossings.forEach((detection, index) => {
            console.log(`Creating list item ${index + 1} for:`, detection.crossingName);
            const li = document.createElement('li');
            li.className = 'crossing-item recent-detection';
            li.dataset.crossingIndex = detection.crossingIndex;
            
            // Get full crossing data for detailed info
            const crossing = this.crossingsData[detection.crossingIndex];
            const timestamp = new Date(detection.timestamp).toLocaleString();
            
            li.innerHTML = `
                <div class="plain-text-info">
${crossing.name}, ${crossing['Mex closest city']}, ${crossing['Mex State']} - ${crossing['US closest city']}, ${crossing['US State']}, ${crossing.coordinates.lat.toFixed(4)}, ${crossing.coordinates.lon.toFixed(4)} - ${detection.timeAgo}
                </div>
            `;
            
            // Add hover event for connection lines and image display
            li.addEventListener('mouseenter', () => {
                const crossing = this.crossingsData[detection.crossingIndex];
                if (crossing) {
                    this.showPanelTriggeredImage(crossing);
                    this.bringImageToTop(crossing); // Bring this image to top
                    this.drawConnectionLine(li, crossing); // Pass the li element
                }
            });
            li.addEventListener('mouseleave', () => {
                const crossing = this.crossingsData[detection.crossingIndex];
                if (crossing) {
                    // Don't hide the image - keep it persistent
                    // Just update line opacity by clearing the current hover state
                    this.currentHoveredCrossing = null;
                    this.redrawAllLines(); // Redraw with all lines at 30% opacity
                }
            });
            
            // Add click event for mobile/touch devices
            li.addEventListener('click', () => {
                const crossing = this.crossingsData[detection.crossingIndex];
                if (crossing) {
                    this.togglePanelTriggeredImage(crossing);
                }
            });
            
            crossingsList.appendChild(li);
        });
        
        // Desktop: scroll interaction, Mobile: tap interaction
        this.setupDesktopScrollBehavior();
    }

    setupConnectionCanvas() {
        this.canvas = document.getElementById('connections-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        const updateCanvasSize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
    }

    drawConnectionLine(listItem, crossing) {
        // Set current hovered crossing
        this.currentHoveredCrossing = crossing.index;
        
        // Redraw all lines with updated opacity
        this.redrawAllLines();
        
        // Create a unique identifier for this line
        const lineId = crossing.index;
        
        // If we haven't drawn a line for this crossing yet, store its coordinates
        if (!this.drawnLines.has(lineId)) {
            // Find visible images for this specific crossing only
            const matchingImages = this.visibleImages.filter(img => 
                img.crossing.index === crossing.index && img.triggeredFromPanel
            );
            
            if (matchingImages.length === 0) {
                console.log(`No panel-triggered image found for crossing ${crossing.index} (${crossing.name})`);
                return;
            }
            
            // Get the position of the right edge of the text - 4px offset
            const listItemRect = listItem.getBoundingClientRect();
            const startX = listItemRect.right -8;
            const startY = listItemRect.top + (listItemRect.height / 2);
            
            // Validate start coordinates
            if (startX <= 0 || startY <= 0) {
                console.warn(`Invalid start coordinates for ${crossing.name}:`, { startX, startY });
                return;
            }
            
            matchingImages.forEach(imgData => {
                // Make sure the element exists and is in the DOM
                if (!imgData.element || !document.body.contains(imgData.element)) {
                    console.warn(`Image element not in DOM for ${crossing.name}`);
                    return;
                }
                
                const imgRect = imgData.element.getBoundingClientRect();
                
                // More strict validation - ensure image is actually visible and positioned
                if (imgRect.left >= 0 && imgRect.bottom > imgRect.top && 
                    imgRect.width > 0 && imgRect.height > 0 && 
                    imgRect.left < window.innerWidth && imgRect.bottom < window.innerHeight) {
                    
                    const endX = imgRect.left;
                    const endY = imgRect.bottom;
                    
                    // Store line coordinates for future redraws
                    this.drawnLines.set(lineId, {
                        startX, startY, endX, endY,
                        crossing: crossing
                    });
                    
                    console.log(`Stored line coordinates for crossing ${crossing.index} (${crossing.name})`);
                } else {
                    console.warn(`Invalid or off-screen image coordinates for ${crossing.name}:`, {
                        left: imgRect.left,
                        top: imgRect.top, 
                        bottom: imgRect.bottom,
                        width: imgRect.width,
                        height: imgRect.height
                    });
                }
            });
        }
    }

    redrawAllLines() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Redraw all stored lines with appropriate opacity
        this.drawnLines.forEach((lineData, crossingIndex) => {
            const isCurrentlyHovered = this.currentHoveredCrossing === crossingIndex;
            const opacity = isCurrentlyHovered ? 1.0 : 0.3; // 100% for hovered, 30% for others
            
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
            this.ctx.lineWidth = 0.5;
            this.ctx.setLineDash([]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(lineData.startX, lineData.startY);
            this.ctx.lineTo(lineData.endX, lineData.endY);
            this.ctx.stroke();
        });
    }

    startPersistentImageTimers() {
        // Start 15-second timer for all panel-triggered images
        this.visibleImages.forEach(imageData => {
            if (imageData.triggeredFromPanel && !imageData.persistentTimer) {
                console.log(`Starting 15-second timer for ${imageData.crossing.name}`);
                imageData.persistentTimer = setTimeout(() => {
                    imageData.element.classList.add('fade-out');
                    // Remove from visible images array after fade completes
                    setTimeout(() => {
                        const index = this.visibleImages.indexOf(imageData);
                        if (index > -1) {
                            this.visibleImages.splice(index, 1);
                        }
                        if (imageData.element.parentNode) {
                            imageData.element.parentNode.removeChild(imageData.element);
                        }
                    }, 2000); // Wait for 2s fade transition to complete
                }, 15000); // 15 seconds
            }
        });
    }

    stopPersistentImageTimers() {
        // Cancel 15-second timers for all panel-triggered images
        this.visibleImages.forEach(imageData => {
            if (imageData.triggeredFromPanel && imageData.persistentTimer) {
                console.log(`Stopping 15-second timer for ${imageData.crossing.name}`);
                clearTimeout(imageData.persistentTimer);
                imageData.persistentTimer = null;
            }
        });
    }

    initializeSocketIO() {
        // Initialize Socket.IO connection
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('🔌 Connected to server via Socket.IO');
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from server');
        });
        
        this.socket.on('initial-images', (imageList) => {
            console.log('📋 Received initial image list:', imageList.length, 'images');
            // Initial load is already handled by existing code
        });
        
        this.socket.on('images-updated', (data) => {
            console.log('🆕 Real-time update:', data.type, data.filename);
            this.handleRealTimeImageUpdate(data);
        });
        
        this.socket.on('frontera-updated', (data) => {
            console.log('🖼️ Frontera update:', data.type, data.filename);
            this.handleFronteraUpdate(data);
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket.IO error:', error);
        });
    }
    
    async handleRealTimeImageUpdate(updateData) {
        const { type, filename, imageList } = updateData;
        
        if (type === 'added') {
            console.log(`🖼️ New cloud image added: ${filename}`);
            
            // If in show-all mode, update just this specific image
            if (this.showAllMode) {
                this.updateSpecificShowAllImage(filename);
            }
            
            // Refresh the panel data in real-time (no notification)
            await this.refreshPanelData();
            
        } else if (type === 'removed') {
            console.log(`🗑️ Cloud image removed: ${filename}`);
            
            // Remove any visible images that match this filename
            this.removeImageByFilename(filename);
            
            // Refresh the panel data
            await this.refreshPanelData();
        }
    }
    
    async handleFronteraUpdate(updateData) {
        const { type, filename } = updateData;
        
        if (type === 'added') {
            console.log(`🖼️ New frontera image available: ${filename}`);
            // If border analysis is currently visible, update it with the new image
            if (this.borderAnalysisVisible) {
                await this.refreshBorderAnalysisImage();
            }
        } else if (type === 'removed') {
            console.log(`🗑️ Frontera image removed: ${filename}`);
            // If the currently displayed image was removed, hide it
            if (this.borderAnalysisVisible && this.borderAnalysisElement) {
                const currentSrc = this.borderAnalysisElement.src;
                if (currentSrc.includes(filename)) {
                    this.hideBorderAnalysisImage();
                }
            }
        }
    }
    
    async refreshBorderAnalysisImage() {
        if (!this.borderAnalysisVisible) return;
        
        const latestImagePath = await this.getLatestFronteraImage();
        if (latestImagePath && this.borderAnalysisElement) {
            // Update the source of the current image
            this.borderAnalysisElement.src = latestImagePath;
            console.log('🔄 Updated border analysis image with latest');
        }
    }
    
    showUpdateNotification(message) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 150, 255, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            transform: translateX(400px);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    removeImageByFilename(filename) {
        // Find and remove any visible images that match this filename
        this.visibleImages = this.visibleImages.filter(imageData => {
            if (imageData.filename === filename) {
                if (imageData.element && imageData.element.parentNode) {
                    imageData.element.parentNode.removeChild(imageData.element);
                }
                if (imageData.fadeTimer) {
                    clearTimeout(imageData.fadeTimer);
                }
                if (imageData.persistentTimer) {
                    clearTimeout(imageData.persistentTimer);
                }
                return false; // Remove from array
            }
            return true; // Keep in array
        });
    }
    
    async refreshPanelData() {
        // Re-fetch cloud detections and update the left panel
        console.log('🔄 Refreshing panel data...');
        
        try {
            const recentCloudCrossings = await this.getRecentCloudDetections();
            const crossingsList = document.getElementById('crossings-list');
            const leftPanel = document.getElementById('left-panel');
            
            if (crossingsList && recentCloudCrossings.length > 0) {
                // Calculate how many entries can fit
                const maxEntries = this.calculateMaxPanelEntries();
                const limitedCrossings = recentCloudCrossings.slice(0, maxEntries);
                
                // Clear and repopulate
                crossingsList.innerHTML = '';
                
                limitedCrossings.forEach((detection) => {
                    const li = document.createElement('li');
                    li.className = 'crossing-item recent-detection';
                    li.dataset.crossingIndex = detection.crossingIndex;
                    
                    const crossing = this.crossingsData[detection.crossingIndex];
                    
                    li.innerHTML = `
                        <div class="plain-text-info">
${crossing.name}, ${crossing['Mex closest city']}, ${crossing['Mex State']} - ${crossing['US closest city']}, ${crossing['US State']}, ${crossing.coordinates.lat.toFixed(4)}, ${crossing.coordinates.lon.toFixed(4)} - ${detection.timeAgo}
                        </div>
                    `;
                    
                    // Re-add event listeners
                    li.addEventListener('mouseenter', () => {
                        const crossing = this.crossingsData[detection.crossingIndex];
                        if (crossing) {
                            this.showPanelTriggeredImage(crossing);
                            this.bringImageToTop(crossing); // Bring this image to top
                            this.drawConnectionLine(li, crossing);
                        }
                    });
                    li.addEventListener('mouseleave', () => {
                        const crossing = this.crossingsData[detection.crossingIndex];
                        if (crossing) {
                            this.currentHoveredCrossing = null;
                            this.redrawAllLines();
                        }
                    });
                    li.addEventListener('click', () => {
                        const crossing = this.crossingsData[detection.crossingIndex];
                        if (crossing) {
                            this.togglePanelTriggeredImage(crossing);
                        }
                    });
                    
                    crossingsList.appendChild(li);
                });
                
                console.log(`✅ Panel refreshed with ${limitedCrossings.length} recent detections`);
            }
        } catch (error) {
            console.error('Error refreshing panel data:', error);
        }
    }

    clearConnectionLines() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawnLines.clear(); // Reset the tracking map when clearing lines
        this.currentHoveredCrossing = null; // Reset hover state
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 's') {
                console.log('📸 S key pressed - showing all available images');
                this.toggleShowAllMode();
            } else if (event.key.toLowerCase() === 'b') {
                console.log('🖼️ B key pressed - showing latest border analysis');
                this.toggleBorderAnalysisImage();
            } else if (this.borderAnalysisVisible) {
                console.log('🔽 Key pressed - hiding border analysis');
                this.hideBorderAnalysisImage();
            }
        });
        
        // Add global event listeners for hiding border analysis image
        document.addEventListener('click', () => {
            if (this.borderAnalysisVisible) {
                console.log('🔽 Click detected - hiding border analysis');
                this.hideBorderAnalysisImage();
            }
        });
        
        document.addEventListener('scroll', () => {
            if (this.borderAnalysisVisible) {
                console.log('🔽 Scroll detected - hiding border analysis');
                this.hideBorderAnalysisImage();
            }
        });
    }

    toggleShowAllMode() {
        this.showAllMode = !this.showAllMode;
        
        if (this.showAllMode) {
            console.log('🔓 Entering show-all mode');
            this.showAllImages();
        } else {
            console.log('🔒 Exiting show-all mode');
            this.hideAllShowAllImages();
        }
    }

    async showAllImages() {
        try {
            // Get all available cloud detections
            const allDetections = await this.getRecentCloudDetections();
            console.log(`📸 Showing all ${allDetections.length} available images`);
            
            // Show an image for each detection (reverse order so most recent renders last and appears on top)
            allDetections.reverse().forEach(detection => {
                const crossing = this.crossingsData[detection.crossingIndex];
                if (crossing) {
                    this.showShowAllModeImage(crossing, detection);
                }
            });
            
        } catch (error) {
            console.error('Error showing all images:', error);
        }
    }

    showShowAllModeImage(crossing, detection) {
        // Check if image is already visible from show-all mode
        const existingShowAllImage = this.visibleImages.find(img => 
            img.crossing.index === crossing.index && img.showAllMode
        );
        if (existingShowAllImage) return;

        // Create image element
        const img = document.createElement('img');
        img.className = 'satellite-image show-all-mode';
        
        // Use specific border cloud image
        const borderNumber = crossing.index.toString().padStart(2, '0');
        img.src = `/api/crossing-image/${borderNumber}`;
        img.alt = `Satellite image at ${crossing.name}`;
        
        // Position image centered exactly on the crossing's SVG coordinates
        const imageContainer = document.getElementById('border-container');
        const containerRect = imageContainer.getBoundingClientRect();
        const borderSvg = document.getElementById('border-svg');
        const svgRect = borderSvg.getBoundingClientRect();
        
        // Get SVG viewBox for scaling
        const viewBox = borderSvg.viewBox.baseVal;
        const scaleX = svgRect.width / viewBox.width;
        const scaleY = svgRect.height / viewBox.height;
        
        // Calculate exact center position of the crossing
        const centerX = (crossing.svgX * scaleX) + (svgRect.left - containerRect.left);
        const centerY = (crossing.svgY * scaleY) + (svgRect.top - containerRect.top);
        
        // Position image so its center aligns with the crossing coordinates
        img.style.left = `${centerX}px`;
        img.style.top = `${centerY}px`;
        img.style.transform = 'translate(-50%, -50%)'; // Center the image on the coordinates
        
        // Add error handling for missing images
        img.onerror = () => {
            console.warn(`Could not load image for crossing ${crossing.index.toString().padStart(2, '0')}: ${crossing.name}`);
            img.src = './cumulus_reference/1_cumulus_landing.png';
        };
        
        // Add to border container so it scales with zoom
        const imgContainer = document.getElementById('border-container');
        imgContainer.appendChild(img);
        
        // Animate in
        setTimeout(() => {
            img.classList.add('visible');
        }, 50);
        
        // Store reference (no timers in show-all mode - persistent until replaced)
        const imageData = {
            element: img,
            crossing: crossing,
            showAllMode: true,
            detection: detection,
            fadeTimer: null,
            persistentTimer: null
        };
        
        this.visibleImages.push(imageData);
    }

    hideAllShowAllImages() {
        // Hide all show-all mode images
        const showAllImages = this.visibleImages.filter(img => img.showAllMode);
        
        showAllImages.forEach(imageData => {
            imageData.element.classList.remove('visible');
            
            // Remove after fade transition
            setTimeout(() => {
                if (imageData.element.parentNode) {
                    imageData.element.parentNode.removeChild(imageData.element);
                }
                const index = this.visibleImages.indexOf(imageData);
                if (index > -1) {
                    this.visibleImages.splice(index, 1);
                }
            }, 500); // Wait for fade transition
        });
        
        console.log(`🔒 Hidden ${showAllImages.length} show-all mode images`);
    }

    replaceShowAllModeImages() {
        if (!this.showAllMode) return;
        
        console.log('🔄 Replacing show-all mode images with new data');
        
        // Remove current show-all images
        this.hideAllShowAllImages();
        
        // Show new ones after a brief delay
        setTimeout(() => {
            this.showAllImages();
        }, 600); // Wait for fade out to complete
    }

    async updateSpecificShowAllImage(filename) {
        if (!this.showAllMode) return;
        
        // Parse the filename to get border number
        const match = filename.match(/border_(\d+)_/);
        if (!match) {
            console.warn(`Could not parse border number from filename: ${filename}`);
            return;
        }
        
        const borderNumber = parseInt(match[1]);
        const crossingIndex = borderNumber - 1;
        const crossing = this.crossingsData[crossingIndex];
        
        if (!crossing) {
            console.warn(`No crossing found for border number: ${borderNumber}`);
            return;
        }
        
        console.log(`🔄 Updating specific show-all image for border ${borderNumber} (${crossing.name})`);
        
        // Find existing show-all image for this crossing
        const existingImageIndex = this.visibleImages.findIndex(img => 
            img.crossing.index === crossingIndex && img.showAllMode
        );
        
        if (existingImageIndex > -1) {
            // Remove existing image
            const existingImage = this.visibleImages[existingImageIndex];
            existingImage.element.classList.remove('visible');
            
            setTimeout(() => {
                if (existingImage.element.parentNode) {
                    existingImage.element.parentNode.removeChild(existingImage.element);
                }
                this.visibleImages.splice(existingImageIndex, 1);
                
                // Add new image after removing the old one
                this.addNewShowAllImage(crossing, filename);
            }, 500); // Wait for fade transition
        } else {
            // No existing image, just add new one
            this.addNewShowAllImage(crossing, filename);
        }
    }

    addNewShowAllImage(crossing, filename) {
        // Create new detection object
        const detection = {
            crossingIndex: crossing.index,
            crossingName: crossing.name,
            borderNumber: crossing.index + 1,
            filename: filename,
            hasImage: true
        };
        
        // Show the new image
        this.showShowAllModeImage(crossing, detection);
        console.log(`✅ Added new show-all image for ${crossing.name}`);
    }

    setupDesktopScrollBehavior() {
        // Only enable scroll behavior on desktop (> 768px)
        if (window.innerWidth > 768) {
            const leftPanel = document.getElementById('left-panel');
            const rightPanel = document.getElementById('right-panel');
            const morakanaLogo = document.getElementById('morakana-logo');
            let lastScrollY = 0;
            
            window.addEventListener('scroll', () => {
                // Skip scroll behavior on mobile
                if (window.innerWidth <= 768) return;
                
                const currentScrollY = window.scrollY;
                
                // Detect scroll direction
                if (currentScrollY > lastScrollY) {
                    // Scrolling down - show panels with minimal threshold
                    if (currentScrollY > 10) {
                        leftPanel.classList.remove('hidden');
                        rightPanel.classList.remove('hidden');
                        morakanaLogo.classList.add('visible');
                        // Stop 15-second timers when panels are shown again
                        this.stopPersistentImageTimers();
                        this.panelsVisible = true;
                    }
                } else if (currentScrollY < lastScrollY) {
                    // Scrolling up - hide panels if near top
                    if (currentScrollY < 5) {
                        leftPanel.classList.add('hidden');
                        rightPanel.classList.add('hidden');
                        morakanaLogo.classList.remove('visible');
                        // Clear connection lines when panels are closed/hidden
                        this.clearConnectionLines();
                        // Start 15-second timer for persistent images
                        this.startPersistentImageTimers();
                        this.panelsVisible = false;
                    }
                }
                
                lastScrollY = currentScrollY;
            });
        }
    }

    setupTouchDragListeners() {
        const container = document.getElementById('border-container');
        
        // Add touch event listeners to the border container
        container.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            this.touchStartPos = {
                x: touch.clientX,
                y: touch.clientY,
                time: Date.now()
            };
            this.isDragging = false; // Don't start dragging immediately
        });
        
        container.addEventListener('touchmove', (e) => {
            if (!this.touchStartPos) return;
            
            // Skip multi-touch (pinch zoom disabled)
            if (e.touches.length > 1) {
                return;
            }
            
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - this.touchStartPos.x);
            const deltaY = Math.abs(touch.clientY - this.touchStartPos.y);
            const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // If movement exceeds threshold, consider it a drag
            if (totalMovement > this.dragThreshold) {
                this.isDragging = true;
                e.preventDefault(); // Prevent scrolling while dragging
                this.handleTouchReveal(e);
            }
        });
        
        container.addEventListener('touchend', (e) => {
            if (this.touchStartPos) {
                const touchDuration = Date.now() - this.touchStartPos.time;
                
                // If it was a short touch without dragging, toggle panels (mobile only)
                if (!this.isDragging && touchDuration < 500 && window.innerWidth <= 768) {
                    this.togglePanels();
                }
            }
            
            this.isDragging = false;
            this.touchStartPos = null;
        });
        
        container.addEventListener('touchcancel', () => {
            this.isDragging = false;
            this.touchStartPos = null;
        });
    }

    handleTouchReveal(e) {
        // Throttle touch events to prevent too many image reveals
        const now = Date.now();
        if (now - this.lastTouchTime < this.touchThrottleDelay) {
            return;
        }
        this.lastTouchTime = now;

        // Get touch coordinates
        const touch = e.touches[0];
        const containerRect = document.getElementById('border-container').getBoundingClientRect();
        const touchX = touch.clientX - containerRect.left;
        const touchY = touch.clientY - containerRect.top;

        // Find the closest hover zone to the touch point
        const closestZone = this.findClosestHoverZone(touchX, touchY);
        
        if (closestZone && closestZone.distance < 60) { // Within 60px of a crossing
            const crossingIndex = parseInt(closestZone.zone.dataset.crossingIndex);
            const crossing = this.crossingsData[crossingIndex];
            
            if (crossing) {
                // Check if image is already visible to avoid duplicates
                const existingImage = this.visibleImages.find(img => 
                    img.crossing.index === crossing.index && 
                    !img.triggeredFromPanel && 
                    !img.showAllMode
                );
                
                if (!existingImage) {
                    this.showSatelliteImage(crossing, closestZone.zone);
                }
            }
        }
    }

    findClosestHoverZone(touchX, touchY) {
        const zones = document.querySelectorAll('.hover-zone');
        let closest = null;
        let minDistance = Infinity;

        zones.forEach(zone => {
            const zoneRect = zone.getBoundingClientRect();
            const containerRect = document.getElementById('border-container').getBoundingClientRect();
            
            // Convert to container-relative coordinates
            const zoneCenterX = (zoneRect.left - containerRect.left) + (zoneRect.width / 2);
            const zoneCenterY = (zoneRect.top - containerRect.top) + (zoneRect.height / 2);
            
            // Calculate distance
            const distance = Math.sqrt(
                Math.pow(touchX - zoneCenterX, 2) + 
                Math.pow(touchY - zoneCenterY, 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                closest = { zone, distance };
            }
        });

        return closest;
    }

    togglePanels() {
        const leftPanel = document.getElementById('left-panel');
        const rightPanel = document.getElementById('right-panel');
        const morakanaLogo = document.getElementById('morakana-logo');
        
        this.panelsVisible = !this.panelsVisible;
        
        if (this.panelsVisible) {
            // Mobile: show only description panel, Desktop: show both panels
            if (window.innerWidth <= 768) {
                // Mobile - only show right panel (description)
                rightPanel.classList.remove('hidden');
                // Keep left panel hidden on mobile
                leftPanel.classList.add('hidden');
            } else {
                // Desktop - show both panels
                leftPanel.classList.remove('hidden');
                rightPanel.classList.remove('hidden');
            }
            morakanaLogo.classList.add('visible');
            // Stop 15-second timers when panels are shown
            this.stopPersistentImageTimers();
        } else {
            // Hide panels
            leftPanel.classList.add('hidden');
            rightPanel.classList.add('hidden');
            morakanaLogo.classList.remove('visible');
            // Clear connection lines when panels are hidden
            this.clearConnectionLines();
            // Start 15-second timer for persistent images
            this.startPersistentImageTimers();
        }
    }

    bringImageToTop(crossing) {
        // Find the image for this crossing
        const matchingImages = this.visibleImages.filter(img => 
            img.crossing.index === crossing.index
        );
        
        if (matchingImages.length > 0) {
            // Reset all image z-indexes to default
            this.visibleImages.forEach(imageData => {
                if (imageData.element && imageData.element.style) {
                    imageData.element.style.zIndex = '8'; // Default z-index
                }
            });
            
            // Bring the hovered image to the top
            matchingImages.forEach(imageData => {
                if (imageData.element && imageData.element.style) {
                    imageData.element.style.zIndex = '20'; // Higher than default
                }
            });
        }
    }

    setupPinchZoom() {
        const zoomContainer = document.getElementById('border-container');
        
        zoomContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Calculate initial pinch distance
                this.lastPinchDistance = this.getPinchDistance(e.touches);
                
                // Calculate center point between the two touches
                this.zoomCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
            }
        });
        
        zoomContainer.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault(); // Prevent scrolling and other gestures
                
                const currentDistance = this.getPinchDistance(e.touches);
                const scale = currentDistance / this.lastPinchDistance;
                
                // Calculate new zoom level
                let newZoom = this.currentZoom * scale;
                newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
                
                // Apply zoom
                this.applyZoom(newZoom);
                
                // Update for next calculation
                this.lastPinchDistance = currentDistance;
            }
        });
        
        zoomContainer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                this.lastPinchDistance = 0;
            }
        });
    }

    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    applyZoom(zoomLevel) {
        this.currentZoom = zoomLevel;
        const container = document.getElementById('border-container');
        
        // Apply transform with zoom
        container.style.transform = `scale(${zoomLevel})`;
        container.style.transformOrigin = 'center center';
        
        // No need to update positions since everything scales together now
    }

    async getLatestFronteraImage() {
        try {
            // Get list of files in the frontera directory
            const response = await fetch('/api/frontera-list');
            if (response.ok) {
                const responseText = await response.text();
                // Check if response is JSON
                if (responseText.startsWith('[') || responseText.startsWith('{')) {
                    const imageFiles = JSON.parse(responseText);
                    console.log(`Found ${imageFiles.length} frontera images`);
                    
                    if (imageFiles.length > 0) {
                        // Sort by filename (which includes timestamp) to get the latest
                        imageFiles.sort();
                        const latestImage = imageFiles[imageFiles.length - 1];
                        console.log(`Latest frontera image: ${latestImage}`);
                        return `/public/images/frontera/${latestImage}`;
                    } else {
                        console.log('No frontera images found');
                        return null;
                    }
                } else {
                    console.warn('Server returned HTML instead of JSON - endpoint may not exist');
                    return this.getFallbackFronteraImage();
                }
            } else {
                console.warn('Could not fetch frontera images list');
                return this.getFallbackFronteraImage();
            }
        } catch (error) {
            console.error('Error fetching latest frontera image:', error);
            return this.getFallbackFronteraImage();
        }
    }

    getFallbackFronteraImage() {
        // Fallback: use a predictable pattern based on current date/time
        // This assumes the frontera images follow a timestamp pattern like the ones we saw
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        // Try to construct the most likely recent filename based on the pattern we observed
        // Since we can't get the exact list, we'll try the most recent timestamp we saw
        const fallbackImage = `2025-08-24 01:00:04.984997.jpg`;
        console.log(`Using fallback frontera image: ${fallbackImage}`);
        return `/public/images/frontera/${fallbackImage}`;
    }

    async toggleBorderAnalysisImage() {
        if (this.borderAnalysisVisible) {
            this.hideBorderAnalysisImage();
        } else {
            await this.showBorderAnalysisImage();
        }
    }

    async showBorderAnalysisImage() {
        if (this.borderAnalysisVisible) return;

        const latestImagePath = await this.getLatestFronteraImage();
        if (!latestImagePath) {
            console.warn('No border analysis image available');
            return;
        }

        // Create image element
        const img = document.createElement('img');
        img.className = 'border-analysis-image';
        img.src = latestImagePath;
        img.alt = 'Latest border analysis';
        
        // Style the image to be centered and 98% width
        img.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            width: 98%;
            max-width: 1470px;
            height: auto;
            transform: translate(-50%, -50%);
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Add error handling
        img.onerror = () => {
            console.error('Failed to load border analysis image');
            this.hideBorderAnalysisImage();
        };

        // Add to document
        document.body.appendChild(img);
        this.borderAnalysisElement = img;
        this.borderAnalysisVisible = true;

        // Fade in
        setTimeout(() => {
            img.style.opacity = '1';
        }, 50);
    }

    hideBorderAnalysisImage() {
        if (!this.borderAnalysisVisible || !this.borderAnalysisElement) return;

        // Fade out
        this.borderAnalysisElement.style.opacity = '0';
        
        // Remove after transition
        setTimeout(() => {
            if (this.borderAnalysisElement && this.borderAnalysisElement.parentNode) {
                this.borderAnalysisElement.parentNode.removeChild(this.borderAnalysisElement);
            }
            this.borderAnalysisElement = null;
            this.borderAnalysisVisible = false;
        }, 300);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.cloudApp = new CloudMigrationApp();
});

// Handle window resize
window.addEventListener('resize', () => {
    // Update text positions if app exists
    if (window.cloudApp) {
        window.cloudApp.updateTextPositions();
        window.cloudApp.updateOutlineTextPositions();
        window.cloudApp.updateHoverZonePositions();
        window.cloudApp.updateSatelliteImagePositions();
    }
});