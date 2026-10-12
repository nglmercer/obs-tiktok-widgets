import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles} = await build({entryPoints:['web/studio/features/drafts.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {DraftManager,mergeDraft}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('draft recovery preserves base, detects external changes, refreshes clean files and ignores obsolete storage',()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let manager=new DraftManager(storage);
 assert.equal(manager.open('id','src/main.ts','a','1').local,'a');
 manager.edit('id','src/main.ts',{base:'a',local:'local',revision:'1'});
 manager=new DraftManager(storage);
 assert.deepEqual(manager.open('id','src/main.ts','remote','2'),{base:'a',local:'local',revision:'1',remote:'remote',remoteRevision:'2'});
 assert.equal(manager.open('id','src/style.css','clean','2').local,'clean');
 assert.equal(manager.open('id','src/style.css','formatted','3').local,'formatted');
 manager.edit('id','src/main.ts',{base:'remote',local:'remote',revision:'2'});
 assert.equal(manager.open('id','src/main.ts','next','3').local,'next');
 data.set('studio-draft-v2:id:src/bad.ts','invalid JSON');
 assert.equal(manager.open('id','src/bad.ts','author','4').local,'author');
});
test('three-way merge accepts independent lines and refuses overlapping or structural edits',()=>{
 assert.equal(mergeDraft('a\nb','A\nb','a\nB'),'A\nB');
 assert.equal(mergeDraft('a','A','B'),undefined);
 assert.equal(mergeDraft('a','a\nb','A'),undefined);
 assert.equal(mergeDraft('a','a','B'),'B');
});
