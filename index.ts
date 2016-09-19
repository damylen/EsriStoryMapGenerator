#! /usr/bin/env node

import fs = require("fs");
var ExifImage = require("exif").ExifImage;
var async = require("async");
import _ = require("lodash");
var Jimp = require("jimp");
var path = require('path');
var fse = require("fs-extra");

var iconSize = 45;
var previewSize = 200;

function resizeImage(original, target, size) {

    Jimp.read(original, function (err, image) {

        var w = image.bitmap.width;
        var h = image.bitmap.height;
       
        if (err) { return; }

        if (typeof image !== "undefined") {

            try {
                image.resize(size, (h / w) * size)            // resize
                    .quality(95)                 // set JPEG quality                    
                    .write(target); // save
            }
            catch (e) {

            }
        }
    });

}

function exifToFeature(exifData: any, path: string) {
    var gps = exifData.gps;
    if (!gps.GPSLatitude) {
        return null;
    }
    var lat = gps.GPSLatitude[0] + gps.GPSLatitude[1] / 60 + gps.GPSLatitude[2] / 3600;
    var lng = gps.GPSLongitude[0] + gps.GPSLongitude[1] / 60 + gps.GPSLongitude[2] / 3600;
    if (gps.hasOwnProperty("GPSLatitudeRef") && gps.GPSLatitudeRef.toLowerCase() === "s") {
        lat = - lat;
    }
    if (gps.hasOwnProperty("GPSLongitudeRef") && gps.GPSLongitudeRef.toLowerCase() === "w") {
        lng = - lng;
    }
    var alt = gps.GPSAltitude | 0;
    var coord = alt ? [lng, lat, alt] : [lng, lat];
    var feat = <any>{
        "type": "Feature",
        "properties": {
        },
        "geometry": {
            "type": "Point",
            "coordinates": coord
        }
    };
    // feat.properties.exif = exifData;

    // time the gps coordinate was taken
    if (gps.hasOwnProperty("GPSDateStamp")) {
        var gpsDateArr = gps.GPSDateStamp.split(":");
        var gpsDate = new Date(Date.UTC(parseInt(gpsDateArr[0]),
            parseInt(gpsDateArr[1]) - 1, // Jan is 0
            parseInt(gpsDateArr[2]),
            gps.GPSTimeStamp[0],
            gps.GPSTimeStamp[1],
            gps.GPSTimeStamp[2]));
        feat.properties.gpsTime = gpsDate.getTime();
        feat.properties.gpsTimeStr = gpsDate.toString();
    }

    // time the actual picture was taken.
    // NH FIXME: We are assuming the pic was taken in the current timezone?
    var imgStr = exifData.exif.CreateDate;
    
    if (imgStr) {
        imgStr = imgStr.replace(":", "-").replace(":", "-");
        var imgDate = new Date(imgStr);
        feat.properties.imgTime = imgDate.getTime();
        feat.properties.imgTimeStr = imgDate.toString();
    }
    return feat;
}

var geojson = {
    type: "FeatureCollection",
    features: []
};



let result = [];
let csv = "Tab_Name,Name,artist,copyright,date,lat,long,Website,pic_url,thumb_url,ico_url\n";
let count = 0;

var files = fs.readdirSync(".");
var website = "website//";
var images = website + "images//";
var original = images + "original//";
var thumbnails = images + "thumbnails//";
var icons = images + "icons//";
var websiteRoot = process.argv[2];

var global = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] + "\\AppData\\Roaming\\npm\\node_modules\\esri-storymap-generator\\website\\";
console.log("Initialize website");


if (!fs.existsSync(website)) fs.mkdirSync(website);
if (!fs.existsSync(images)) fs.mkdirSync(images);
if (!fs.existsSync(original)) fs.mkdirSync(original);
if (!fs.existsSync(thumbnails)) fs.mkdirSync(thumbnails);
if (!fs.existsSync(icons)) fs.mkdirSync(icons);
fse.copySync(global,website,{ clobber : false});

console.log("Creating images");

async.eachSeries(files, (file, cb) => {
    var ext = path.extname(file).toLowerCase();
    
    if (ext !== ".jpg") { cb(); return; }
    console.log(file);
    

    var opath = file;
    var safeFile = file.replace(/[^a-z0-9/.]/gi, "").toLowerCase();
    var name = file.replace(".jpg", "");
    var fpath = original + "/" + safeFile;
    if (!fs.existsSync(fpath)) {
        console.log(safeFile);
        try {
            fse.copySync(opath, fpath);
        } catch (e) {

        }
    }

    new ExifImage({ image: fpath }, (error, exifData) => {
       
        if (error) {
            console.log("error : " + error);
            cb(null);
        }
        else {
            delete exifData.exif.MakerNote;
            delete exifData.exif.UserComment;
            delete exifData.makernote;


            var preview = thumbnails + safeFile;


            var f = exifToFeature(exifData, fpath);
            if (f != null) {
                count += 1;
                var icon = icons  + safeFile;
                f.properties.largeUrl = fpath;

                f.properties.iconUrl = icon;
                f.properties.description = exifData.image.ImageDescription;
                f.properties.artist = exifData.image.Artist;
                f.properties.date = exifData.image.ModifyDate;
                f.properties.copyright = exifData.image.Copyright;
                if (!fs.existsSync(icon)) {
                    resizeImage(fpath, icon, iconSize);
                }
                if (!fs.existsSync(preview)) {
                    resizeImage(fpath, preview, previewSize);
                }
                f.properties.previewUrl = preview;
                if (f.geometry) {
                    csv += "test,\"" + f.properties.description + "\",\"" + f.properties.artist + "\",\"" + f.properties.copyright + "\"," + f.properties.date + "," + f.geometry.coordinates[1] + "," + f.geometry.coordinates[0] + ",,\"" + websiteRoot + "/images/original/" + safeFile + "\",\"" + websiteRoot + "/images/thumbnails/" + safeFile + "\",\"" + websiteRoot + "/images/icons/" + safeFile + "\"\n";
                }

                result.push(f);
            }

            cb(null);
            //res[f] = exifData;            
        }

    });

}, (r) => {
    geojson.features = result;
    fs.writeFile(website + "result.json", JSON.stringify(geojson));
    fs.writeFile(website + "storymap.csv", csv);
});

