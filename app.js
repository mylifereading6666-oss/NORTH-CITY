import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const CENTER={lat:43.0687,lon:141.3508};
const BBOX={south:43.058,west:141.337,north:43.078,east:141.365};
const sceneHost=document.querySelector("#scene");
const statusEl=document.querySelector("#status");
const loadingText=document.querySelector("#loading-text");
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9bb8c7);
scene.fog=new THREE.Fog(0x9bb8c7,180,650);
const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,1400);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
sceneHost.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd9efff,0x52606a,2.0));
const sun=new THREE.DirectionalLight(0xfff1d6,2.1);sun.position.set(-90,160,80);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.near=1;sun.shadow.camera.far=500;sun.shadow.camera.left=-180;sun.shadow.camera.right=180;sun.shadow.camera.top=180;sun.shadow.camera.bottom=-180;scene.add(sun);

const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
const groundMat=mat(0x687b70),roadMat=mat(0x303941),sideMat=mat(0x9ba6a9),buildingMats=[mat(0x9aa8b1),mat(0x758895),mat(0xb2b8b5),mat(0x667985),mat(0xc1b9a8)];
const ground=new THREE.Mesh(new THREE.PlaneGeometry(900,900),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.4;scene.add(ground);
const grid=new THREE.GridHelper(900,90,0x829b9f,0x829b9f);grid.position.y=-.38;grid.material.transparent=true;grid.material.opacity=.12;scene.add(grid);

const metersLon= Math.cos(CENTER.lat*Math.PI/180)*111320;
function project(lat,lon){return {x:(lon-CENTER.lon)*metersLon,z:-(lat-CENTER.lat)*111320};}
function addRoad(points,width=6){if(points.length<2)return;const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,.03,p.z)));const geo=new THREE.TubeGeometry(curve,Math.max(8,points.length*3),width/2,5,false);const mesh=new THREE.Mesh(geo,roadMat);mesh.userData.terrainRoad=true;scene.add(mesh);}
function addBuilding(way){const coords=way.geometry;if(!coords||coords.length<4)return;const pts=coords.map(p=>project(p.lat,p.lon));const center=pts.reduce((a,p)=>({x:a.x+p.x/pts.length,z:a.z+p.z/pts.length}),{x:0,z:0});const shape=new THREE.Shape();pts.forEach((p,i)=>{const x=p.x-center.x,z=p.z-center.z;i?shape.lineTo(x,-z):shape.moveTo(x,-z)});shape.closePath();const h=Math.max(5,Math.min(55,Number(way.tags?.["height"]?.replace(" m",""))||Number(way.tags?.["building:levels"])*3.2||10+Math.random()*13));const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false});const mesh=new THREE.Mesh(geo,buildingMats[Math.floor(Math.random()*buildingMats.length)]);mesh.rotation.x=-Math.PI/2;mesh.position.set(center.x,.05,center.z);mesh.userData.terrainBuilding=true;mesh.userData.terrainCenter={x:center.x,z:center.z};scene.add(mesh);const roof=new THREE.Mesh(new THREE.BoxGeometry(1,.15,1),mat(0x4a5961));roof.scale.set(1,1,1);roof.position.set(center.x,h+.05,center.z);roof.visible=false;scene.add(roof);}
function addFallbackStreet(){for(let z=-360;z<=360;z+=65)addRoad([{x:-360,z},{x:360,z}],8);for(let x=-360;x<=360;x+=65)addRoad([{x,z:-360},{x,z:360}],8);for(let i=0;i<48;i++){const x=(Math.random()-.5)*560,z=(Math.random()-.5)*560;const w=12+Math.random()*22,d=12+Math.random()*24,h=8+Math.random()*28;const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),buildingMats[i%buildingMats.length]);b.position.set(x,h/2,z);scene.add(b);}}

