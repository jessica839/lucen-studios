#!/usr/bin/env node
/** Local static/API server that follows this project's clean URL and redirects. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const mime = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.vcf': 'text/vcard; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));

function responseShim(response, localBrowserOrigin) {
  return {
    setHeader: (name, value) => response.setHeader(name, name.toLowerCase() === 'access-control-allow-origin' && localBrowserOrigin ? localBrowserOrigin : value),
    status(code) { response.statusCode = code; return this; },
    json(body) { response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); return this; },
    end(body) { response.end(body); return this; }
  };
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return undefined; }
}

function redirectFor(pathname) {
  for (const redirect of vercel.redirects || []) {
    if (redirect.source === pathname || `${redirect.source}.html` === pathname) return redirect;
  }
  return null;
}

function staticFile(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (relative.includes('\0') || relative.split('/').includes('..')) return null;
  if (!relative) return 'index.html';
  const direct = path.join(root, relative);
  if (path.extname(relative) && existsSync(direct)) return relative;
  if (!path.extname(relative)) {
    const asHtml = `${relative}.html`;
    if (existsSync(path.join(root, asHtml))) return asHtml;
    const asIndex = path.join(relative, 'index.html');
    if (existsSync(path.join(root, asIndex))) return asIndex;
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/' && url.pathname.endsWith('/')) { response.statusCode = 308; response.setHeader('Location', `${url.pathname.slice(0, -1)}${url.search}`); response.end(); return; }
    const redirect = redirectFor(url.pathname);
    if (redirect) { response.statusCode = redirect.permanent ? 308 : 307; response.setHeader('Location', redirect.destination); response.end(); return; }
    if (url.pathname.endsWith('.html') && staticFile(url.pathname)) {
      const withoutExtension = url.pathname.slice(0, -5);
      const cleanPath = withoutExtension === '/index' ? '/' : withoutExtension.replace(/\/index$/, '') || '/';
      response.statusCode = 308; response.setHeader('Location', `${cleanPath}${url.search}`); response.end(); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice('/api/'.length);
      if (!/^[a-z0-9-]+$/.test(name) || !existsSync(path.join(root, 'api', `${name}.js`))) { response.statusCode = 404; response.end('Not found'); return; }
      const handler = (await import(`../api/${name}.js`)).default;
      request.body = await requestBody(request);
      const localOrigin = request.headers.origin;
      const usingLoopbackGhl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(process.env.GHL_API_BASE || '');
      if (usingLoopbackGhl && localOrigin === url.origin) {
        // Local stub mode bridges only localhost to the production origin policy; deployed handlers remain strict.
        request.headers.origin = 'https://www.gamperklimmek.com';
      }
      await handler(request, responseShim(response, usingLoopbackGhl && localOrigin === url.origin ? localOrigin : undefined));
      return;
    }
    const relative = staticFile(url.pathname);
    if (!relative) {
      const notFound = path.join(root, '404.html');
      if (existsSync(notFound)) { response.statusCode = 404; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(await readFile(notFound)); }
      else { response.statusCode = 404; response.end('Not found'); }
      return;
    }
    const file = path.join(root, relative);
    if (!(await stat(file)).isFile()) { response.statusCode = 404; response.end('Not found'); return; }
    response.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) { console.error(error); if (!response.headersSent) response.statusCode = 500; response.end('Server error'); }
});

server.listen(port, '127.0.0.1', () => console.log(`Development server: http://127.0.0.1:${port}`));
