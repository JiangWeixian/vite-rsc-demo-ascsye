/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { unlink, writeFile } from 'fs/promises';
import { renderToPipeableStream } from '../vendor/react-server-dom-vite/writer.node.server';
import path from 'path';

import React from 'react';

import db from './db';
import seed from './seed';

import Trouter from 'trouter';
import bodyParser from 'body-parser';

const router = new Trouter();

let viteDevServer;
async function getEntryServer() {
  if (viteDevServer) {
    const entry = await viteDevServer.ssrLoadModule('/src/App.server');
    return entry.default;
  }
}

async function renderReactTree(res, props) {
  const ReactApp = await getEntryServer();

  const { pipe } = renderToPipeableStream(React.createElement(ReactApp, props));

  pipe(res);
}

function sendResponse(req, res, redirectToId) {
  const location = JSON.parse(req.query.location);
  if (redirectToId) {
    location.selectedId = redirectToId;
  }
  res.setHeader('X-Location', JSON.stringify(location));
  renderReactTree(res, {
    selectedId: location.selectedId,
    isEditing: location.isEditing,
    searchText: location.searchText,
  });
}

router.get('/react', function (req, res) {
  sendResponse(req, res, null);
});

const NOTES_PATH = path.resolve(__dirname, '../notes');

router.post('/notes', async function (req, res) {
  const now = new Date();
  await db.query(
    'insert into notes (title, body, created_at, updated_at) values ($1, $2, $3, $3);',
    [req.body.title, req.body.body, now]
  );
  // Current published version of SQLite does not support RETURNING
  const result = await db.query('select id from notes where created_at = ?;', [
    now,
  ]);

  const insertedId = result.rows[0].id;
  await writeFile(
    path.resolve(NOTES_PATH, `${insertedId}.md`),
    req.body.body,
    'utf8'
  );
  sendResponse(req, res, insertedId);
});

router.put('/notes/:id', async function (req, res) {
  const now = new Date();
  const updatedId = Number(req.params.id);
  await db.query(
    'update notes set title = $1, body = $2, updated_at = $3 where id = $4',
    [req.body.title, req.body.body, now, updatedId]
  );
  await writeFile(
    path.resolve(NOTES_PATH, `${updatedId}.md`),
    req.body.body,
    'utf8'
  );
  sendResponse(req, res, null);
});

router.delete('/notes/:id', async function (req, res) {
  await db.query('delete from notes where id = $1', [req.params.id]);
  await unlink(path.resolve(NOTES_PATH, `${req.params.id}.md`));
  sendResponse(req, res, null);
});

router.get('/notes', async function (_req, res) {
  const { rows } = await db.query('select * from notes order by id desc');
  res.json(rows);
});

router.get('/notes/:id', async function (req, res) {
  const { rows } = await db.query('select * from notes where id = $1', [
    req.params.id,
  ]);
  res.json(rows[0]);
});

router.get('/sleep/:ms', function (req, res) {
  setTimeout(() => {
    res.json({ ok: true });
  }, req.params.ms);
});

const parseJsonBody = bodyParser.json();
export function handleRequest(req, res, next) {
  const [url, query = ''] = req.url.split('?');
  const { params, handlers } = router.find(req.method, url);

  if (handlers.length === 0) {
    return next();
  }

  res.json = (data) => res.end(JSON.stringify(data));
  req.params = params;
  req.query = Object.fromEntries(new URLSearchParams(query).entries());

  parseJsonBody(req, res, () =>
    handlers.forEach((handler) => handler(req, res))
  );
}

export async function configureViteDevServer(server) {
  viteDevServer = server;
  await seed(db);

  server.middlewares.use(handleRequest);
}
