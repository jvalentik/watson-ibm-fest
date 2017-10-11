'use strict';

const debug = require('debug')('ibm-fest-demo:common');
const fs = require('fs');

const scoreData = (score) => {
  let scoreColor;
  if (score >= 0.8) {
    scoreColor = '#b9e7c9';
  } else if (score >= 0.6) {
    scoreColor = '#f5d5bb';
  } else {
    scoreColor = '#f4bac0';
  }
  return {
    score: score,
    xloc: (score * 312.0),
    scoreColor: scoreColor
  };
};

const deleteUploadedFile = (readStream) => {
  fs.unlink(readStream.path, (e) => {
    if (e) {
      debug(`error deleting ${readStream.path} ${e}`);
    }
  });
};

const parseBase64Image = (imageString) => {
  const  matches = imageString.match(/^data:image\/([A-Za-z-+/]+);base64,(.+)$/);
  let resource = {};
  
  if (matches.length !== 3) {
    return null;
  }
  
  resource.type = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  resource.data = new Buffer(matches[2], 'base64');
  return resource;
};

module.exports = {
  scoreData,
  deleteUploadedFile,
  parseBase64Image,
};
