#!/usr/bin/env python3
"""Add lamacoid OCR + audit-walk session assignment to RTU Photo Renamer."""
from pathlib import Path

HTML = Path(
    r"c:\Users\Robert\OneDrive - Quadreal Property Group\#OI-Industrial East - @Master Sheets&Projects\Claude Projects\Renaming Pictures based on GPS location\RTU_Photo_Renamer_34.html"
)

LAMACOID_JS = r'''
/* ════════════════════ Lamacoid label OCR + audit-walk assignment ════════════════════
   During a roof audit you shoot ~3 photos per RTU. A lamacoid (DFHP-04, RT-09, RTU-01…)
   on the first photo identifies the unit; following shots inherit that RTU until the next
   lamacoid. GPS is used before the first label and as a sanity check. */
let TESS_OK = false, _tessTried = false;
function lazyTesseract(){
  return new Promise(res=>{
    if(_tessTried) return res(TESS_OK);
    _tessTried = true;
    if(window.Tesseract){ TESS_OK=true; return res(true); }
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.crossOrigin='anonymous';
    s.onload=()=>{ TESS_OK=!!window.Tesseract; log(TESS_OK?'Lamacoid OCR ready (Tesseract).':'OCR library failed to load.','ok'); res(TESS_OK); };
    s.onerror=()=>{ TESS_OK=false; log('Lamacoid OCR unavailable — using GPS only.','warn'); res(false); };
    document.head.appendChild(s);
  });
}
function rtuUnitKey(name){
  const m=String(name||'').match(/RTU\s*[-#]?\s*0*(\d+)\s*([A-Za-z])?/i);
  if(!m) return null;
  return { num:parseInt(m[1],10), suffix:(m[2]||'').toLowerCase(), hybrid:/hybrid/i.test(name) };
}
function pickClosestRtu(cands, gps){
  if(!cands || !cands.length) return null;
  if(!gps || cands.length===1) return cands[0];
  let best=cands[0], bd=Infinity;
  cands.forEach(r=>{
    const d=haversineM(gps.lat,gps.lon,r.lat,r.lon);
    if(d<bd){ bd=d; best=r; }
  });
  return best;
}
function extractLamacoidTokens(text){
  const upper=String(text||'').toUpperCase().replace(/[|]/g,'I');
  const hits=[];
  const specs=[
    { re:/\bDFHP\s*[-#]?\s*0*(\d+)\s*([A-Z])?\b/g, dfhp:true },
    { re:/\bRTU\s*[-#]?\s*0*(\d+)\s*([A-Z])?\b/g, dfhp:false },
    { re:/\bRT\s*[-#]?\s*0*(\d+)\s*([A-Z])?\b/g, dfhp:false },
  ];
  specs.forEach(({re,dfhp})=>{
    let m; re.lastIndex=0;
    while((m=re.exec(upper))){
      hits.push({ num:parseInt(m[1],10), suffix:(m[2]||'').toLowerCase(), dfhp, raw:m[0].trim() });
    }
  });
  /* prefer DFHP over RTU over RT when multiple hits in same OCR blob */
  hits.sort((a,b)=>(b.dfhp?2:0)-(a.dfhp?2:0) || a.raw.length-b.raw.length);
  const seen=new Set();
  return hits.filter(h=>{ const k=h.dfhp+'-'+h.num+h.suffix; if(seen.has(k)) return false; seen.add(k); return true; });
}
function matchRtuFromLamacoid(token, rtus, gps){
  if(!token || !rtus.length) return null;
  let cands=rtus.filter(r=>{
    const uk=rtuUnitKey(r.rtu_name);
    if(!uk || uk.num!==token.num) return false;
    if(token.dfhp) return uk.hybrid;
    if(token.suffix && uk.suffix && uk.suffix!==token.suffix) return false;
    return true;
  });
  if(token.dfhp){
    const withB=cands.filter(r=>/\b0*4B\b/i.test(r.rtu_name) || rtuUnitKey(r.rtu_name)?.suffix==='b');
    if(withB.length) cands=withB;
    else cands=cands.filter(r=>/hybrid/i.test(r.rtu_name));
  } else if(!token.suffix){
    const plain=cands.filter(r=>!rtuUnitKey(r.rtu_name)?.hybrid);
    if(plain.length) cands=plain;
  }
  if(token.suffix && cands.length>1){
    const suff=cands.filter(r=>rtuUnitKey(r.rtu_name)?.suffix===token.suffix);
    if(suff.length) cands=suff;
  }
  return pickClosestRtu(cands, gps);
}
async function imageBlobForOcr(file){
  if(HEIF_EXTS.includes(lowerExt(file.name))){
    await lazyHeic();
    return await toDisplayBlob(file) || file;
  }
  return file;
}
async function ocrImageForLamacoid(blob){
  if(!TESS_OK || !window.Tesseract) return '';
  try{
    const url=URL.createObjectURL(blob);
    const worker=await Tesseract.createWorker('eng', 1, { logger:()=>{} });
    await worker.setParameters({ tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-# ' });
    const { data }=await worker.recognize(url, {}, { rotateAuto:true });
    await worker.terminate();
    URL.revokeObjectURL(url);
    return data && data.text || '';
  }catch(e){ return ''; }
}
function offsetAroundRtu(lat, lon, index, total, radiusM){
  radiusM=radiusM||7;
  const a=(index/Math.max(total,1))*2*Math.PI - Math.PI/2;
  const dLat=(radiusM/EARTH_RADIUS_M)*(180/Math.PI)*Math.cos(a);
  const dLon=(radiusM/EARTH_RADIUS_M)*(180/Math.PI)*Math.sin(a)/Math.cos(lat*Math.PI/180);
  return { lat:lat+dLat, lng:lon+dLon };
}
function applyMapOffsets(results){
  const groups={};
  results.filter(r=>r.status==='HIT' && r.target_lat!=null).forEach(r=>{
    const k=(r.address||'')+'||'+(r.rtu_name||'');
    (groups[k]=groups[k]||[]).push(r);
  });
  Object.values(groups).forEach(arr=>{
    arr.sort(_bySeq);
    const lat=arr[0].target_lat, lon=arr[0].target_lon;
    arr.forEach((r,i)=>{
      const p=offsetAroundRtu(lat,lon,i,arr.length);
      r._mapLat=p.lat; r._mapLng=p.lng;
    });
  });
}
function sortEntriesAuditOrder(entries){
  return entries.slice().sort((a,b)=>{
    const ta=auditInfo(a.dt).time, tb=auditInfo(b.dt).time;
    const na=(ta==null), nb=(tb==null);
    if(na&&nb) return String(a.name).localeCompare(String(b.name));
    if(na) return 1; if(nb) return -1;
    if(ta!==tb) return ta-tb;
    return String(a.name).localeCompare(String(b.name));
  });
}
async function assignEntriesToRtus(entries, targets, maxDistFt, useLamacoid, dryRun){
  const sorted=sortEntriesAuditOrder(entries);
  let sessionRtu=null;
  const assigned=[];
  if(useLamacoid){
    log('Loading lamacoid OCR…');
    await lazyTesseract();
    if(TESS_OK) log('Scanning '+sorted.length+' photo(s) in capture-time order for lamacoid labels…');
  }
  let n=0;
  for(const e of sorted){
    let t=null, mode='gps', lamacoid='';
    if(useLamacoid && TESS_OK){
      const blob=await imageBlobForOcr(e.file);
      const text=await ocrImageForLamacoid(blob);
      const tokens=extractLamacoidTokens(text);
      if(tokens.length){
        const hit=matchRtuFromLamacoid(tokens[0], targets, e.gps);
        if(hit){ t=hit; sessionRtu=hit; mode='label'; lamacoid=tokens[0].raw;
          log('Label "'+lamacoid+'" on '+e.name+' → '+hit.rtu_name,'ok'); }
      }
    }
    if(!t && sessionRtu) { t=sessionRtu; mode='session'; }
    if(!t){
      const {pos,dist}=findClosest(e.gps.lat,e.gps.lon,targets);
      t=targets[pos];
      if(dist>maxDistFt){ assigned.push({ entry:e, t, mode:'miss', distFt:dist, lamacoid:'' }); n++; continue; }
      mode='gps';
    }
    const distFt=Math.round(m2ft(haversineM(e.gps.lat,e.gps.lon,t.lat,t.lon))*10)/10;
    assigned.push({ entry:e, t, mode, distFt, lamacoid });
    if(++n%3===0 && useLamacoid) log('Processed '+n+' / '+sorted.length+'…');
  }
  return assigned;
}
'''

