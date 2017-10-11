/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const fs = require('fs');

const lookupName = (token) => {
  return {
    moleskine: 'Moleskine Types',
    dogs: 'Dog Breeds',
    insurance: 'Insurance Claims',
    omniearth: 'Satellite Imagery'
  }[token];
};

const itemPath = (kind, item) => {
  return './public/images/bundles/' + kind + '/' + item + '.zip';
};

const isNegative = (item) => {
  return item.match(/^neg/);
};

module.exports.createFormData = (b) => {
  const formData = {
    name: lookupName(b.kind)
  };
  b.bundles.forEach((item) => {
    const itempath = itemPath(b.kind, item);
    if (isNegative(item)) {
      formData.negative_examples = fs.createReadStream(itempath);
    } else {
      formData[item + '_positive_examples'] = fs.createReadStream(itempath);
    }
  });
  return formData;
};
