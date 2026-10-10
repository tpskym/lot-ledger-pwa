import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const base='/lot-ledger-pwa/';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/'||pathname===base.slice(0,-1)){res.writeHead(302,{Location:base});res.end();return;}
    if(!pathname.startsWith(base)){res.writeHead(404);res.end('Not found');return;}
    const relative=pathname.slice(base.length)||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root)){res.writeHead(404);res.end('Not found');return;}
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(content);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Лоты PWA: http://127.0.0.1:4173'+base));