# Read file
text = HTML.read_text(encoding="utf-8")

anchor = "function findClosest(plat,plon,targets){\n  let pos=0, best=Infinity;\n  targets.forEach((t,i)=>{ const d=m2ft(haversineM(plat,plon,t.lat,t.lon)); if(d<best){best=d;pos=i;} });\n  return {pos, dist:best};\n}\n"
if anchor not in text:
    raise SystemExit("findClosest anchor missing")
if "function assignEntriesToRtus" not in text:
    text = text.replace(anchor, anchor + LAMACOID_JS + "\n")

# Settings checkbox
old_settings = """  <div class="row">
    <label class="chk"><input type="checkbox" id="showKey"> Show API key / Map ID</label>
  </div>
</aside>"""
new_settings = """  <div class="row">
    <label class="chk"><input type="checkbox" id="useLamacoid" checked> Read lamacoid labels (OCR) — audit-walk assignment</label>
  </div>
  <div class="row">
    <label class="chk"><input type="checkbox" id="showKey"> Show API key / Map ID</label>
  </div>
</aside>"""
if old_settings in text:
    text = text.replace(old_settings, new_settings, 1)

# Replace Pass 2 loop
old_pass2 = """  /* Pass 2 — assign each GPS photo to the closest RTU; flag MISS when beyond maxDistFt. */
  const results=[];
  let done=0;
  for(const e of withGps){
    const {pos, dist:distFtRaw}=findClosest(e.gps.lat,e.gps.lon,targets);
    const t=targets[pos];
    const fileExt=lowerExt(e.name);
    const willConvert = !dryRun && convHeic && HEIF_EXTS.includes(fileExt) && HEIC_OK;
    const outExt = willConvert ? '.jpg' : ext(e.name);
    const legacy = parseLegacyTags(e.name);
    const audit  = auditInfo(e.dt);
    const distFt = Math.round(distFtRaw*10)/10;
    const within = distFt <= maxDistFt;
    const stem   = within ? makeStem(t.address,t.rtu_name) : '';
    if(!dryRun) e.displayBlob = await toDisplayBlob(e.file);
    const url = e.displayBlob ? URL.createObjectURL(e.displayBlob) : null;
    results.push({
      original:e.name, new_name:'',
      status: within ? 'HIT' : 'MISS', address:t.address, rtu_name: within ? (t.rtu_name||'') : '',
      dist_ft:distFt,
      photo_lat:e.gps.lat, photo_lon:e.gps.lon,
      target_lat: within ? t.lat : null, target_lon: within ? t.lon : null,
      converted:willConvert,
      url, srcFile:e.file, displayBlob:e.displayBlob, outExt, dt:e.dt||null, _exifAll:e.exifAll||null,
      _stem:stem, _legacy:legacy, _auditYear:audit.year, _auditTime:audit.time
    });
    if(!within && distFt > maxDistFt) log('MISS: '+e.name+' is '+distFt+' ft from '+t.rtu_name+' (max '+maxDistFt+' ft)','warn');
    if(++done % 5===0) log('Matched '+done+' / '+withGps.length+'…');
  }
  const hits=results.filter(x=>x.status==='HIT').length, misses=results.filter(x=>x.status==='MISS').length;
  log('Within '+maxDistFt+' ft: '+hits+' HIT, '+misses+' MISS.','ok');"""

