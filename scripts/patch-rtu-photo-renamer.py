#!/usr/bin/env python3
"""Apply improvements to RTU_Photo_Renamer_34.html."""
from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

HTML_PATH = Path(
    r"c:\Users\Robert\OneDrive - Quadreal Property Group\#OI-Industrial East - @Master Sheets&Projects\Claude Projects\Renaming Pictures based on GPS location\RTU_Photo_Renamer_34.html"
)


def replace_or_skip(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text or new.split("\n")[0] in text:
        print(f"SKIP ({label}): already applied")
        return text
    raise SystemExit(f"PATCH FAILED ({label}): anchor not found")


def must_replace(text: str, old: str, new: str, label: str) -> str:
    return replace_or_skip(text, old, new, label)


def main() -> None:
    if not HTML_PATH.exists():
        raise SystemExit(f"File not found: {HTML_PATH}")

    text = HTML_PATH.read_text(encoding="utf-8")
    original_len = len(text)

    # ── 1. Extract embedded database to sibling .xlsx ──
    db_pat = re.compile(
        r'(const EMBEDDED_DB_NAME = "([^"]+)";\s*const EMBEDDED_DB_B64 = ")([^"]*)(";\s*/\* ── Embedded libheif)',
        re.DOTALL,
    )
    m = db_pat.search(text)
    if not m:
        raise SystemExit("Could not find EMBEDDED_DB_B64 block")
    db_name, b64 = m.group(2), m.group(3)
    if b64:
        xlsx_path = HTML_PATH.parent / db_name
        if not xlsx_path.exists():
            xlsx_path.write_bytes(base64.b64decode(b64))
            print(f"Extracted database -> {xlsx_path} ({xlsx_path.stat().st_size:,} bytes)")
        else:
            print(f"Database file already exists: {xlsx_path}")
        text = db_pat.sub(r"\1\4", text, count=1)
    else:
        print("Embedded DB already externalized")

    # ── 2. Security: remove hardcoded API key ──
    text = must_replace(
        text,
        "const DEFAULT_KEY   = 'AIzaSyCi8vk7UYK745c6DimuzzN_W9aOPq6b0j0';",
        "const DEFAULT_KEY   = '';  /* enter your own Maps key in the UI */",
        "DEFAULT_KEY",
    )

    # ── 3. Constants ──
    text = must_replace(
        text,
        "const THUMB = 64;",
        "const THUMB = 64;\nconst DEFAULT_MAX_DIST_FT = 300;",
        "DEFAULT_MAX_DIST_FT",
    )

    # ── 4. Shared stamp helper (before stampImageBlob) ──
    text = must_replace(
        text,
        "async function stampImageBlob(blob, line){",
        """function drawStampBar(g, W, H, line){
  if(!line) return;
  const fs=Math.max(16, Math.round(W/42)), padX=Math.round(fs*0.7), padY=Math.round(fs*0.5), barH=fs+padY*2;
  g.fillStyle='rgba(0,0,0,0.55)'; g.fillRect(0, H-barH, W, barH);
  g.font='600 '+fs+'px Segoe UI,Arial,sans-serif'; g.textBaseline='middle'; g.textAlign='left';
  g.fillStyle='#000'; g.fillText(line, padX+1, H-barH/2+1);
  g.fillStyle='#ffffff'; g.fillText(line, padX, H-barH/2);
}
async function stampImageBlob(blob, line){""",
        "drawStampBar",
    )

    text = must_replace(
        text,
        """  const g=c.getContext('2d'); g.drawImage(im,0,0);
  if(line){
    const fs=Math.max(16, Math.round(W/42)), padX=Math.round(fs*0.7), padY=Math.round(fs*0.5), barH=fs+padY*2;
    g.fillStyle='rgba(0,0,0,0.55)'; g.fillRect(0, H-barH, W, barH);
    g.font='600 '+fs+'px Segoe UI,Arial,sans-serif'; g.textBaseline='middle'; g.textAlign='left';
    g.fillStyle='#000'; g.fillText(line, padX+1, H-barH/2+1);
    g.fillStyle='#ffffff'; g.fillText(line, padX, H-barH/2);
  }
  return await new Promise(res=> c.toBlob(b=>res(b||blob), 'image/jpeg', 0.92));""",
        """  const g=c.getContext('2d'); g.drawImage(im,0,0);
  drawStampBar(g, W, H, line);
  return await new Promise(res=> c.toBlob(b=>res(b||blob), 'image/jpeg', 0.92));""",
        "stampImageBlob body",
    )

    # ── 5. Fix _loadImgBlob memory leak ──
    text = must_replace(
        text,
        "  im.onload=()=>{ res(im); }; im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('img')); }; im.src=u; }); }",
        "  im.onload=()=>{ URL.revokeObjectURL(u); res(im); }; im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('img')); }; im.src=u; }); }",
        "_loadImgBlob",
    )

    # ── 6. Remove dead autoGapThreshold; keep scopeTargets ──
    text = must_replace(
        text,
        """/* Auto-detect the pause (seconds) that separates one RTU's photos from the next.
   Finds the biggest multiplicative jump in the sorted inter-shot gaps. */
function autoGapThreshold(times){
  const gaps=[];
  for(let i=1;i<times.length;i++){ const g=(times[i]-times[i-1])/1000; if(g>=0) gaps.push(g); }
  if(gaps.length<3) return 30;                 // too little data → 30s default
  const sorted=gaps.slice().sort((a,b)=>a-b);
  let bestRatio=1, lo=null, hi=null;
  for(let i=0;i<sorted.length-1;i++){
    const a=Math.max(sorted[i],1), b=sorted[i+1];
    if(b>=8 && b/a>bestRatio){ bestRatio=b/a; lo=sorted[i]; hi=b; }
  }
  let thr;
  if(lo!=null && bestRatio>=2){ thr=Math.sqrt(Math.max(lo,1)*hi); }
  else { const med=sorted[Math.floor(sorted.length/2)]; thr=Math.max(med*4,20); }
  return Math.min(Math.max(thr,10),600);       // clamp 10s … 10min
}
function scopeTargets""",
        "function scopeTargets",
        "remove autoGapThreshold",
    )

    # ── 7. loadEmbeddedDatabase: try sibling xlsx when no embed/IDB ──
    text = must_replace(
        text,
        """  // 2) otherwise the database embedded in this file
  if(!EMBEDDED_DB_B64){ checkReady(); return; }
  try{
    const {rtus,buildings,polygons} = parseWorkbookBuffer(_b64ToBytes(EMBEDDED_DB_B64).buffer);
    state.rtus=rtus; state.buildings=buildings; state.polygons=polygons;
    state.dbFile={name:EMBEDDED_DB_NAME, embedded:true};
    $('dbName').textContent='Embedded: '+EMBEDDED_DB_NAME+' — click to replace';
    log('Embedded database loaded — '+rtus.length+' RTUs, '+buildings.length+' buildings, '+
        Object.keys(polygons).length+' buildings with suites. (Choose a database to replace it.)','ok');
  }catch(err){ log('Failed to load embedded database: '+err.message,'err'); }
  checkReady();
}""",
        """  // 2) embedded base64 in this file (legacy single-file builds)
  if(EMBEDDED_DB_B64){
    try{
      const {rtus,buildings,polygons} = parseWorkbookBuffer(_b64ToBytes(EMBEDDED_DB_B64).buffer);
      state.rtus=rtus; state.buildings=buildings; state.polygons=polygons;
      state.dbFile={name:EMBEDDED_DB_NAME, embedded:true};
      $('dbName').textContent='Embedded: '+EMBEDDED_DB_NAME+' — click to replace';
      log('Embedded database loaded — '+rtus.length+' RTUs, '+buildings.length+' buildings, '+
          Object.keys(polygons).length+' buildings with suites.','ok');
      checkReady(); return;
    }catch(err){ log('Failed to load embedded database: '+err.message,'warn'); }
  }
  // 3) bundled .xlsx beside this HTML
  try{
    const resp=await fetch(encodeURI(EMBEDDED_DB_NAME));
    if(resp.ok){
      const buf=await resp.arrayBuffer();
      const {rtus,buildings,polygons}=parseWorkbookBuffer(buf);
      state.rtus=rtus; state.buildings=buildings; state.polygons=polygons;
      state.dbFile={name:EMBEDDED_DB_NAME, embedded:false};
      $('dbName').textContent='Bundled: '+EMBEDDED_DB_NAME+' — click to replace';
      log('Bundled database loaded — '+rtus.length+' RTUs, '+buildings.length+' buildings, '+
          Object.keys(polygons).length+' buildings with suites.','ok');
      checkReady(); return;
    }
  }catch(e){}
  $('dbName').textContent='No database — choose Excel export or place '+EMBEDDED_DB_NAME+' beside this file';
  checkReady();
}""",
        "loadEmbeddedDatabase",
    )

    # ── 8. UI: max distance field ──
    text = must_replace(
        text,
        """      <div class="field">
        <label>Vector Map ID <span class="ed-hint">(optional — enables rotate/tilt)</span></label>
        <input type="password" id="mapId" placeholder="optional" autocomplete="off">
      </div>
    </div>""",
        """      <div class="field">
        <label>Vector Map ID <span class="ed-hint">(optional — enables rotate/tilt)</span></label>
        <input type="password" id="mapId" placeholder="optional" autocomplete="off">
      </div>
      <div class="field small">
        <label>Max match distance (ft)</label>
        <input type="number" id="maxDistFt" min="25" max="5000" step="25" value="300" title="Photos farther than this from the nearest RTU are flagged MISS">
      </div>
    </div>""",
        "maxDistFt UI",
    )

    # ── 9. UI: ZIP download button ──
    text = must_replace(
        text,
        """          <button class="ghost go" id="dlFolder">📁 Save renamed photos to “Renamed” folder</button>
          <button class="ghost" id="dlCsv">⬇ Download report (CSV)</button>""",
        """          <button class="ghost go" id="dlFolder">📁 Save renamed photos to “Renamed” folder</button>
          <button class="ghost" id="dlCsv">⬇ Download report (CSV)</button>
          <button class="ghost" id="dlZip">📦 Download renamed photos (ZIP)</button>""",
        "dlZip button",
    )

    # ── 10. CSS for distance colors ──
    text = must_replace(
        text,
        "  .err-line{color:#ff9a8d}",
        "  .err-line{color:#ff9a8d}\n  .dist-ok{color:var(--hit)} .dist-warn{color:var(--orange)} .dist-bad{color:var(--miss)}",
        "dist CSS",
    )

    # ── 11. runRenamer: alerts, dry-run perf, scope, max dist, merged EXIF ──
    text = must_replace(
        text,
        """  if(!state.rtus.length && !state.buildings.length){ alert('Load the RTU database first.'); return; }
  if(!state.photos.length){ alert('Choose some photos first.'); return; }""",
        """  if(!state.rtus.length && !state.buildings.length){
    log('Load the RTU database first.','err'); showErrorBanner('Load the RTU database first.'); return;
  }
  if(!state.photos.length){
    log('Choose some photos first.','err'); showErrorBanner('Choose some photos first.'); return;
  }""",
        "runRenamer alerts",
    )

    text = must_replace(
        text,
        """  /* load HEIC support only if the batch actually contains HEIC/HEIF */
  if(state.photos.some(p=>HEIF_EXTS.includes(p.ext))){
    log('iPhone HEIC photos detected — loading the HEIC converter…');
    await lazyHeic();
  }""",
        """  /* load HEIC support only when we will preview/convert (skip in dry run) */
  if(!dryRun && state.photos.some(p=>HEIF_EXTS.includes(p.ext))){
    log('iPhone HEIC photos detected — loading the HEIC converter…');
    await lazyHeic();
  }""",
        "dry run HEIC",
    )

    text = must_replace(
        text,
        """  /* Pass 1 — EXIF GPS + capture time + displayable blobs */
  const entries=[];
  for(const p of state.photos){
    let gps=null, dt=null;
    try{ const g=await exifr.gps(p.file); if(g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) gps={lat:g.latitude, lon:g.longitude}; }
    catch(e){}
    try{ const m=await exifr.parse(p.file, ['DateTimeOriginal','CreateDate','ModifyDate']);
         dt=m && (m.DateTimeOriginal||m.CreateDate||m.ModifyDate) || null; }
    catch(e){}
    let exifAll=null;
    try{ exifAll=await exifr.parse(p.file, true); }catch(e){}
    entries.push({...p, gps, dt, exifAll, displayBlob:null});
  }""",
        """  /* Pass 1 — EXIF GPS + capture time (single parse per photo) */
  const entries=[];
  for(const p of state.photos){
    let gps=null, dt=null, exifAll=null;
    try{
      exifAll=await exifr.parse(p.file, {gps:true, reviveValues:true});
      if(exifAll && Number.isFinite(exifAll.latitude) && Number.isFinite(exifAll.longitude))
        gps={lat:exifAll.latitude, lon:exifAll.longitude};
      dt=exifAll && (exifAll.DateTimeOriginal||exifAll.CreateDate||exifAll.ModifyDate) || null;
    }catch(e){}
    entries.push({...p, gps, dt, exifAll, displayBlob:null});
  }""",
        "merged EXIF",
    )

    text = must_replace(
        text,
        """  /* Assign purely by proximity: consider EVERY RTU and pick the closest by GPS. */
  const haveRtu = state.rtus.length>0;
  const targets = haveRtu ? state.rtus : state.buildings;

  /* Pass 2 — assign each GPS photo to the CLOSEST RTU by location. The (1)(2)(3)
     sequence within an RTU is ordered by capture time (assignSequencedNames). */
  const results=[];
  let done=0;
  for(const e of withGps){
    const {pos}=findClosest(e.gps.lat,e.gps.lon,targets);   // closest RTU by location
    const t=targets[pos];
    const fileExt=lowerExt(e.name);
    const willConvert = convHeic && HEIF_EXTS.includes(fileExt) && HEIC_OK;
    const outExt = willConvert ? '.jpg' : ext(e.name);
    const legacy = parseLegacyTags(e.name);
    const audit  = auditInfo(e.dt);
    const stem   = makeStem(t.address,t.rtu_name);
    const distFt = m2ft(haversineM(e.gps.lat,e.gps.lon,t.lat,t.lon));
    e.displayBlob = await toDisplayBlob(e.file);
    const url = e.displayBlob ? URL.createObjectURL(e.displayBlob) : null;
    results.push({
      original:e.name, new_name:'',
      status:'HIT', address:t.address, rtu_name:t.rtu_name||'',
      dist_ft:Math.round(distFt*10)/10,""",
        """  /* Scope RTUs to photographed building(s), then pick closest within scope. */
  const haveRtu = state.rtus.length>0;
  const baseTargets = haveRtu ? state.rtus : state.buildings;
  const coords = withGps.map(e=>[e.gps.lat, e.gps.lon]);
  const targets = haveRtu ? scopeTargets(coords, baseTargets) : baseTargets;
  const maxDistFt = Math.max(25, parseFloat($('maxDistFt')?.value) || DEFAULT_MAX_DIST_FT);

  /* Pass 2 — assign each GPS photo to the closest RTU; flag MISS when beyond maxDistFt. */
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
      dist_ft:distFt,""",
        "runRenamer matching",
    )

    # Fix target_lat for MISS rows
    text = must_replace(
        text,
        """      photo_lat:e.gps.lat, photo_lon:e.gps.lon,
      target_lat:t.lat, target_lon:t.lon,
      converted:willConvert,
      url, srcFile:e.file, displayBlob:e.displayBlob, outExt, dt:e.dt||null, _exifAll:e.exifAll||null,
      _stem:stem, _legacy:legacy, _auditYear:audit.year, _auditTime:audit.time
    });
    if(++done % 5===0) log('Placed '+done+' / '+withGps.length+'…');
  }""",
        """      photo_lat:e.gps.lat, photo_lon:e.gps.lon,
      target_lat: within ? t.lat : null, target_lon: within ? t.lon : null,
      converted:willConvert,
      url, srcFile:e.file, displayBlob:e.displayBlob, outExt, dt:e.dt||null, _exifAll:e.exifAll||null,
      _stem:stem, _legacy:legacy, _auditYear:audit.year, _auditTime:audit.time
    });
    if(!within && distFt > maxDistFt) log('MISS: '+e.name+' is '+distFt+' ft from '+t.rtu_name+' (max '+maxDistFt+' ft)','warn');
    if(++done % 5===0) log('Matched '+done+' / '+withGps.length+'…');
  }
  const hits=results.filter(x=>x.status==='HIT').length, misses=results.filter(x=>x.status==='MISS').length;
  log('Within '+maxDistFt+' ft: '+hits+' HIT, '+misses+' MISS.','ok');""",
        "MISS target coords",
    )

    # ── 12. assignSequencedNames only for HIT (already filters HIT) - MISS gets name in assignSequencedNames? It filters HIT only. Need to set new_name for MISS
    # Check assignSequencedNames - only HIT with _stem. MISS rows need a default new_name
    text = must_replace(
        text,
        """  /* Sequence per RTU, ordered by audit date (capture time); undated photos last */
  assignSequencedNames(results);

  state.results=results;""",
        """  /* Sequence per RTU, ordered by audit date (capture time); undated photos last */
  assignSequencedNames(results);
  results.filter(x=>x.status==='MISS' && !x.new_name).forEach(x=>{
    x.new_name = (x.original||'').startsWith('!') ? x.original : '!'+x.original;
  });

  state.results=results;""",
        "MISS names",
    )

    # ── 13. renderReport distance coloring ──
    text = must_replace(
        text,
        """    // Dist
    const tdD=document.createElement('td'); tdD.textContent=(x.dist_ft==null?'—':x.dist_ft); tr.appendChild(tdD);""",
        """    // Dist (color by proximity)
    const tdD=document.createElement('td');
    if(x.dist_ft==null) tdD.textContent='—';
    else {
      const maxD=Math.max(25, parseFloat($('maxDistFt')?.value)||DEFAULT_MAX_DIST_FT);
      tdD.textContent=String(x.dist_ft);
      tdD.className = x.dist_ft<=maxD*0.5 ? 'dist-ok' : (x.dist_ft<=maxD ? 'dist-warn' : 'dist-bad');
    }
    tr.appendChild(tdD);""",
        "dist coloring",
    )

    # ── 14. buildDownloads + wire dlZip ──
    text = must_replace(
        text,
        "function buildDownloads(){ /* lazy — built on click */ }",
        "function buildDownloads(){ const z=$('dlZip'); if(z) z.disabled = !state.results.some(x=>x.status!=='NO_GPS' && x.srcFile); }",
        "buildDownloads",
    )

    text = must_replace(
        text,
        "$('dlCsv').addEventListener('click', downloadCsv);",
        "$('dlCsv').addEventListener('click', downloadCsv);\n$('dlZip').addEventListener('click', downloadZip);",
        "dlZip wire",
    )

    # ── 15. Editor stampInfo uses drawStampBar ──
    text = must_replace(
        text,
        """    const fs=Math.max(16, Math.round(img.width/42));
    const padX=Math.round(fs*0.7), padY=Math.round(fs*0.45), barH=fs+padY*2;
    g.fillStyle='rgba(0,0,0,0.55)'; g.fillRect(0, img.height-barH, img.width, barH);
    g.font='600 '+fs+'px Segoe UI,Arial,sans-serif'; g.textBaseline='middle'; g.textAlign='left';
    g.fillStyle='#000'; g.fillText(line, padX+1, img.height-barH/2+1);   // subtle shadow
    g.fillStyle='#ffffff'; g.fillText(line, padX, img.height-barH/2);
    history.push(img); img=c; previewImg=null; applyFit();""",
        """    drawStampBar(g, img.width, img.height, line);
    history.push(img); img=c; previewImg=null; applyFit();""",
        "editor stampInfo",
    )

    # ── 16. Fix setMode text toolbar ──
    text = must_replace(
        text,
        "$('edTextToolsBar').style.display = m==='text'?'flex':'flex';",
        "$('edTextToolsBar').style.display = m==='text'?'flex':'none';",
        "setMode",
    )

    # ── 17. Softer reset (keep DB if loaded) ──
    text = must_replace(
        text,
        "$('clearBtn').addEventListener('click', ()=>location.reload());",
        """$('clearBtn').addEventListener('click', ()=>{
  if(!confirm('Clear photos and results? The loaded database is kept.')) return;
  state.photos=[]; state.results=[]; state.convertedToJpg=false; state.photoDirHandle=null;
  $('dirName').textContent='No folder chosen'; $('filesName').textContent='None selected';
  $('reportCard').classList.add('hidden'); $('mapCard').classList.add('hidden'); $('tableCard').classList.add('hidden');
  $('zipMsg').textContent=''; checkReady();
});""",
        "clearBtn",
    )

    # ── 18. Update note about API key ──
    text = must_replace(
        text,
        "      results are offered as a downloadable copy. The API key lives only in this page on your machine.</p>",
        "      results are offered as a downloadable copy. Enter your own Google Maps API key above — it is not saved to disk.</p>",
        "api key note",
    )

    HTML_PATH.write_text(text, encoding="utf-8")
    new_len = len(text)
    print(f"Patched {HTML_PATH.name}: {original_len:,} -> {new_len:,} bytes ({100*(original_len-new_len)/original_len:.1f}% smaller)")


if __name__ == "__main__":
    main()
