// A software projection of the same voxel sculpture for devices without WebGL.
(() => {
  'use strict';
  const clamp = (x,min,max) => Math.max(min,Math.min(max,x));
  const basis = [
    [[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,0,1],[0,1,0]],
    [[0,1,0],[0,0,1],[1,0,0]], [[0,-1,0],[1,0,0],[0,0,1]],
    [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[0,1,0],[1,0,0]]
  ];
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  const faceLight = [.77,1,.99,.62,1.02,.73];

  window.createFallbackRenderer = function createFallbackRenderer(canvas,stage,scenery) {
    const ctx = canvas.getContext('2d', {alpha:false});
    const vertices = [], vertexIndex = new Map(), palette = new Map();
    const horizonFaces = [], terrainFaces = [], statueFaces = [], cloudFaces = [];
    function vertex(x,y,z) {
      const key = x + ',' + y + ',' + z;
      if (vertexIndex.has(key)) return vertexIndex.get(key);
      const id = vertices.length / 3;
      vertices.push(x,y,z);
      vertexIndex.set(key,id);
      return id;
    }
    function color(hex, side, shade, mist) {
      const lighting = Math.round((faceLight[side] + (side === 2 ? .13 : 0)) * shade * 48);
      const key = hex + '/' + lighting + '/' + mist;
      if (palette.has(key)) return palette.get(key);
      const rgb = parseInt(hex.slice(1),16);
      const tint = [235,209,172];
      const result = '#' + [16,8,0].map((bits,i) => {
        const c = (rgb >> bits & 255) * lighting / 48;
        return clamp(Math.round(c * (1-mist) + tint[i] * mist),0,255).toString(16).padStart(2,'0');
      }).join('');
      palette.set(key,result);
      return result;
    }
    function face(list,x,y,z,w,h,d,side,hex,shade=1,mist=0) {
      const [n,u,v] = basis[side];
      const fx = x+n[0]*w*.5, fy = y+n[1]*h*.5, fz = z+n[2]*d*.5;
      const ids = corners.map(([s,t]) => vertex(fx+(u[0]*s+v[0]*t)*w*.5,
        fy+(u[1]*s+v[1]*t)*h*.5, fz+(u[2]*s+v[2]*t)*d*.5));
      list.push({ids,x:fx,y:fy,z:fz,side,fill:color(hex,side,shade,mist),depth:0});
    }
    function box(list, data, mist=0) {
      const [x,y,z,w,h,d,hex] = data;
      for (const side of [0,1,2,4,5]) face(list,x,y,z,w,h,d,side,hex,1,mist);
    }

    const rock = [];
    window.buildSphinx((x,y,z,hex) => rock.push([x,y,z,hex]));
    const xs = rock.map(v=>v[0]), ys = rock.map(v=>v[1]), zs = rock.map(v=>v[2]);
    const xmin = Math.min(...xs)-2, ymin = Math.min(...ys)-2, zmin = Math.min(...zs)-2;
    const nx = Math.max(...xs)-xmin+3, ny = Math.max(...ys)-ymin+3, nz = Math.max(...zs)-zmin+3;
    const plane = nx*nz, cells = new Uint8Array(plane*ny);
    const id = (x,y,z)=>(y-ymin)*plane+(z-zmin)*nx+x-xmin;
    for (const [x,y,z] of rock) cells[id(x,y,z)]=1;
    const delta = [1,-1,plane,-plane,nx,-nx];
    // Mark exterior air so internal faces of the hollow export never get drawn.
    const queue = new Int32Array(cells.length);
    let begin=0,end=1;
    cells[0]=2;
    while(begin<end) {
      const at=queue[begin++];
      for (const step of delta) {
        const next=at+step;
        if (next<0 || next>=cells.length || cells[next]) continue;
        cells[next]=2; queue[end++]=next;
      }
    }
    const occupied = (x,y,z) => {
      if (x<xmin || x>=xmin+nx || y<ymin || y>=ymin+ny || z<zmin || z>=zmin+nz) return false;
      return cells[id(x,y,z)] !== 2;
    };
    const shadowRows = new Map();
    for (const [x,y,z,hex] of rock) {
      const root = id(x,y,z);
      // Project each stone onto the sand along the sunlight direction.
      const sx = Math.round(x+.61*y), sz=Math.round(z-1.13*y);
      if(!shadowRows.has(sz)) shadowRows.set(sz,new Set());
      shadowRows.get(sz).add(sx);
      for (const side of [0,1,2,3,4,5]) {
        if (cells[root+delta[side]]!==2 || (side===3 && y===0)) continue;
        const [n,u,v]=basis[side], a=x+n[0], b=y+n[1], c=z+n[2];
        let inset=0;
        for (const [s,t] of corners) {
          const ua=u[0]*s, ub=u[1]*s, uc=u[2]*s, va=v[0]*t, vb=v[1]*t, vc=v[2]*t;
          const wallA=occupied(a+ua,b+ub,c+uc),wallB=occupied(a+va,b+vb,c+vc);
          inset+=wallA&&wallB ? 3 : +wallA + +wallB + +occupied(a+ua+va,b+ub+vb,c+uc+vc);
        }
        let shade=1-.023*inset;
        if (side===1 || side===2 || side===4) {
          for(let k=2;k<60;k+=1.25) {
            if(occupied(Math.round(a-.61*k),Math.round(b+k),Math.round(c+1.13*k))) {
              shade*=.83; break;
            }
          }
        }
        face(statueFaces,x,y,z,1,1,1,side,hex,shade);
      }
    }

    const shadow=[];
    for (const [z,row] of shadowRows) {
      const ordered=[...row].sort((a,b)=>a-b);
      for(let from=0;from<ordered.length;) {
        let to=from;
        while(to+1<ordered.length && ordered[to+1]===ordered[to]+1) to++;
        const left=ordered[from]-.55,right=ordered[to]+.55;
        shadow.push([vertex(left,-.46,z-.55),vertex(right,-.46,z-.55),
          vertex(right,-.46,z+.55),vertex(left,-.46,z+.55)]);
        from=to+1;
      }
    }

    for(const b of scenery.distant) box(horizonFaces,b,.54);
    for(const b of scenery.palms) box(horizonFaces,b,.16);
    for(const b of scenery.clouds) box(cloudFaces,b,.14);
    for(const b of scenery.terrain) box(terrainFaces,b);

    const vertexCount=vertices.length/3;
    const coords=new Float32Array(vertices), screenX=new Float32Array(vertexCount),
      screenY=new Float32Array(vertexCount), depths=new Float32Array(vertexCount);
    const sorted=[];
    return function renderFallback(state) {
      const {yaw,pitch}=state;
      const width=state.width||stage.clientWidth, height=state.height||stage.clientHeight;
      if(width<1 || height<1) return;
      const pixelRatio=Math.min(window.devicePixelRatio||1,1.4);
      const sw=Math.max(1,Math.round(width*pixelRatio)),sh=Math.max(1,Math.round(height*pixelRatio));
      if(canvas.width!==sw || canvas.height!==sh) {canvas.width=sw;canvas.height=sh;}
      ctx.setTransform(sw/width,0,0,sh/height,0,0);
      const tan=Math.tan(32*Math.PI/360);
      const dist=state.distance, eyeY=state.eyeY;
      const cx=width*.5-state.offsetX, cy=height*.5-state.offsetY;
      const sy=Math.sin(yaw),ay=Math.cos(yaw),sp=Math.sin(pitch),ap=Math.cos(pitch);
      const eyeX=dist*ap*sy, eyeHeight=eyeY+dist*sp,eyeZ=dist*ap*ay;
      const focal=height/(2*tan), horizon=cy-focal*Math.tan(pitch);
      const sky=ctx.createLinearGradient(0,horizon-height*.78,0,horizon);
      sky.addColorStop(0,'#a9c3c8'); sky.addColorStop(.68,'#e9ded0'); sky.addColorStop(1,'#f4dbba');
      ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
      const field=ctx.createLinearGradient(0,horizon,0,Math.max(horizon+2,height));
      field.addColorStop(0,'#ecd0a7');field.addColorStop(.37,'#dfba88');field.addColorStop(1,'#d4ad79');
      ctx.fillStyle=field;ctx.fillRect(0,horizon,width,height-horizon);
      for(let j=0,i=0;i<vertexCount;i++,j+=3) {
        const x=coords[j], y=coords[j+1]-eyeY, z=coords[j+2];
        const along=x*sy+z*ay, depth=dist-along*ap-y*sp;
        depths[i]=depth;
        screenX[i]=cx+(x*ay-z*sy)*focal/depth;
        screenY[i]=cy-(y*ap-along*sp)*focal/depth;
      }
      function drawFaces(faces) {
        sorted.length=0;
        for(let i=0;i<faces.length;i++) {
          const f=faces[i],n=basis[f.side][0];
          if(n[0]*(eyeX-f.x)+n[1]*(eyeHeight-f.y)+n[2]*(eyeZ-f.z)<=0) continue;
          const ids=f.ids;
          if(depths[ids[0]]<=.5 || depths[ids[1]]<=.5 || depths[ids[2]]<=.5 || depths[ids[3]]<=.5) continue;
          f.depth=(depths[ids[0]]+depths[ids[2]])*.5;
          sorted.push(f);
        }
        sorted.sort((a,b)=>b.depth-a.depth);
        for(let j=0;j<sorted.length;j++) {
          const f=sorted[j], ids=f.ids;
          const midX=(screenX[ids[0]]+screenX[ids[2]])*.5,midY=(screenY[ids[0]]+screenY[ids[2]])*.5;
          ctx.fillStyle=f.fill;
          ctx.beginPath();
          for(let i=0;i<4;i++) {
            const p=ids[i],x=screenX[p],y=screenY[p],dx=x-midX,dy=y-midY;
            const bleed=.32/Math.max(.9,Math.abs(dx),Math.abs(dy));
            if(i===0) ctx.moveTo(x+dx*bleed,y+dy*bleed);
            else ctx.lineTo(x+dx*bleed,y+dy*bleed);
          }
          ctx.fill();
        }
      }
      drawFaces(cloudFaces);
      drawFaces(horizonFaces);
      drawFaces(terrainFaces);
      ctx.beginPath();
      for(const ids of shadow) {
        if(ids.some(p=>depths[p]<.5)) continue;
        ctx.moveTo(screenX[ids[0]],screenY[ids[0]]);
        for(let i=1;i<4;i++) ctx.lineTo(screenX[ids[i]],screenY[ids[i]]);
        ctx.closePath();
      }
      ctx.fillStyle='rgba(99,76,62,.27)';ctx.fill();
      drawFaces(statueFaces);
    };
  };
})();
