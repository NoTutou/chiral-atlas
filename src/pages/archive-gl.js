/* =========================================================
   WebGL2 instanced renderer for the archive rack
   one instance = one case (3 visible faces: top, -x side, -z end), depth-tested.
   side-face artwork (label plate, disc outline, barcode, stripe) comes from a texture atlas
   rendered once with the same 2D faceArt() used by the detail view.
   ========================================================= */
const VS = `#version 300 es
layout(location=0) in vec4 aV;     // x_local, z_local, isBottom, face(0 top,1 side,2 end)
layout(location=1) in vec2 aUV;    // u, v (top face only)
layout(location=2) in vec3 iPos;   // x_rel, lift, z_rel
layout(location=3) in vec4 iA;     // shelf, hot, flags, record atlas index
layout(location=4) in vec4 iB;     // fogMul, vis, visE, -
uniform vec2 uC; uniform float uS; uniform vec2 uRes; uniform vec4 uRot;
out vec2 vUV; out float vSY;
flat out float vFace; flat out vec4 vA; flat out vec2 vFL;
void main(){
  float face = aV.w;
  float vis = face < 1.5 ? iB.y : iB.z;
  float y = iPos.y - aV.z * vis;
  float X = iPos.x + aV.x, Z = iPos.z + aV.y;
  float x1 = X*uRot.x - Z*uRot.y, z1 = X*uRot.y + Z*uRot.x;
  float sx = uC.x + uS*x1, sy = uC.y - uS*(y*uRot.z + z1*uRot.w);
  float depth = z1*uRot.z - y*uRot.w;
  gl_Position = vec4(sx/uRes.x*2.0-1.0, 1.0-sy/uRes.y*2.0, clamp(depth/7000.0, -1.0, 1.0), 1.0);
  vUV = vec2(aUV.x, face > 0.5 ? aV.z*vis : aUV.y);
  vSY = sy; vFace = face; vA = iA; vFL = vec2(iB.x, iPos.y);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV; in float vSY;
flat in float vFace; flat in vec4 vA; flat in vec2 vFL;
uniform sampler2D uAtlas; uniform vec4 uAt;      // cols, cellW, cellH, pad
uniform vec2 uAtSize;
uniform vec3 uCol[6]; uniform float uH; uniform float uDim; uniform float uS;
out vec4 o;
const float TX = 9.0, LZ = 210.0, HY = 175.0;
float edge(float d){ return 1.0 - smoothstep(0.0, 1.3/uS, d); }
void main(){
  float hot = vA.y;
  int flags = int(vA.z + 0.5);
  bool hit = (flags & 1) != 0, saved = (flags & 2) != 0;
  vec3 sc = uCol[int(vA.x + 0.5)];
  float fog = clamp(0.32 + 0.75*(vSY + 120.0)/(uH + 120.0), 0.2, 1.0) * vFL.x * (1.0 - uDim*0.55);
  vec3 c; float a = 1.0;
  if (vFace < 0.5) {                       // top
    c = vec3(40.0,60.0,72.0)/255.0 + hot*vec3(150.0,160.0,165.0)/255.0;
    a = 0.86 + hot*0.14;
    float lifted = clamp(clamp(vFL.y/60.0,0.0,1.0)*0.6 + hot*0.6 + (hit ? 0.5 : 0.0), 0.0, 1.0);
    vec3 ec = hot > 0.5 ? vec3(1.0) : vec3(134.0,227.0,255.0)/255.0;
    float e = max(edge(vUV.y), edge(vUV.x));
    c = mix(c, ec, e*lifted);
    if (saved && abs(vUV.x - TX*0.5) < 1.7 && abs(vUV.y - 14.0) < 1.7) { c = vec3(0.89,0.635,0.227); a = 1.0; }
  } else if (vFace < 1.5) {                // side: atlas art
    float rec = vA.w;
    vec2 cell = vec2(mod(rec, uAt.x), floor(rec / uAt.x));
    vec2 px = cell*vec2(uAt.y, uAt.z) + uAt.w + vec2(vUV.x/LZ, vUV.y/HY)*(vec2(uAt.y, uAt.z) - 2.0*uAt.w);
    c = texture(uAtlas, px/uAtSize).rgb;
    c += hot*vec3(0.07,0.13,0.17)*(1.0 - vUV.y/HY);
    c = mix(c, vec3(170.0,220.0,240.0)/255.0, edge(vUV.y)*(0.16 + hot*0.5));
  } else {                                 // end: spine + hex badge
    c = vec3(22.0,34.0,42.0)/255.0 + hot*vec3(40.0,60.0,70.0)/255.0;
    float e = max(edge(vUV.x), edge(TX - vUV.x));
    c = mix(c, vec3(170.0,220.0,240.0)/255.0, e*(0.12 + hot*0.5));
    vec2 d = abs(vUV - vec2(TX*0.5, 9.0));
    if (max(d.x*0.866 + d.y*0.5, d.y) < 2.4) c = mix(c, sc, 0.5 + hot*0.5);
  }
  a *= fog;
  o = vec4(c*a, a);
}`;

