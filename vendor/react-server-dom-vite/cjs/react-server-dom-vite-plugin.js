/** @license React vundefined
 * react-server-dom-vite-plugin.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

'use strict';

var esModuleLexer = require('es-module-lexer');
var vite = require('vite');
var fs = require('fs');
var path = require('path');

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === 'string') return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === 'Object' && o.constructor) n = o.constructor.name;
  if (n === 'Map' || n === 'Set') return Array.from(o);
  if (n === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
    return _arrayLikeToArray(o, minLen);
}

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;

  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

  return arr2;
}

function _createForOfIteratorHelper(o, allowArrayLike) {
  var it;

  if (typeof Symbol === 'undefined' || o[Symbol.iterator] == null) {
    if (
      Array.isArray(o) ||
      (it = _unsupportedIterableToArray(o)) ||
      (allowArrayLike && o && typeof o.length === 'number')
    ) {
      if (it) o = it;
      var i = 0;

      var F = function () {};

      return {
        s: F,
        n: function () {
          if (i >= o.length)
            return {
              done: true,
            };
          return {
            done: false,
            value: o[i++],
          };
        },
        e: function (e) {
          throw e;
        },
        f: F,
      };
    }

    throw new TypeError(
      'Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
    );
  }

  var normalCompletion = true,
    didErr = false,
    err;
  return {
    s: function () {
      it = o[Symbol.iterator]();
    },
    n: function () {
      var step = it.next();
      normalCompletion = step.done;
      return step;
    },
    e: function (e) {
      didErr = true;
      err = e;
    },
    f: function () {
      try {
        if (!normalCompletion && it.return != null) it.return();
      } finally {
        if (didErr) throw err;
      }
    },
  };
}

function ReactFlightVitePlugin() {
  var _ref =
      arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
    _ref$clientComponentP = _ref.clientComponentPaths,
    clientComponentPaths =
      _ref$clientComponentP === void 0 ? [] : _ref$clientComponentP,
    _ref$isServerComponen = _ref.isServerComponentImporterAllowed,
    isServerComponentImporterAllowed =
      _ref$isServerComponen === void 0
        ? function (importer) {
            return false;
          }
        : _ref$isServerComponen;

  var config;
  return {
    name: 'vite-plugin-react-server-components',
    enforce: 'pre',
    configResolved: function (_config) {
      config = _config;
    },
    resolveId: async function (source, importer) {
      if (!importer) return null;
      /**
       * Throw errors when non-Server Components try to load Server Components.
       */

      if (
        /\.server(\.[jt]sx?)?$/.test(source) &&
        !(
          /(\.server\.[jt]sx?|entry-server\.[jt]sx?|\/index\.html)$/.test(
            importer
          ) || isServerComponentImporterAllowed(importer, source)
        )
      ) {
        throw new Error(
          'Cannot import ' +
            source +
            ' from "' +
            importer +
            '". ' +
            'By react-server convention, .server.js files can only be imported from other .server.js files. ' +
            'That way nobody accidentally sends these to the client by indirectly importing it.'
        );
      }
    },
    load: async function (id) {
      var options =
        arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (!options.ssr) return null; // Wrapped components won't match this becase they end in ?no-proxy

      if (/\.client\.[jt]sx?$/.test(id)) {
        return proxyClientComponent(id);
      }

      return null;
    },
    transform: function (code, id) {
      /**
       * In order to allow dynamic component imports from RSC, we use Vite's import.meta.glob.
       * This hook replaces the glob placeholders with resolved paths to all client components.
       *
       * NOTE: Glob import paths MUST be relative to the importer file in
       * order to get the `?v=xxx` querystring from Vite added to the import URL.
       * If the paths are relative to the root instead, Vite won't add the querystring
       * and we will have duplicated files in the browser (with duplicated contexts, etc).
       */
      if (/\/react-server-dom-vite.js/.test(id)) {
        var CLIENT_COMPONENT_GLOB = '**/*.client.[jt]s?(x)';
        var importerPath = path.dirname(id);
        var importerToRootPath = vite.normalizePath(
          path.relative(importerPath, config.root)
        );

        var _ref2 = importerToRootPath.match(/(\.\.\/)+(\.\.)?/) || [],
          importerToRootNested = _ref2[0];

        var userPrefix = path.normalize(
          path.join(
            importerPath,
            importerToRootNested.replace(/\/?$/, path.sep)
          )
        );
        var userGlob = path.join(
          importerToRootPath,
          'src',
          CLIENT_COMPONENT_GLOB
        );
        var importers = [[userGlob, userPrefix]];

        var _iterator = _createForOfIteratorHelper(clientComponentPaths),
          _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done; ) {
            var componentPath = _step.value;
            var libPrefix = componentPath + path.sep;
            var libGlob = path.join(
              path.relative(importerPath, componentPath),
              CLIENT_COMPONENT_GLOB
            );
            importers.push([libGlob, libPrefix]);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }

        var injectedGlobs =
          'Object.assign(Object.create(null), ' +
          importers
            .map(function (_ref3) {
              var glob = _ref3[0],
                prefix = _ref3[1];
              return (
                "__vncp(import.meta.glob('" + glob + "'), '" + prefix + "')"
              );
            })
            .join(', ') +
          ');';
        return code.replace(
          /\{\s*__INJECTED_CLIENT_IMPORTERS__[:\s]*null[,\s]*\}\s*;/,
          injectedGlobs + serializedNormalizePaths()
        );
      }
    },
  };
}

