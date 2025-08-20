// ---------- Small math helpers (vec3 / mat4) ----------
const Mat4 = {
  identity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
  multiply(a,b){
    const r=new Array(16);
    for(let i=0;i<4;i++){
      for(let j=0;j<4;j++){
        r[i*4+j]=a[i*4+0]*b[0*4+j]+a[i*4+1]*b[1*4+j]+a[i*4+2]*b[2*4+j]+a[i*4+3]*b[3*4+j];
      }
    }
    return r;
  },
  translate(m,x,y,z){
    const t=[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
    return Mat4.multiply(m,t);
  },
  scale(m,x,y,z){
    const s=[x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
    return Mat4.multiply(m,s);
  },
  rotateX(m,r){
    const c=Math.cos(r),s=Math.sin(r);
    const rx=[1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
    return Mat4.multiply(m,rx);
  },
  rotateY(m,r){
    const c=Math.cos(r),s=Math.sin(r);
    const ry=[c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
    return Mat4.multiply(m,ry);
  },
  perspective(fovy,aspect,near,far){
    const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
  },
  lookAt(eye,center,up){
    const z=norm(sub(eye,center));
    const x=norm(cross(up,z));
    const y=cross(z,x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
            -dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  },
};
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];}
function len(v){return Math.hypot(v[0],v[1],v[2]);}
function norm(v){const L=len(v)||1;return [v[0]/L,v[1]/L,v[2]/L];}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

// ---------- WebGL init ----------
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl');
const wm = document.getElementById('wm');
const errorEl = document.getElementById('errorMsg');

if (!gl) {
  errorEl.textContent = 'WebGL not supported in this browser.';
  errorEl.classList.add('show');
}

// Resize handling
function resize(){
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  gl.viewport(0,0,gl.drawingBufferWidth, gl.drawingBufferHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------- Shaders ----------
const vs = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uModel, uView, uProj;
uniform vec3 uLightDir;
varying float vLight;
void main(){
  vec3 n = mat3(uModel) * aNormal;
  n = normalize(n);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  vLight = 0.25 + 0.75*diff;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`;
const fs = `
precision mediump float;
uniform vec3 uColor;
varying float vLight;
void main(){
  gl_FragColor = vec4(uColor * vLight, 1.0);
}`;
// Wireframe (edges)
const vsl = `
attribute vec3 aPos;
uniform mat4 uModel,uView,uProj;
void main(){ gl_Position = uProj * uView * uModel * vec4(aPos,1.0); }`;
const fsl = `
precision mediump float;
uniform vec3 uColor;
void main(){ gl_FragColor = vec4(uColor,1.0); }`;

function compile(type, src){
  const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ console.error(gl.getShaderInfoLog(s)); }
  return s;
}
function program(vsSrc, fsSrc){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){ console.error(gl.getProgramInfoLog(p)); }
  return p;
}

const progTri = program(vs,fs);
const progLine = program(vsl,fsl);

// ---------- Geometry: unit cube centered at origin (size 1) ----------
const cube = (() => {
  // 8 corners
  const P = [
    [-.5,-.5,-.5],[ .5,-.5,-.5],[ .5, .5,-.5],[ -.5, .5,-.5], // back
    [-.5,-.5, .5],[ .5,-.5, .5],[ .5, .5, .5],[ -.5, .5, .5]  // front
  ];
  // faces (triangles) with normals
  const faces = [
    // +Z (front)
    { idx:[4,5,6, 4,6,7], n:[0,0,1] },
    // -Z (back)
    { idx:[1,0,3, 1,3,2], n:[0,0,-1] },
    // +X (right)
    { idx:[5,1,2, 5,2,6], n:[1,0,0] },
    // -X (left)
    { idx:[0,4,7, 0,7,3], n:[-1,0,0] },
    // +Y (top)
    { idx:[7,6,2, 7,2,3], n:[0,1,0] },
    // -Y (bottom)
    { idx:[0,1,5, 0,5,4], n:[0,-1,0] },
  ];
  const pos=[], norm=[];
  faces.forEach(f=>{
    for(let i=0;i<f.idx.length;i++){
      const v=P[f.idx[i]];
      pos.push(v[0],v[1],v[2]);
      norm.push(f.n[0],f.n[1],f.n[2]);
    }
  });

  // edges for wireframe
  const edgesIdx = [
    0,1, 1,2, 2,3, 3,0, // back
    4,5, 5,6, 6,7, 7,4, // front
    0,4, 1,5, 2,6, 3,7  // sides
  ];
  const edgePos=[];
  edgesIdx.forEach(i=>{const v=P[i]; edgePos.push(v[0],v[1],v[2]);});

  function buf(data, loc, size){
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { b, loc, size };
  }
  return {
    triPos: buf(pos, gl.getAttribLocation(progTri, 'aPos'), 3),
    triNrm: buf(norm, gl.getAttribLocation(progTri, 'aNormal'), 3),
    triCount: pos.length/3,
    linePos: buf(edgePos, gl.getAttribLocation(progLine, 'aPos'), 3),
    lineCount: edgePos.length/3,
  };
})();

// ---------- Scene state ----------
let showGrid = false;
let showWire = false;
let hasBox = false;

let boxDims = { w:1, h:1, d:1 }; // meters
let scale = 1;                    // meters -> world units
let eyeDist = 6;                  // camera distance in world units
let yaw = 45 * Math.PI/180;
let pitch = 20 * Math.PI/180;
let pan = [0,0];

// ---------- UI wiring ----------
const form = document.getElementById('dimForm');
const widthEl  = document.getElementById('width');
const heightEl = document.getElementById('height');
const depthEl  = document.getElementById('depth');
const gridToggle = document.getElementById('gridToggle');
const wireToggle = document.getElementById('wireToggle');
const resetBtn  = document.getElementById('resetBtn');
const randomBtn = document.getElementById('randomBtn');

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const w = parseFloat(widthEl.value);
  const h = parseFloat(heightEl.value);
  const d = parseFloat(depthEl.value);
  const err = validate(w,h,d);
  if (err){ errorEl.textContent = err; errorEl.classList.add('show'); return; }
  errorEl.textContent=''; errorEl.classList.remove('show');

  // map meters so max dimension ≈ 2 world units
  const maxDim = Math.max(w,h,d);
  scale = 2 / maxDim;

  boxDims = { w, h, d };
  hasBox = true;
  wm.hidden = false;

  // frame camera to box (diagonal view)
  const r = Math.sqrt(w*w + h*h + d*d) * scale / 2; // bounding radius
  eyeDist = Math.max(3, r * 3.0); // keep nice padding
});
gridToggle.addEventListener('change', ()=>{ showGrid = gridToggle.checked; });
wireToggle.addEventListener('change', ()=>{ showWire = wireToggle.checked; });
resetBtn.addEventListener('click', ()=>{
  hasBox=false; wm.hidden = true;
});
randomBtn.addEventListener('click', ()=>{
  const r=(a,b)=> (Math.random()*(b-a)+a).toFixed(2);
  widthEl.value=r(0.3,5); heightEl.value=r(0.3,5); depthEl.value=r(0.3,5);
  form.requestSubmit();
});

// Controls: orbit / pan / zoom
let dragging=false, last=[0,0], panMode=false;
canvas.addEventListener('mousedown', (e)=>{
  dragging=true; last=[e.clientX,e.clientY]; panMode = (e.button===2 || e.altKey);
});
window.addEventListener('mouseup', ()=> dragging=false);
window.addEventListener('mousemove', (e)=>{
  if(!dragging) return;
  const dx=e.clientX-last[0], dy=e.clientY-last[1]; last=[e.clientX,e.clientY];
  if (panMode){ pan[0]+=dx*0.01; pan[1]-=dy*0.01; }
  else {
    yaw   += dx * 0.01;
    pitch += dy * 0.01;
    pitch = clamp(pitch, -Math.PI/2+0.05, Math.PI/2-0.05);
  }
});
canvas.addEventListener('contextmenu', e=>e.preventDefault());
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const f = Math.exp(e.deltaY*0.001);
  eyeDist = clamp(eyeDist*f, 2, 50);
},{passive:false});

// ---------- Render loop ----------
function render(){
  resize();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.04,0.06,0.09,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const proj = Mat4.perspective(50*Math.PI/180, aspect, 0.01, 100);
  const target = [pan[0], 0, pan[1]];
  const eye = [
    target[0] + eyeDist*Math.cos(pitch)*Math.cos(yaw),
    target[1] + eyeDist*Math.sin(pitch),
    target[2] + eyeDist*Math.cos(pitch)*Math.sin(yaw)
  ];
  const view = Mat4.lookAt(eye, target, [0,1,0]);

  // Optional grid on XZ plane (y=0)
  if (showGrid){
    drawGrid(view, proj);
  }

  if (hasBox){
    // Model: scale to dimensions, then lift so bottom sits on y=0
    let model = Mat4.identity();
    const S = [boxDims.w*scale, boxDims.h*scale, boxDims.d*scale];
    model = Mat4.scale(model, S[0], S[1], S[2]);
    model = Mat4.translate(model, 0, 0.5, 0); // unit cube base at y=0 after scale

    // Solid
    gl.useProgram(progTri);
    setAttrib(cube.triPos); setAttrib(cube.triNrm);
    setMat(progTri, 'uModel', model);
    setMat(progTri, 'uView', view);
    setMat(progTri, 'uProj', proj);
    setVec3(progTri, 'uLightDir', [0.7,0.8,0.4]);
    setVec3(progTri, 'uColor', [0.19,0.70,0.78]); // teal
    gl.drawArrays(gl.TRIANGLES, 0, cube.triCount);

    // Wireframe overlay
    if (showWire){
      gl.useProgram(progLine);
      setAttrib(cube.linePos);
      setMat(progLine, 'uModel', model);
      setMat(progLine, 'uView', view);
      setMat(progLine, 'uProj', proj);
      setVec3(progLine, 'uColor', [1,1,1]);
      gl.lineWidth(1);
      gl.drawArrays(gl.LINES, 0, cube.lineCount);
    }
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ---------- Helpers for GL uniforms/attributes ----------
function setAttrib(buf){
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
  gl.enableVertexAttribArray(buf.loc);
  gl.vertexAttribPointer(buf.loc, buf.size, gl.FLOAT, false, 0, 0);
}
function setMat(p, name, m){
  const loc = gl.getUniformLocation(p, name);
  gl.uniformMatrix4fv(loc, false, new Float32Array(m));
}
function setVec3(p, name, v){
  const loc = gl.getUniformLocation(p, name);
  gl.uniform3fv(loc, new Float32Array(v));
}

// ---------- Validation ----------
function validate(w,h,d){
  if ([w,h,d].some(Number.isNaN)) return 'Please enter numeric values for all dimensions.';
  if ([w,h,d].some(v=>v<=0)) return 'All dimensions must be greater than zero.';
  if ([w,h,d].some(v=>v>1e6)) return 'Those dimensions are too large for this view.';
  return '';
}

// ---------- Simple grid renderer ----------
function drawGrid(view, proj){
  const lines=[];
  const N=20, step=0.5;
  for(let i=-N;i<=N;i++){
    // lines parallel to X
    lines.push(-N*step,0,i*step,  N*step,0,i*step);
    // lines parallel to Z
    lines.push(i*step,0,-N*step,  i*step,0, N*step);
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STREAM_DRAW);

  gl.useProgram(progLine);
  const loc = gl.getAttribLocation(progLine,'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
  setMat(progLine,'uModel', Mat4.identity());
  setMat(progLine,'uView', view);
  setMat(progLine,'uProj', proj);
  setVec3(progLine,'uColor',[0.18,0.22,0.28]);
  gl.drawArrays(gl.LINES, 0, lines.length/3);

  gl.deleteBuffer(buf);
}