let terrainHeightGrid=null;
const TERRAIN_SEGMENTS=128;
function terrainHeightAt(x,z){
 if(!terrainHeightGrid)return 0;
 const u=Math.max(0,Math.min(1,(x+1200)/2400)),v=Math.max(0,Math.min(1,(z+1200)/2400));
 const gx=u*TERRAIN_SEGMENTS,gz=v*TERRAIN_SEGMENTS,x0=Math.floor(gx),z0=Math.floor(gz),x1=Math.min(TERRAIN_SEGMENTS,x0+1),z1=Math.min(TERRAIN_SEGMENTS,z0+1),tx=gx-x0,tz=gz-z0;
 const a=terrainHeightGrid[z0*(TERRAIN_SEGMENTS+1)+x0],b=terrainHeightGrid[z0*(TERRAIN_SEGMENTS+1)+x1],c=terrainHeightGrid[z1*(TERRAIN_SEGMENTS+1)+x0],d=terrainHeightGrid[z1*(TERRAIN_SEGMENTS+1)+x1];
 return (a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz-.42;
}
function conformMapToTerrain(){
 if(!terrainHeightGrid)return;
 scene.traverse(obj=>{
  if(obj.userData.terrainRoad&&obj.geometry){
   const p=obj.geometry.attributes.position;
   for(let i=0;i<p.count;i++){p.setY(i,terrainHeightAt(p.getX(i),p.getZ(i))+.08);}
   p.needsUpdate=true;obj.geometry.computeVertexNormals();
  }else if(obj.userData.terrainBuilding){
   const c=obj.userData.terrainCenter;obj.position.y=terrainHeightAt(c.x,c.z)+.05;
  }
 });
}
const DEM_ZOOM=15;
function tileXY(lat,lon,z){const n=2**z,xt=(lon+180)/360*n,rad=lat*Math.PI/180,yt=(1-Math.asinh(Math.tan(rad))/Math.PI)/2*n;return {x:xt,y:yt};}
function demElevation(r,g,b){const v=r*655.36+g*2.56+b*.01-10000;return v < -9999 ? 0 : v;}
async function loadDemTile(x,y){const url=`https://tiles.gsi.go.jp/xyz/dem5a/${DEM_ZOOM}/${x}/${y}.png`;const response=await fetch(url);if(!response.ok)throw new Error("DEM tile unavailable");const blob=await response.blob();const bitmap=await createImageBitmap(blob);const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,bitmap.width,bitmap.height);}
async function loadTerrain(){
 const a=tileXY(BBOX.north,BBOX.west,DEM_ZOOM),b=tileXY(BBOX.south,BBOX.east,DEM_ZOOM),tiles=new Map(),jobs=[];
 for(let x=Math.floor(a.x);x<=Math.floor(b.x);x++)for(let y=Math.floor(a.y);y<=Math.floor(b.y);y++)jobs.push((async()=>{try{tiles.set(`${x}/${y}`,await loadDemTile(x,y));}catch(e){}})());
 await Promise.all(jobs);if(!tiles.size)throw new Error("No elevation tiles");
 const centerTile=tileXY(CENTER.lat,CENTER.lon,DEM_ZOOM),centerData=tiles.get(`${Math.floor(centerTile.x)}/${Math.floor(centerTile.y)}`);
 let baseElevation=0;if(centerData){const cx=Math.min(255,Math.floor((centerTile.x-Math.floor(centerTile.x))*256)),cy=Math.min(255,Math.floor((centerTile.y-Math.floor(centerTile.y))*256)),ci=(cy*centerData.width+cx)*4;baseElevation=demElevation(centerData.data[ci],centerData.data[ci+1],centerData.data[ci+2]);}
 const seg=TERRAIN_SEGMENTS,geometry=new THREE.PlaneGeometry(2400,2400,seg,seg),pos=geometry.attributes.position;terrainHeightGrid=new Float32Array(pos.count);
 for(let i=0;i<pos.count;i++){
  const u=(pos.getX(i)+1200)/2400,v=(1200-pos.getY(i))/2400;
  const lat=BBOX.north+(BBOX.south-BBOX.north)*v,lon=BBOX.west+(BBOX.east-BBOX.west)*u,t=tileXY(lat,lon,DEM_ZOOM);
  const tx=Math.floor(t.x),ty=Math.floor(t.y),tile=tiles.get(`${tx}/${ty}`);if(!tile)continue;
  const px=Math.max(0,Math.min(255,Math.floor((t.x-tx)*256))),py=Math.max(0,Math.min(255,Math.floor((t.y-ty)*256))),idx=(py*tile.width+px)*4;
  const h=demElevation(tile.data[idx],tile.data[idx+1],tile.data[idx+2]);const relative=Math.max(-20,Math.min(100,h-baseElevation));pos.setZ(i,relative);terrainHeightGrid[i]=relative;
 }
 geometry.computeVertexNormals();const terrain=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x81917c,roughness:1,side:THREE.DoubleSide}));terrain.rotation.x=-Math.PI/2;terrain.position.y=-.42;scene.add(terrain);ground.visible=false;grid.visible=false;conformMapToTerrain();
 return tiles.size;
}

