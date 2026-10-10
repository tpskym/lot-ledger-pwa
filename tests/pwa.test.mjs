import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../dist/',import.meta.url);
test('manifest and shell work under a GitHub Pages project path',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root)));
  const base=new URL('https://example.github.io/lot-ledger-pwa/');
  assert.equal(new URL(manifest.start_url,base).href,base.href);
  assert.equal(new URL(manifest.scope,base).href,base.href);
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){
    const bytes=await readFile(new URL(icon.src,root));
    assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));
    assert.equal(bytes.readUInt32BE(20),Number(icon.sizes.split('x')[1]));
  }
  const html=await readFile(new URL('index.html',root),'utf8');
  assert.match(html,/rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html,/type="module" src="\.\/app.js"/);
});
test('service worker precaches assets and serves cached modules offline',async()=>{
  const handlers={},scope='https://example.github.io/lot-ledger-pwa/';
  const cached=new Map(),names=['another-pwa-cache','lot-ledger-pwa:'+scope+':old'];
  const removed=[],fetched=[];
  const cache={put:async(url,response)=>cached.set(new URL(url,scope).href,response),match:async(request)=>cached.get(request.url)};
  const context={URL,fetch:async(url)=>{
    fetched.push(url);const file=url==='./'?'index.html':url;
    const bytes=await readFile(new URL(file,root));
    return {ok:true,redirected:false,headers:{get:()=>file.endsWith('.html')?'text/html':'application/octet-stream'},bytes};
  },caches:{open:async(name)=>{const prefix='lot-ledger-pwa:'+scope+':';assert.ok(name.startsWith(prefix));assert.match(name.slice(prefix.length),/^v\d+$/);return cache;},keys:async()=>names,delete:async(name)=>removed.push(name)},self:{registration:{scope},location:{origin:'https://example.github.io'},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn}};
  vm.runInNewContext(await readFile(new URL('sw.js',root),'utf8'),context);
  let pending;
  handlers.install({waitUntil:p=>pending=p});await pending;
  assert.equal(cached.size,11);
  handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(removed,['lot-ledger-pwa:'+scope+':old']);
  context.fetch=()=>{throw new Error('Offline');};
  let response;
  handlers.fetch({request:{method:'GET',url:scope+'app.js'},respondWith:p=>response=p});
  assert.equal((await response).bytes.length,cached.get(scope+'app.js').bytes.length);
  assert.equal(fetched.length,11);
});
