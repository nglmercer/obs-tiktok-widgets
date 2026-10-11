(() => {
'use strict';
const config = {template:document.body.dataset.template,animation:true,messageLimit:30,...window.TikTokWidgetConfig};
const root = document.getElementById('root');
document.documentElement.style.setProperty('--accent',config.color || '#ff416c');
document.body.classList.toggle('light',config.theme==='light');
const style=document.createElement('style');style.textContent=config.customCss||'';document.head.append(style);
const allowed=e=>!config.filters?.length||config.filters.includes(e.type);
function safeUrl(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function image(url){const src=safeUrl(url);if(!src)return null;const img=document.createElement('img');img.src=src;img.referrerPolicy='no-referrer';return img;}
function row(user,text,url){const div=document.createElement('div');div.className='item'+(config.animation?' animate':'');const avatar=image(url||user?.avatar_url);if(avatar)div.append(avatar);const content=document.createElement('div'),name=document.createElement('strong'),message=document.createElement('div');name.textContent=user?.nickname||user?.unique_id||'Viewer';message.textContent=text;content.append(name,message);div.append(content);return div;}
function trim(){while(root.children.length>Math.max(1,Math.min(1000,Number(config.messageLimit)||30)))root.firstChild.remove();}
function sound(){if(config.sound && config.soundUrl){try{const url=new URL(config.soundUrl,location.href);if(['https:','file:'].includes(url.protocol))new Audio(url.href).play().catch(()=>{});}catch{}}}
let likeTotal=0n,likeTimer,viewerTimer,pendingViewer;
const giftRows=new Map(),giftCounts=new Map();
function counter(label,value){root.replaceChildren();const div=document.createElement('div');div.className='counter'+(config.animation?' animate':'');div.textContent=`${label} ${value}`;root.append(div);}
function accept(event){const e=event.detail;if(!e||e.version!==1||!allowed(e))return;const d=e.data||{};switch(config.template){
case 'chat':if(e.type==='chat'){root.append(row(d.user,d.comment||''));trim();}break;
case 'gifts':if(e.type==='gift'){
 const key=`${e.room}:${d.user?.id}:${d.gift_id}:${d.group_id||e.messageId}`;
 const count=BigInt(d.repeat_count||'1'),previous=giftCounts.get(key)||0n;
 // Streak messages contain cumulative totals: display max, never add totals.
 if(count<previous)return;giftCounts.set(key,count);let item=giftRows.get(key);
 if(item?.isConnected)item.remove();item=row(d.user,`${d.gift_name||'Gift'} × ${count}${d.repeat_end?' ✓':' …'}`,d.gift_image_url);giftRows.set(key,item);root.append(item);trim();if(count>previous)sound();
 if(giftRows.size>2048){const oldest=giftRows.keys().next().value;giftRows.delete(oldest);giftCounts.delete(oldest);}
}break;
case 'alerts':if(e.type==='follow'){root.append(row(d.user,'followed the creator'));trim();sound();setTimeout(()=>root.firstChild?.remove(),5000);}break;
case 'likes':if(e.type==='like'){likeTotal=d.total!=null?BigInt(d.total):likeTotal+BigInt(d.count||'0');if(!likeTimer)likeTimer=setTimeout(()=>{counter('♥',likeTotal.toString());likeTimer=null;},Number(config.likeAggregationMs)||250);}break;
case 'viewers':if(e.type==='roomUser'){pendingViewer=d.total||'0';if(!viewerTimer)viewerTimer=setTimeout(()=>{counter('Viewers',pendingViewer);viewerTimer=null;},Number(config.viewerCoalescingMs)||250);}break;
case 'events':{const pre=document.createElement('pre');const copy={...e};delete copy.native;pre.textContent=JSON.stringify(copy,null,2);root.append(pre);trim();}break;
}}
window.addEventListener('tiktok:event',accept);
// Follow is an alias on identified social events and is consumed only here.
if(config.template==='alerts')window.addEventListener('tiktok:follow',event=>{if(event.detail.type!=='follow')accept({detail:{...event.detail,type:'follow'}});});
window.addEventListener('tiktok:state',event=>{window.TikTokLastState=event.detail;});
if(config.template==='likes')counter('♥','0');if(config.template==='viewers')counter('Viewers','0');
// Explicit fixture mode is available in ordinary browsers; it opens no transport.
if(new URL(location.href).searchParams.has('preview')){const b=document.createElement('button');b.id='preview';b.textContent='Play offline fixtures';document.body.prepend(b);b.onclick=()=>{const fixtures=[['chat',{user:{nickname:'Fixture <script>',id:'1'},comment:'Safe offline preview'}],['gift',{user:{nickname:'Viewer',id:'1'},gift_name:'Rose',gift_id:'5655',group_id:'preview',repeat_count:'3',repeat_end:true}],['like',{count:'5',total:'25'}],['follow',{user:{nickname:'Viewer'}}],['roomUser',{total:'123'}],['unknown',{'#900':'9007199254740999'}]];for(const [type,data] of fixtures)window.dispatchEvent(new CustomEvent('tiktok:event',{detail:{version:1,type,data,room:'@fixture',messageId:'preview-'+type}}));};}
})();
