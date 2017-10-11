'use strict';

const debug = require('debug')('ibm-fest-demo:router');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const uuid = require('uuid');
const async = require('async');
const extend = require('extend');
const multer = require('multer');

const common = require('../common');
const visualRecognition = require('../config/watson');
const bundleUtils = require('../config/bundle-utils');

const router = express.Router();
const ONE_HOUR = 3600000;
const TWENTY_SECONDS = 20000;

// Setup the upload mechanism
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage
});

router.get('/', (req, res) => {
  res.render('use');
});

router.get('/thermometer', (req, res) => {
  if (typeof req.query.score === 'undefined') {
    return res.status(400).json({ error: 'Missing required parameter: score', code: 400 });
  }
  const score = parseFloat(req.query.score);
  if (score >= 0.0 && score <= 1.0) {
    res.set('Content-type', 'image/svg+xml');
    res.render('thermometer', common.scoreData(score));
  } else {
    return res.status(400).json({ error: 'Score value invalid', code: 400 });
  }
});

router.get('/ready/:classifier_id', (req, res) => {
  visualRecognition.getClassifier(req.params, (err, classifier) => {
    if (err) {
      console.log(err);
      return res.status(err.code || 500).json(err);
    }
    res.json(classifier);
  });
});

router.get('/train', (req, res) => {
  res.render('train');
});

/**
 * Creates a classifier
 * @param req.body.bundles Array of selected bundles
 * @param req.body.kind The bundle kind
 */
router.post('/api/classifiers', upload.fields([{ name: 'classupload', maxCount: 3 }, { name: 'negativeclassupload', maxCount: 1 }]), (req, res) => {
  let formData;
  
  if (!req.files) {
    formData = bundleUtils.createFormData(req.body);
  } else {
    formData = { name: req.body.classifiername };
    req.files.classupload.map(function(fileobj, idx) {
      formData[req.body.classname[idx] + '_positive_examples'] = fs.createReadStream(path.join(fileobj.destination, fileobj.filename));
    });
    
    if (req.files.negativeclassupload && req.files.negativeclassupload.length > 0) {
      const negpath = path.join(req.files.negativeclassupload[0].destination, req.files.negativeclassupload[0].filename);
      formData.negative_examples = fs.createReadStream(negpath);
    }
  }
  
  visualRecognition.createClassifier(formData, (err, classifier) => {
    if (req.files) {
      req.files.classupload.map(common.deleteUploadedFile);
      if (req.files.negativeclassupload) {
        req.files.negativeclassupload.map(common.deleteUploadedFile);
      }
    }
    
    if (err) {
      console.log(err);
      return res.status(err.code || 500).json(err);
    }
    
    // ENV var prevents classifiers from being destroyed
    // for users who want that feature
    if (!process.env.PRESERVE_CLASSIFIERS) {
      // deletes the classifier after an hour
      setTimeout(visualRecognition.deleteClassifier.bind(visualRecognition, classifier), ONE_HOUR);
      res.json(classifier);
    }
  });
});

router.post('/api/retrain/:classifier_id', upload.any(), (req, res) => {
  let formData = { classifier_id: req.params.classifier_id };
  if (req.file) {
    if (req.file.fieldname.match(/^(negative_examples|.*_positive_examples)$/)) {
      formData[req.file.fieldname] = fs.createReadStream(req.file.path);
    }
  }
  let bodyKeys = Object.keys(req.body);
  
  bodyKeys.length && bodyKeys.reduce((store, item) => {
    let pathToZip = path.join('./public/images/bundles', req.body[item]);
    try {
      fs.statSync(pathToZip);
      store[item] = fs.createReadStream(pathToZip);
    } catch (err) {
      console.log(pathToZip, " path not found");
    }
    return store;
  },formData);
  
  req.files && req.files.reduce((store, item) => {
    if (item.fieldname.match(/^(negative_examples|.*_positive_examples)$/)) {
      store[item.fieldname] = fs.createReadStream(item.path);
    }
    return store;
  }, formData);
  
  visualRecognition.retrainClassifier(formData, (err, classifier) => {
    if (err) {
      console.log(err, Object.keys(formData),classifier);
    }
    Object.keys(formData).filter((item) => { return item !== 'classifier_id'; }).map((item) => {
      if (formData[item].path.match("public/images/bundles") === null) {
        fs.unlink(formData[item].path, (e) => {
          if (e) {
            console.log("Error removeing " + formData[item].path);
          }
        });
      }
    });
    if (err) {
      res.json(err)
    } else {
      res.json(classifier);
    }
  });
});