async function loadOSM(){const q=`[out:json][timeout:20];(way["highway"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}););out geom;`;const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];let data=null;for(const url of endpoints){try{const r=await fetch(url,{method:"POST",body:q});if(r.ok){data=await r.json();break;}}catch(e){}}if(!data)throw new Error("OSM data unavailable");let roads=0,buildings=0;for(const way of data.elements){if(!way.geometry)continue;if(way.tags?.highway){addRoad(way.geometry.map(p=>project(p.lat,p.lon)),way.tags.highway==="motorway"?10:way.tags.highway==="primary"?8:way.tags.highway==="footway"?2.2:5);roads++;}else if(way.tags?.building){addBuilding(way);buildings++;}}return {roads,buildings};}

const player=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.9,4,8),mat(0x18232c));body.position.y=1.15;player.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.29,12,10),mat(0xc99b7b));head.position.y=1.95;player.add(head);const hair=new THREE.Mesh(new THREE.SphereGeometry(.3,12,8),mat(0x17191d));hair.scale.set(1, .55,1);hair.position.y=2.13;player.add(hair);const legMat=mat(0x111820);for(const x of [-.2,.2]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.19,.7,.22),legMat);leg.position.set(x,.45,0);player.add(leg);}scene.add(player);player.position.set(0,0,0);

let yaw=0,pitch=.25,moveX=0,moveZ=0,running=false,jumpV=0,onGround=true;const camOffset=new THREE.Vector3(0,5.2,10);
function updateCamera(){const dist=running?9:8;const target=new THREE.Vector3(player.position.x,player.position.y+1.3,player.position.z);const offset=new THREE.Vector3(Math.sin(yaw)*dist,3.2+pitch*5,Math.cos(yaw)*dist);camera.position.copy(target).add(offset);camera.lookAt(target);}
updateCamera();
const joy=document.querySelector("#joystick"),stick=document.querySelector("#stick");let joyPointer=null;
function setStick(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=34,len=Math.hypot(dx,dy),k=len>max?max/len:1;const x=dx*k,y=dy*k;stick.style.left=`calc(50% + ${x}px)`;stick.style.top=`calc(50% + ${y}px)`;moveX=x/max;moveZ=y/max;}
joy.addEventListener("pointerdown",e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setStick(e);});joy.addEventListener("pointermove",e=>{if(e.pointerId===joyPointer)setStick(e);});function releaseJoy(){joyPointer=null;moveX=moveZ=0;stick.style.left="50%";stick.style.top="50%";}joy.addEventListener("pointerup",releaseJoy);joy.addEventListener("pointercancel",releaseJoy);
let lookPointer=null,lastX=0,lastY=0;renderer.domElement.addEventListener("pointerdown",e=>{if(e.clientX<innerWidth*.3&&e.clientY>innerHeight*.55)return;lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener("pointermove",e=>{if(e.pointerId!==lookPointer)return;yaw+=(e.clientX-lastX)*.006;pitch=Math.max(-.12,Math.min(.65,pitch+(e.clientY-lastY)*.003));lastX=e.clientX;lastY=e.clientY;});renderer.domElement.addEventListener("pointerup",()=>lookPointer=null);renderer.domElement.addEventListener("pointercancel",()=>lookPointer=null);
document.querySelector("#run").addEventListener("pointerdown",()=>running=true);["pointerup","pointercancel","pointerleave"].forEach(ev=>document.querySelector("#run").addEventListener(ev,()=>running=false));document.querySelector("#jump").addEventListener("pointerdown",()=>{if(onGround){jumpV=6;onGround=false;}});
document.querySelector("#reset-camera").addEventListener("click",()=>{yaw=0;pitch=.25;});
const clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));const dir=forward.multiplyScalar(-moveZ).add(right.multiplyScalar(moveX));if(dir.lengthSq()>1)dir.normalize();const speed=running?9:4.2;player.position.addScaledVector(dir,speed*dt);if(dir.lengthSq()>.001)player.rotation.y=Math.atan2(dir.x,dir.z);jumpV-=15*dt;player.position.y+=jumpV*dt;if(player.position.y<=0){player.position.y=0;jumpV=0;onGround=true;}updateCamera();renderer.render(scene,camera);}
animate();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);});
(async()=>{try{loadingText.textContent="OpenStreetMapから札幌の道路・建物を取得中...";const result=await loadOSM();let demCount=0;try{demCount=await loadTerrain();}catch(demError){console.warn("標高データを読み込めませんでした",demError);}statusEl.textContent=`道路 ${result.roads} / 建物 ${result.buildings} / 標高タイル ${demCount}`;document.querySelector("#coords").textContent="札幌駅周辺";}catch(e){console.warn(e);addFallbackStreet();statusEl.textContent="簡易マップ表示（地図データ未取得）";document.querySelector("#coords").textContent="札幌中心部・簡易表示";}finally{document.querySelector("#loading").classList.add("hidden");}})();
