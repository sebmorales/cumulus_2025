#!/usr/bin/python
# -*- coding:utf-8 -*-
# gps coordinates:https://gps-coordinates.org/
import sys
import os

picdir = os.path.join(os.path.dirname('/home/morakana/cumulus/'), 'pic')
libdir = os.path.join(os.path.dirname('/home/morakana/cumulus/'), 'lib')
# hashpath = os.path.join(os.path.dirname('/home/pi/.local/lib/python3.7/site-packages/imagehash.py'), 'lib')


if os.path.exists(libdir):
    sys.path.append(libdir)
    # sys.path.append(hashpath)
# from waveshare_epd import epd7in5_V2_seb

#
# import imagehash
import logging
logging.basicConfig(level=logging.DEBUG)
# print(imagehash.__file__)
from PIL import Image,ImageDraw,ImageFont, ImageChops
import traceback
import dithering

from io import BytesIO

# Duplicate detection functions (from remove_duplicates.py)
def get_image_signature(img, max_dim=64):
    """Get a small thumbnail signature for comparison. Accepts PIL Image or filepath.
    Maintains aspect ratio - scales so largest dimension is max_dim."""
    try:
        if isinstance(img, str):
            img = Image.open(img)
        # Calculate new size maintaining aspect ratio
        w, h = img.size
        if w > h:
            new_w = max_dim
            new_h = max(1, int(h * max_dim / w))
        else:
            new_h = max_dim
            new_w = max(1, int(w * max_dim / h))
        # Convert to grayscale and resize maintaining aspect ratio
        thumb = img.convert('L').resize((new_w, new_h), Image.LANCZOS)
        return list(thumb.getdata())
    except Exception as e:
        print(f"Error getting image signature: {e}")
        return None

def compare_signatures(sig1, sig2):
    """
    Compare two image signatures.
    Returns similarity as percentage (0-100).
    100 = identical, 0 = completely different.
    """
    if sig1 is None or sig2 is None:
        return 0
    if len(sig1) != len(sig2):
        # Different aspect ratios - not comparable
        return 0
    total_diff = sum(abs(a - b) for a, b in zip(sig1, sig2))
    max_diff = 255 * len(sig1)
    similarity = 100 * (1 - total_diff / max_diff)
    return similarity

def is_duplicate_image(new_img, existing_path, threshold=99.5):
    """
    Check if new_img is a duplicate of the image at existing_path.
    Returns True if similarity >= threshold.
    """
    if not os.path.exists(existing_path):
        return False
    new_sig = get_image_signature(new_img)
    existing_sig = get_image_signature(existing_path)
    similarity = compare_signatures(new_sig, existing_sig)
    if similarity >= threshold:
        print(f"Duplicate detected: {similarity:.1f}% similar to {os.path.basename(existing_path)}")
        return True
    return False

import cv2
import time, datetime, sys, signal, urllib, requests, random, json, numpy, pytz
import subprocess

#from StringIO import StringIO
# Because the program will run form the crontab, we need to specify the absolute path
img_save_name0="public/images/img0.jpg"
img_save_name1="public/images/img1.jpg"
# path_cumulus='public/images/'
path_cumulus='/home/morakana/cumulus/cumulus_2025/public/images/'
jsonfile=open(path_cumulus+'frontera.json',)
# jsonfile=open("public/images/frontera.json",)
frontera=json.load(jsonfile)
noaa_type="Most_Recent_MERGEDGC"
# noaa_type="Most_Recent_ABIGC"

# border_img="https://morakana.com/wp-content/uploads/2021/03/frontera1.jpg"
# https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-12800000%2C4100000%2C-11000000%2C2800000&imageSR=102100&bboxSR=102100&size=1000%2C500"
# Extended border bounding box to cover entire US-Mexico border
# From San Diego/Tijuana (-117.04°, 32.54°) to Brownsville/Matamoros (-97.47°, 25.88°)
# Web Mercator coordinates: West: -13041000, East: -10845000, North: 3871000, South: 2961000
border_img="https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/"+noaa_type+"/ImageServer/exportImage?f=image&bbox=-13041000%2C3871000%2C-10845000%2C2961000&imageSR=102100&bboxSR=102100&size=1000%2C500"
bprderBB=[-13041000,3871000,-10845000,2961000]
url_base="https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/"+noaa_type+"/ImageServer/exportImage?f=image&bbox="

