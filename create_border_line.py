#!/usr/bin/python3
import json
import math
import numpy as np

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

# Define key points along the actual US-Mexico border (approximate)
# These follow the actual border geography including the Rio Grande curve
border_geography = [
    # California coast to Arizona
    (32.534, -117.126),  # Pacific coast
    (32.534, -117.023),  # San Diego/Tijuana area
    (32.557, -116.944),  # Otay Mesa area
    (32.571, -116.627),  # Tecate
    (32.650, -115.950),  # Curve through mountains
    (32.671, -115.498),  # Calexico area
    (32.719, -114.721),  # Andrade
    
    # Arizona border (more mountainous, irregular)
    (32.488, -114.777),  # San Luis
    (32.200, -114.450),  # Curve south
    (31.879, -112.816),  # Lukeville area
    (31.600, -112.200),  # Mountain curves
    (31.489, -111.545),  # Sasabe
    (31.333, -110.989),  # Nogales area
    (31.334, -109.948),  # Naco
    (31.345, -109.546),  # Douglas
    
    # New Mexico border (shorter, mountainous)
    (31.335, -108.530),  # Antelope Wells
    (31.470, -108.200),  # Mountain curve
    (31.780, -107.720),  # Curve north
    (31.827, -107.640),  # Columbus area
    (31.815, -106.572),  # Santa Teresa
    
    # Texas border (follows Rio Grande river - big curve)
    (31.759, -106.487),  # El Paso area
    (31.440, -106.080),  # Tornillo area
    (31.299, -105.847),  # Fort Hancock
    (30.900, -105.200),  # River curve southeast
    (30.400, -104.700),  # River continues
    (29.560, -104.410),  # Presidio/Ojinaga
    (29.350, -103.800),  # River curve
    (29.132, -102.969),  # Big Bend area
    (29.200, -102.400),  # River curve north
    (29.468, -101.049),  # Amistad Dam area
    (29.361, -100.901),  # Del Rio
    (29.100, -100.600),  # River curve
    (28.709, -100.508),  # Eagle Pass
    (28.400, -100.200),  # River continues
    (27.950, -99.800),   # River curve
    (27.600, -99.530),   # Laredo area
    (27.200, -99.200),   # River southeast
    (26.800, -98.900),   # River curve
    (26.561, -99.142),   # Falcon Dam area
    (26.405, -99.016),   # Roma area
    (26.378, -98.816),   # Rio Grande City
    (26.270, -98.565),   # Los Ebanos
    (26.174, -98.314),   # Anzalduas
    (26.096, -98.267),   # Hidalgo/McAllen
    (26.071, -98.204),   # Pharr
    (26.081, -98.049),   # Donna
    (26.093, -97.957),   # Progreso
    (26.041, -97.738),   # Los Indios
    (25.963, -97.520),   # Brownsville area
    (25.880, -97.473),   # Gulf coast
]

# Convert all points to pixels and interpolate between them
border_points = []

for i, (lat, lon) in enumerate(border_geography):
    web_x, web_y = lat_lon_to_web_mercator(lat, lon)
    pixel_x, pixel_y = web_mercator_to_pixel(web_x, web_y)
    
    # Add the main point
    border_points.append({"x": pixel_x, "y": pixel_y})
    
    # Add interpolated points between this point and the next
    if i < len(border_geography) - 1:
        next_lat, next_lon = border_geography[i + 1]
        next_web_x, next_web_y = lat_lon_to_web_mercator(next_lat, next_lon)
        next_pixel_x, next_pixel_y = web_mercator_to_pixel(next_web_x, next_web_y)
        
        # Calculate distance and add intermediate points
        distance = math.sqrt((next_pixel_x - pixel_x)**2 + (next_pixel_y - pixel_y)**2)
        num_interpolated = max(1, int(distance / 5))  # Point every ~5 pixels
        
        for j in range(1, num_interpolated):
            ratio = j / num_interpolated
            interp_x = int(pixel_x + (next_pixel_x - pixel_x) * ratio)
            interp_y = int(pixel_y + (next_pixel_y - pixel_y) * ratio)
            border_points.append({"x": interp_x, "y": interp_y})

# Remove duplicates and sort by x coordinate
seen = set()
unique_points = []
for point in border_points:
    coord = (point["x"], point["y"])
    if coord not in seen:
        seen.add(coord)
        unique_points.append(point)

unique_points.sort(key=lambda p: p['x'])

# Create the frontera.json structure
frontera_data = {
    "points": unique_points
}

# Save the updated frontera.json
with open('/home/morakana/cumulus/public/images/frontera.json', 'w') as f:
    json.dump(frontera_data, f, indent=2)

print(f"Generated {len(unique_points)} border line points")
print(f"X range: {min(p['x'] for p in unique_points)} to {max(p['x'] for p in unique_points)}")
print(f"Y range: {min(p['y'] for p in unique_points)} to {max(p['y'] for p in unique_points)}")

# Print some sample points to verify the border curve
print("\nSample border points (showing the curve):")
for i in range(0, len(unique_points), len(unique_points)//10):
    point = unique_points[i]
    print(f"  Point {i}: ({point['x']}, {point['y']})")