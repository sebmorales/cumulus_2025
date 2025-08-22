const express = require('express');
const path = require('path');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3001;

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

// API endpoint to serve crossings data
app.get('/api/crossings', (req, res) => {
    try {
        const crossings = require('./cumulus_reference/crossings.json');
        res.json(crossings);
    } catch (error) {
        console.error('Error loading crossings data:', error);
        res.status(500).json({ error: 'Failed to load crossings data' });
    }
});

// API endpoint to serve border SVG
app.get('/api/border', (req, res) => {
    const borderPath = path.join(__dirname, 'cumulus_reference', 'border_line.svg');
    res.sendFile(borderPath);
});

// List all available cloud images
app.get('/api/clouds-over-borders-list', (req, res) => {
    const fs = require('fs');
    const cloudsDir = path.join(__dirname, 'border_images', 'clouds_over_borders');
    
    try {
        if (!fs.existsSync(cloudsDir)) {
            return res.json([]);
        }
        
        const files = fs.readdirSync(cloudsDir);
        const imageFiles = files.filter(file => 
            file.startsWith('border_') && file.endsWith('.jpg')
        );
        
        res.json(imageFiles);
    } catch (error) {
        console.error('Error listing cloud images:', error);
        res.status(500).json({ error: 'Failed to list images' });
    }
});

// Get available cloud images for a specific border
app.get('/api/border-image/:borderNumber', (req, res) => {
    const fs = require('fs');
    const borderNumber = req.params.borderNumber;
    const cloudsDir = path.join(__dirname, 'border_images', 'clouds_over_borders');
    
    try {
        if (!fs.existsSync(cloudsDir)) {
            return res.status(404).json({ error: 'Clouds directory not found' });
        }
        
        const files = fs.readdirSync(cloudsDir);
        const borderFiles = files.filter(file => 
            file.startsWith(`border_${borderNumber}_`) && file.endsWith('.jpg')
        );
        
        if (borderFiles.length === 0) {
            return res.status(404).json({ error: 'No image found for this border' });
        }
        
        // Get the most recent file (assuming timestamp ordering)
        const mostRecentFile = borderFiles.sort().pop();
        const imagePath = path.join(cloudsDir, mostRecentFile);
        
        res.sendFile(imagePath, (err) => {
            if (err) {
                console.error('Error serving border image:', err);
                res.status(404).json({ error: 'Border image not found' });
            }
        });
    } catch (error) {
        console.error('Error accessing clouds directory:', error);
        res.status(500).json({ error: 'Server error accessing images' });
    }
});

// Serve crossing images from clouds_over_borders directory (for direct filename access)
app.get('/api/crossing-images/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, 'border_images', 'clouds_over_borders', filename);
    res.sendFile(imagePath, (err) => {
        if (err) {
            console.error('Error serving crossing image:', err);
            res.status(404).json({ error: 'Crossing image not found' });
        }
    });
});

// Serve reference images (fallback)
app.get('/api/images/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, 'cumulus_reference', filename);
    res.sendFile(imagePath, (err) => {
        if (err) {
            console.error('Error serving image:', err);
            res.status(404).json({ error: 'Image not found' });
        }
    });
});

// Serve the main HTML file for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    // Send current image list when client connects
    socket.emit('initial-images', getCurrentImageList());
});

// File watching for real-time updates
const cloudsDir = path.join(__dirname, 'border_images', 'clouds_over_borders');

function getCurrentImageList() {
    const fs = require('fs');
    try {
        if (!fs.existsSync(cloudsDir)) {
            return [];
        }
        const files = fs.readdirSync(cloudsDir);
        const imageFiles = files.filter(file => 
            file.startsWith('border_') && file.endsWith('.jpg')
        );
        return imageFiles;
    } catch (error) {
        console.error('Error getting current image list:', error);
        return [];
    }
}

// Watch for changes in the clouds directory
if (require('fs').existsSync(cloudsDir)) {
    const watcher = chokidar.watch(cloudsDir, {
        ignored: /^\./, // ignore dotfiles
        persistent: true,
        ignoreInitial: true // don't emit events for existing files on startup
    });

    watcher
        .on('add', (filePath) => {
            const filename = path.basename(filePath);
            if (filename.startsWith('border_') && filename.endsWith('.jpg')) {
                console.log(`New cloud image detected: ${filename}`);
                const updatedList = getCurrentImageList();
                io.emit('images-updated', {
                    type: 'added',
                    filename: filename,
                    imageList: updatedList
                });
            }
        })
        .on('unlink', (filePath) => {
            const filename = path.basename(filePath);
            if (filename.startsWith('border_') && filename.endsWith('.jpg')) {
                console.log(`Cloud image removed: ${filename}`);
                const updatedList = getCurrentImageList();
                io.emit('images-updated', {
                    type: 'removed',
                    filename: filename,
                    imageList: updatedList
                });
            }
        })
        .on('error', (error) => {
            console.error('File watcher error:', error);
        });

    console.log(`Watching for cloud image changes in: ${cloudsDir}`);
} else {
    console.log(`Clouds directory not found: ${cloudsDir} - will create when needed`);
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Project structure:');
    console.log('- Border SVG loaded from cumulus_reference/border_line.svg');
    console.log('- Crossings data loaded from cumulus_reference/crossings.json');
    console.log('- Custom sentences loaded from sentences.js');
    console.log('- Cloud images in border_images/clouds_over_borders/ directory (border_XX_TIMESTAMP.jpg)');
    console.log('- Reference images in cumulus_reference/ directory (fallback)');
    console.log('\nFeatures implemented:');
    console.log('✓ SVG border path loaded and displayed');
    console.log('✓ Custom sentences following border curve with periodic changes');
    console.log('✓ 48 hover zones mapped to crossing coordinates');
    console.log('✓ Each crossing shows its specific cloud image (border_XX_TIMESTAMP.jpg)');
    console.log('✓ Tunable hover zone size (CONFIG.HOVER_ZONE_SIZE)');
    console.log('✓ Satellite images appear on hover and stay visible');
    console.log('✓ Scroll reveals side panels');
    console.log('✓ Connection lines between panel items and images');
    console.log('✓ Responsive design');
});