# border_img="https://morakana.com/wp-content/uploads/2021/03/frontera1.jpg"
satelites=["https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-13961794%2C5951224%2C-3167246%2C-5132306&imageSR=102100&bboxSR=102100&size=528%2C880",
"https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/"+noaa_type+"/ImageServer/exportImage?f=image&bbox=-12796986%2C435536%2C-7100695%2C962688&imageSR=102100&bboxSR=102100&size=528%2C880",
"https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-9644519.959372513%2C2504839.8345999033%2C-7296374.450452522%2C6418415.682799887&imageSR=102100&bboxSR=102100&size=528%2C880",
"https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-8535265.80489833%2C4550906.207736957%2C-7948229.427668332%2C5529300.169786953&imageSR=102100&bboxSR=102100&size=528%2C880",
"https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-12505099.305916186%2C-1674125.3758061416%2C-7808808.288076207%2C6153026.3205938265&imageSR=102100&bboxSR=102100&size=528%2C880"]
# https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-13050000%2C4050000%2C-10750000%2C2900000&imageSR=102100&bboxSR=102100&size=528%2C880



try:
    logging.info(datetime.datetime.now())
    print ("trying")
    response_0 = requests.get(satelites[0])
    # response_1 = requests.get(satelites[2])
    response_clouds = requests.get(border_img)

    # Request images
    # img_0 = Image.open(BytesIO(response_0.content)).convert('L').resize((480,800),Image.ANTIALIAS)
    img_0 = Image.open(BytesIO(response_0.content)).resize((528,880),Image.ANTIALIAS)
    # img_1 = Image.open(BytesIO(response_1.content)).convert('L').resize((480,800),Image.ANTIALIAS)
    img_0=img_0.transpose(Image.ROTATE_180)

    # img_clouds = np.array(bytearray(response_clouds.read()), dtype=np.uint8)
    img_clouds = Image.open(BytesIO(response_clouds.content)).resize((1000,500),Image.ANTIALIAS).convert('RGB')
    
    # Check if this image is similar to the previous one (using threshold-based comparison)
    previous_clouds_path = path_cumulus + "clouds_previous.jpg"
    current_clouds_path = path_cumulus + "clouds.jpg"

    # Compare with previous image if it exists
    if os.path.exists(previous_clouds_path):
        if is_duplicate_image(img_clouds, previous_clouds_path, threshold=98.0):
            print("Border clouds image unchanged from previous - skipping processing (including ML detection)")
            # Update the previous image timestamp and exit
            img_clouds.save(previous_clouds_path)
            exit()
    
    # Save current image and copy as previous for next comparison
    img_clouds.save(current_clouds_path)
    img_clouds.save(previous_clouds_path)
    
    # clouds_cv = numpy.array(img_clouds)
    clouds_cv = cv2.cvtColor(numpy.array(img_clouds), cv2.COLOR_RGB2BGR)

    # Run ML cloud detection FIRST to use its results for crossing selection
    ml_results = {}
    ml_script = '/home/morakana/cumulus/cumulus_2025/cloud_detection_ml_final.py'
    ml_output = '/home/morakana/cumulus/cumulus_2025/border_images/ml_detection'

    try:
        print("Running ML cloud detection...")
        env = os.environ.copy()
        env['PYTHONPATH'] = '/home/morakana/.local/lib/python3.8/site-packages:' + env.get('PYTHONPATH', '')
        result = subprocess.run(
            ['python3', ml_script, '--output', ml_output],
            capture_output=True,
            text=True,
            timeout=300,
            env=env
        )
        if result.returncode == 0:
            print("ML detection completed successfully")
            # Read the latest ML report to get per-crossing results
            import glob
            report_files = sorted(glob.glob(ml_output + '/report_*.json'))
            if report_files:
                with open(report_files[-1], 'r') as f:
                    ml_report = json.load(f)
                    for r in ml_report.get('results', []):
                        ml_results[r['index']] = {
                            'is_cloud': r['is_cloud'],
                            'probability': r['probability']
                        }
                    print(f"ML: {ml_report.get('clouds_detected', 0)}/{ml_report.get('total_points', 0)} clouds detected")
        else:
            print("ML detection failed: " + result.stderr[:200])
    except Exception as ml_error:
        print("ML detection error: " + str(ml_error))

    # Build cloud_crossings using ML results (fallback to RGB if ML failed)
    cloud_crossings = []
    use_ml = len(ml_results) > 0
    print(f"Using {'ML' if use_ml else 'RGB'} detection for crossing selection")

    for index, pix in enumerate(frontera['points']):
        # Get RGB values for visualization
        p_c = clouds_cv[pix["y"], pix["x"]]
        brightness = (int(p_c[0]) + int(p_c[1]) + int(p_c[2])) / 3

        # Determine if cloud using ML results (or fallback to RGB)
        if use_ml and index in ml_results:
            is_cloud = ml_results[index]['is_cloud']
            cloud_probability = ml_results[index]['probability']
        else:
            # Fallback to RGB threshold
            limit = 130
            is_cloud = p_c[0] >= limit and p_c[1] >= limit and p_c[2] >= limit
            cloud_probability = max(0, (brightness - 100) / 155)

        adjusted_y = int(250 + (pix["y"] - 250) * 0.83)
        if is_cloud:
            # Mark clouds with blue dots
            cv2.circle(clouds_cv, (pix["x"], adjusted_y), 3, (255, 0, 0), -1)
            cloud_crossings.append({
                'index': index,
                'point': pix,
                'probability': cloud_probability,
                'brightness': brightness
            })
        else:
            # Mark clear skies with green dots
            cv2.circle(clouds_cv, (pix["x"], adjusted_y), 3, (0, 255, 0), -1)

    print("Cloudy crossings found (ML-based): " + str(len(cloud_crossings)))
    
    # Select crossings based on probability + geographic spread
    selected_crossings = []
    MIN_DISTANCE = 50  # Minimum pixel distance between selected crossings
    MAX_CROSSINGS = 9  # Maximum number of crossings to select

    def get_distance(p1, p2):
        """Calculate Euclidean distance between two crossing points"""
        return ((p1['point']['x'] - p2['point']['x'])**2 +
                (p1['point']['y'] - p2['point']['y'])**2) ** 0.5

    def is_far_enough(candidate, selected_list, min_dist):
        """Check if candidate is far enough from all already selected crossings"""
        for selected in selected_list:
            if get_distance(candidate, selected) < min_dist:
                return False
        return True

    if len(cloud_crossings) > 0:
        # Sort by probability (highest first)
        cloud_crossings.sort(key=lambda x: x['probability'], reverse=True)

        # Always select the highest probability crossing first
        selected_crossings.append(cloud_crossings[0])

        # For remaining selections, prioritize probability but enforce geographic spread
        remaining = cloud_crossings[1:]

        while len(selected_crossings) < MAX_CROSSINGS and remaining:
            # Find the highest probability crossing that is far enough from selected ones
            found = False
            for candidate in remaining:
                if is_far_enough(candidate, selected_crossings, MIN_DISTANCE):
                    selected_crossings.append(candidate)
                    remaining.remove(candidate)
                    found = True
                    break

            if not found:
                # No candidate far enough - reduce distance requirement or stop
                # Try with half the distance
                for candidate in remaining:
                    if is_far_enough(candidate, selected_crossings, MIN_DISTANCE / 2):
                        selected_crossings.append(candidate)
                        remaining.remove(candidate)
                        found = True
                        break

                if not found:
                    # Still no candidate - just take the highest probability remaining
                    if remaining:
                        selected_crossings.append(remaining[0])
                        remaining.pop(0)
                    else:
                        break

    # Mark the first one (highest probability) for the website to display by default
    if selected_crossings:
        selected_crossings[0]['is_primary'] = True

    print(f"Selected {len(selected_crossings)} crossings for detailed analysis (spread: {MIN_DISTANCE}px min distance)")
    
    # Create crossings directory if it doesn't exist
    crossings_dir = path_cumulus + "crossings/"
    os.makedirs(crossings_dir, exist_ok=True)

    # Save selection metadata for the website
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    selection_metadata = {
        'timestamp': timestamp,
        'crossings': []
    }

    # Process each selected crossing
    for crossing in selected_crossings:
        pix = crossing['point']
        border_index = crossing['index']
        
        # Mark selected crossing with larger red circle
        adjusted_y = int(250 + (pix["y"] - 250) * 0.83)  # Compress Y around center
        cv2.circle(clouds_cv,(pix["x"],adjusted_y),4,(0,0,255),-1)
        # Generate high-resolution zoomed image for this crossing
        # Finding the abs map point relative to selection
        abs_x = bprderBB[0] - (bprderBB[0] - bprderBB[2]) / 1000 * pix["x"]
        abs_y = bprderBB[1] - (bprderBB[1] - bprderBB[3]) / 500 * pix["y"] * 0.95
        
        # High-resolution image parameters (240x400 as requested)
        crossing_w = 240
        crossing_h = 400
        zoom = 8  # Higher zoom for more detail
        crossing_map_w = (bprderBB[0] - bprderBB[2]) / zoom
        crossing_map_h = crossing_map_w * (crossing_h / crossing_w)  # Maintain aspect ratio
        
        # Create bounding box centered on crossing
        bbox_crossing = [
            abs_x - crossing_map_w / 2,
            abs_y - crossing_map_h / 2,
            abs_x + crossing_map_w / 2,
            abs_y + crossing_map_h / 2
        ]
        
        print(f"Processing border crossing {border_index}: probability={crossing['probability']:.3f}")
        print(f"BBOX: {bbox_crossing}")
        
        # Generate timestamp for filename
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
        try:
            # Request high-resolution image
            crossing_query = f"{bbox_crossing[0]}%2C{bbox_crossing[1]}%2C{bbox_crossing[2]}%2C{bbox_crossing[3]}&imageSR=102100&bboxSR=102100&size={crossing_w}%2C{crossing_h}"
            crossing_get = requests.get(url_base + crossing_query)
            
            if crossing_get.status_code == 200:
                crossing_image = Image.open(BytesIO(crossing_get.content)).resize((crossing_w, crossing_h), Image.ANTIALIAS).convert('RGB')

                # Check for existing border images with same number
                import glob
                existing_files = glob.glob(crossings_dir + f"border_{border_index:02d}_*.jpg")

                # Check if new image is too similar to existing one (skip if duplicate)
                if existing_files:
                    # Compare with the most recent existing file
                    existing_files.sort()
                    latest_existing = existing_files[-1]
                    if is_duplicate_image(crossing_image, latest_existing, threshold=99.5):
                        print(f"Skipping border {border_index}: image unchanged from previous")
                        # Still add existing image to metadata
                        selection_metadata['crossings'].append({
                            'filename': os.path.basename(latest_existing),
                            'border_index': border_index,
                            'probability': crossing['probability'],
                            'is_primary': crossing.get('is_primary', False),
                            'x': pix['x'],
                            'y': pix['y']
                        })
                        continue

                    # Not a duplicate, delete old files before saving new one
                    for old_file in existing_files:
                        try:
                            os.remove(old_file)
                            print(f"Deleted old image: {os.path.basename(old_file)}")
                        except OSError as e:
                            print(f"Could not delete {old_file}: {e}")

                # Save with requested filename format: border_XX_timestamp.jpg
                filename = f"border_{border_index:02d}_{timestamp}.jpg"
                crossing_image.save(crossings_dir + filename)
                print(f"Saved high-resolution image: {filename}")

                # Add to metadata
                selection_metadata['crossings'].append({
                    'filename': filename,
                    'border_index': border_index,
                    'probability': crossing['probability'],
                    'is_primary': crossing.get('is_primary', False),
                    'x': pix['x'],
                    'y': pix['y']
                })
            else:
                print(f"Failed to retrieve image for border {border_index}: HTTP {crossing_get.status_code}")
        except Exception as e:
            print(f"Error processing border {border_index}: {e}")

    # Save selection metadata for the website
    if selection_metadata['crossings']:
        metadata_file = crossings_dir + "selection.json"
        with open(metadata_file, 'w') as f:
            json.dump(selection_metadata, f, indent=2)
        print(f"Saved selection metadata: {len(selection_metadata['crossings'])} crossings")

    #In case of need for analysis, lets save the CV image with border crossings marked
    cv2.imwrite(path_cumulus+'clouds_cv.jpg',clouds_cv)
    # Save image with timestamp showing border crossing analysis
    # cv2.imwrite(path_cumulus+'border_crossings_'+str(datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))+'.jpg',clouds_cv)
    
    # For backward compatibility, also create the original zoom image if any crossings were selected
    if selected_crossings:
        # Use the first selected crossing for the legacy zoom image
        first_crossing = selected_crossings[0]
        pix = first_crossing['point']
        abs_x = bprderBB[0] - (bprderBB[0] - bprderBB[2]) / 1000 * pix["x"]
        abs_y = bprderBB[1] - (bprderBB[1] - bprderBB[3]) / 500 * pix["y"] * 0.95
        
        clouds_w = 528
        clouds_h = 880
        zoom = 4
        clouds_map_w = (bprderBB[0] - bprderBB[2]) / zoom
        clouds_map_h = clouds_map_w * 1.667
        bbox_clouds = [abs_x - clouds_map_w / 2, abs_y - clouds_map_h / 2, abs_x + clouds_map_w / 2, abs_y + clouds_map_h / 2]
        
        cloud_query = f"{bbox_clouds[0]}%2C{bbox_clouds[1]}%2C{bbox_clouds[2]}%2C{bbox_clouds[3]}&imageSR=102100&bboxSR=102100&size={clouds_w}%2C{clouds_h}"
        cloud_get = requests.get(url_base + cloud_query)
        zoom_clouds = Image.open(BytesIO(cloud_get.content)).resize((clouds_w, clouds_h), Image.ANTIALIAS).convert('RGB')
        zoom_clouds.save(path_cumulus + "zoomclouds.jpg")
    # Create directories if they don't exist
    import os
    import glob
    os.makedirs(path_cumulus+"continente", exist_ok=True)
    os.makedirs(path_cumulus+"frontera", exist_ok=True)

    # Save continente image only if different from previous
    continente_files = sorted(glob.glob(path_cumulus+"continente/*.jpg"))
    if continente_files:
        if not is_duplicate_image(img_0, continente_files[-1], threshold=99.5):
            img_0.save(path_cumulus+"continente/"+str(datetime.datetime.now())+".jpg")
            print("Saved new continente image")
        else:
            print("Skipping continente: image unchanged from previous")
    else:
        img_0.save(path_cumulus+"continente/"+str(datetime.datetime.now())+".jpg")
        print("Saved first continente image")

    # Save frontera image only if different from previous
    frontera_files = sorted(glob.glob(path_cumulus+"frontera/*.jpg"))
    # Convert clouds_cv to PIL for comparison
    clouds_pil = Image.fromarray(cv2.cvtColor(clouds_cv, cv2.COLOR_BGR2RGB))
    if frontera_files:
        if not is_duplicate_image(clouds_pil, frontera_files[-1], threshold=99.5):
            cv2.imwrite(path_cumulus+"frontera/"+str(datetime.datetime.now())+'.jpg',clouds_cv)
            print("Saved new frontera image")
        else:
            print("Skipping frontera: image unchanged from previous")
    else:
        cv2.imwrite(path_cumulus+"frontera/"+str(datetime.datetime.now())+'.jpg',clouds_cv)
        print("Saved first frontera image")

    continente_cv = cv2.cvtColor(numpy.array(img_0), cv2.COLOR_BGR2GRAY)

    #adding data on images
    continente_cv=cv2.rotate(continente_cv,cv2.ROTATE_180)
    start_point=(0,858)
    end_point=(528,880)
    color = (0, 0, 0)
    thickness = -1
    continente_cv=cv2.rectangle(continente_cv, start_point, end_point, color, thickness)
    text_position = (5,873)
    cv2.putText(
        continente_cv, #numpy array on which text is written
        "Cumulus 2025- American Continent", #text
        text_position, #position at which writing has to start
        cv2.FONT_HERSHEY_SIMPLEX, #font family
        0.5, #font size
        (255, 255,255, 255), #font color
        1, #font stroke
        cv2.LINE_AA,
        False)
    continente_cv=cv2.rotate(continente_cv,cv2.ROTATE_180)

    continente_cv=cv2.rotate(continente_cv,cv2.ROTATE_90_CLOCKWISE)
    #resize for Testing
    s=(880,528)
    thresh = 128

    continente_cv=cv2.resize(continente_cv,s,interpolation = cv2.INTER_AREA)
    outMat_gray = dithering.dithering_gray(continente_cv.copy(), 1)
    # outMat_BW = cv2.threshold(outMat_gray, thresh, 255, cv2.THRESH_BINARY)[1]


    pilBW=Image.fromarray(outMat_gray,mode='L').convert('1')
    pilBW.save(path_cumulus+'continente.bmp',bits=1,optimize=True)


    # cv2.imwrite(path_cumulus+'continente.bmp', outMat_BW,[cv2.IMWRITE_PNG_BILEVEL, 9])

    # Only create nubes_frontera.bmp if we have selected crossings (zoom_clouds exists)
    if selected_crossings:
        nubes_frontera_cv=cv2.cvtColor(numpy.array(zoom_clouds), cv2.COLOR_BGR2GRAY)

        #adding data on images
        start_point=(0,858)
        end_point=(528,880)
        color = (0, 0, 0)
        thickness = -1
        nubes_frontera_cv=cv2.rectangle(nubes_frontera_cv, start_point, end_point, color, thickness)
        text_position = (5,873)
        # dt = datetime.datetime.now()
        dt=datetime.datetime.now(pytz.timezone('US/Eastern'))
        x = dt.strftime("%Y-%m-%d %H:%M:%S")
        # message=" Clouds Crossing: "+str(abs_x/100000)+", "+str(abs_y/100000) +"    "+str(x)+" GMT"
        message=" Clouds Crossing: "+str(abs_y/100000)+", "+str(abs_x/100000) +"    "+str(x)
        cv2.putText(
            nubes_frontera_cv, #numpy array on which text is written
            message, #text
            text_position, #position at which writing has to start
            cv2.FONT_HERSHEY_SIMPLEX, #font family
            0.5, #font size
            (255, 255,255, 255), #font color
            1, #font stroke
            cv2.LINE_AA,
            False)

        nubes_frontera_cv=cv2.rotate(nubes_frontera_cv,cv2.ROTATE_90_CLOCKWISE)
        nubes_frontera_cv=cv2.rotate(nubes_frontera_cv,cv2.ROTATE_180)

        outMat_gray = dithering.dithering_gray(nubes_frontera_cv.copy(), 1)
        # outMat_BW = cv2.threshold(outMat_gray, thresh, 255, cv2.THRESH_BINARY)[1]

        #This creates a 8bit image (even that it's black and white), so let's convert
        # it to a 1 bit image so it loads faster on the esp32.

        pilBW=Image.fromarray(outMat_gray,mode='L').convert('1')
        pilBW.save(path_cumulus+'nubes_frontera.bmp')
        # cv2.imwrite(path_cumulus+'nubes_frontera.bmp', outMat_BW,[cv2.IMWRITE_PNG_BILEVEL, 9])
    else:
        print("No clouds detected - skipping nubes_frontera.bmp generation")

    # ML detection already ran at the beginning - results used for crossing selection


except IOError as e:
    logging.info(e)

except KeyboardInterrupt:
    logging.info("ctrl + c:")
    exit()

def get_cloud():
    return
