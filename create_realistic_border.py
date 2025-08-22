#!/usr/bin/python3
import json
import math

# Our current bounding box in Web Mercator (EPSG:102100)
bbox_west = -13041000
bbox_north = 3871000  
bbox_east = -10845000
bbox_south = 2961000

# Image dimensions
img_width = 1000
img_height = 500

def lat_lon_to_web_mercator(lat, lon):
    """Convert lat/lon to Web Mercator coordinates"""
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.34 / 180
    return x, y

def web_mercator_to_pixel(x, y):
    """Convert Web Mercator coordinates to pixel coordinates"""
    pixel_x = int((x - bbox_west) / (bbox_east - bbox_west) * img_width)
    pixel_y = int((bbox_north - y) / (bbox_north - bbox_south) * img_height)
    
    # Ensure coordinates are within image bounds
    pixel_x = max(0, min(img_width - 1, pixel_x))
    pixel_y = max(0, min(img_height - 1, pixel_y))
    
    return pixel_x, pixel_y

# Load the crossing coordinates (using the clean JSON file)
with open('/home/morakana/cumulus/cumulus_2025/cumulus_reference/crossings.json', 'r') as f:
    crossings = json.load(f)

# Extract key crossing points and add intermediate border points to create realistic border curve
# These points represent major geographical features and known border line points

# Select key crossings and add intermediate geographic points
key_border_points = [
    # Pacific Coast to San Diego area
    (32.534, -117.130),  # Pacific Ocean point
    (32.534, -117.020),  # San Ysidro area
    
    # California border (following mountain ranges)
    (32.557, -116.944),  # Otay Mesa
    (32.600, -116.800),  # Mountain curve
    (32.571, -116.627),  # Tecate
    (32.650, -116.200),  # Desert curve
    (32.680, -115.800),  # Mountain approach
    (32.671, -115.498),  # Calexico area
    (32.719, -114.721),  # Andrade
    
    # Arizona border (desert and mountain terrain)
    (32.488, -114.777),  # San Luis
    (32.400, -114.500),  # Desert curve south
    (32.200, -113.800),  # Desert stretch
    (31.950, -113.200),  # Mountain approach
    (31.879, -112.816),  # Lukeville
    (31.700, -112.400),  # Mountain terrain
    (31.489, -111.545),  # Sasabe
    (31.420, -111.200),  # Mountain curve
    (31.333, -110.989),  # Nogales area
    (31.334, -109.948),  # Naco
    (31.345, -109.546),  # Douglas
    
    # New Mexico border (short mountain section)
    (31.335, -108.530),  # Antelope Wells
    (31.650, -108.000),  # Mountain curve north
    (31.827, -107.640),  # Columbus
    (31.815, -106.572),  # Santa Teresa
    
    # Texas border - Rio Grande River (major curves)
    (31.759, -106.487),  # El Paso area
    (31.500, -106.200),  # River start
    (31.440, -106.080),  # Tornillo area
    (31.299, -105.847),  # Fort Hancock
    (31.000, -105.400),  # River curve southeast
    (30.700, -105.000),  # Big river curve
    (30.200, -104.600),  # River continues
    (29.560, -104.410),  # Presidio/Ojinaga
    (29.400, -103.800),  # River curve
    (29.132, -102.969),  # Big Bend area
    (29.300, -102.200),  # River curve north
    (29.468, -101.049),  # Amistad Dam
    (29.361, -100.901),  # Del Rio
    (29.200, -100.700),  # River curve
    (28.900, -100.600),  # River continues
    (28.709, -100.508),  # Eagle Pass
    (28.400, -100.200),  # River southeast
    (28.000, -99.900),   # River curve
    (27.640, -99.530),   # Laredo area
    (27.400, -99.300),   # River continues
    (27.000, -99.100),   # River curve
    (26.800, -99.000),   # River southeast
    (26.561, -99.142),   # Falcon Dam
    (26.405, -99.016),   # Roma
    (26.378, -98.816),   # Rio Grande City
    (26.270, -98.565),   # Los Ebanos
    (26.174, -98.314),   # Anzalduas
    (26.096, -98.267),   # Hidalgo/McAllen
    (26.071, -98.204),   # Pharr
    (26.081, -98.049),   # Donna
    (26.093, -97.957),   # Progreso
    (26.041, -97.738),   # Los Indios
    (25.950, -97.520),   # Brownsville area
    (25.880, -97.473),   # Gulf of Mexico
]

# Convert all border points to pixel coordinates
border_pixels = []

for lat, lon in key_border_points:
    web_x, web_y = lat_lon_to_web_mercator(lat, lon)
    pixel_x, pixel_y = web_mercator_to_pixel(web_x, web_y)
    border_pixels.append({"x": pixel_x, "y": pixel_y})

# Add interpolated points between major points for smoother curve
interpolated_points = []

for i in range(len(border_pixels) - 1):
    current = border_pixels[i]
    next_point = border_pixels[i + 1]
    
    # Add current point
    interpolated_points.append(current)
    
    # Calculate distance and add intermediate points
    dx = next_point["x"] - current["x"]
    dy = next_point["y"] - current["y"]
    distance = math.sqrt(dx*dx + dy*dy)
    
    # Add intermediate points every ~3 pixels for smooth curve
    num_intermediate = max(1, int(distance / 3))
    
    for j in range(1, num_intermediate):
        ratio = j / num_intermediate
        interp_x = int(current["x"] + dx * ratio)
        interp_y = int(current["y"] + dy * ratio)
        interpolated_points.append({"x": interp_x, "y": interp_y})

# Add the last point
interpolated_points.append(border_pixels[-1])

# Remove duplicates while preserving order
seen = set()
final_points = []
for point in interpolated_points:
    coord = (point["x"], point["y"])
    if coord not in seen:
        seen.add(coord)
        final_points.append(point)

# Create the frontera.json structure
frontera_data = {
    "points": final_points
}

# Save the updated frontera.json
with open('/home/morakana/cumulus/public/images/frontera.json', 'w') as f:
    json.dump(frontera_data, f, indent=2)

print(f"Generated {len(final_points)} realistic border points")
print(f"X range: {min(p['x'] for p in final_points)} to {max(p['x'] for p in final_points)}")
print(f"Y range: {min(p['y'] for p in final_points)} to {max(p['y'] for p in final_points)}")

# Show the border curve progression
print("\nBorder progression (every 50th point):")
for i in range(0, len(final_points), 50):
    point = final_points[i]
    print(f"  Point {i}: ({point['x']}, {point['y']})")