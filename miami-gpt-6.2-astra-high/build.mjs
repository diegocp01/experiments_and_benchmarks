import {build} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
const result=await build({entryPoints:['src/scene.js'],bundle:true,minify:true,format:'iife',write:false,legalComments:'inline'});
const license=fs.readFileSync('/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/LICENSE','utf8');
const code=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
fs.writeFileSync('ocean-drive.html',fs.readFileSync('src/shell.html','utf8').replace('/* BUNDLE */',()=>'/* Three.js license:\n'+license+'\n*/\n'+code));
console.log('Built ocean-drive.html: '+fs.statSync('ocean-drive.html').size+' bytes');
