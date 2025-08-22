#!/usr/bin/python3
import json
import math

# Our current bounding box in Web Mercator (EPSG:102100)
# bprderBB=[-13041000,3871000,-10845000,2961000]
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
    # Calculate pixel position within our bounding box
    pixel_x = int((x - bbox_west) / (bbox_east - bbox_west) * img_width)
    pixel_y = int((bbox_north - y) / (bbox_north - bbox_south) * img_height)
    
    # Ensure coordinates are within image bounds
    pixel_x = max(0, min(img_width - 1, pixel_x))
    pixel_y = max(0, min(img_height - 1, pixel_y))
    
    return pixel_x, pixel_y

# Load the crossing coordinates
with open('/home/morakana/cumulus/cumulus_2025/cumulus_reference/crossings.json', 'r') as f:
    crossings = json.load(f)

# Convert to pixel coordinates
border_points = []

for crossing in crossings:
    lat = crossing['coordinates']['lat']
    lon = crossing['coordinates']['lon']
    
    # Convert to Web Mercator
    web_x, web_y = lat_lon_to_web_mercator(lat, lon)
    
    # Convert to pixel coordinates
    pixel_x, pixel_y = web_mercator_to_pixel(web_x, web_y)
    
    border_points.append({
        "x": pixel_x,
        "y": pixel_y,
        "name": crossing['name']
    })
    
    print(f"{crossing['name']}: ({lat}, {lon}) -> ({web_x:.0f}, {web_y:.0f}) -> ({pixel_x}, {pixel_y})")

# Sort by x coordinate (west to east)
border_points.sort(key=lambda p: p['x'])

# Create the frontera.json structure (without names to match original format)
frontera_data = {
    "points": [{"x": point["x"], "y": point["y"]} for point in border_points]
}

# Save the updated frontera.json
with open('/home/morakana/cumulus/public/images/frontera.json', 'w') as f:
    json.dump(frontera_data, f, indent=2)

print(f"\nGenerated {len(border_points)} border crossing points")
print(f"X range: {min(p['x'] for p in border_points)} to {max(p['x'] for p in border_points)}")
print(f"Y range: {min(p['y'] for p in border_points)} to {max(p['y'] for p in border_points)}")