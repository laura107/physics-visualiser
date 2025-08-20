/* ----------------- tiny math utils ----------------- */
const Mat4 = {
  identity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
  multiply(a,b){
    const r=new Array(16);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)
      r[i*4+j]=a[i*4+0]*b[0*4+j]+a[i*4+1]*b[1*4+j]+a[i*4+2]*b[2*4+j]+a[i*4+3]*b[3*4+j];
    return r;
  },
  translate(m,x,y,z){ return Mat4.multiply(m,[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); },
  scale(m,x,y,z){ return Mat4.multiply(m,[x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); },
  perspective(fovy,aspect,near,far){
    const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
  },
  lookAt(eye,center,up){
    const z=norm(sub(eye,center)), x=norm(cross(up,z)), y=cross(z,x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  },
};
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];}
function len(v){return Math.hypot(v[0],v[1],v[2]);}
function norm(v){const L=len(v)||1;return [v[0]/L,v[1]/L,v[2]/L];}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

/* ----------------- WebGL init ----------------- */
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl');
const wm = document.getElementById('wm');
const errorEl = document.getElementById('errorMsg');

if (!gl) { errorEl.textContent='WebGL not supported.'; errorEl.classList.add('show'); }

function resize(){
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
  gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
}
window.addEventListener('resize', resize); resize();

