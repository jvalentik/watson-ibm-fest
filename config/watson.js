'use strict';

const watson = require('watson-developer-cloud');

// If no API Key is provided here, the watson-developer-cloud@2.x.x library will check for an VISUAL_RECOGNITION_API_KEY
// environment property and then fall back to the VCAP_SERVICES property provided by Bluemix.
const visualRecognition = new watson.VisualRecognitionV3({
  version_date: '2015-05-19'
});

module.exports = visualRecognition;