/**
 * Gets the status of a classifier
 * @param req.params.classifier_id The classifier id
 */
router.get('/api/classifiers/:classifier_id', (req, res) => {
  visualRecognition.getClassifier(req.params, (err, classifier) => {
    if (err) {
      debug(err);
      return res.status(err.code || 500).json(err);
    }
    res.json(classifier);
  });});

/**
 * Classifies an image
 * @param req.body.url The URL for an image either.
 *                     images/test.jpg or https://example.com/test.jpg
 * @param req.file The image file.
 */
router.post('/api/classify', upload.single('images_file'), (req, res) => {
  const params = {
    url: null,
    images_file: null
  };
  
  if (req.file) { // file image
    params.images_file = fs.createReadStream(req.file.path);
  } else if (req.body.url && req.body.url.indexOf('images') === 0) { // local image
    params.images_file = fs.createReadStream(path.join('public', req.body.url));
  } else if (req.body.image_data) {
    // write the base64 image to a temp file
    const resource = common.parseBase64Image(req.body.image_data);
    const temp = path.join(os.tmpdir(), uuid.v1() + '.' + resource.type);
    fs.writeFileSync(temp, resource.data);
    params.images_file = fs.createReadStream(temp);
  } else if (req.body.url) { // url
    params.url = req.body.url;
  } else { // malformed url
    return res.status(400).json({ error: 'Malformed URL', code: 400 });
  }
  
  if (params.images_file) {
    delete params.url;
  } else {
    delete params.images_file;
  }
  let methods = [];
  if (req.body.classifier_id || process.env.OVERRIDE_CLASSIFIER_ID) {
    params.classifier_ids = req.body.classifier_id ? [req.body.classifier_id] : [process.env.OVERRIDE_CLASSIFIER_ID];
    methods.push('classify');
  } else {
    params.classifier_ids = ['default', 'food'];
    params.threshold = 0.5; //So the classifers only show images with a confindence level of 0.5 or higher
    methods.push('classify');
    methods.push('detectFaces');
    methods.push('recognizeText');
  }
  
  // run the 3 classifiers asynchronously and combine the results
  async.parallel(methods.map((method) => {
    const fn = visualRecognition[method].bind(visualRecognition, params);
    if (method === 'recognizeText' || method === 'detectFaces') {
      return async.reflect(async.timeout(fn, TWENTY_SECONDS));
    } else {
      return async.reflect(fn);
    }
  }), (err, results) => {
    // delete the recognized file
    if (params.images_file && !req.body.url) {
      common.deleteUploadedFile(params.images_file);
    }
    
    if (err) {
      console.log(err);
      return res.status(err.code || 500).json(err);
    }
    // combine the results
    const combine = results.map((result) => {
      if (result.value && result.value.length) {
        // value is an array of arguments passed to the callback (excluding the error).
        // In this case, it's the result and then the request object.
        // We only want the result.
        result.value = result.value[0];
      }
      return result;
    }).reduce(function(prev, cur) {
      return extend(true, prev, cur);
    });
    if (combine.value) {
      // save the classifier_id as part of the response
      if (req.body.classifier_id) {
        combine.value.classifier_ids = req.body.classifier_id;
      }
      combine.value.raw = {};
      methods.map((methodName, idx) =>  {
        combine.value.raw[methodName] = encodeURIComponent(JSON.stringify(results[idx].value));
      });
      res.json(combine.value);
    } else {
      res.status(400).json(combine.error);
    }
  });
});

module.exports = router;