var serializedNormalizePaths = function () {
  return "\nfunction __vncp(obj, prefix) {\n  const nestedRE = /\\.\\.\\//gm;\n  return Object.keys(obj).reduce(function (acc, key) {\n    acc[prefix + key.replace(nestedRE, '')] = obj[key];\n    return acc;\n  }, {});\n}\n";
};

async function proxyClientComponent(id, src) {
  var DEFAULT_EXPORT = 'default'; // Modify the import ID to avoid infinite wraps

  var importFrom = id + '?no-proxy';
  await esModuleLexer.init;

  if (!src) {
    src = await fs.promises.readFile(id, 'utf-8');
  }

  var _await$transformWithE = await vite.transformWithEsbuild(src, id),
    code = _await$transformWithE.code;

  var _parse = esModuleLexer.parse(code),
    exportStatements = _parse[1]; // Classify exports in components to wrap vs. everything else (e.g. GQL Fragments)

  var otherExports = [];
  var componentExports = [];

  var _iterator2 = _createForOfIteratorHelper(exportStatements),
    _step2;

  try {
    for (_iterator2.s(); !(_step2 = _iterator2.n()).done; ) {
      var key = _step2.value;

      if (
        key !== DEFAULT_EXPORT &&
        /^use[A-Z]|Fragment$|Context$|^[A-Z_]+$/.test(key)
      ) {
        otherExports.push(key);
      } else {
        componentExports.push(key);
      }
    }
  } catch (err) {
    _iterator2.e(err);
  } finally {
    _iterator2.f();
  }

  if (componentExports.length === 0) {
    return "export * from '" + importFrom + "';\n";
  }

  var proxyCode =
    "import {wrapInClientProxy} from 'react-server-dom-vite/client-proxy';\n" +
    ("import * as allImports from '" + importFrom + "';\n\n"); // Re-export other stuff directly without wrapping

  if (otherExports.length > 0) {
    proxyCode +=
      'export {' + otherExports.join(', ') + "} from '" + importFrom + "';\n";
  } // Wrap components in Client Proxy

  componentExports.forEach(function (key) {
    var isDefault = key === DEFAULT_EXPORT;
    var componentName = isDefault
      ? id.split('/').pop().split('.').shift()
      : key;
    proxyCode +=
      'export ' +
      (isDefault ? DEFAULT_EXPORT : 'const ' + componentName + ' =') +
      " wrapInClientProxy({ name: '" +
      componentName +
      "', id: '" +
      id +
      "', component: allImports['" +
      key +
      "'], named: " +
      String(!isDefault) +
      ' });\n';
  });
  return proxyCode;
}

module.exports = ReactFlightVitePlugin;
