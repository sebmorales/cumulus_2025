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
const PORT = process.env.PORT || 3000;

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

// List all available cloud images from crossings directory
app.get('/api/crossings-list', (req, res) => {
    const fs = require('fs');
    const cloudsDir = path.join(__dirname, 'public', 'images', 'crossings');
    
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

// List all available frontera (border analysis) images
app.get('/api/frontera-list', (req, res) => {
    const fs = require('fs');
    const fronteraDir = path.join(__dirname, 'public', 'images', 'frontera');
    
    try {
        if (!fs.existsSync(fronteraDir)) {
            return res.json([]);
        }
        
        const files = fs.readdirSync(fronteraDir);
        const imageFiles = files.filter(file => 
            file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
        );
        
        res.json(imageFiles);
    } catch (error) {
        console.error('Error listing frontera images:', error);
        res.status(500).json({ error: 'Failed to list frontera images' });
    }
});

// Get available cloud images for a specific border from crossings directory
app.get('/api/crossing-image/:borderNumber', (req, res) => {
    const fs = require('fs');
    const borderNumber = req.params.borderNumber;
    const cloudsDir = path.join(__dirname, 'public', 'images', 'crossings');
    
    try {
        if (!fs.existsSync(cloudsDir)) {
            return res.status(404).json({ error: 'Crossings directory not found' });
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

// Serve crossing images from crossings directory (for direct filename access)
app.get('/api/crossing-images/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, 'public', 'images', 'crossings', filename);
    res.sendFile(imagePath, (err) => {
        if (err) {
            console.error('Error serving crossing image:', err);
            res.status(404).json({ error: 'Crossing image not found' });
        }
    });
});

// Get selection metadata (includes primary/highest probability image)
app.get('/api/selection', (req, res) => {
    const fs = require('fs');
    const selectionFile = path.join(__dirname, 'public', 'images', 'crossings', 'selection.json');

    try {
        if (!fs.existsSync(selectionFile)) {
            return res.status(404).json({ error: 'Selection metadata not found' });
        }

        const data = JSON.parse(fs.readFileSync(selectionFile, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('Error reading selection metadata:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get the most recently modified image from public/images/crossings directory
app.get('/api/latest-crossing-image', (req, res) => {
    const fs = require('fs');
    const crossingsDir = path.join(__dirname, 'public', 'images', 'crossings');

    try {
        if (!fs.existsSync(crossingsDir)) {
            return res.status(404).json({ error: 'crossings directory not found' });
        }

        const files = fs.readdirSync(crossingsDir);
        const imageFiles = files.filter(file =>
            file.startsWith('border_') && file.endsWith('.jpg')
        );

        if (imageFiles.length === 0) {
            return res.status(404).json({ error: 'No crossing images found' });
        }

        // Find the most recently modified file
        let latestFile = null;
        let latestMtime = 0;

        for (const file of imageFiles) {
            const filePath = path.join(crossingsDir, file);
            const stats = fs.statSync(filePath);
            if (stats.mtimeMs > latestMtime) {
                latestMtime = stats.mtimeMs;
                latestFile = file;
            }
        }

        // Extract border number from filename (border_31_2026-02-07_19-08-40.jpg -> 31)
        const match = latestFile.match(/border_(\d+)_/);
        const borderNumber = match ? parseInt(match[1], 10) : null;

        res.json({
            filename: latestFile,
            borderNumber: borderNumber,
            modifiedTime: latestMtime
        });
    } catch (error) {
        console.error('Error getting latest crossing image:', error);
        res.status(500).json({ error: 'Server error' });
    }
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
const cloudsDir = path.join(__dirname, 'public', 'images', 'crossings');
const fronteraDir = path.join(__dirname, 'public', 'images', 'frontera');

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
            if (filename === 'selection.json') {
                console.log('Selection metadata created');
                try {
                    const fs = require('fs');
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    io.emit('selection-updated', data);
                } catch (e) {
                    console.error('Error reading selection.json:', e);
                }
            } else if (filename.startsWith('border_') && filename.endsWith('.jpg')) {
                console.log(`New cloud image detected: ${filename}`);
                const updatedList = getCurrentImageList();
                io.emit('images-updated', {
                    type: 'added',
                    filename: filename,
                    imageList: updatedList
                });
                // Also emit crossing-image-updated for the latest image display
                const match = filename.match(/border_(\d+)_/);
                const borderNumber = match ? parseInt(match[1], 10) : null;
                io.emit('crossing-image-updated', {
                    type: 'added',
                    filename: filename,
                    borderNumber: borderNumber
                });
            }
        })
        .on('change', (filePath) => {
            const filename = path.basename(filePath);
            if (filename === 'selection.json') {
                console.log('Selection metadata updated');
                try {
                    const fs = require('fs');
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    io.emit('selection-updated', data);
                } catch (e) {
                    console.error('Error reading selection.json:', e);
                }
            } else if (filename.startsWith('border_') && filename.endsWith('.jpg')) {
                console.log(`Cloud image changed: ${filename}`);
                const match = filename.match(/border_(\d+)_/);
                const borderNumber = match ? parseInt(match[1], 10) : null;
                io.emit('crossing-image-updated', {
                    type: 'changed',
                    filename: filename,
                    borderNumber: borderNumber
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
    console.log(`Crossings directory not found: ${cloudsDir} - will create when needed`);
}

// Also watch the frontera directory for border analysis images
if (require('fs').existsSync(fronteraDir)) {
    const fronteraWatcher = chokidar.watch(fronteraDir, {
        ignored: /^\./, // ignore dotfiles
        persistent: true,
        ignoreInitial: true // don't emit events for existing files on startup
    });

    fronteraWatcher
        .on('add', (filePath) => {
            const filename = path.basename(filePath);
            if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png')) {
                console.log(`New frontera image detected: ${filename}`);
                io.emit('frontera-updated', {
                    type: 'added',
                    filename: filename
                });
            }
        })
        .on('unlink', (filePath) => {
            const filename = path.basename(filePath);
            if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png')) {
                console.log(`Frontera image removed: ${filename}`);
                io.emit('frontera-updated', {
                    type: 'removed',
                    filename: filename
                });
            }
        })
        .on('error', (error) => {
            console.error('Frontera file watcher error:', error);
        });

    console.log(`Watching for frontera image changes in: ${fronteraDir}`);
} else {
    console.log(`Frontera directory not found: ${fronteraDir} - will create when needed`);
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Project structure:');
    console.log('- Border SVG loaded from cumulus_reference/border_line.svg');
    console.log('- Crossings data loaded from cumulus_reference/crossings.json');
    console.log('- Custom sentences loaded from sentences.js');
    console.log('- Cloud images in public/images/crossings/ directory (border_XX_TIMESTAMP.jpg)');
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