const LVS = `#version 300 es
layout(location=0) in vec2 aQ;          // unit quad 0..1
layout(location=1) in vec4 iL;          // x_rel(start), z_rel(center), shelf, alpha
uniform vec2 uC; uniform float uS; uniform vec2 uRes; uniform vec4 uRot; uniform vec2 uLen;
out vec2 vT; flat out float vSh; flat out float vAl;
void main(){
  float X = iL.x + aQ.x*uLen.x, Z = iL.y + (aQ.y - 0.5)*uLen.y, y = 0.5;
  float x1 = X*uRot.x - Z*uRot.y, z1 = X*uRot.y + Z*uRot.x;
  float sx = uC.x + uS*x1, sy = uC.y - uS*(y*uRot.z + z1*uRot.w);
  gl_Position = vec4(sx/uRes.x*2.0-1.0, 1.0-sy/uRes.y*2.0, clamp((z1*uRot.z - y*uRot.w)/7000.0,-1.0,1.0), 1.0);
  vT = vec2(aQ.x, 1.0 - aQ.y); vSh = iL.z; vAl = iL.w;
}`;
const LFS = `#version 300 es
precision highp float;
in vec2 vT; flat in float vSh; flat in float vAl;
uniform sampler2D uLab;
out vec4 o;
void main(){ vec4 t = texture(uLab, vec2(vT.x, (vSh + vT.y)/6.0)); o = t*vAl; }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export const STRIDE = 11;   // floats per case instance

/**
 * @param canvas
 * @param geo   {TX, LZ, HY, PITCH_X, PER}
 * @param atlasCanvas  2D canvas with side-face art, grid of `cols` cells (cellW × cellH, pad)
 * @param labelCanvas  2D canvas with 6 stacked shelf label strips
 */
export function createGL(canvas, geo, atlas, labelCanvas, shelfCols) {
  const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true, depth: true });
  if (!gl) return null;
  let prog, lprog;
  try { prog = compile(gl, VS, FS); lprog = compile(gl, LVS, LFS); } catch (e) { console.warn('[archive-gl]', e); return null; }
  const { TX, LZ, HY } = geo;
  const xL = -TX / 2, xR = TX / 2, zN = -LZ / 2, zF = LZ / 2;
  // 3 faces × 4 verts: [x, z, isBottom, face, u, v]
  const V = new Float32Array([
    xL, zN, 0, 0, 0, 0, xR, zN, 0, 0, TX, 0, xR, zF, 0, 0, TX, LZ, xL, zF, 0, 0, 0, LZ,      // top
    xL, zF, 0, 1, 0, 0, xL, zN, 0, 1, LZ, 0, xL, zN, 1, 1, LZ, 0, xL, zF, 1, 1, 0, 0,        // side (-x)
    xL, zN, 0, 2, 0, 0, xR, zN, 0, 2, TX, 0, xR, zN, 1, 2, TX, 0, xL, zN, 1, 2, 0, 0,        // end (-z)
  ]);
  const I = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I, gl.STATIC_DRAW);
  const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const S4 = STRIDE * 4;
  [[2, 3, 0], [3, 4, 3], [4, 4, 7]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S4, off * 4); gl.vertexAttribDivisor(loc, 1);
  });
  gl.bindVertexArray(null);

  // labels
  const lvao = gl.createVertexArray();
  gl.bindVertexArray(lvao);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const lb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lb);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);

  const tex = (src, mip) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext && mip) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  };
  const atlasTex = tex(atlas.canvas, true);
  const labTex = tex(labelCanvas, true);
  const U = (p, n) => gl.getUniformLocation(p, n);
  const u = Object.fromEntries(['uC', 'uS', 'uRes', 'uRot', 'uAtlas', 'uAt', 'uAtSize', 'uCol', 'uH', 'uDim'].map((n) => [n, U(prog, n)]));
  const lu = Object.fromEntries(['uC', 'uS', 'uRes', 'uRot', 'uLab', 'uLen'].map((n) => [n, U(lprog, n)]));
  const colArr = new Float32Array(shelfCols.flatMap((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255)));
  let W = 1, H = 1, dpr = 1;

  return {
    gl,
    resize(w, h, d) { W = w; H = h; dpr = d; },
    /** data: Float32Array instances (count × STRIDE), labels: Float32Array (n × 4) */
    render(data, count, labels, lcount, cam) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(prog);
      gl.uniform2f(u.uC, cam.CX, cam.CY); gl.uniform1f(u.uS, cam.S); gl.uniform2f(u.uRes, W, H);
      gl.uniform4f(u.uRot, cam.cp, cam.sp, cam.cq, cam.sq);
      gl.uniform1f(u.uH, H); gl.uniform1f(u.uDim, cam.dim);
      gl.uniform3fv(u.uCol, colArr);
      gl.uniform4f(u.uAt, atlas.cols, atlas.cw, atlas.ch, atlas.pad);
      gl.uniform2f(u.uAtSize, atlas.canvas.width, atlas.canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(u.uAtlas, 0);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STRIDE), gl.STREAM_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, 18, gl.UNSIGNED_SHORT, 0, count);
      // floating shelf index strips (depth-tested, no depth write)
      if (lcount) {
        gl.depthMask(false);
        gl.useProgram(lprog);
        gl.uniform2f(lu.uC, cam.CX, cam.CY); gl.uniform1f(lu.uS, cam.S); gl.uniform2f(lu.uRes, W, H);
        gl.uniform4f(lu.uRot, cam.cp, cam.sp, cam.cq, cam.sq);
        gl.uniform2f(lu.uLen, geo.PITCH_X * geo.PER, 14);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, labTex); gl.uniform1i(lu.uLab, 1);
        gl.bindVertexArray(lvao);
        gl.bindBuffer(gl.ARRAY_BUFFER, lb);
        gl.bufferData(gl.ARRAY_BUFFER, labels.subarray(0, lcount * 4), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, lcount);
        gl.depthMask(true);
      }
      gl.bindVertexArray(null);
    },
  };
}
