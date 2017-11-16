# Extract Keyframes

A Node.js module that identifies and extracts the keyframes in videos for processing/storage elsewhere.

*NB:* _This module is still under development. Breaking changes in the interface are to be expected often, but will be versioned._

## Usage

The module uses FFProbe to identify keyframes in a video file (a path to the video file must be passed for processing. Streams and Buffers are not supported at this time). These frames are then extracted with FFMPEG.

```JavaScript

const extractKeyframes = require('extract-keyframes');

extractKeyframes('/path/to/validFile.mp4')
    .then(extractionProcess => {

        // Event fired when extraction process has begun.
        extractionProcess.on('start', function(){
            debug('Started');
        }, false);

        // Event fired when a keyframe is extracted
        extractionProcess.on('keyframe', function(data){
            debug('KEYFRAME:', data);
        });

        // Event fired when all keyframes have been extracted from the video
        extractionProcess.on('finish', function(data){
            debug('Finish:', data);
        });

    })
    .catch(err => {
        debug('Error extracting keyframes:', err);
    })
;

```

## You may also be interested in...

[The Node-red module for keyframe extraction](https://github.com/seanmtracey/node-red-contrib-extract-keyframes)