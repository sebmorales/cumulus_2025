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

import cv2
import time, datetime, sys, signal, urllib, requests, random, json, numpy, pytz

#from StringIO import StringIO
# Because the program will run form the crontab, we need to specify the absolute path
img_save_name0="public/images/img0.jpg"
img_save_name1="public/images/img1.jpg"
# path_cumulus='public/images/'
path_cumulus='/home/morakana/cumulus/public/images/'
jsonfile=open(path_cumulus+'frontera.json',)
# jsonfile=open("public/images/frontera.json",)
frontera=json.load(jsonfile)
noaa_type="Most_Recent_MERGEDGC"
# noaa_type="Most_Recent_ABIGC"

# border_img="https://morakana.com/wp-content/uploads/2021/03/frontera1.jpg"
# https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/Most_Recent_MERGEDGC/ImageServer/exportImage?f=image&bbox=-12800000%2C4100000%2C-11000000%2C2800000&imageSR=102100&bboxSR=102100&size=1000%2C500"
border_img="https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/"+noaa_type+"/ImageServer/exportImage?f=image&bbox=-12800000%2C4100000%2C-11000000%2C2800000&imageSR=102100&bboxSR=102100&size=1000%2C500"
# bprderBB=[-13050000,4050000,-10750000,2900000]
bprderBB=[-13084894,3924382,-10794985,2922455]
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
    img_clouds.save(path_cumulus+"clouds.jpg")
    # clouds_cv = numpy.array(img_clouds)
    clouds_cv = cv2.cvtColor(numpy.array(img_clouds), cv2.COLOR_RGB2BGR)

    cloud_index=[]
    #For each point on border, check if there are clouds
    index=0
    # print(frontera)
    for pix in frontera['points']:
        #get color value of pixel
        p_c=clouds_cv[pix["y"],pix["x"]]
        # if pixel is light gray/white
        limit=140
        if p_c[0] >= limit and  p_c[1] >= limit and p_c[2] >= limit:
            # print("CLOUD")
            cv2.circle(clouds_cv,(pix["x"],pix["y"]),5,(255,0,0),-1)
            cloud_index.append(index)
        index=index+1
    print("Points found "+ str(len(cloud_index)))
    # Now that we have a list of points with clouds, lets select one at random to focus on
    cloudFocus=frontera["points"][random.choice(cloud_index)]
    #Finding the abs map point relative to selection
    abs_x=bprderBB[0]-(bprderBB[0]-bprderBB[2])/1000*cloudFocus["x"]
    abs_y=bprderBB[1]-(bprderBB[1]-bprderBB[3])/500*cloudFocus["y"]
    print(cloudFocus)
    print(abs_x)
    print(abs_y)
    clouds_w=528
    clouds_h=880
    zoom=4
    clouds_map_w=(bprderBB[0]-bprderBB[2])/zoom
    clouds_map_h=clouds_map_w*1.667
    # clouds_map_h=clouds_map_w*1.9
    bbox_clouds=[abs_x-clouds_map_w/2,abs_y-clouds_map_h/2,abs_x+clouds_map_w/2,abs_y+clouds_map_h/2,]
    cv2.circle(clouds_cv,(cloudFocus["x"],cloudFocus["y"]),5,(0,0,255),-1)
    #In case of need for analysis, lets save the CV image
    cv2.imwrite(path_cumulus+'clouds_cv.jpg',clouds_cv)

    print("BBOX:")
    print(bbox_clouds)
    cloud_query=str(bbox_clouds[0])+"%2C"+str(bbox_clouds[1])+"%2C"+str(bbox_clouds[2])+"%2C"+str(bbox_clouds[3])+"&imageSR=102100&bboxSR=102100&size="+str(clouds_w)+"%2C"+str(clouds_h)
    cloud_get = requests.get(url_base+cloud_query)
    zoom_clouds = Image.open(BytesIO(cloud_get.content)).resize((clouds_w,clouds_h),Image.ANTIALIAS).convert('RGB')
    zoom_clouds.save(path_cumulus+"zoomclouds.jpg")
    zoom_clouds.save(path_cumulus+"clouds/"+str(datetime.datetime.now())+".jpg")
    img_0.save(path_cumulus+"continente/"+str(datetime.datetime.now())+".jpg")
    cv2.imwrite(path_cumulus+"frontera/"+str(datetime.datetime.now())+'.jpg',clouds_cv)

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




except IOError as e:
    logging.info(e)

except KeyboardInterrupt:
    logging.info("ctrl + c:")
    exit()

def get_cloud():
    return
