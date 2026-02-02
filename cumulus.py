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

    # Enhanced cloud detection with probability calculation
    cloud_crossings = []
    #For each point on border, check if there are clouds and calculate probability
    for index, pix in enumerate(frontera['points']):
        #get color value of pixel
        p_c=clouds_cv[pix["y"],pix["x"]]
        # Calculate cloud probability based on brightness (0-255 scale)
        brightness = (int(p_c[0]) + int(p_c[1]) + int(p_c[2])) / 3
        cloud_probability = max(0, (brightness - 100) / 155)  # Scale from 100-255 to 0-1
        
        limit=130
        if p_c[0] >= limit and  p_c[1] >= limit and p_c[2] >= limit:
            # Mark clouds with blue dots
            adjusted_y = int(250 + (pix["y"] - 250) * 0.83)  # Compress Y around center
            cv2.circle(clouds_cv,(pix["x"],adjusted_y),3,(255,0,0),-1)
            cloud_crossings.append({
                'index': index,
                'point': pix,
                'probability': cloud_probability,
                'brightness': brightness
            })
        else:
            # Mark clear skies with green dots
            adjusted_y = int(250 + (pix["y"] - 250) * 0.83)  # Compress Y around center
            cv2.circle(clouds_cv,(pix["x"],adjusted_y),3,(0,255,0),-1)
    
    print("Cloudy crossings found: "+ str(len(cloud_crossings)))
    
    # Select crossings based on enhanced logic
    selected_crossings = []
    if len(cloud_crossings) >= 5:
        # Sort by probability (highest first)
        cloud_crossings.sort(key=lambda x: x['probability'], reverse=True)
        # Select 2 highest probability
        selected_crossings.extend(cloud_crossings[:2])
        # Select 3 random from remaining
        remaining = cloud_crossings[2:]
        selected_crossings.extend(random.sample(remaining, min(3, len(remaining))))
    else:
        # Use all available cloudy crossings
        selected_crossings = cloud_crossings
    
    print(f"Selected {len(selected_crossings)} crossings for detailed analysis")
    
    # Create crossings directory if it doesn't exist
    crossings_dir = path_cumulus + "crossings/"
    os.makedirs(crossings_dir, exist_ok=True)
    
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
            else:
                print(f"Failed to retrieve image for border {border_index}: HTTP {crossing_get.status_code}")
        except Exception as e:
            print(f"Error processing border {border_index}: {e}")
    
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

    # Run ML cloud detection
    try:
        ml_script = '/home/morakana/cumulus/cumulus_2025/cloud_detection_ml_final.py'
        ml_output = '/home/morakana/cumulus/cumulus_2025/border_images/ml_detection'
        print("Running ML cloud detection...")
        # Add user's local packages to PYTHONPATH for root execution
        env = os.environ.copy()
        env['PYTHONPATH'] = '/home/morakana/.local/lib/python3.8/site-packages:' + env.get('PYTHONPATH', '')
        result = subprocess.run(
            ['python3', ml_script, '--minimal', '--output', ml_output],
            capture_output=True,
            text=True,
            timeout=300,
            env=env
        )
        if result.returncode == 0:
            print("ML detection completed successfully")
            # Extract clouds detected from output
            for line in result.stdout.split('\n'):
                if 'Clouds detected:' in line:
                    print("ML: " + line.strip())
        else:
            print("ML detection failed: " + result.stderr[:200])
    except Exception as ml_error:
        print("ML detection error: " + str(ml_error))


except IOError as e:
    logging.info(e)

except KeyboardInterrupt:
    logging.info("ctrl + c:")
    exit()

def get_cloud():
    return
