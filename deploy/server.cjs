// server.cjs — 零依赖静态服务器（原生 http，无 npm install、无联网、秒起）
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname; // 托管自身所在目录
var port = Number(process.env.PORT);
if (!port) { console.error('ERROR: PORT env is required'); process.exit(1); }

var MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json'
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  var filePath = path.join(ROOT, path.normalize(urlPath));
  if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('Forbidden'); return; } // 防目录穿越
  fs.readFile(filePath, function (err, buf) {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, function () { console.log('Static server on port ' + port); });