/* ----------------- Shaders ----------------- */
// Solid with 2 lights (warm key + cool fill) + ambient
const vsTri = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uModel,uView,uProj;
varying vec3 vWorldNormal;
void main(){
  vWorldNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * uModel * vec4(aPos,1.0);
}`;
const fsTri = `
precision mediump float;
varying vec3 vWorldNormal;
uniform vec3 uColor;
uniform vec3 uLightDir1; // warm key
uniform vec3 uLightDir2; // cool fill
uniform float uAmbient;
void main(){
  vec3 N = normalize(vWorldNormal);
  float diff1 = max(dot(N, normalize(uLightDir1)), 0.0);
  float diff2 = max(dot(N, normalize(uLightDir2)), 0.0);
  // subtle tinting on second light
  vec3 light = uAmbient + diff1*vec3(1.0,0.98,0.95) + diff2*vec3(0.9,0.95,1.0);
  gl_FragColor = vec4(uColor * light, 1.0);
}`;

// Lines (wireframe/edges)
const vsLine = `attribute vec3 aPos; uniform mat4 uModel,uView,uProj; void main(){ gl_Position = uProj*uView*uModel*vec4(aPos,1.0);} `;
const fsLine = `precision mediump float; uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor,1.0); }`;

// Fading grid (distance-based alpha)
const vsGrid = `
attribute vec3 aPos;
uniform mat4 uModel,uView,uProj;
varying vec3 vWorld;
void main(){
  vWorld = (uModel * vec4(aPos,1.0)).xyz;
  gl_Position = uProj * uView * vec4(vWorld,1.0);
}`;
const fsGrid = `
precision mediump float;
varying vec3 vWorld;
uniform vec3 uColor;
uniform float uFalloffRadius;
uniform float uBaseAlpha;
void main(){
  float r = length(vWorld.xz);
  float t = clamp(1.0 - r / uFalloffRadius, 0.0, 1.0);
  float alpha = uBaseAlpha * t;
  gl_FragColor = vec4(uColor, alpha);
}`;

// Warm/cool lights
const progTri  = program(vsTri, fsTri);
const progLine = program(vsLine, fsLine);
const progGrid = program(vsGrid, fsGrid);

function compile(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; }
function program(vsSrc,fsSrc){ const p=gl.createProgram(); gl.attachShader(p,compile(gl.VERTEX_SHADER,vsSrc));
  gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fsSrc)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p)); return p; }

/* ----------------- Unit cube geometry ----------------- */
const cube = (()=>{
  const P=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
  const faces=[
    {idx:[4,5,6, 4,6,7], n:[0,0,1]}, {idx:[1,0,3, 1,3,2], n:[0,0,-1]},
    {idx:[5,1,2, 5,2,6], n:[1,0,0]}, {idx:[0,4,7, 0,7,3], n:[-1,0,0]},
    {idx:[7,6,2, 7,2,3], n:[0,1,0]}, {idx:[0,1,5, 0,5,4], n:[0,-1,0]},
  ];
  const pos=[], nrm=[];
  faces.forEach(f=>{ f.idx.forEach(i=>{ const v=P[i]; pos.push(v[0],v[1],v[2]); nrm.push(f.n[0],f.n[1],f.n[2]); }); });
  const edges=[0,1,1,2,2,3,3,0, 4,5,5,6,6,7,7,4, 0,4,1,5,2,6,3,7];
  const line=[]; edges.forEach(i=>{ const v=P[i]; line.push(v[0],v[1],v[2]); });
  function buf(data, loc, size){ const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW); return {b,loc,size}; }
  return {
    triPos: buf(pos, gl.getAttribLocation(progTri,'aPos'), 3),
    triNrm: buf(nrm, gl.getAttribLocation(progTri,'aNormal'), 3),
    triCount: pos.length/3,
    linePos: buf(line, gl.getAttribLocation(progLine,'aPos'), 3),
    lineCount: line.length/3
  };
})();

/* ----------------- Ground plane (soft radial disk) ----------------- */
const ground = (()=>{
  // A big square on y = -0.0001 to avoid z-fighting with grid/boxes
  const S = 20.0;
  const pos = [
    -S,-0.0001,-S,  S,-0.0001,-S,  S,-0.0001, S,
    -S,-0.0001,-S,  S,-0.0001, S, -S,-0.0001, S
  ];
  const vsG = `
  attribute vec3 aPos;
  uniform mat4 uView,uProj;
  varying vec2 vXZ;
  void main(){
    vXZ = aPos.xz;
    gl_Position = uProj * uView * vec4(aPos,1.0);
  }`;
  const fsG = `
  precision mediump float;
  varying vec2 vXZ;
  void main(){
    float r = length(vXZ);
    // soft radial gradient: dark center -> transparent edge
    float alpha = smoothstep(8.0, 0.0, r);
    vec3 col = vec3(0.05, 0.07, 0.10);
    gl_FragColor = vec4(col, alpha*0.7);
  }`;
  const prog = program(vsG, fsG);
  const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);
  return {
    prog,
    buf: { b, loc: gl.getAttribLocation(prog,'aPos'), size:3 },
    count: pos.length/3
  };
})();

/* ----------------- Scene state ----------------- */
let instanceModels = [];   // array of model matrices (one per entity)
let hasInstances = false;
let showGrid = false, showWire = false;

// camera/orbit
let eyeDist = 6, yaw = 45*Math.PI/180, pitch = 20*Math.PI/180, pan = [0,0];

/* ----------------- UI wiring ----------------- */
const form = document.getElementById('dimForm');
const widthEl = document.getElementById('width');
const heightEl = document.getElementById('height');
const depthEl = document.getElementById('depth');
const entitiesEl = document.getElementById('entities');
const gridToggle = document.getElementById('gridToggle');
const wireToggle = document.getElementById('wireToggle');
const resetBtn = document.getElementById('resetBtn');
const randomBtn = document.getElementById('randomBtn');

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const w = parseFloat(widthEl.value);
  const h = parseFloat(heightEl.value);
  const d = parseFloat(depthEl.value);
  let n = parseInt(entitiesEl.value,10); if (isNaN(n)) n = 1;

  const err = validate(w,h,d,n);
  if (err){ errorEl.textContent = err; errorEl.classList.add('show'); return; }
  errorEl.textContent=''; errorEl.classList.remove('show');

  buildInstancesRow(w,h,d,n);
  wm.hidden = false;
});
gridToggle.addEventListener('change', ()=> showGrid = gridToggle.checked);
wireToggle.addEventListener('change', ()=> showWire = wireToggle.checked);
resetBtn.addEventListener('click', ()=>{ hasInstances=false; instanceModels=[]; wm.hidden=true; });
randomBtn.addEventListener('click', ()=>{
  const r=(a,b)=> (Math.random()*(b-a)+a).toFixed(2);
  widthEl.value=r(0.3,5); heightEl.value=r(0.3,5); depthEl.value=r(0.3,5);
  entitiesEl.value = Math.floor(Math.random()*16)+1;
  form.requestSubmit();
});

/* --------- Build N instances in a single horizontal row (with color shift) --------- */
function buildInstancesRow(w,h,d,n){
  const maxDim = Math.max(w,h,d);
  const S = 2 / maxDim;     // meters -> world units (largest ≈ 2)
  const W = w*S, H = h*S, D = d*S;

  const gap = 0.3;          // world gap between blocks
  const totalW = n*W + (n-1)*gap;
  const x0 = -totalW/2 + W/2;

  instanceModels = [];
  for (let i=0;i<n;i++){
    const tx = x0 + i*(W+gap), tz = 0;
    let m = Mat4.identity();
    m = Mat4.translate(m, tx, 0, tz); // world placement
    m = Mat4.scale(m, W, H, D);       // size
    m = Mat4.translate(m, 0, 0.5, 0); // sit on ground
    instanceModels.push(m);
  }

  const rBound = Math.sqrt(totalW*totalW + D*D + H*H) / 2;
  eyeDist = Math.max(3, rBound * 3.0);
  hasInstances = true;
}

/* ----------------- Controls ----------------- */
let dragging=false, last=[0,0], panMode=false;
canvas.addEventListener('mousedown', e=>{ dragging=true; last=[e.clientX,e.clientY]; panMode=(e.button===2||e.altKey); });
window.addEventListener('mouseup', ()=> dragging=false);
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const dx=e.clientX-last[0], dy=e.clientY-last[1]; last=[e.clientX,e.clientY];
  if (panMode){ pan[0]+=dx*0.01; pan[1]-=dy*0.01; }
  else { yaw+=dx*0.01; pitch=clamp(pitch+dy*0.01,-Math.PI/2+0.05,Math.PI/2-0.05); }
});
canvas.addEventListener('contextmenu', e=>e.preventDefault());
canvas.addEventListener('wheel', e=>{ e.preventDefault(); eyeDist = clamp(eyeDist*Math.exp(e.deltaY*0.001), 2, 80); }, {passive:false});

/* ----------------- Render loop ----------------- */
function render(){
  resize();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.04,0.06,0.09,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const proj = Mat4.perspective(50*Math.PI/180, aspect, 0.01, 200);
  const target=[pan[0],0,pan[1]];
  const eye=[ target[0]+eyeDist*Math.cos(pitch)*Math.cos(yaw),
              target[1]+eyeDist*Math.sin(pitch),
              target[2]+eyeDist*Math.cos(pitch)*Math.sin(yaw) ];
  const view = Mat4.lookAt(eye, target, [0,1,0]);

  // --- Ground (blended) ---
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(ground.prog);
  setAttrib(ground.buf);
  setMat(ground.prog,'uView',view);
  setMat(ground.prog,'uProj',proj);
  gl.drawArrays(gl.TRIANGLES, 0, ground.count);

  // --- Grid (blended + fading with distance) ---
  if (showGrid) {
    const gridData = getGridLines();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridData.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridData.lines), gl.STREAM_DRAW);

    gl.useProgram(progGrid);
    const loc = gl.getAttribLocation(progGrid,'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
    setMat(progGrid,'uModel', Mat4.identity());
    setMat(progGrid,'uView', view);
    setMat(progGrid,'uProj', proj);
    setVec3(progGrid,'uColor',[0.18,0.22,0.28]);
    gl.uniform1f(gl.getUniformLocation(progGrid,'uFalloffRadius'), 12.0);
    gl.uniform1f(gl.getUniformLocation(progGrid,'uBaseAlpha'), 0.8);
    gl.drawArrays(gl.LINES, 0, gridData.lines.length/3);
  }

  // --- Boxes (solid, no blending) ---
  gl.disable(gl.BLEND);
  if (hasInstances){
    gl.useProgram(progTri);
    setAttrib(cube.triPos); setAttrib(cube.triNrm);
    setMat(progTri,'uView',view); setMat(progTri,'uProj',proj);
    // warm key (from above-right), cool fill (from behind-left)
    setVec3(progTri,'uLightDir1',[0.8,1.0,0.6]);
    setVec3(progTri,'uLightDir2',[-0.6,0.6,-0.8]);
    gl.uniform1f(gl.getUniformLocation(progTri,'uAmbient'), 0.25);

    // draw each with a pleasant hue shift
    const n = instanceModels.length;
    for (let i=0;i<n;i++){
      setMat(progTri,'uModel',instanceModels[i]);
      const rgb = hslToRgb(0.55 + i*0.03, 0.55, 0.55); // teal-ish base, slight hue shift
      setVec3(progTri,'uColor', rgb);
      gl.drawArrays(gl.TRIANGLES,0,cube.triCount);
    }

    // Wireframe overlay (blended)
    if (showWire){
      gl.enable(gl.BLEND);
      gl.useProgram(progLine);
      setAttrib(cube.linePos);
      setMat(progLine,'uView',view); setMat(progLine,'uProj',proj);
      setVec3(progLine,'uColor',[1,1,1]);
      instanceModels.forEach(m=>{ setMat(progLine,'uModel',m); gl.drawArrays(gl.LINES,0,cube.lineCount); });
      gl.disable(gl.BLEND);
    }
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

/* ----------------- Helpers ----------------- */
function setAttrib(buf){ gl.bindBuffer(gl.ARRAY_BUFFER, buf.b); gl.enableVertexAttribArray(buf.loc); gl.vertexAttribPointer(buf.loc,buf.size,gl.FLOAT,false,0,0); }
function setMat(p,name,m){ const loc=gl.getUniformLocation(p,name); gl.uniformMatrix4fv(loc,false,new Float32Array(m)); }
function setVec3(p,name,v){ const loc=gl.getUniformLocation(p,name); gl.uniform3fv(loc,new Float32Array(v)); }

function validate(w,h,d,n){
  if ([w,h,d].some(Number.isNaN)) return 'Please enter numeric values for all dimensions.';
  if ([w,h,d].some(v=>v<=0)) return 'All dimensions must be greater than zero.';
  if (!Number.isInteger(n) || n<1 || n>16) return 'Entities must be an integer from 1 to 16.';
  return '';
}

// Distance-fading grid data buffer (reused)
const gridBuffer = gl.createBuffer();
function getGridLines(){
  const lines=[]; const N=30, step=0.5;
  for(let i=-N;i<=N;i++){
    lines.push(-N*step,0,i*step,  N*step,0,i*step);
    lines.push(i*step,0,-N*step,  i*step,0, N*step);
  }
  return { lines, buf: gridBuffer };
}

// HSL → RGB in [0..1]
function hslToRgb(h,s,l){
  h = (h%1+1)%1;
  const a = s*Math.min(l,1-l);
  const f = n=>{
    const k=(n+h*12)%12;
    return l - a * Math.max(Math.min(k-3, 9-k, 1), -1);
  };
  return [f(0),f(8),f(4)];
}
