/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// THIS IS JUST A QUICK react-sqlite3 IMPLEMENTATION FOLLOWING react-pg

import {fileURLToPath} from 'url';
import {unstable_getCacheForType} from 'react';
import sqlite3 from 'sqlite3';

const Pending = 0;
const Resolved = 1;
const Rejected = 2;

function createRecordFromThenable(thenable) {
  const record = {
    status: Pending,
    value: thenable,
  };
  thenable.then(
    (value) => {
      if (record.status === Pending) {
        const resolvedRecord = record;
        resolvedRecord.status = Resolved;
        resolvedRecord.value = value;
      }
    },
    (err) => {
      if (record.status === Pending) {
        const rejectedRecord = record;
        rejectedRecord.status = Rejected;
        rejectedRecord.value = err;
      }
    }
  );
  return record;
}

function readRecordValue(record) {
  if (record.status === Resolved) {
    return record.value;
  } else {
    throw record.value;
  }
}

function prepareValue(val, seen) {
  // null and undefined are both null for postgres
  if (val == null) {
    return null;
  }
  if (val instanceof Buffer) {
    return val;
  }
  if (ArrayBuffer.isView(val)) {
    var buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength);
    if (buf.length === val.byteLength) {
      return buf;
    }
    return buf.slice(val.byteOffset, val.byteOffset + val.byteLength); // Node.js v4 does not support those Buffer.from params
  }
  if (val instanceof Date) {
    if (defaults.parseInputDatesAsUTC) {
      return dateToStringUTC(val);
    } else {
      return dateToString(val);
    }
  }
  if (Array.isArray(val)) {
    return arrayString(val);
  }
  if (typeof val === 'object') {
    return prepareObject(val, seen);
  }
  return val.toString();
}

function prepareObject(val, seen) {
  if (val && typeof val.toPostgres === 'function') {
    seen = seen || [];
    if (seen.indexOf(val) !== -1) {
      throw new Error(
        'circular reference detected while preparing "' + val + '" for query'
      );
    }
    seen.push(val);

    return prepareValue(val.toPostgres(prepareValue), seen);
  }
  return JSON.stringify(val);
}

function SQLite(filename) {
  this.db = new sqlite3.Database(filename);

  this.db.query = function(sql, params) {
    if (params && !Array.isArray(params)) {
      throw new Error('second parameter must be an array');
    }

    return new Promise((resolve, reject) => {
      this.all(sql, params, function(err, rows) {
        if (err) {
          reject(err);
        } else {
          resolve({rows});
        }
      });
    });
  };

  // Unique function per instance because it's used for cache identity.
  this.createRecordMap = function() {
    return new Map();
  };
}

SQLite.prototype.query = function(query, values) {
  const db = this.db;
  const outerMap = unstable_getCacheForType(this.createRecordMap);

  let innerMap = outerMap;
  let key = query;
  if (values != null) {
    // If we have parameters, each becomes as a nesting layer for Maps.
    // We want to find (or create as needed) the innermost Map, and return that.
    for (let i = 0; i < values.length; i++) {
      let nextMap = innerMap.get(key);
      if (nextMap === undefined) {
        nextMap = new Map();
        innerMap.set(key, nextMap);
      } else if (!(nextMap instanceof Map)) {
        throw new Error(
          'This query has received more parameters than the last time ' +
            'the same query was used. Always pass the exact number of ' +
            'parameters that the query needs.'
        );
      }
      innerMap = nextMap;

      key = prepareValue(values[i]);
    }
  }

  let record = innerMap.get(key);
  if (!record) {
    const thenable = db.query(query, values);
    record = createRecordFromThenable(thenable);
    innerMap.set(key, record);
  } else if (record instanceof Map) {
    throw new Error(
      'This query has received fewer parameters than the last time ' +
        'the same query was used. Always pass the exact number of ' +
        'parameters that the query needs.'
    );
  }
  const result = readRecordValue(record);
  return result;
};

export const db = new SQLite(
  fileURLToPath(import.meta.url).replace(
    /\/src\/db.server.js$/,
    '/server/db.sqlite'
  )
);
