import test from 'node:test';
import assert from 'node:assert/strict';
const target=new EventTarget();globalThis.window=target;
const {TikTokOBSClient}=await import('../../data/web/sdk/tiktok-obs.mjs');
function dispatch(type,detail){const event=new Event('tiktok:'+type);event.detail=detail;target.dispatchEvent(event);}
test('typed, generic, once, off, state and destroy',()=>{const client=new TikTokOBSClient(target);let typed=0,any=0,once=0;const cb=()=>typed++;const off=client.on('gift',cb);client.on('gift',cb);client.onAny(()=>any++);client.once('gift',()=>once++);dispatch('gift',{version:1,type:'gift',data:{}});dispatch('event',{version:1,type:'gift',data:{}});dispatch('gift',{version:1,type:'gift',data:{}});assert.equal(typed,2);assert.equal(any,1);assert.equal(once,1);off();dispatch('gift',{version:1});assert.equal(typed,2);dispatch('state',{version:1,data:{state:'Connected'}});assert.equal(client.getLastState().data.state,'Connected');client.destroy();dispatch('event',{version:1});assert.equal(any,1);assert.equal(client.getLastState(),null);});
test('invalid contract ignored',()=>{const client=new TikTokOBSClient(target);let calls=0;client.onAny(()=>calls++);dispatch('event',{version:99});assert.equal(calls,0);client.destroy();});
