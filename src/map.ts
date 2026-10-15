import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {zones,tracker,clock,type State,type Point} from './model';
export const mapNode=document.createElement('div');mapNode.className='geo-shell';
mapNode.innerHTML='<div class="tile-status" role="status">OpenStreetMap · загрузка подложки…</div><div id="real-map" aria-label="Реальная карта Астаны OpenStreetMap"></div><div class="fallback-map" hidden></div><div class="map-controls"><button id="fit-map">Все зоны</button><button id="fallback-toggle">Показать схему</button></div><div class="map-legend">● В зоне <span>● Вне зоны</span> ◇ Нет GPS · пунктир — последняя позиция · стрелка — направление</div>';
let map:L.Map|undefined,overlay:L.LayerGroup|undefined,lastSelected=-1,fallback=false,loaded=0,errors=0;
let selectWorker:(id:number)=>void=()=>{};let selectZone:(id:number)=>void=()=>{};
const latlng=(p:Point):L.LatLngTuple=>[p[1],p[0]];
export function initMap(onSelect:(id:number)=>void,onZone:(id:number)=>void){selectWorker=onSelect;selectZone=onZone;if(map){setTimeout(()=>map?.invalidateSize(),0);return;}map=L.map(mapNode.querySelector('#real-map') as HTMLElement,{scrollWheelZoom:true,minZoom:10,maxZoom:18,preferCanvas:true}).setView([51.131,71.438],12);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',maxZoom:19,updateWhenIdle:true,keepBuffer:1}).on('tileload',()=>{loaded++;tileStatus();}).on('tileerror',()=>{errors++;tileStatus();}).addTo(map);
 overlay=L.layerGroup().addTo(map);
 mapNode.querySelector<HTMLButtonElement>('#fit-map')!.onclick=()=>map!.fitBounds(L.latLngBounds(zones.flatMap(z=>z.poly.map(latlng))),{padding:[30,30]});
 mapNode.querySelector<HTMLButtonElement>('#fallback-toggle')!.onclick=()=>{fallback=!fallback;mapNode.querySelector<HTMLElement>('#real-map')!.hidden=fallback;mapNode.querySelector<HTMLElement>('.fallback-map')!.hidden=!fallback;mapNode.querySelector<HTMLButtonElement>('#fallback-toggle')!.textContent=fallback?'Вернуться к OSM':'Показать схему';map?.invalidateSize();tileStatus();};
 mapNode.addEventListener('click',e=>{const el=(e.target as HTMLElement).closest('[data-zone-fallback]') as HTMLElement;if(el)onZone(Number(el.dataset.zoneFallback));});

}
function tileStatus(){mapNode.querySelector('.tile-status')!.textContent=fallback?'Резервная схема · без картографической подложки':errors?(loaded?'OSM · часть тайлов недоступна. Можно открыть схему.':'Подложка OSM недоступна. Интернет необходим; доступна отдельная схема.'):'OpenStreetMap · реальная подложка Астаны · синтетические точки и границы';}
let eventPin:L.CircleMarker|undefined;
export function clearMapFocus(){eventPin?.remove();eventPin=undefined;}
export function focusPoint(p:Point,label='Точка события'){if(map){eventPin?.remove();eventPin=L.circleMarker(latlng(p),{radius:13,color:'#476dd2',weight:3,fillOpacity:.15}).bindTooltip(label,{permanent:true,direction:'top'}).addTo(map);map.setView(latlng(p),15);}}
export function refreshMap(s:State,selected:number,team:string,status:string){if(!map||!overlay)return;overlay.clearLayers();
 for(const z of zones)L.polygon(z.poly.map(latlng),{color:'#24825e',weight:2,fillColor:'#4ba765',fillOpacity:.13,dashArray:'6 4'}).bindTooltip(`${z.name} · демо-зона`).on('click',()=>{selectZone(z.id);}).addTo(overlay);
 for(const w of s.workers){if(team!=='all'&&w.team!==team||status!=='all'&&w.status!==status)continue;const color=w.status==='outside'?'#d75f39':w.status==='unknown'?'#7a80a1':w.status==='break'?'#c18c34':'#147c58';
 // Gaps in GPS and separate shifts must not become invented connecting tracks.
 let segment:Point[]=[];let previous=0;const paint=()=>{if(segment.length>1)L.polyline(segment.map(latlng),{color,weight:w.id===selected?4:2,opacity:.7}).addTo(overlay!);segment=[];};
 for(const fix of w.trail){if(fix.at-previous>16000)paint();segment.push(fix.point);previous=fix.at;}paint();
 if(w.point){const trail=w.trail,prev=trail.at(-2)?.point??w.point,angle=Math.atan2((w.point[0]-prev[0])*Math.cos(w.point[1]*Math.PI/180),w.point[1]-prev[1])*180/Math.PI;
 const icon=L.divIcon({className:'gps-marker',html:`<div class="gps-dot ${w.id===selected?'selected':''}" style="background:${color}">${w.id+1}<span style="transform:rotate(${angle}deg)">↑</span></div>`,iconSize:[32,32],iconAnchor:[16,16]});
 L.marker(latlng(w.point),{icon,title:w.name,keyboard:true}).bindTooltip(`${w.name} · ${tracker(w.id)} · ${clock(w.lastFix!)} · ±8 м`).on('click',()=>{selectWorker(w.id);}).addTo(overlay);
 L.circle(latlng(w.point),{radius:8,color,weight:1,fillOpacity:.1}).addTo(overlay);
 }else if(w.lastPoint&&w.active){L.circleMarker(latlng(w.lastPoint),{radius:10,color,weight:2,dashArray:'3 3',fillOpacity:.1}).bindTooltip(`${w.name}: последняя известная, ${clock(w.lastFix!)}. Текущее положение неизвестно.`).on('click',()=>{selectWorker(w.id);}).addTo(overlay);}}
 const xy=(p:Point)=>`${(p[0]-71.398)/.09*800},${520-(p[1]-51.09)/.085*520}`;
 mapNode.querySelector('.fallback-map')!.innerHTML=`<strong>АВТОНОМНАЯ СХЕМА · ЭТО НЕ OSM-КАРТА</strong><svg viewBox="0 0 800 520" role="img" aria-label="Резервная схема зон"><rect width="800" height="520" fill="#edf2e8"/><path d="M-10 150Q200 200 400 120T820 270" stroke="#b3d9e4" fill="none" stroke-width="32"/>${zones.map(z=>`<polygon points="${z.poly.map(xy).join(' ')}" fill="#a7d4b0" stroke="#3b8e61"/><text x="${xy(z.poly[3]).split(',')[0]}" y="${Number(xy(z.poly[3]).split(',')[1])-8}" font-size="13">${z.name}</text>`).join('')}${s.workers.filter(w=>w.point).map(w=>`<circle cx="${xy(w.point!).split(',')[0]}" cy="${xy(w.point!).split(',')[1]}" r="9" fill="${w.status==='outside'?'#d75f39':'#147c58'}"/>`).join('')}</svg><p>Показаны только синтетические зоны и точки. Схема не содержит реальных улиц.</p>`;
 if(lastSelected!==selected){lastSelected=selected;}setTimeout(()=>map?.invalidateSize(),0);
}
