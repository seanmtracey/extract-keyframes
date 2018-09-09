const debug = require('debug')('extract-keyframes');
const fs = require('fs');
const spawn = require(`child_process`).spawn;
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static');
const EventEmitter = require('events');
const uuid = require('uuid/v4');
const rimraf = require('rimraf');

const WORKING_DIRECTORY = process.env.WORKING_DIRECTORY || '/tmp';
const FFPROBE_PATH = process.env.FFPROBEPATH || ffprobe.path;
const FFMPEG_PATH = process.env.FFMPEGPATH || ffmpeg.path;

function spawnProcess(binaryPath, args){
	debug(`\n\n`, binaryPath, args.join(` `), `\n\n`);
	return spawn(binaryPath, args);
}

function extractKeyframes(fileObject, dimensions = {}) {

	if(!fileObject){
		return Promise.reject(`No filepath or buffer passed as an argument. Pass a filepath (string) pointing to the video file, or a file object (buffer) of the video you'd like to process`);
	}

	function exit(emitter){

		emitter.emit('finish', {
			totalFrames : framesGenerated
		});
		
		rimraf(outputPath, {},(err) => {
			if(err){
				debug(`There was an error unlinking '${outputPath}'`, err);
			} else {
				debug(`Directory '${outputPath}' successfully unlinked`);
			}
		});
	
	}

	if(!dimensions.width){
		dimensions.width = -1;
	}

	if(!dimensions.height){
		dimensions.height = -1;
	}

	if(dimensions.width < -1){
		return Promise.reject(`Value of 'width' in dimensions object is less then -1. Values must be >= -1`);
	}

	if(dimensions.height < -1){
		return Promise.reject(`Value of 'height' in dimensions object is less then -1. Values must be >= -1`);
	}

	let firstFrame = true;
	let finishedLooking = false;
	let framesIdentified = 0
	let framesGenerated = 0;

	const randomDirectoryName = uuid();
	const outputPath = `${WORKING_DIRECTORY}/${randomDirectoryName}`;

	const fsPromise = new Promise( (resolve, reject) => {

		if(Buffer.isBuffer(fileObject)){

			const vidUUID = uuid();

			fs.writeFile(`${WORKING_DIRECTORY}/${vidUUID}`, fileObject, (err) => {

				if(err){
					reject(err);
				} else {
					resolve(`${WORKING_DIRECTORY}/${vidUUID}`);
				}

			});
		} else if(typeof(fileObject) === 'string' ) {

			fs.access(fileObject, function(err) {
				if (err) {
					reject('Unable to access file.', err)
				} else {
					resolve(fileObject);
				}
			});

		} else {
			reject('A valid file object or path was not passed to the function. The object passed was:', fileObject);
		}

	});

	return fsPromise
		.then(filePath => {

			return new Promise( (resolve, reject) => {

				fs.mkdir(outputPath, function(err){
					
					if(err){
						debug('DIRECTORY CREATION ERROR', err);
						throw err;
					}
	
					debug(`INPUT FILEPATH:`, filePath);
					debug(`OUTPUT FILEPATH:`, outputPath);
	
					const emitter = new EventEmitter();
	
					resolve(emitter);
	
					// FFProbe Options / Listeners
					const keyframeTimeIndexExtractionArguments = [
						`-loglevel`,
						`error`,
						`-select_streams`,
						`v:0`,
						`-show_entries`,
						`frame=pkt_pts_time,pict_type`,
						`-of`,
						`csv=print_section=0`,
						`${filePath}`
					];
	
					const keyframeTimeIndexExtraction = spawnProcess( FFPROBE_PATH, keyframeTimeIndexExtractionArguments );
	
					emitter.emit('start');
	
					keyframeTimeIndexExtraction.stdout.on(`data`, (data) => {
						data = data.toString(`utf8`);
	
						// We want to look for frames labelled with 'I'. These are the keyframes
						if(data.indexOf('I') > -1){
	
							data.split('\n').filter(z => {
									return z.indexOf('I') > 1;
								})
								.forEach(data => {
	
									debug(`KEYFRAME: ${data}`);
	
									const isThisTheFirstFrame = firstFrame;
									framesIdentified += 1;
	
									if(firstFrame === true){
										firstFrame = false;
									}
	
									const frameTime = data.split(',')[0];

									debug(`Extracting frame from time index ${frameTime}`);
	
									const outputFilename = `${uuid()}.jpg`;
									const completeOutputFilepath = `${outputPath}/${outputFilename}`;

									const keyFrameExtractionArguments = [
										'-ss',
										frameTime,
										'-i',
										filePath,
										'-vf',
										`scale=${dimensions.width}:${dimensions.height}`,
										'-vframes',
										'1',
										'-q:v',
										'2',
										completeOutputFilepath
									];

									const frameExtract = spawnProcess(FFMPEG_PATH, keyFrameExtractionArguments);
	
									frameExtract.on(`close`, (code) => {
	
										if(code === 1){
											debug(`frameExtract exited with status code 1 and was unhappy`);
										} else if(code === 0){
											debug(`frameExtract closed and was happy`);
	
											framesGenerated += 1;
											debug('FG:', framesGenerated, 'FI:', framesIdentified, 'FT:', frameTime);
	
											const details = {
												keyframeTimeoffset : Number(frameTime),
												image : fs.readFileSync( completeOutputFilepath )
											};
	
											debug('>>>', details.keyframeTimeoffset);
	
											emitter.emit('keyframe', details);
											
											 debug(`finishedLooking: ${finishedLooking} framesIdentified: ${framesIdentified} framesGenerated: ${framesGenerated} EQ: ${framesIdentified === framesGenerated}`);

											if(finishedLooking && framesIdentified === framesGenerated){
												exit(emitter);
											}

										}
	
									});
	
								})
							;
	
						}
					});
	
					keyframeTimeIndexExtraction.stderr.on(`data`, (data) => {
						debug(`stderr: ${data}`);
					});
	
					keyframeTimeIndexExtraction.on(`close`, (code) => {
	
						if(code === 1){
							debug(`keyframeTimeIndexExtraction exited with status code 1 and was unhappy`);
						} else if(code === 0){
							debug(`keyframeTimeIndexExtraction closed and was happy`);
							
							finishedLooking = true;

							if(framesIdentified === framesGenerated){

								debug(`Emitting 'finish' event`);
								exit(emitter);

							}
	
						}
	
					});
	
				});
				
			});

		})
	;

};

module.exports = extractKeyframes;