new_pass2 = """  /* Pass 2 — lamacoid OCR + audit-walk session, then GPS fallback */
  const useLamacoid = $('useLamacoid')?.checked !== false;
  const assignments = await assignEntriesToRtus(withGps, targets, maxDistFt, useLamacoid, dryRun);
  const results=[];
  for(const a of assignments){
    const e=a.entry, t=a.t;
    const fileExt=lowerExt(e.name);
    const willConvert = !dryRun && convHeic && HEIF_EXTS.includes(fileExt) && HEIC_OK;
    const outExt = willConvert ? '.jpg' : ext(e.name);
    const legacy = parseLegacyTags(e.name);
    const audit  = auditInfo(e.dt);
    const within = a.mode !== 'miss';
    const stem   = within ? makeStem(t.address,t.rtu_name) : '';
    if(!dryRun) e.displayBlob = await toDisplayBlob(e.file);
    const url = e.displayBlob ? URL.createObjectURL(e.displayBlob) : null;
    results.push({
      original:e.name, new_name:'',
      status: within ? 'HIT' : 'MISS', address: within ? t.address : (t.address||''),
      rtu_name: within ? (t.rtu_name||'') : '',
      dist_ft: a.distFt,
      photo_lat:e.gps.lat, photo_lon:e.gps.lon,
      target_lat: within ? t.lat : null, target_lon: within ? t.lon : null,
      converted:willConvert,
      url, srcFile:e.file, displayBlob:e.displayBlob, outExt, dt:e.dt||null, _exifAll:e.exifAll||null,
      _stem:stem, _legacy:legacy, _auditYear:audit.year, _auditTime:audit.time,
      _assignMode:a.mode, _lamacoid:a.lamacoid||''
    });
    if(a.mode==='miss') log('MISS: '+e.name+' is '+a.distFt+' ft from '+t.rtu_name+' (max '+maxDistFt+' ft)','warn');
  }
  const hits=results.filter(x=>x.status==='HIT').length;
  const misses=results.filter(x=>x.status==='MISS').length;
  const byLabel=results.filter(x=>x._assignMode==='label').length;
  const bySession=results.filter(x=>x._assignMode==='session').length;
  log('Assigned: '+hits+' HIT ('+byLabel+' from lamacoid, '+bySession+' session carry-over, '+
      (hits-byLabel-bySession)+' GPS), '+misses+' MISS.','ok');"""

