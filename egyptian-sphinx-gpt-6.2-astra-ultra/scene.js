(() => {
  'use strict';

  let canvas = document.getElementById('scene');
  const stage = document.getElementById('stage');
  const T = window.THREE;
  const radians = T.MathUtils.degToRad;
  const clamp = T.MathUtils.clamp;
  let webgl;
  try {
    const context = canvas.getContext('webgl2', { antialias:true, alpha:false, powerPreference:'high-performance' });
    if (context) webgl = new T.WebGLRenderer({ canvas, context });
  } catch (error) {
    // A canvas that acquired WebGL cannot switch to a 2D context.
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    console.info('Using the Canvas 2D renderer.', error.message);
  }
  const scenery = createScenery();
  const renderFrame = webgl ? createScene(webgl, scenery) : window.createFallbackRenderer(canvas, stage, scenery);

  function createScenery() {
    const terrain=[], distant=[], palms=[], clouds=[];
    window.buildTerrain((...box) => terrain.push(box));
    let seed=7584;
    function random() {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    }
    function between(a,b) { return a+(b-a)*random(); }
    const pick = array => array[Math.floor(random()*array.length)];
    const ochres=['#c7a172','#cbaa7e','#cfad7e','#d3b082','#bc996f'];
    // Flat ripples and loose angular fragments interrupt the sand between ledges.
    for(let i=0;i<1300;i++) {
      const x=between(-230,230), z=between(-230,230);
      if(Math.abs(x)<34 && Math.abs(z)<65) continue;
      const w=between(.55,5), d=between(.4,1.8);
      terrain.push([x,-2.77,z,w,.12,d,pick(ochres)]);
    }
    function grass(x,z,height) {
      const n=3+Math.floor(random()*3);
      for(let i=0;i<n;i++) {
        const a=between(0,7), h=height*between(.41,1);
        const col=pick(['#a38c59','#a78c5b','#9a804e','#bca36b']);
        for(let j=0;j<3;j++) {
          const off=(j+.5)*h*.22;
          terrain.push([x+Math.cos(a)*off,-2.83+(j+.5)*h/3,z+Math.sin(a)*off,.22+h*.10,h/3,.22+h*.10,col]);
        }
      }
    }
    for(let i=0;i<95;i++) {
      const x=between(-135,130), z=between(-132,135);
      if(Math.abs(x)<40 && Math.abs(z)<69) continue;
      grass(x,z,between(.7,2.1));
      if(random()>.45) grass(x+between(1,2.8),z+between(-1,1),between(.4,1.1));
    }
    const referenceAngle = radians(42);
    function backdrop(across,back) {
      return [Math.cos(referenceAngle)*across-Math.sin(referenceAngle)*back,
         -Math.sin(referenceAngle)*across-Math.cos(referenceAngle)*back];
    }
    // Small clusters of broken limestone collect around the outer sand flats.
    for(const [across,back,scale] of [[-68,14,1],[-69,-29,.78],[73,-11,1.15],[63,78,.7],[-25,-101,.8],[32,-87,.75],[-83,94,.9]]) {
      const [cx,cz]=backdrop(across,back);
      for(let i=0;i<9;i++) {
        const x=cx+between(-5,5),z=cz+between(-4,4),w=scale*between(.8,4.3),h=w*between(.28,.52),d=w*between(.55,1);
        const c=pick(['#c3a078','#c89f72','#b99570','#d1ac80']);
        terrain.push([x,-2.83+h*.30,z,w,h*.60,d,c],[x+.15,-2.83+h*.80,z,w*.73,h*.4,d*.80,c]);
      }
      grass(cx-1,cz+2,2.1*scale);
    }
    // Terraced pyramids and a low horizon recede into the desert haze.
    function pyramid(across,back,base,height) {
      const [x,z]=backdrop(across,back);
      const steps=Math.round(height/1.3);
      for(let i=0;i<steps;i++) {
        const w=base*(1-i/steps), h=height/steps;
        const c=new T.Color('#cbac85').multiplyScalar(between(.97,1.027));
        distant.push([x,-2.8+(i+.5)*h,z,w,h,w,'#'+c.getHexString()]);
      }
    }
    pyramid(179,390,100,60);
    pyramid(-268,478,67,38);
    pyramid(250,467,52,31);
    for(let i=0;i<125;i++) {
      const a=2*Math.PI*i/125;
      const r=between(430,485), x=r*Math.sin(a),z=r*Math.cos(a);
      const w=between(58,104), d=between(28,58), h=between(2.2,6);
      const c=pick(['#d8b88f','#dbbd97','#d5b58f']);
      for(let layer=0;layer<6;layer++) {
        const fraction=1-layer/6;
        distant.push([x+layer*1.2,-2.82+h*(layer+.5)/6,z,w*fraction,h/6,d*fraction,c]);
      }
    }
    // Small date palms mark the edge of the plateau and give the monument scale.
    function palm(x,z,h) {
      const trunk=['#91774d','#a98b5d','#997e54'];
      for(let j=0;j<9;j++) {
        const k=j/9;
        palms.push([x+.45*k*k,-2.8+(j+.5)*h/9,z,.072*h,h/9,.085*h,trunk[j%3]]);
      }
      for(let j=0;j<9;j++) {
        const a=2*Math.PI*j/9+between(-.13,.13);
        const l=between(.42,.62)*h;
        const color=pick(['#77815c','#939260','#7b8054','#a3a06b']);
        for(let s=0;s<7;s++) {
          const t=(s+.5)/7, off=l*t, width=l*(.225*Math.sin(Math.PI*t)+.05);
          palms.push([x+.45+Math.cos(a)*off,-2.8+h+(Math.sin(t*Math.PI)*.21-t*.16)*h,z+Math.sin(a)*off,
            Math.abs(Math.sin(a))*width+Math.abs(Math.cos(a))*l/6,.06*h,
            Math.abs(Math.cos(a))*width+Math.abs(Math.sin(a))*l/6,color]);
        }
      }
    }
    for(const [a,b,h] of [[-112,137,12],[-123,145,9],[-132,140,11],[124,150,11],[130,145,15],[137,145,8],[14,187,8],[-44,-166,12],[75,-191,11]]) {
      const [x,z]=backdrop(a,b); palm(x,z,h);
    }
    function cloud(across,back,y,scale) {
      const [cx,cz]=backdrop(across,back);
      const outline=[[-21,0,28,3,7],[-9,3,23,5,8],[1,6,17,5,8],[10,3,21,5,9],[24,0,21,3,8],[40,-1.1,13,1.6,5]];
      for(const [offset,dy,w,h,d] of outline) {
        const dx=Math.cos(referenceAngle)*offset*scale, dz=-Math.sin(referenceAngle)*offset*scale;
        clouds.push([cx+dx,y+dy*scale,cz+dz,w*scale,h*scale,d*scale,dy>1?'#fff4dc':'#f5e7cd']);
      }
    }
    cloud(143,610,120,1.04); cloud(-233,580,101,1.04); cloud(43,690,145,.48);
    cloud(-25,-640,127,1.5); cloud(398,-260,94,1);
    return {terrain,distant,palms,clouds};
  }

  function createScene(renderer, scenery) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    scene.fog = new T.Fog(0xf5daba, 100, 650);
    const camera = new T.PerspectiveCamera(32, 1, 0.5, 2700);
    const sky = new T.Mesh(new T.SphereGeometry(1600, 32, 18), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: {
        horizon: { value: new T.Color('#f5daba') },
        middle: { value: new T.Color('#dedfd1') },
        upper: { value: new T.Color('#9bc5d3') }
      },
      vertexShader: 'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 direction; uniform vec3 horizon,middle,upper;
        void main(){ float h=normalize(direction).y;
          vec3 c=mix(horizon,middle,smoothstep(-.035,.070,h));
          c=mix(c,upper,smoothstep(.015,.20,h));
          gl_FragColor=vec4(c,1.);
          #include <colorspace_fragment>
        }`
    }));
    sky.renderOrder = -10;
    scene.add(sky);

    scene.add(new T.HemisphereLight(0xeaf3ff, 0xe6bc98, 1.72));
    const sun = new T.DirectionalLight(0xffefd6, 2.63);
    sun.position.set(-67, 102, 103);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -87, right: 87, top: 85, bottom: -85, near: 1, far: 280 });
    sun.shadow.normalBias = 0.075;
    sun.shadow.bias = -0.00014;
    scene.add(sun);

    // A world-space grain keeps the sandstone texture attached to the moving view.
    function sandyMaterial(options, strength) {
      const mat = new T.MeshLambertMaterial(options);
      mat.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 stonePosition;\n' + shader.vertexShader.replace('#include <project_vertex>', `
          vec4 stoneVertex=vec4(transformed,1.);
          #ifdef USE_INSTANCING
            stoneVertex=instanceMatrix*stoneVertex;
          #endif
          stonePosition=(modelMatrix*stoneVertex).xyz;
          #include <project_vertex>`);
        shader.fragmentShader = 'varying vec3 stonePosition;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          vec3 p=floor(stonePosition*4.0+vec3(.017));
          float hash=fract(sin(dot(mod(p, 137.0),vec3(17.17,45.93,79.81)))*13579.);
          float fade=1.-smoothstep(.25,1.75,length(fwidth(stonePosition)));
          diffuseColor.rgb*=1.+(hash-.5)*${strength.toFixed(3)}*fade;`);
      };
      mat.customProgramCacheKey = () => 'sand'+strength;
      return mat;
    }

    // Keep only exposed faces. Local neighbour occupancy darkens recessed corners.
    const voxels = new Map();
    const key = (x,y,z) => (x+128)*65536+(y+32)*512+z+160;
    window.buildSphinx((x,y,z,color) => voxels.set(key(x,y,z), [x,y,z,color]));
    const faces = [
      [[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,0,1],[0,1,0]],
      [[0,1,0],[0,0,1],[1,0,0]], [[0,-1,0],[1,0,0],[0,0,1]],
      [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[0,1,0],[1,0,0]]
    ];
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
    const positions=[], normals=[], colors=[], indices=[];
    const palette = new Map();
    voxels.forEach(([x,y,z,hex]) => {
      if (!palette.has(hex)) palette.set(hex,new T.Color(hex));
      const color=palette.get(hex);
      for (const [n,u,v] of faces) {
        const a=x+n[0], b=y+n[1], c=z+n[2];
        if (voxels.has(key(a,b,c))) continue;
        const first=positions.length/3, ao=[];
        for (const [i,j] of corners) {
          const ux=u[0]*i, uy=u[1]*i, uz=u[2]*i, vx=v[0]*j, vy=v[1]*j, vz=v[2]*j;
          const s1=+voxels.has(key(a+ux,b+uy,c+uz)), s2=+voxels.has(key(a+vx,b+vy,c+vz));
          const diagonal=+voxels.has(key(a+ux+vx,b+uy+vy,c+uz+vz));
          const shade=[1,.86,.71,.56][s1&&s2 ? 3 : s1+s2+diagonal];
          ao.push(shade);
          positions.push(x+(n[0]+ux+vx)*.5,y+(n[1]+uy+vy)*.5,z+(n[2]+uz+vz)*.5);
          normals.push(...n);
          colors.push(color.r*shade,color.g*shade,color.b*shade);
        }
        const quad=ao[0]+ao[2]>ao[1]+ao[3] ? [0,1,3,1,2,3] : [0,1,2,0,2,3];
        for(const k of quad) indices.push(first+k);
      }
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);
    const statue = new T.Mesh(geo,sandyMaterial({vertexColors:true},.065));
    statue.castShadow=statue.receiveShadow=true;
    scene.add(statue);

    const boxGeometry = new T.BoxGeometry(1,1,1);
    const transform = new T.Object3D();
    function boxMesh(boxes,material,shadow) {
      const mesh = new T.InstancedMesh(boxGeometry,material,boxes.length);
      boxes.forEach(([x,y,z,w,h,d,hex],i) => {
        transform.position.set(x,y,z);
        transform.scale.set(w,h,d);
        transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);
        mesh.setColorAt(i,new T.Color(hex));
      });
      mesh.castShadow=mesh.receiveShadow=shadow;
      scene.add(mesh);
    }
    const {terrain,distant,palms,clouds}=scenery;
    const ground = new T.Mesh(new T.PlaneGeometry(3600,3600),sandyMaterial({color:0xd9b78b},.074));
    ground.rotation.x=-Math.PI/2;
    ground.position.y=-2.83;
    ground.receiveShadow=true;
    scene.add(ground);

    boxMesh(terrain,sandyMaterial({},.11),true);
    boxMesh(distant,new T.MeshLambertMaterial(),false);
    boxMesh(palms,new T.MeshLambertMaterial(),true);

    boxMesh(clouds,new T.MeshBasicMaterial({fog:false}),false);

    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.needsUpdate=true;
    return function renderScene({yaw,pitch,width,height,distance,eyeY,offsetX,offsetY}) {
      const horizontal=distance*Math.cos(pitch);
      camera.position.set(horizontal*Math.sin(yaw),eyeY+distance*Math.sin(pitch),horizontal*Math.cos(yaw));
      camera.lookAt(0,eyeY,0);
      camera.aspect=width/height;
      camera.setViewOffset(width,height,offsetX,offsetY,width,height);
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
      scene.fog.near=distance-42;
      scene.fog.far=distance+700;
      renderer.render(scene,camera);
    };
  }

  const views={standard:[42,9],front:[0,8],side:[90,9]};
  const current={yaw:radians(42),pitch:radians(9),zoom:1};
  const target={...current};
  let auto=false, frame=0, lastTime=0, width=1,height=1;
  const pointers=new Map();
  let pinch=0, dragged=false;
  function render(time) {
    frame=0;
    const dt=lastTime?Math.min((time-lastTime)/1000,.05):.016;
    lastTime=time;
    if(auto && !document.hidden) target.yaw+=dt*.115;
    const t=1-Math.exp(-16*dt);
    for(const k of ['yaw','pitch','zoom']) current[k]+=(target[k]-current[k])*t;
    const narrow=width<700, aspect=width/height;
    const distance=Math.max(164,106/(aspect*(narrow?.99:.77)*2*Math.tan(radians(16))))/current.zoom;
    const offsetX=-width*(narrow?.015:.085), offsetY=-height*(narrow?.08:.028);
    const eyeY=(narrow?20:19)+Math.max(0,current.zoom-1)*5;
    renderFrame({...current,width,height,distance,eyeY,offsetX,offsetY});
    const needle=document.getElementById('needle');
    // The Sphinx looks east (+Z), and geographic north is +X.
    if(needle) needle.setAttribute('transform','rotate('+(90+current.yaw*180/Math.PI)+' 34 36.5)');

    if(auto || Math.abs(current.yaw-target.yaw)+Math.abs(current.pitch-target.pitch)+Math.abs(current.zoom-target.zoom)>.00005) draw();
    else lastTime=0;
  }
  function draw() { if(!frame) frame=requestAnimationFrame(render); }
  function resize() {
    width=stage.clientWidth; height=stage.clientHeight;
    if(webgl) webgl.setSize(width,height,false);
    draw();
  }
  function autoOrbit(enabled) {
    auto=enabled; document.getElementById('auto-orbit').setAttribute('aria-pressed',String(enabled)); draw();
  }
  function orbit(dx,dy) {
    target.yaw-=dx*.006;
    target.pitch=clamp(target.pitch+dy*.004,radians(2),radians(75));
    autoOrbit(false);
    window.dispatchEvent(new Event('manual-orbit'));
    draw();
  }
  function zoom(factor) {
    target.zoom=clamp(target.zoom*factor,.48,3.0);
    document.getElementById('zoom-value').textContent=Math.round(target.zoom*100)+'%';
    document.getElementById('zoom-in').disabled=target.zoom>=2.999;
    document.getElementById('zoom-out').disabled=target.zoom<=.481;
    draw();
  }
  function preset(name) {
    if(!views[name]) return;
    autoOrbit(false);
    const next=radians(views[name][0]);
    target.yaw=current.yaw+Math.atan2(Math.sin(next-current.yaw),Math.cos(next-current.yaw));
    target.pitch=radians(views[name][1]);
    zoom(1/target.zoom); draw();
  }
  function separation() {
    const [a,b]=[...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    canvas.focus({preventScroll:true});
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    if(pointers.size===2) pinch=separation();
    dragged=false;
  });
  canvas.addEventListener('pointermove',e=>{
    const prev=pointers.get(e.pointerId); if(!prev) return;
    const dx=e.clientX-prev.x, dy=e.clientY-prev.y;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2) {
      const d=separation();
      if(pinch>1 && d>1) zoom(d/pinch);
      pinch=d;
    } else if(pointers.size===1 && (dx||dy)) {
      if(!dragged) autoOrbit(false);
      dragged=true; orbit(dx,dy);
    }
  });
  function release(e) {
    pointers.delete(e.pointerId);
    if(pointers.size<2) pinch=0;
    if(!pointers.size) canvas.classList.remove('dragging');
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,release);
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const units=e.deltaMode===1?16:e.deltaMode===2?height:1;
    zoom(Math.exp(-clamp(e.deltaY*units,-220,220)*.00165));
  },{passive:false});
  canvas.addEventListener('keydown',e=>{
    const map={ArrowLeft:[22,0],ArrowRight:[-22,0],ArrowUp:[0,20],ArrowDown:[0,-20]};
    if(map[e.key]) { e.preventDefault(); orbit(...map[e.key]); }
    if(['+','=','-','_'].includes(e.key)) { e.preventDefault(); zoom(e.key==='-'||e.key==='_'?1/1.2:1.2); }
    if(e.key==='Home') { e.preventDefault(); preset('standard'); window.dispatchEvent(new Event('reset-view')); }
  });
  new ResizeObserver(resize).observe(stage);
  document.addEventListener('visibilitychange',()=>{lastTime=0; if(!document.hidden) draw();});
  window.exhibit={zoom,preset,toggleAuto:()=>autoOrbit(!auto)};
  resize();
})();
