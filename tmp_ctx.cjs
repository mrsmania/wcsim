const fs=require('fs');const src=fs.readFileSync('src/data/squads.ts','utf8');
const hdr=/squad\('([A-Z]{3})',\s*'([^']+)',\s*(\d{4}),/;
const row=/^\s*\[\s*(\d+)\s*,\s*'(.*?)'\s*,\s*\[([^\]]*)\]/;
let cur=null;const first={};
for(const L of src.split('\n')){const h=L.match(hdr);if(h){cur={code:h[1],year:+h[3]};continue;}
  const m=L.match(row);if(m&&cur){const name=m[2].replace(/\'/g,"'");
    if(!first[name])first[name]={code:cur.code,year:cur.year,pos:m[3].replace(/'/g,'').trim()};}}
const names=Object.keys(first);
const targets=names.filter(n=>!n.includes(' ')||/^[A-Z]\. /.test(n));
targets.sort();
const out=targets.map(n=>`${n} [${first[n].code} ${first[n].year}, ${first[n].pos}]`);
fs.writeFileSync('tmp_namelist.txt', out.join('\n'));
console.log('wrote',out.length,'names');
// split into 5 chunks
const per=Math.ceil(out.length/5);
for(let i=0;i<5;i++){fs.writeFileSync(`tmp_batch${i+1}.txt`, out.slice(i*per,(i+1)*per).join('\n'));}
console.log('chunks of ~',per);
