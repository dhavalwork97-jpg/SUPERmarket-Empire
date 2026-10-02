"use client";

import { useEffect, useRef } from "react";
import { AisleState } from "@/types/game";

type Props = { cols: number; rows: number; aisles: AisleState[]; tier: number };
type Vec3 = [number, number, number];
type Mat4 = Float32Array;
type MeshData = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; min: Vec3; max: Vec3 };

const ASSETS = {
  shelf: "/assets/3d/supermarket-gondola-shelf.glb",
  cartA: "/assets/3d/shopping-cart-a.glb",
  cartB: "/assets/3d/shopping-cart-b.glb",
  display: "/assets/3d/shallow-display-fixture.glb",
};

const VERT = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec4 uColor;
out vec3 vNormal;
out vec3 vWorld;
out vec4 vColor;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=mat3(uModel)*aNormal;
  vColor=uColor;
  gl_Position=uMVP*vec4(aPosition,1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorld;
in vec4 vColor;
out vec4 outColor;
void main(){
  vec3 n=normalize(vNormal);
  vec3 l=normalize(vec3(-0.35,0.9,0.5));
  float diffuse=max(dot(n,l),0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(0.0,0.5,1.0))),0.0),2.0)*0.08;
  float light=0.48+diffuse*0.48+rim;
  outColor=vec4(vColor.rgb*light,vColor.a);
}`;

function identity(): Mat4 { const m=new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
function multiply(a: Mat4,b: Mat4): Mat4 { const o=new Float32Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3]; return o; }
function translation(x:number,y:number,z:number):Mat4{const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;}
function scale(x:number,y:number,z:number):Mat4{const m=identity();m[0]=x;m[5]=y;m[10]=z;return m;}
function rotationY(a:number):Mat4{const m=identity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
function perspective(fov:number,aspect:number,near:number,far:number):Mat4{const f=1/Math.tan(fov/2),nf=1/(near-far),m=new Float32Array(16);m[0]=f/aspect;m[5]=f;m[10]=(far+near)*nf;m[11]=-1;m[14]=2*far*near*nf;return m;}
function lookAt(eye:Vec3,center:Vec3,up:Vec3):Mat4{let zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];let zl=Math.hypot(zx,zy,zz)||1;zx/=zl;zy/=zl;zz/=zl;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;let xl=Math.hypot(xx,xy,xz)||1;xx/=xl;xy/=xl;xz/=xl;let yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;const m=identity();m[0]=xx;m[1]=yx;m[2]=zx;m[4]=xy;m[5]=yy;m[6]=zy;m[8]=xz;m[9]=yz;m[10]=zz;m[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);m[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);m[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);return m;}

function compile(gl:WebGL2RenderingContext,type:number,src:string){const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||"shader compile failed");return s;}
function program(gl:WebGL2RenderingContext){const p=gl.createProgram()!;gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"program link failed");return p;}

async function loadGLB(url:string):Promise<MeshData>{
  const b=await fetch(url).then(r=>{if(!r.ok)throw new Error(`3D asset ${url} ${r.status}`);return r.arrayBuffer();});
  const dv=new DataView(b); if(dv.getUint32(0,true)!==0x46546c67)throw new Error("invalid GLB");
  let off=12,json:any=null,bin:Uint8Array|null=null;
  while(off<dv.byteLength){const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);const data=new Uint8Array(b,off+8,len);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(data));if(type===0x004e4942)bin=data;off+=8+len;}
  if(!json||!bin)throw new Error("incomplete GLB");
  const prim=json.meshes[0].primitives[0], acc=(i:number)=>json.accessors[i], bv=(i:number)=>json.bufferViews[i];
  function read(index:number):Float32Array{const a=acc(index),v=bv(a.bufferView),base=(v.byteOffset||0)+(a.byteOffset||0),count=a.count, comps=a.type==="VEC3"?3:1,stride=v.byteStride||comps*4,out=new Float32Array(count*comps),bd=new DataView(bin!.buffer,bin!.byteOffset);for(let i=0;i<count;i++)for(let c=0;c<comps;c++)out[i*comps+c]=bd.getFloat32(base+i*stride+c*4,true);return out;}
  function readIndex(index:number):Uint32Array{const a=acc(index),v=bv(a.bufferView),base=(v.byteOffset||0)+(a.byteOffset||0),out=new Uint32Array(a.count),component=a.componentType||5125,bytes=component===5121?1:component===5123?2:4,bd=new DataView(bin!.buffer,bin!.byteOffset+base);for(let i=0;i<a.count;i++){const p=i*bytes;out[i]=component===5121?bd.getUint8(p):component===5123?bd.getUint16(p,true):bd.getUint32(p,true);}return out;}
  const positions=read(prim.attributes.POSITION);const normals=read(prim.attributes.NORMAL);const indices=readIndex(prim.indices);return {positions,normals,indices,min:acc(prim.attributes.POSITION).min as Vec3,max:acc(prim.attributes.POSITION).max as Vec3};
}

function makeMesh(gl:WebGL2RenderingContext,data:MeshData,p:WebGLProgram){const vao=gl.createVertexArray()!,pb=gl.createBuffer()!,ib=gl.createBuffer()!;gl.bindVertexArray(vao);const inter=new Float32Array(data.positions.length/3*6);for(let i=0;i<data.positions.length/3;i++){inter.set(data.positions.slice(i*3,i*3+3),i*6);inter.set(data.normals.slice(i*3,i*3+3),i*6+3);}gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,inter,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);const ap=gl.getAttribLocation(p,"aPosition"),an=gl.getAttribLocation(p,"aNormal");gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(an);gl.vertexAttribPointer(an,3,gl.FLOAT,false,24,12);gl.bindVertexArray(null);return {vao,count:data.indices.length};}

export default function Store3DLayer({cols,rows,aisles,tier}:Props){
  const ref=useRef<HTMLCanvasElement>(null);
  const layoutKey=aisles.map(a=>`${a.id}:${a.x}:${a.y}:${a.level}`).join("|");
  useEffect(()=>{
    let dead=false;const canvas=ref.current;if(!canvas)return;
    const gl=canvas.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:true});if(!gl)return;
    const p=program(gl);gl.useProgram(p);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
    const meshes:Record<string,{vao:WebGLVertexArrayObject,count:number}>={};
    const locMVP=gl.getUniformLocation(p,"uMVP"),locModel=gl.getUniformLocation(p,"uModel"),locColor=gl.getUniformLocation(p,"uColor");
    const draw=(key:string,model:Mat4,color:[number,number,number,number],vp:Mat4)=>{const m=meshes[key];if(!m)return;gl.uniformMatrix4fv(locModel,false,model);gl.uniformMatrix4fv(locMVP,false,multiply(vp,model));gl.uniform4fv(locColor,color);gl.bindVertexArray(m.vao);gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_INT,0);};
    const render=()=>{if(dead)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const aspect=w/Math.max(1,h);const eye:[number,number,number]=[0,7.8,9.2];const view=lookAt(eye,[0,0,0],[0,1,0]);const proj=perspective(Math.PI/3,aspect,0.1,60);const vp=multiply(proj,view);
      const sx=Math.max(0.075,Math.min(0.115,7/(Math.max(cols,6)*7.7)));const sy=sx*2.55,sz=sx*2.9;
      aisles.filter(a=>a.level>0).forEach(a=>{const x=a.x-(cols-1)/2;const z=-((a.y-(rows-1)/2));const model=multiply(translation(x,0.02,z),scale(sx,sy,sz));draw("shelf",model,[0.42,0.46,0.48,0.96],vp);});
      const cartScale=Math.min(0.5,Math.max(0.34,6/Math.max(cols,6)));for(let i=0;i<2;i++){const x=-((cols-1)/2)+0.75+i*0.85;const z=-((rows-1)/2)+0.35;const model=multiply(translation(x,0.02,z),multiply(rotationY(i?0.12:-0.12),scale(cartScale,cartScale,cartScale)));draw(i?"cartB":"cartA",model,[0.38,0.43,0.45,0.9],vp);}
      if(tier>=1){const x=(cols-1)/2-0.55,z=-(rows-1)/2+0.55;const model=multiply(translation(x,0.02,z),scale(0.075,0.26,0.18));draw("display",model,[0.5,0.43,0.3,0.75],vp);}
    };
    const load=async()=>{for(const [k,u] of Object.entries(ASSETS)){const d=await loadGLB(u);if(dead)return;meshes[k]=makeMesh(gl,d,p);}render();};
    load().catch(()=>{});
    const ro=new ResizeObserver(()=>render());ro.observe(canvas);
    return()=>{dead=true;ro.disconnect();};
  },[layoutKey,cols,rows,tier]);
  return <canvas ref={ref} className="store-3d-layer" aria-hidden="true" />;
}
