import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pub=path.join(root,'public'), ext=path.join(root,'extension'), docs=path.join(root,'docs');
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
const upstream=path.join(root,'node_modules/axe-core/axe.min.js');
const hasAxe=await exists(upstream);
if(process.argv.includes('--require-axe')&&!hasAxe)throw new Error('axe-core dependency missing. Run npm install --ignore-scripts first.');
if(hasAxe){
  await fs.copyFile(upstream,path.join(pub,'assets/vendor-axe.js'));
  await fs.mkdir(path.join(pub,'licenses'),{recursive:true});
  await fs.copyFile(path.join(root,'node_modules/axe-core/LICENSE'),path.join(pub,'licenses/axe-core-LICENSE.txt'));
  const thirdParty=path.join(root,'node_modules/axe-core/LICENSE-3RD-PARTY.txt');
  if(await exists(thirdParty))await fs.copyFile(thirdParty,path.join(pub,'licenses/axe-core-LICENSE-3RD-PARTY.txt'));
}
if(await exists(path.join(root,'LICENSE')))await fs.copyFile(path.join(root,'LICENSE'),path.join(ext,'LICENSE'));
await fs.cp(path.join(pub,'assets'),path.join(ext,'assets'),{recursive:true});
let reportHTML=await fs.readFile(path.join(pub,'index.html'),'utf8');
reportHTML=reportHTML.replace('</head>','<script defer src="report-loader.js"></script></head>');
await fs.writeFile(path.join(ext,'report.html'),reportHTML);
await fs.copyFile(path.join(pub,'demo.html'),path.join(ext,'demo.html'));
if(await exists(path.join(pub,'licenses')))await fs.cp(path.join(pub,'licenses'),path.join(ext,'licenses'),{recursive:true});
// ZIP store format: no runtime zip utility or additional dependency is needed.
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
async function walk(dir,base=dir){const files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p,base));else files.push({name:path.relative(base,p).split(path.sep).join('/'),data:await fs.readFile(p)});}return files;}
function zip(files){
  const local=[],central=[];let offset=0;
  for(const file of files){const name=Buffer.from(file.name),data=file.data,crc=crc32(data),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);local.push(h,name,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,cd,end]);
}
await fs.mkdir(path.join(pub,'downloads'),{recursive:true});
await fs.writeFile(path.join(pub,'downloads/accessibility-studio-extension.zip'),zip(await walk(ext)));
await fs.writeFile(path.join(pub,'.nojekyll'),'');
await fs.cp(pub,docs,{recursive:true});
console.log(`Built GitHub Pages docs/ and extension ZIP. axe-core: ${hasAxe?'bundled from installed package':'NOT BUNDLED — built-in rules only'}`);