if old_pass2 in text:
    text = text.replace(old_pass2, new_pass2, 1)
else:
    raise SystemExit("Pass 2 block missing")

# applyMapOffsets after assignSequencedNames
old_seq = """  assignSequencedNames(results);
  results.filter(x=>x.status==='MISS' && !x.new_name).forEach(x=>{
    x.new_name = (x.original||'').startsWith('!') ? x.original : '!'+x.original;
  });

  state.results=results;"""
new_seq = """  assignSequencedNames(results);
  applyMapOffsets(results);
  results.filter(x=>x.status==='MISS' && !x.new_name).forEach(x=>{
    x.new_name = (x.original||'').startsWith('!') ? x.original : '!'+x.original;
  });

  state.results=results;"""
if old_seq in text:
    text = text.replace(old_seq, new_seq, 1)

# Table header + row for assign mode
old_th = "<th>Old name</th><th>Projected name</th><th>Closest RTU</th>\n          <th>Dist (ft)</th><th>Status</th><th>Building</th>"
new_th = "<th>Old name</th><th>Projected name</th><th>Closest RTU</th>\n          <th>Dist (ft)</th><th>Assign</th><th>Status</th><th>Building</th>"
if old_th in text:
    text = text.replace(old_th, new_th, 1)

old_status_cell = """    // Status
    const tdS=document.createElement('td'); tdS.innerHTML='<span class="badge '+x.status+'">'+x.status.replace('_',' ')+'</span>'+(x._verified?' <span title="verified" style="color:#2ecc71;font-weight:700">✓</span>':''); tr.appendChild(tdS);"""
new_status_cell = """    // Assign source
    const tdA=document.createElement('td');
    const mode=x._assignMode||'';
  const modeLbl={label:'Label',session:'Session',gps:'GPS',miss:'—'}[mode]||'—';
    tdA.textContent = x._lamacoid ? (modeLbl+' · '+x._lamacoid) : modeLbl;
    if(mode==='label') tdA.className='dist-ok';
    else if(mode==='session') tdA.style.color='var(--accent)';
    tr.appendChild(tdA);
    // Status
    const tdS=document.createElement('td'); tdS.innerHTML='<span class="badge '+x.status+'">'+x.status.replace('_',' ')+'</span>'+(x._verified?' <span title="verified" style="color:#2ecc71;font-weight:700">✓</span>':''); tr.appendChild(tdS);"""
if old_status_cell in text:
    text = text.replace(old_status_cell, new_status_cell, 1)

# Map pins: use offset position + color by assign mode
old_gps_pin = """    const gps={lat:d.photo_lat,lng:d.photo_lon};
    const key=(d.address||'')+'||'+(d.rtu_name||'');
    const icon={path:google.maps.SymbolPath.CIRCLE, scale:9, fillColor:'#2d9cff', fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5};"""
new_gps_pin = """    const gps={lat:d._mapLat!=null?d._mapLat:d.photo_lat, lng:d._mapLng!=null?d._mapLng:d.photo_lon};
    const key=(d.address||'')+'||'+(d.rtu_name||'');
    const pinColor=d._assignMode==='label'?'#2ecc71':(d._assignMode==='session'?'#5fb0ff':'#2d9cff');
    const icon={path:google.maps.SymbolPath.CIRCLE, scale:9, fillColor:pinColor, fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5};"""
if old_gps_pin in text:
    text = text.replace(old_gps_pin, new_gps_pin, 1)

# distFt in drawConn uses true photo GPS vs RTU
old_dist = "      const ft=distFt(e.gps,rPos);   // always the TRUE measured distance"
new_dist = "      const trueGps={lat:d.photo_lat,lng:d.photo_lon};\n      const ft=distFt(trueGps,rPos);"
if old_dist in text:
    text = text.replace(old_dist, new_dist, 1)

HTML.write_text(text, encoding="utf-8")
print("Patched lamacoid assignment OK")
