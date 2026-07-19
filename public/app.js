(function(){
  var ALL = window.SC_DATA;
  if(!ALL){ document.body.innerHTML = "<p style='color:#fff;padding:40px;font-family:sans-serif'>data.js not found.</p>"; return; }

  var WORKSPACES = ["g2g", "pipwave"];
  var WINDOWS = ["today", "week", "month", "all"];
  var ws = "g2g", win = "week";
  try{ var sv = sessionStorage.getItem("pitwall_ws"); if(WORKSPACES.indexOf(sv) >= 0) ws = sv; }catch(e){}
  try{ var sw = sessionStorage.getItem("pitwall_win"); if(WINDOWS.indexOf(sw) >= 0) win = sw; }catch(e){}
  (function(){ var h=(location.hash||"").replace(/^#\/?/,"").split("/"); if(WORKSPACES.indexOf(h[0])>=0) ws=h[0]; if(WINDOWS.indexOf(h[1])>=0) win=h[1]; })();  // URL wins: #/ws/win
  if(!ALL[ws]) ws = Object.keys(ALL)[0];
  if(!ALL[ws][win]) win = Object.keys(ALL[ws])[0];

  function dataset(){ return ALL[ws] && ALL[ws][win]; }
  var D = dataset();
  if(!D){ document.body.innerHTML = "<p style='color:#fff;padding:40px;font-family:sans-serif'>data.js missing the '"+ws+"/"+win+"' dataset.</p>"; return; }

  var sectorVar = { silver:"--silver",purple:"--purple",red:"--red",green:"--green",yellow:"--yellow",cyan:"--cyan",teal:"--teal" };
  var LOGOS = { g2g:"logos/g2g.png", pipwave:"logos/pipwave.png" };
  var selectedKey = null;
  var curFeedMetric = null, curAccent = "var(--silver)";
  var curFeedStories = [];

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function fmtTime(iso){
    try{ return new Date(iso).toLocaleString("en-GB",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}); }
    catch(e){ return iso; }
  }

  function setText(id, t){ var el=document.getElementById(id); if(el) el.textContent=t; }
  function renderHeader(){
    setText("driver", D.meta.driver);
    setText("driverno", "#22");
    setText("mention", D.meta.mention);
    setText("workspace", D.meta.workspace);
    setText("snapTime", fmtTime(D.meta.generatedAt));
    setText("footMeta", D.meta.workspace + " · " + (D.meta.windowLabel || "").toUpperCase());
    var wsSeg = document.getElementById("wsSeg");
    if(wsSeg){ wsSeg.querySelectorAll("a").forEach(function(a){ a.classList.toggle("active", a.dataset.ws===ws); }); }
    var winSeg = document.getElementById("winSeg");
    if(winSeg){ winSeg.querySelectorAll("a").forEach(function(a){ a.classList.toggle("active", a.dataset.win===win); }); }
    var hero = document.getElementById("wsLogoHero");
    if(hero && LOGOS[ws]){ hero.src = LOGOS[ws]; hero.alt = D.meta.workspace; }
    checkFreshness();
  }

  function buildTower(animate){
    var tower = document.getElementById("tower");
    tower.innerHTML = "";
    D.metrics.forEach(function(m, idx){
      var row = document.createElement("div");
      row.className = "row s-"+m.sector;
      if(animate){ row.style.animation = "rowIn .5s ease forwards"; row.style.animationDelay = (0.1*idx + 0.08)+"s"; }
      else { row.style.opacity = 1; row.style.transform = "none"; }
      row.dataset.key = m.key;
      row.setAttribute("role","button"); row.setAttribute("tabindex","0"); row.setAttribute("aria-pressed","false");
      row.setAttribute("aria-label", m.label+" — "+m.value+(m.note?" approx":"")+" stories");
      var extra="";                                                   // Tested tile carries a 6-week sparkline + ▲/▼ delta
      if(m.key==="tested" && D.form && D.form.length>=2){
        var dd=testedDelta();
        var chip = dd==null ? "" : '<span class="delta '+(dd>0?"up":dd<0?"down":"flat")+'" title="vs last week">'+(dd>0?"▲":dd<0?"▼":"±")+Math.abs(dd)+'</span>';
        extra='<div class="r-spark" aria-hidden="true">'+sparkSVG(D.form.map(function(x){return x.tested||0;}))+chip+'</div>';
      }
      row.innerHTML =
        '<div class="pos">'+m.pos+'</div>'+
        '<div class="r-main"><div class="r-label">'+esc(m.label)+'</div><div class="r-sub">'+esc(m.sub)+'</div>'+extra+'</div>'+
        '<div class="r-val">'+m.value+'<small>'+(m.note?'≈ FUZZY':'STORIES')+'</small></div>';
      row.addEventListener("click", function(){ select(m.key); });
      row.addEventListener("keydown", function(ev){
        if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); select(m.key); }
        else if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){ ev.preventDefault(); moveTowerSelection(ev.key==="ArrowDown"?1:-1); }
      });
      tower.appendChild(row);
    });
  }

  function select(key){
    var m = D.metrics.filter(function(x){return x.key===key;})[0];
    if(!m) return;
    selectedKey = key;
    document.querySelectorAll(".row").forEach(function(r){ var on=r.dataset.key===key; r.classList.toggle("active", on); r.setAttribute("aria-pressed", on?"true":"false"); });

    var accent = "var("+sectorVar[m.sector]+")";
    var feedName = document.getElementById("feedName");
    feedName.textContent = m.label;
    feedName.style.setProperty("--accent", accent);
    feedName.style.color = accent;
    var fq = document.getElementById("feedQuery"); if(fq) fq.style.display = "none";

    document.getElementById("feedBig").innerHTML = m.value + '<span class="unit">'+(m.note?'≈':'')+'</span>';

    var note = document.getElementById("feedNote");
    if(m.note){ note.style.display="flex"; document.getElementById("feedNoteTxt").textContent = m.note; }
    else { note.style.display="none"; }

    curFeedMetric = m; curAccent = accent;
    var order = document.getElementById("order");
    order.scrollTop = 0;
    curFeedStories = m.stories.slice();
    order.innerHTML = curFeedStories.length
      ? (feedLead() + curFeedStories.map(function(s,i){ return rowHTML(s,i,accent); }).join(""))
      : '<div class="empty"><span class="chk"></span>No cars on the grid for this window.</div>';
    updateFeedHint();
  }

  function feedLead(){ return '<div class="lead"><span>Pos</span><span>Story</span><span class="r">Tyre · Status</span></div>'; }
  // stint age → tyre compound (fresh=soft, aging=medium, stale=hard)
  function tyreFor(updated){
    if(!updated) return null;
    var d = (Date.now() - new Date(updated)) / 86400000;
    if(isNaN(d)) return null;
    var age = d < 1 ? Math.round(d*24)+"h" : Math.round(d)+"d";
    if(d <= 3)  return {cls:"s", lab:"S", title:"Soft · "+age+" in stint"};
    if(d <= 10) return {cls:"m", lab:"M", title:"Medium · "+age+" in stint"};
    return {cls:"h", lab:"H", title:"Hard · "+age+" in stint — going off"};
  }
  function rowHTML(s, i, accent){
    var ty = tyreFor(s.updated);
    var tyre = ty ? '<span class="tyre tyre-'+ty.cls+'" title="'+esc(ty.title)+'">'+ty.lab+'</span>' : '';
    return '<div class="lb-row'+(i<3?" p"+(i+1):"")+'" data-i="'+i+'" style="--accent:'+accent+'">'+
      '<div class="lb-pos">'+(i+1)+'</div>'+
      '<div class="lb-name">'+esc(s.name)+'</div>'+
      '<div class="lb-meta">'+tyre+'<span class="lb-mtxt"><span class="lb-id">#'+s.id+'</span><span class="lb-state">'+esc(s.state)+'</span></span></div>'+
    '</div>';
  }
  // ---- broadcast lower-third ticker ----
  function renderTicker(items){
    var track=document.getElementById("tkTrack"); if(!track) return;
    var msgs = (items && items.length) ? items.slice(0,20).map(function(a){
      return a.kind==="comment" ? ("💬 "+a.who+" — "+a.name)
                                 : ("🏁 Assigned · "+a.name+" → "+a.state);
    }) : ["Listening on the timing screens…", "Pit Wall · live QA telemetry", "Box, box — keep the queue clear"];
    var seq = msgs.concat(msgs);   // duplicate for a seamless loop
    track.innerHTML = seq.map(function(t){ return '<span class="tk-item">'+esc(t)+'</span>'; }).join("");
    // constant calm speed (~28px/s) regardless of how much content
    var oneSet = track.scrollWidth / 2;
    track.style.animationDuration = Math.max(40, Math.round(oneSet / 28)) + "s";
  }

  function fmtDur(h){
    if(h==null) return "—";
    if(h < 1) return Math.round(h*60)+"m";
    if(h < 24) return (Math.round(h*10)/10)+"h";
    var d=Math.floor(h/24), r=Math.round(h%24);
    return d+"d"+(r?(" "+r+"h"):"");
  }
  function metricMap(ds){ var m={}; (ds.metrics||[]).forEach(function(x){ m[x.key]=x.value; }); return m; }

  // ---- Constructors' Championship (cross-workspace, current window) ----
  function renderChampionship(){
    var board = document.getElementById("champBoard"); if(!board) return;
    var wl = document.getElementById("champWindow"); if(wl) wl.textContent = D.meta.windowLabel;
    var rows = Object.keys(ALL).map(function(k){
      var ds = ALL[k] && ALL[k][win]; if(!ds) return null;
      var m = metricMap(ds);
      var pts = (m.tested||0)*5 + (m.ready_for_qa||0)*3 + (m.test_cases_created||0)*2 + (m.ongoing_tasks||0)*1;
      return { key:k, name:ds.meta.workspace, m:m, pts:pts };
    }).filter(Boolean).sort(function(a,b){ return b.pts-a.pts; });
    var leader = rows.length ? rows[0].pts : 0;

    var html = '<div class="champ-row head"><span></span><span>Constructor</span>'+
      '<span class="r">Ongoing</span><span class="r">RFQA</span><span class="r">Bugs</span><span class="r">Tested</span><span class="r">Pts</span></div>';
    rows.forEach(function(r, i){
      var accent = "var("+(sectorVar[i===0?"yellow":(i===1?"silver":"red")])+")";
      var logo = LOGOS[r.key] ? '<img src="'+LOGOS[r.key]+'" alt="'+esc(r.name)+'">' : '';
      var gap = i===0 ? "—" : ("-"+(leader-r.pts));
      html +=
        '<div class="champ-row'+(i===0?" lead":"")+'" style="--wc:'+accent+'">'+
          '<div class="champ-pos">'+(i+1)+'</div>'+
          '<div class="champ-team">'+logo+'</div>'+
          '<div class="champ-num">'+(r.m.ongoing_tasks||0)+'</div>'+
          '<div class="champ-num">'+(r.m.ready_for_qa||0)+'</div>'+
          '<div class="champ-num">'+(r.m.bugs_reported||0)+'</div>'+
          '<div class="champ-num">'+(r.m.tested||0)+'</div>'+
          '<div class="champ-num pts">'+r.pts+'<span class="champ-num gap"> '+gap+'</span></div>'+
        '</div>';
    });
    html += '<div class="champ-foot">PTS = Tested×5 + Ready-for-QA×3 + Test Cases×2 + Ongoing×1 · '+esc(D.meta.windowLabel)+'</div>';
    board.innerHTML = html;
  }

  // ---- QA Circuit · real F1 track maps for the 2026 calendar (toggle between them) ----
  // Outlines projected + normalized from real circuit geometry; see circuits.js.
  var CIRCUITS = window.F1_CIRCUITS || [];
  var CIRCUIT_VB = window.F1_CIRCUIT_VB || "0 0 1000 563";
  var CIRCUIT_BY_ID = {}; CIRCUITS.forEach(function(c){ CIRCUIT_BY_ID[c.id]=c; });
  // featured circuit is randomised on every page load
  var curCircuit = CIRCUITS.length ? CIRCUITS[Math.floor(Math.random()*CIRCUITS.length)].id : "be-1925";
  // QA stages shown as cars circulating the track (coloured by stage)
  var CIRCUIT_STAGES = ["in_dev","ready_for_qa","tested","test_cases_created"];
  var circuitView = "track";   // "track" (single, with QA telemetry) | "grid" (2026 calendar overview)
  try{ var cvv = sessionStorage.getItem("pitwall_circuitview"); if(cvv==="grid"||cvv==="track") circuitView = cvv; }catch(e){}

  // 2026 calendar overview — every circuit as a mini outline with its country, like the event-calendar poster
  function renderCircuitGrid(){
    var el = document.getElementById("circuit"); if(!el) return;
    el.innerHTML = '<div class="circ-grid">' + CIRCUITS.map(function(c, i){
      return '<button class="circ-tile'+(c.id===curCircuit?' on':'')+'" data-cid="'+c.id+'" title="'+esc(c.country)+' · '+esc(c.locality)+'">'+
        '<span class="ct-rnd">R'+(i+1)+'</span>'+
        '<svg viewBox="'+CIRCUIT_VB+'" preserveAspectRatio="xMidYMid meet"><path class="circ-mini" d="'+c.d+'"/></svg>'+
        '<span class="ct-lab"><b>'+c.flag+' '+esc(c.country)+'</b><span>'+esc(c.locality)+'</span></span>'+
      '</button>';
    }).join("") + '</div>';
  }

  function renderCircuit(){
    var el = document.getElementById("circuit"); if(!el) return;
    if(circuitView === "grid"){ renderCircuitGrid(); return; }
    var cir = CIRCUIT_BY_ID[curCircuit] || CIRCUITS[0];
    if(!cir){ el.innerHTML = '<div class="f1-msg">No circuit data.</div>'; return; }
    var byKey = {}; D.metrics.forEach(function(m){ byKey[m.key]=m; });
    var cos = CIRCUIT_STAGES.filter(function(k){ return byKey[k]; });
    cos.sort(function(a,b){ return byKey[b].value - byKey[a].value; });   // rank by value: leading stat in front, others behind
    var maxV = Math.max.apply(null, cos.map(function(k){ return byKey[k].value; }).concat([0]));
    var legend = cos.map(function(k){
      var m = byKey[k], col = "var("+sectorVar[m.sector]+")", hot=m.value===maxV&&maxV>0;
      return '<div class="spa-leg'+(hot?' hot':'')+'" style="--cc:'+col+'">'+
        '<span class="lg-dot"></span>'+
        '<div class="lg-txt"><span class="lg-name">'+esc(m.label).toUpperCase()+'</span>'+
        '<span class="lg-val">'+m.value+'</span></div>'+
        (hot?'<span class="lg-flag">🏎️</span>':'')+
      '</div>';
    }).join("");
    var total = cos.reduce(function(t,k){ return t+byKey[k].value; }, 0);

    // one car per QA stage, in that stage's colour, running as a tight pack around the outline
    var sectorHex = { silver:"#cfd6df",purple:"#b14dff",red:"#e10600",green:"#37d67a",yellow:"#ffd200",cyan:"#19c2e6",teal:"#1ee0c0" };
    var raceCols = cos.map(function(k){ return sectorHex[byKey[k].sector] || "#e10600"; });
    if(!raceCols.length) raceCols = ["#e10600"];
    var LAP_DUR = 92, PACK_GAP = 1.4;   // ~1:32 per lap — real-race pace
    var cars = raceCols.map(function(col, i){
      var begin = (-(i * PACK_GAP)).toFixed(2) + "s";
      return '<circle class="spa-car-glow" r="9" fill="'+col+'"><animateMotion dur="'+LAP_DUR+'s" begin="'+begin+'" repeatCount="indefinite"><mpath href="#circuitPath"/></animateMotion></circle>'+
             '<circle class="spa-car" r="5" fill="'+col+'"><animateMotion dur="'+LAP_DUR+'s" begin="'+begin+'" repeatCount="indefinite"><mpath href="#circuitPath"/></animateMotion></circle>';
    }).join("");

    // start/finish: a small chequered band at the circuit's start point, oriented to the track
    var st = cir.start || {x:0,y:0,a:0}, fCols=4, fRows=2, fCell=5, fW=fCols*fCell, fH=fRows*fCell, fSq="";
    for(var fr=0;fr<fRows;fr++) for(var fc=0;fc<fCols;fc++){ if((fr+fc)%2) continue;
      fSq+='<rect x="'+(fc*fCell)+'" y="'+(fr*fCell)+'" width="'+fCell+'" height="'+fCell+'" fill="#fff"/>'; }
    var finish='<g class="spa-finish" transform="translate('+(st.x-fW/2)+' '+(st.y-fH/2)+') rotate('+st.a+' '+(fW/2)+' '+(fH/2)+')">'+
      '<rect width="'+fW+'" height="'+fH+'" fill="#0a0d12"/>'+fSq+'</g>';

    el.innerHTML =
      '<div class="spa-plaque"><span class="spa-flag">'+(cir.flag||"🏁")+'</span><div class="spa-plaque-t">'+
        '<div class="pt">'+esc(cir.country)+'</div>'+
        '<div class="ps">'+esc(cir.locality)+' · '+total+' on track · '+esc(D.meta.windowLabel)+'</div>'+
      '</div></div>'+
      '<div class="spa-body">'+
        '<svg class="spa-track" viewBox="'+CIRCUIT_VB+'" preserveAspectRatio="xMidYMid meet">'+
          '<path id="circuitPath" class="spa-bed" d="'+cir.d+'"/>'+
          '<path class="spa-line" d="'+cir.d+'"/>'+
          '<path class="spa-core" d="'+cir.d+'"/>'+
          finish+
          cars+
        '</svg>'+
        '<div class="spa-legend">'+legend+'</div>'+
      '</div>';
  }
  // wire the Track ↔ Calendar-grid view toggle and grid selection
  (function wireCircuitSelector(){
    if(!CIRCUITS.length) return;
    var vt = document.getElementById("circView");
    function syncView(){
      if(vt) vt.querySelectorAll("a").forEach(function(a){ a.classList.toggle("active", a.dataset.cv===circuitView); });
    }
    if(vt) vt.addEventListener("click", function(ev){
      var a = ev.target.closest("a"); if(!a) return;
      circuitView = a.dataset.cv;
      try{ sessionStorage.setItem("pitwall_circuitview", circuitView); }catch(e){}
      syncView(); renderCircuit();
    });
    syncView();
    // circuits are chosen only from the grid — click a tile to feature it in the single-track view
    var circEl = document.getElementById("circuit");
    if(circEl) circEl.addEventListener("click", function(ev){
      var tile = ev.target.closest(".circ-tile"); if(!tile) return;
      curCircuit = tile.dataset.cid;
      circuitView = "track";
      try{ sessionStorage.setItem("pitwall_circuitview", "track"); }catch(e){}
      syncView(); renderCircuit();
    });
  })();

  // ---- Pace · Fastest Lap + Sectors ----
  function renderPace(){
    var el = document.getElementById("pace"); if(!el) return;
    var p = D.pace;
    if(!p){ el.innerHTML = '<div class="pace-empty">Click <b>Sync</b> to compute lap times from Shortcut.</div>'; return; }
    var base = D.meta.baseUrl;
    function storyLink(s){ return s ? '<a href="'+(s.url||(base+s.id))+'" target="_blank" rel="noopener">#'+s.id+' · '+esc(s.name)+'</a>' : ''; }
    var html =
      '<div class="lap-hero">'+
        '<div class="lh-lab">⚡ Fastest Lap · started → tested</div>'+
        '<div class="lh-val">'+fmtDur(p.fastestLapHours)+'</div>'+
        storyLink(p.fastestStory)+
      '</div>'+
      '<div class="pace-row">'+
        '<div class="pace-cell"><div class="pc-lab">Average Lap</div><div class="pc-val">'+fmtDur(p.avgLapHours)+'</div><div class="pc-lab" style="margin-top:4px">over '+(p.lapCount||0)+' tested</div></div>'+
        '<div class="pace-cell tyre-cell"><div class="pc-lab">🛞 Tyre Age · oldest RFQA</div><div class="pc-val">'+(p.tyreAgeDays!=null?p.tyreAgeDays+"d":"—")+'</div>'+storyLink(p.tyreStory)+'</div>'+
      '</div>';
    var secs = D.sectors || [];
    var maxD = Math.max.apply(null, secs.map(function(s){return s.days||0;}).concat([0.1]));
    secs.forEach(function(s){
      var pct = s.days!=null ? Math.max(4, Math.round((s.days/maxD)*100)) : 0;
      html += '<div class="sector"><div class="s-lab"><b>'+esc(s.label)+'</b><span>'+esc(s.sub)+'</span></div>'+
        '<div class="s-bar"><div class="s-fill" style="width:'+pct+'%"></div></div>'+
        '<div class="s-val">'+(s.days!=null?s.days+"d":"—")+'</div></div>';
    });
    el.innerHTML = html;
  }

  // ---- Form Guide (6-week tested) + Race Control ----
  function renderForm(){
    var el = document.getElementById("form"); if(!el) return;
    var head = document.getElementById("formHead");
    var f = D.form;
    if(!f || !f.length){ el.innerHTML = '<div class="pace-empty">Click <b>Sync</b> to load the 6-week trend.</div>'; if(head) head.innerHTML=""; return; }
    var maxV = Math.max.apply(null, f.map(function(x){return x.tested;}).concat([1]));
    var bestI = f.reduce(function(bi,x,i){ return x.tested>f[bi].tested?i:bi; }, 0);
    if(head){
      var total=f.reduce(function(t,x){ return t+(x.tested||0); }, 0);
      var streak=0; for(var si=f.length-1; si>=0; si--){ if((f[si].tested||0)>0) streak++; else break; }
      var dd=testedDelta();
      var deltaTxt = dd==null ? "" : ' <span class="fh-delta '+(dd>0?"up":dd<0?"down":"flat")+'">'+(dd>0?"▲":dd<0?"▼":"±")+Math.abs(dd)+'</span>';
      head.innerHTML =
        '<div class="fh-cell"><b>'+total+'</b><span>6-wk tested'+deltaTxt+'</span></div>'+
        '<div class="fh-cell"><b>'+f[bestI].tested+'</b><span>best · '+esc(f[bestI].label)+'</span></div>'+
        '<div class="fh-cell"><b>'+streak+'</b><span>week streak</span></div>';
    }
    el.innerHTML = f.map(function(x, i){
      var h = Math.max(3, Math.round((x.tested/maxV)*100));
      var cls = "fbar" + (i===bestI&&x.tested>0?" best":"") + (i===f.length-1?" now":"");
      return '<div class="'+cls+'"><div class="fb-cnt">'+x.tested+'</div>'+
        '<div class="fb-track"><div class="fb-fill" style="height:'+h+'%"></div></div>'+
        '<div class="fb-wk">'+esc(x.label)+'</div></div>';
    }).join("");
  }

  function renderRaceControl(){
    var el = document.getElementById("raceControl"); if(!el) return;
    var m = metricMap(D);
    var rfqa = m.ready_for_qa||0, nd = m.new_defect_week||0, tested = m.tested||0;
    var tyre = D.pace && D.pace.tyreAgeDays;
    var kind="green", badge="GREEN FLAG", msg="Track clear — "+tested+" tested, pace steady.";
    if(rfqa >= 10){ kind="red"; badge="BOX BOX"; msg=rfqa+" cars queued for QA — box this lap to clear the pit lane."; }
    else if(nd > 0){ kind="yellow"; badge="YELLOW FLAG"; msg=nd+" new defect"+(nd>1?"s":"")+" reported this week — debris on track."; }
    else if(tyre != null && tyre > 14){ kind="yellow"; badge="TYRE WARNING"; msg="Oldest Ready-for-QA story is "+tyre+"d old — heavy degradation."; }
    else if(rfqa > 0){ kind="yellow"; badge="WAITING"; msg=rfqa+" car"+(rfqa>1?"s":"")+" in the QA queue."; }
    el.className = "rc " + kind;
    el.innerHTML = '<span class="rc-badge">'+badge+'</span><span>'+esc(msg)+'</span>';
  }

  function renderAll(animate){
    renderHeader();
    buildTower(animate);
    var key = (selectedKey && D.metrics.some(function(x){return x.key===selectedKey;}))
      ? selectedKey
      : ((D.metrics.filter(function(x){return x.key==="ready_for_qa";})[0] || D.metrics[0]).key);
    select(key);
    renderChampionship();
    renderCircuit();
    renderPace();
    renderForm();
    renderRaceControl();
  }

  // ---- toast ----
  var toastT;
  function toast(msg, kind){
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ el.className = "toast " + (kind || ""); }, 4200);
  }

  // ---- Workspace + Window selectors (switch dataset in place) ----
  function setWorkspace(w){
    if(!ALL[w]) return;
    ws = w;
    try{ sessionStorage.setItem("pitwall_ws", w); }catch(e){}
    if(!ALL[ws][win]) win = Object.keys(ALL[ws])[0];
    D = dataset();
    writeHash();
    renderAll(false);
  }
  function setWindow(v){
    if(!ALL[ws][v]) return;
    win = v;
    try{ sessionStorage.setItem("pitwall_win", v); }catch(e){}
    D = dataset();
    writeHash();
    renderAll(false);
  }
  var wsSegEl = document.getElementById("wsSeg");
  if(wsSegEl){ wsSegEl.querySelectorAll("a").forEach(function(a){
    a.addEventListener("click", function(ev){ ev.preventDefault(); setWorkspace(a.dataset.ws); }); }); }
  var winSegEl = document.getElementById("winSeg");
  if(winSegEl){ winSegEl.querySelectorAll("a").forEach(function(a){
    a.addEventListener("click", function(ev){ ev.preventDefault(); setWindow(a.dataset.win); }); }); }

  // ---- trend helpers: Tested-tile sparkline + week-over-week delta ----
  function sparkSVG(vals){
    var w=58, h=16;
    if(!vals || vals.length<2) return "";
    var max=Math.max.apply(null, vals.concat([1])), n=vals.length;
    var pts=vals.map(function(v,i){ var x=(i/(n-1))*(w-2)+1; var y=h-2-((v/max)*(h-4)); return x.toFixed(1)+","+y.toFixed(1); }).join(" ");
    var lx=w-1, ly=h-2-((vals[n-1]/max)*(h-4));
    return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none">'+
      '<polyline points="'+pts+'" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="1.6" fill="currentColor"/></svg>';
  }
  function testedDelta(){ var f=D.form; if(!f||f.length<2) return null; return (f[f.length-1].tested||0)-(f[f.length-2].tested||0); }

  // ---- URL deep-linking: reflect ws/win in the hash so views are bookmarkable ----
  function writeHash(){ try{ var nh="#/"+ws+"/"+win; if(location.hash!==nh) history.replaceState(null,"",nh); }catch(e){} }
  window.addEventListener("hashchange", function(){
    var h=(location.hash||"").replace(/^#\/?/,"").split("/"), changed=false;
    if(WORKSPACES.indexOf(h[0])>=0 && ALL[h[0]] && h[0]!==ws){ ws=h[0]; changed=true; }
    if(WINDOWS.indexOf(h[1])>=0 && ALL[ws] && ALL[ws][h[1]] && h[1]!==win){ win=h[1]; changed=true; }
    if(changed){ try{ sessionStorage.setItem("pitwall_ws",ws); sessionStorage.setItem("pitwall_win",win); }catch(e){} D=dataset(); renderAll(false); }
  });
  writeHash();

  // ---- Timing Tower keyboard navigation ----
  function moveTowerSelection(dir){
    if(!D || !D.metrics || !D.metrics.length) return;
    var keys=D.metrics.map(function(m){ return m.key; });
    var i=keys.indexOf(selectedKey); if(i<0) i=0;
    i=(i+dir+keys.length)%keys.length;
    select(keys[i]);
    var row=document.querySelector('.row[data-key="'+keys[i]+'"]');
    if(row){ if(row.scrollIntoView) row.scrollIntoView({block:"nearest"}); if(row.focus) row.focus(); }
  }

  // ---- global keyboard shortcuts (S sync · 1–4 timeframe · G/P workspace · J/K metric · ? help) ----
  function typingCtx(e){ var t=e.target, tag=t&&t.tagName; return tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||(t&&t.isContentEditable); }
  function overlayOpen(){
    if(document.querySelector(".fmodal.show")) return true;
    var s=document.getElementById("saver"); if(s && s.classList.contains("show")) return true;
    var a=document.getElementById("aiPanel"); if(a && a.classList.contains("show")) return true;
    return false;
  }
  document.addEventListener("keydown", function(e){
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    if(typingCtx(e) || overlayOpen()) return;
    var app=document.getElementById("app");
    var inSub = app && (app.classList.contains("pdk-mode")||app.classList.contains("garage-mode")||app.classList.contains("f1-mode"));
    var k=e.key;
    if(k==="s"||k==="S"){ e.preventDefault(); doSync(false); }
    else if(k==="?"){ e.preventDefault(); toast("Shortcuts · S sync · 1–4 timeframe · G/P workspace · J/K metric · Esc close",""); }
    else if(inSub){ return; }                                        // 1–4 / G/P / J-K only apply on the Board
    else if(k>="1" && k<="4"){ e.preventDefault(); setWindow(WINDOWS[+k-1]); }
    else if(k==="g"||k==="G"){ e.preventDefault(); setWorkspace("g2g"); }
    else if(k==="p"||k==="P"){ e.preventDefault(); setWorkspace("pipwave"); }
    else if(k==="j"||k==="J"){ e.preventDefault(); moveTowerSelection(1); }
    else if(k==="k"||k==="K"){ e.preventDefault(); moveTowerSelection(-1); }
  });

  // ---- modal focus trap: keep Tab inside an open .fmodal ----
  document.addEventListener("keydown", function(e){
    if(e.key!=="Tab") return;
    var modal=document.querySelector(".fmodal.show"); if(!modal) return;
    var f=Array.prototype.filter.call(
      modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      function(el){ return el.offsetParent!==null; });
    if(!f.length) return;
    var first=f[0], last=f[f.length-1];
    if(!modal.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  });

  // ---- Telemetry feed hint (the list itself scrolls inside the section) ----
  function updateFeedHint(){
    var h = document.getElementById("feedHint"); if(!h || !curFeedMetric) return;
    var n = curFeedMetric.stories.length, tot = curFeedMetric.value;
    h.textContent = n ? ("Top " + n + (tot > n ? (" of " + tot) : "") + " · click to edit") : "No runners";
  }

  // ---- Running order: paste a mixed g2g/pipwave list → pull the stories into a clickable to-do list ----
  function getOrder(){
    try{ var a=JSON.parse(localStorage.getItem("pitwall_order"))||[];
      return a.map(function(x){ return typeof x==="number" ? {id:x,ws:null} : {id:+x.id, ws:x.ws||null}; });
    }catch(e){ return []; }
  }
  function saveOrder(list){ try{ localStorage.setItem("pitwall_order", JSON.stringify(list)); }catch(e){} }
  function getDone(){ try{ return JSON.parse(localStorage.getItem("pitwall_order_done"))||{}; }catch(e){ return {}; } }
  function setDone(d){ try{ localStorage.setItem("pitwall_order_done", JSON.stringify(d)); }catch(e){} }
  // pull story refs out of pasted text, tagging the workspace when a Shortcut URL reveals it
  function parseOrder(text){
    var out=[], seen={}, re=/(?:(g2g|pipwave)\/story\/|sc-|#)?(\d{3,})/gi, m;
    while((m=re.exec(text))){
      var w=m[1]?m[1].toLowerCase():null, id=+m[2], key=(w||"")+":"+id;
      if(!seen[key]){ seen[key]=1; out.push({id:id, ws:w}); }
    }
    return out;
  }
  var orderResolved = {};  // "<ws|?>:<id>" -> {id,name,state,updated,ws} | {id,ws,error:true}
  // fetch one story from the server; for untagged IDs, try each workspace until one answers
  function pullStory(entry){
    var tries = entry.ws ? [entry.ws] : WORKSPACES.slice();
    function attempt(i){
      if(i>=tries.length) return Promise.resolve({id:entry.id, ws:entry.ws, error:true});
      var w=tries[i];
      return apiGet("/api/story/get?ws="+encodeURIComponent(w)+"&id="+entry.id).then(function(res){
        if(res && res.ok && res.story){ var s=res.story; return {id:s.id, name:s.name, state:s.state, updated:s.updated_at, ws:w}; }
        return attempt(i+1);
      }).catch(function(){ return attempt(i+1); });
    }
    return attempt(0);
  }
  function refreshOrderUI(){
    var ord=getOrder(), n=ord.length, g=0,p=0;
    ord.forEach(function(e){ if(e.ws==="g2g")g++; else if(e.ws==="pipwave")p++; });
    var stat=document.getElementById("orderStat");
    if(stat){
      if(!n) stat.textContent="Nothing pinned yet";
      else if(g||p) stat.textContent="g2g "+g+" · pipwave "+p+(n>g+p?(" · "+(n-g-p)+" untagged"):"");
      else stat.textContent=n+" stories";
    }
    var btn=document.getElementById("orderBtn");
    if(btn){ btn.classList.toggle("active", n>0); btn.textContent = n>0 ? "✎ Edit list" : "＋ Paste list"; }
  }
  function olRow(it, done){
    var isDone = !!done[it.ws+":"+it.id];
    var ty = tyreFor(it.updated);
    var tyre = ty ? '<span class="tyre tyre-'+ty.cls+'" title="'+esc(ty.title)+'">'+ty.lab+'</span>' : '';
    return '<div class="ol-row'+(isDone?" done":"")+'" data-ws="'+it.ws+'" data-id="'+it.id+'">'+
      '<button class="ol-check" type="button" title="Mark done" data-ws="'+it.ws+'" data-id="'+it.id+'">'+(isDone?"✓":"")+'</button>'+
      '<div class="ol-main"><div class="ol-name">'+esc(it.name||("#"+it.id))+'</div>'+
      '<div class="ol-sub">'+tyre+'<span class="ol-id">#'+it.id+'</span><span class="ol-state">'+esc(it.state||"")+'</span></div></div>'+
      '<span class="ol-go">›</span>'+
    '</div>';
  }
  function paintOrderList(items){
    var wrap=document.getElementById("orderList"); if(!wrap) return;
    var done=getDone(), html="";
    [{ws:"g2g",label:"G2G"},{ws:"pipwave",label:"Pipwave"}].forEach(function(grp){
      var rows=items.filter(function(it){ return it && !it.error && it.ws===grp.ws; });
      if(!rows.length) return;
      var left=rows.filter(function(it){ return !done[it.ws+":"+it.id]; }).length;
      html+='<div class="ol-group"><div class="ol-ghead">'+grp.label+' · '+left+' to go</div>'+
        '<div class="ol-rows">'+rows.map(function(it){ return olRow(it,done); }).join("")+'</div></div>';
    });
    var errs=items.filter(function(it){ return !it || it.error; });
    if(errs.length){ html+='<div class="ol-group"><div class="ol-ghead warn">Couldn’t pull · '+errs.length+'</div>'+
      '<div class="ol-rows">'+errs.map(function(it){ return '<div class="ol-row err"><div class="ol-main"><div class="ol-name">#'+((it&&it.id)||"?")+'</div><div class="ol-sub">not found in g2g or pipwave</div></div></div>'; }).join("")+'</div></div>'; }
    wrap.innerHTML = html || '<div class="ol-empty">No stories pulled.</div>';
  }
  function buildOrderList(){
    var wrap=document.getElementById("orderList"); if(!wrap) return;
    var empty=document.getElementById("orderEmpty");
    var ord=getOrder();
    if(!ord.length){ wrap.hidden=true; wrap.innerHTML=""; if(empty) empty.hidden=false; return; }
    wrap.hidden=false; if(empty) empty.hidden=true;
    if(!isServed){ wrap.innerHTML='<div class="ol-empty">Start the local server (node server.js) to pull stories.</div>'; return; }
    if(!wrap.innerHTML) wrap.innerHTML='<div class="ol-empty">Pulling '+ord.length+' stories…</div>';
    Promise.all(ord.map(function(e){
      var key=(e.ws||"?")+":"+e.id;
      if(orderResolved[key]) return Promise.resolve(orderResolved[key]);
      return pullStory(e).then(function(st){ orderResolved[key]=st; return st; });
    })).then(paintOrderList);
  }
  function toggleOrderDone(w,id){ var d=getDone(), k=w+":"+id; if(d[k]) delete d[k]; else d[k]=1; setDone(d); buildOrderList(); }
  function applyOrder(){
    var ta=document.getElementById("orderInput"); if(!ta) return;
    var list=parseOrder(ta.value); saveOrder(list); orderResolved={};
    refreshOrderUI();
    var wrap=document.getElementById("orderList"); if(wrap) wrap.innerHTML="";
    buildOrderList();
    var om=document.getElementById("orderModal"); if(om) om.classList.remove("show");
    toast(list.length ? ("Pulling "+list.length+" stories…") : "No story IDs found in that paste", list.length?"ok":"err");
  }
  function clearOrder(){
    saveOrder([]); orderResolved={};
    var ta=document.getElementById("orderInput"); if(ta) ta.value="";
    refreshOrderUI(); buildOrderList(); toast("Running order cleared","ok");
  }

  // ---- Story editor (state / comment / linked story) ----
  var isServed = location.protocol === "http:" || location.protocol === "https:";
  function apiPost(path, body){
    return fetch(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }).then(function(r){ return r.json(); });
  }
  function apiGet(path){ return fetch(path).then(function(r){ return r.json(); }); }
  // full-screen speed-sweep played when swapping between the QA / F1 / Paddock views
  function playViewWipe(){
    var w=document.getElementById("viewWipe"); if(!w) return;
    w.classList.remove("go"); void w.offsetWidth; w.classList.add("go");
    setTimeout(function(){ w.classList.remove("go"); }, 720);
  }
  function fmtTs(iso){
    if(!iso) return "";
    var d=new Date(iso), diff=(Date.now()-d)/1000;
    if(diff<60) return "just now";
    if(diff<3600) return Math.floor(diff/60)+"m ago";
    if(diff<86400) return Math.floor(diff/3600)+"h ago";
    return d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
  }
  function fmtFull(iso){
    if(!iso) return "—";
    var d=new Date(iso);
    return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+
           " · "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  }
  // render Shortcut markdown → sanitized HTML (formatting + images)
  function md(text){
    if(!text) return "";
    try{
      var html = window.marked ? marked.parse(text, {breaks:true, gfm:true}) : esc(text);
      return window.DOMPurify ? DOMPurify.sanitize(html) : html;
    }catch(e){ return esc(text); }
  }
  // route Shortcut images through the authenticated proxy + make every image open in a new tab
  function enhanceMedia(container){
    if(!container) return;
    var imgs = container.querySelectorAll("img");
    for(var i=0;i<imgs.length;i++){
      var im = imgs[i], src = im.getAttribute("src") || "";
      if(!/^https?:/i.test(src)) continue;
      var finalSrc = /(^|\.)shortcut\.com/i.test(src) ? ("/api/img?ws="+encodeURIComponent(ws)+"&u="+encodeURIComponent(src)) : src;
      im.setAttribute("src", finalSrc);
      im.setAttribute("loading", "lazy");
      if(!(im.parentNode && im.parentNode.tagName === "A")){
        var a = document.createElement("a");
        a.href = finalSrc; a.target = "_blank"; a.rel = "noopener"; a.title = "Open image in new tab";
        im.parentNode.insertBefore(a, im); a.appendChild(im);
      }
    }
  }
  function fillState(selId){
    var sel=document.getElementById("edState"); if(!sel) return;
    sel.innerHTML = (D.meta.states||[]).map(function(s){
      return '<option value="'+s.id+'"'+(s.id===selId?" selected":"")+'>'+esc(s.name)+(s.workflow?(" · "+esc(s.workflow)):"")+'</option>';
    }).join("");
  }
  function renderComments(list){
    var box=document.getElementById("edComments"); if(!box) return;
    if(!list || !list.length){ box.innerHTML='<div class="ed-empty">No comments yet.</div>'; return; }
    box.innerHTML = list.slice().reverse().map(function(c){   // latest first
      var edit = c.mine ? '<button class="ec-edit" data-id="'+c.id+'" type="button">Edit</button>' : '';
      return '<div class="ed-comment" data-id="'+c.id+'"><div class="ec-head"><span class="ec-who">'+esc(c.author||"Member")+
             '</span><span class="ec-meta">'+esc(fmtTs(c.ts))+edit+'</span></div><div class="ec-text md">'+md(c.text||"")+'</div></div>';
    }).join("");
    enhanceMedia(box);
  }
  var editStory = null, editDetail = null;
  function openEditor(st){
    if(!isServed){ toast("Start the local server (node server.js) to edit stories.", "err"); return; }
    editStory = st; editDetail = null;
    var modal = document.getElementById("editModal"); if(!modal) return;
    var t = document.getElementById("edTitle"); if(t){ t.textContent = "#"+st.id; t.style.color = curAccent; }
    var sub = document.getElementById("edSub"); if(sub) sub.textContent = st.name;
    var open = document.getElementById("edOpen"); if(open) open.href = D.meta.baseUrl + st.id;
    document.getElementById("edMeta").textContent = "Loading story…";
    fillState(null);
    setDescView("");
    descEditMode(false);
    document.getElementById("edSaved").textContent = "";
    document.getElementById("edComment").value = "";
    document.getElementById("edComments").innerHTML = '<div class="ed-empty">Loading…</div>';
    document.getElementById("edNewName").value = "";
    document.getElementById("edCreated").innerHTML = "";
    modal.classList.add("show");
    if(aiPanel && aiPanel.classList.contains("show")) openAi();   // keep the per-story Pit Crew chat synced to the open story
    apiGet("/api/story/get?ws="+encodeURIComponent(ws)+"&id="+st.id).then(function(res){
      if(!editStory || (editStory.id!==st.id)) return;          // a different story was opened meanwhile
      var meta = document.getElementById("edMeta");
      if(!res.ok){ meta.textContent = "Couldn't load story: "+(res.error||"?"); return; }
      var s = res.story; editDetail = s;
      var tp = (s.story_type||"").toLowerCase();
      var owners = (s.owners && s.owners.length) ? esc(s.owners.join(", ")) : "—";
      var est = (s.estimate!=null) ? (s.estimate+" pts") : "—";
      meta.innerHTML =
        '<div class="em-item"><div class="em-k">Type</div><div class="em-v"><span class="ed-badge '+esc(tp)+'">'+esc(s.story_type||"story")+'</span></div></div>'+
        '<div class="em-item"><div class="em-k">Estimate</div><div class="em-v">'+est+'</div></div>'+
        '<div class="em-item"><div class="em-k">Owners</div><div class="em-v">'+owners+'</div></div>'+
        '<div class="em-item"><div class="em-k">Updated</div><div class="em-v">'+esc(fmtFull(s.updated_at))+'</div></div>';
      document.getElementById("edSub").textContent = s.name;
      fillState(s.workflow_state_id);
      setDescView(s.description || "");
      descEditMode(false);
      renderComments(s.comments);
    }).catch(function(e){ var m=document.getElementById("edMeta"); if(m) m.textContent = "Couldn't load story: "+e.message; });
  }
  function closeEditor(){ var m=document.getElementById("editModal"); if(m) m.classList.remove("show"); }

  function busy(btn, on, idle){ if(!btn) return; btn.disabled=on; btn.textContent = on ? "…" : idle; }

  // ---- status: independent update ----
  var edStateSave = document.getElementById("edStateSave");
  if(edStateSave) edStateSave.addEventListener("click", function(){
    if(!editStory) return;
    var sel=document.getElementById("edState"), opt=sel.options[sel.selectedIndex];
    var stateName = opt.textContent.split(" · ")[0];
    var saved=document.getElementById("edStateSaved"); if(saved) saved.textContent="";
    busy(edStateSave, true, "Update");
    apiPost("/api/story/update", { ws:ws, id:editStory.id, stateId:+sel.value }).then(function(res){
      if(res.ok){
        editStory.state = stateName;
        if(editDetail){ editDetail.state=stateName; editDetail.workflow_state_id=+sel.value; }
        select(selectedKey);
        if(saved) saved.textContent="✓ Saved";
        toast("#"+editStory.id+" → "+stateName, "ok");
      } else toast("Update failed: "+(res.error||"?"), "err");
    }).catch(function(e){ toast("Update failed: "+e.message, "err"); }).finally(function(){ busy(edStateSave, false, "Update"); });
  });

  // ---- description: read-only view, edit on demand ----
  function setDescView(text){
    var v=document.getElementById("edDescView"); if(!v) return;
    if(text && text.trim()){ v.innerHTML=md(text); v.classList.remove("empty"); v.classList.add("md"); enhanceMedia(v); }
    else { v.textContent="No description yet."; v.classList.remove("md"); v.classList.add("empty"); }
  }
  function descEditMode(on){
    var wrap=document.getElementById("edDescEditWrap"), view=document.getElementById("edDescView"), btn=document.getElementById("edDescEdit");
    if(wrap) wrap.hidden = !on;
    if(view) view.style.display = on ? "none" : "";
    if(btn) btn.style.display = on ? "none" : "";
  }
  var edDescEdit = document.getElementById("edDescEdit");
  if(edDescEdit) edDescEdit.addEventListener("click", function(){
    document.getElementById("edDesc").value = (editDetail && editDetail.description) || "";
    document.getElementById("edSaved").textContent = "";
    descEditMode(true);
    document.getElementById("edDesc").focus();
  });
  var edDescCancel = document.getElementById("edDescCancel");
  if(edDescCancel) edDescCancel.addEventListener("click", function(){ descEditMode(false); });
  var edDescSave = document.getElementById("edDescSave");
  if(edDescSave) edDescSave.addEventListener("click", function(){
    if(!editStory) return;
    var desc=document.getElementById("edDesc").value;
    busy(edDescSave, true, "Save description");
    document.getElementById("edSaved").textContent = "";
    apiPost("/api/story/update", { ws:ws, id:editStory.id, description:desc }).then(function(res){
      if(res.ok){
        if(editDetail) editDetail.description=desc;
        setDescView(desc); descEditMode(false);
        toast("#"+editStory.id+" description saved", "ok");
      } else toast("Save failed: "+(res.error||"?"), "err");
    }).catch(function(e){ toast("Save failed: "+e.message, "err"); }).finally(function(){ busy(edDescSave, false, "Save description"); });
  });

  var edCommentPost = document.getElementById("edCommentPost");
  if(edCommentPost) edCommentPost.addEventListener("click", function(){
    if(!editStory) return;
    var ta=document.getElementById("edComment"), text=(ta.value||"").trim();
    if(!text){ toast("Write a comment first.", "err"); return; }
    busy(edCommentPost, true, "Post comment");
    apiPost("/api/story/comment", { ws:ws, id:editStory.id, text:text }).then(function(res){
      if(res.ok){
        ta.value=""; toast("Comment posted on #"+editStory.id, "ok");
        return apiGet("/api/story/get?ws="+encodeURIComponent(ws)+"&id="+editStory.id).then(function(d){
          if(d.ok && editStory && editStory.id===d.story.id){ editDetail=d.story; renderComments(d.story.comments); }
        });
      } else toast("Comment failed: "+(res.error||"?"), "err");
    }).catch(function(e){ toast("Comment failed: "+e.message, "err"); }).finally(function(){ busy(edCommentPost, false, "Post comment"); });
  });

  // ---- edit my own comments inline ----
  var edCommentsBox = document.getElementById("edComments");
  if(edCommentsBox) edCommentsBox.addEventListener("click", function(ev){
    var btn = ev.target.closest(".ec-edit"); if(!btn) return;
    var card = btn.closest(".ed-comment"); if(!card || card.querySelector(".ec-editta")) return;
    var id = btn.dataset.id, textEl = card.querySelector(".ec-text");
    var cur = ((editDetail && editDetail.comments) || []).filter(function(c){ return String(c.id)===String(id); })[0];
    var val = cur ? cur.text : textEl.textContent;
    textEl.style.display = "none"; btn.style.display = "none";
    var wrap = document.createElement("div"); wrap.className = "ec-editwrap";
    var ta = document.createElement("textarea"); ta.className = "ed-input ed-textarea ec-editta"; ta.value = val; ta.style.marginBottom = "8px";
    var row = document.createElement("div"); row.className = "ed-row";
    var save = document.createElement("button"); save.className = "ed-btn ed-btn-primary"; save.textContent = "Save";
    var cancel = document.createElement("button"); cancel.className = "ed-btn"; cancel.textContent = "Cancel";
    row.appendChild(save); row.appendChild(cancel); wrap.appendChild(ta); wrap.appendChild(row); card.appendChild(wrap); ta.focus();
    function done(){ wrap.remove(); textEl.style.display = ""; btn.style.display = ""; }
    cancel.addEventListener("click", done);
    save.addEventListener("click", function(){
      var text = (ta.value||"").trim(); if(!text){ toast("Comment can't be empty.", "err"); return; }
      save.disabled = cancel.disabled = true; save.textContent = "…";
      apiPost("/api/story/comment-update", { ws:ws, id:editStory.id, commentId:id, text:text }).then(function(res){
        if(res.ok){
          toast("Comment updated", "ok");
          return apiGet("/api/story/get?ws="+encodeURIComponent(ws)+"&id="+editStory.id).then(function(d){
            if(d.ok && editStory && editStory.id===d.story.id){ editDetail=d.story; renderComments(d.story.comments); }
          });
        } else { toast("Update failed: "+(res.error||"?"), "err"); save.disabled=cancel.disabled=false; save.textContent="Save"; }
      }).catch(function(e){ toast("Update failed: "+e.message, "err"); save.disabled=cancel.disabled=false; save.textContent="Save"; });
    });
  });

  // ---- attach files / paste images → upload to Shortcut, insert markdown at the cursor ----
  function insertAtCursor(ta, text){
    var s=ta.selectionStart||0, e=ta.selectionEnd||0, v=ta.value;
    var ins = (s>0 && v[s-1] && v[s-1]!=="\n" ? "\n" : "") + text + "\n";
    ta.value = v.slice(0,s) + ins + v.slice(e);
    var pos = s + ins.length; ta.selectionStart = ta.selectionEnd = pos; ta.focus();
  }
  function uploadAttachment(file, ta){
    if(!file) return;
    if(!editStory){ toast("Open a story first.", "err"); return; }
    if(file.size > 50*1024*1024){ toast("File too large (max 50MB).", "err"); return; }
    var rd = new FileReader();
    rd.onload = function(){
      var b64 = String(rd.result).split(",")[1] || "";
      toast("Uploading "+(file.name||"image")+"…", "ok");
      apiPost("/api/story/upload", { ws:ws, id:editStory.id, filename:file.name||"pasted-image.png", contentType:file.type||"application/octet-stream", data:b64 })
        .then(function(res){
          if(res.ok){ insertAtCursor(ta, res.markdown); toast("Attached "+res.name, "ok"); }
          else toast("Upload failed: "+(res.error||"?"), "err");
        }).catch(function(e){ toast("Upload failed: "+e.message, "err"); });
    };
    rd.readAsDataURL(file);
  }
  function wireAttach(btnId, ta){
    if(!ta) return;
    var btn=document.getElementById(btnId);
    if(btn){
      var input=document.createElement("input"); input.type="file"; input.style.display="none"; document.body.appendChild(input);
      btn.addEventListener("click", function(){ input.click(); });
      input.addEventListener("change", function(){ if(input.files && input.files[0]) uploadAttachment(input.files[0], ta); input.value=""; });
    }
    ta.addEventListener("paste", function(e){
      var items=((e.clipboardData)||{}).items||[];
      for(var i=0;i<items.length;i++){ if(items[i].kind==="file"){ var f=items[i].getAsFile(); if(f){ e.preventDefault(); uploadAttachment(f, ta); return; } } }
    });
  }
  wireAttach("edDescAttach", document.getElementById("edDesc"));
  wireAttach("edCommentAttach", document.getElementById("edComment"));

  var edCreate = document.getElementById("edCreate");
  if(edCreate) edCreate.addEventListener("click", function(){
    if(!editStory) return;
    var name=(document.getElementById("edNewName").value||"").trim();
    if(!name){ toast("Enter a title for the new story.", "err"); return; }
    var type=document.getElementById("edNewType").value;
    busy(edCreate, true, "Create & link");
    apiPost("/api/story/create", { ws:ws, sourceId:editStory.id, name:name, type:type }).then(function(res){
      if(res.ok){
        var url = res.app_url || (D.meta.baseUrl + res.id);
        document.getElementById("edCreated").innerHTML = '✓ Created <a href="'+url+'" target="_blank" rel="noopener">#'+res.id+'</a> — linked to #'+editStory.id;
        document.getElementById("edNewName").value="";
        toast("Created #"+res.id+" & linked", "ok");
      } else toast("Create failed: "+(res.error||"?"), "err");
    }).catch(function(e){ toast("Create failed: "+e.message, "err"); }).finally(function(){ busy(edCreate, false, "Create & link"); });
  });

  // ---- Claude assistant: per-story chat drawer ----
  var aiPanel = document.getElementById("aiPanel");
  var aiMsgs = document.getElementById("aiMsgs");
  var aiText = document.getElementById("aiText");
  var aiSend = document.getElementById("aiSend");
  var aiStory = null, aiBusy = false;
  function aiRenderMsg(role, text){
    var d = document.createElement("div");
    if(role === "user"){ d.className = "ai-msg user"; d.textContent = text; }
    else { d.className = "ai-msg bot md"; d.innerHTML = md(text); enhanceMedia(d); }
    aiMsgs.appendChild(d); return d;
  }
  function aiScroll(){ aiMsgs.scrollTop = aiMsgs.scrollHeight; }
  function aiEmpty(){ aiMsgs.innerHTML = '<div class="ai-empty">Ask anything about this story — summaries, test cases, draft comments, or reasoning about the work.<br><br>Each story keeps its own conversation.</div>'; }
  function aiRender(messages){
    aiMsgs.innerHTML = "";
    if(!messages || !messages.length){ aiEmpty(); return; }
    messages.forEach(function(m){ aiRenderMsg(m.role === "assistant" ? "bot" : "user", m.content); });
    aiScroll();
  }
  function aiWs(){ return (aiStory && aiStory.ws) ? aiStory.ws : ws; }
  var aiPicker=document.getElementById("aiPicker"), aiPickTrigger=document.getElementById("aiPickTrigger"),
      aiPickCurrent=document.getElementById("aiPickCurrent"), aiPickMenu=document.getElementById("aiPickMenu");
  function aiWsBadge(w){ return '<span class="ai-ws ai-ws-'+(w==="pipwave"?"pipwave":"g2g")+'">'+(w==="pipwave"?"PW":"G2G")+'</span>'; }
  // stories offered in the picker: pinned Pit Board stories (resolved names/state/tyre) + any open/active story
  function aiStoryOptions(){
    var seen={}, list=[];
    function add(o){ if(!o||!o.id) return; var w=o.ws||ws, k=w+":"+o.id; if(seen[k]) return; seen[k]=1;
      list.push({id:+o.id, ws:w, name:o.name||("#"+o.id), state:o.state||"", updated:o.updated||null}); }
    getOrder().forEach(function(e){ var r=orderResolved[(e.ws||"?")+":"+e.id]; if(r && !r.error) add(r); else add({id:e.id, ws:e.ws, name:"#"+e.id}); });
    if(editStory) add({id:editStory.id, ws:ws, name:editStory.name, state:editStory.state, updated:editStory.updated_at});
    if(aiStory) add(aiStory);
    return list;
  }
  function aiSetTrigger(){
    if(aiStory) aiPickCurrent.innerHTML = aiWsBadge(aiStory.ws)+'<span class="ai-pc-id">#'+aiStory.id+'</span><span class="ai-pc-nm">'+esc(aiStory.name||"")+'</span>';
    else aiPickCurrent.textContent = "Select a story…";
  }
  function aiPopulateStories(){
    if(!aiPickMenu) return;
    var list=aiStoryOptions();
    if(!list.length){ aiPickMenu.innerHTML='<div class="ai-pick-empty">No stories yet — pin some to the Pit Board with <b>＋ Paste list</b>, or open a story from the Telemetry Feed.</div>'; }
    else {
      aiPickMenu.innerHTML = list.map(function(o){
        var active = aiStory && aiStory.ws===o.ws && +aiStory.id===+o.id;
        var ty = (typeof tyreFor==="function" && o.updated) ? tyreFor(o.updated) : null;
        return '<button type="button" class="ai-pick-row'+(active?" active":"")+'" role="option" data-v="'+o.ws+':'+o.id+'">'+
          '<div class="ai-pr-top">'+aiWsBadge(o.ws)+'<span class="ai-pr-id">#'+o.id+'</span>'+
          (o.state?'<span class="ai-pr-state">'+esc(o.state)+'</span>':'')+
          (ty?'<span class="tyre tyre-'+ty.cls+'" title="'+esc(ty.title||"")+'">'+ty.lab+'</span>':'')+'</div>'+
          '<div class="ai-pr-name">'+esc(o.name||("#"+o.id))+'</div></button>';
      }).join("");
    }
    aiSetTrigger();
  }
  function aiPickClose(){ if(!aiPickMenu) return; aiPickMenu.hidden=true; aiPicker.classList.remove("open"); aiPickTrigger.setAttribute("aria-expanded","false"); }
  function aiPickToggle(){
    if(!aiPickMenu) return;
    var willOpen=aiPickMenu.hidden;
    aiPickMenu.hidden=!willOpen; aiPicker.classList.toggle("open",willOpen); aiPickTrigger.setAttribute("aria-expanded",willOpen?"true":"false");
    if(willOpen){ var act=aiPickMenu.querySelector(".ai-pick-row.active"); if(act) act.scrollIntoView({block:"nearest"}); }
  }
  function aiLoadHistory(){
    if(!aiStory) return;
    document.getElementById("aiSub").textContent = aiWs()+" · #"+aiStory.id;
    aiMsgs.innerHTML = '<div class="ai-empty">Loading…</div>';
    var sid=aiStory.id, w=aiWs();
    apiGet("/api/ai/history?ws="+encodeURIComponent(w)+"&id="+sid).then(function(res){
      if(!aiStory || aiStory.id!==sid) return;
      if(res.ok && !res.ready){
        aiMsgs.innerHTML = '<div class="ai-empty">Pit Crew is offline — the Claude Code CLI wasn’t found.<br><br>Make sure Claude Code is installed and logged in (it runs on your plan), then restart the server.</div>';
        return;
      }
      aiRender(res.messages);
    }).catch(function(e){ aiMsgs.innerHTML = '<div class="ai-empty">Couldn’t load history: '+esc(e.message)+'</div>'; });
  }
  function aiSelectStory(val){
    var m=/^([^:]+):(\d+)$/.exec(val||""); if(!m) return;
    var w=m[1], id=+m[2], opt=aiStoryOptions().filter(function(o){ return o.ws===w && +o.id===id; })[0];
    aiStory={ id:id, ws:w, name:opt?opt.name:("#"+id) };
    aiSetTrigger();
    if(aiPickMenu) aiPickMenu.querySelectorAll(".ai-pick-row").forEach(function(r){ r.classList.toggle("active", r.getAttribute("data-v")===val); });
    aiLoadHistory(); aiText.focus();
  }
  function openAi(){
    if(!isServed){ toast("Start the local server to use the Pit Crew.", "err"); return; }
    aiPanel.classList.add("show"); aiPanel.setAttribute("aria-hidden","false");
    aiPickClose();
    var st = editStory ? { id:editStory.id, ws:ws, name:editStory.name } : aiStory;
    if(!st){ var list=aiStoryOptions(); if(list.length) st=list[0]; }
    if(!st){
      aiStory=null; aiPopulateStories();
      document.getElementById("aiSub").textContent = "No story on the channel";
      aiMsgs.innerHTML = '<div class="ai-empty">Pin stories to the Pit Board (＋ Paste list) or open a story from the Telemetry Feed, then pick one above.<br><br>Each story keeps its own team-radio channel.</div>';
      setTimeout(function(){ aiText.focus(); }, 250);
      return;
    }
    aiStory = st;
    aiPopulateStories();
    aiLoadHistory();
    setTimeout(function(){ aiText.focus(); }, 250);
  }
  function closeAi(){ if(aiPanel){ aiPanel.classList.remove("show"); aiPanel.setAttribute("aria-hidden","true"); } }
  function aiSendMsg(){
    if(aiBusy || !aiStory) return;
    var text = (aiText.value||"").trim(); if(!text) return;
    if(aiMsgs.querySelector(".ai-empty")) aiMsgs.innerHTML = "";
    aiRenderMsg("user", text); aiScroll();
    aiText.value = ""; aiText.style.height = "";
    aiBusy = true; aiSend.disabled = true;
    var typing = document.createElement("div"); typing.className = "ai-msg typing"; typing.textContent = "Claude is thinking…";
    aiMsgs.appendChild(typing); aiScroll();
    var sid = aiStory.id, w = aiWs();
    apiPost("/api/ai/chat", { ws:w, id:sid, message:text }).then(function(res){
      typing.remove();
      if(!aiStory || aiStory.id !== sid) return;
      if(res.ok){ aiRenderMsg("bot", res.reply); }
      else { aiRenderMsg("bot", res.error || "Something went wrong.").classList.add("err"); }
      aiScroll();
    }).catch(function(err){
      typing.remove(); aiRenderMsg("bot", "Request failed: "+err.message).classList.add("err"); aiScroll();
    }).finally(function(){ aiBusy = false; aiSend.disabled = false; aiText.focus(); });
  }
  var aiOpenBtn = document.getElementById("aiOpenBtn");
  if(aiOpenBtn) aiOpenBtn.addEventListener("click", openAi);
  if(aiPickTrigger) aiPickTrigger.addEventListener("click", function(e){ e.stopPropagation(); aiPickToggle(); });
  if(aiPickMenu) aiPickMenu.addEventListener("click", function(e){ var row=e.target.closest(".ai-pick-row"); if(!row) return; aiPickClose(); aiSelectStory(row.getAttribute("data-v")); });
  document.addEventListener("click", function(e){ if(aiPicker && !aiPicker.contains(e.target)) aiPickClose(); });
  document.addEventListener("keydown", function(e){ if(e.key==="Escape") aiPickClose(); });
  if(aiSend) aiSend.addEventListener("click", aiSendMsg);
  var aiCloseBtn = document.getElementById("aiClose");
  if(aiCloseBtn) aiCloseBtn.addEventListener("click", closeAi);
  var aiClearBtn = document.getElementById("aiClear");
  if(aiClearBtn) aiClearBtn.addEventListener("click", function(){
    if(!aiStory) return;
    apiPost("/api/ai/clear", { ws:aiWs(), id:aiStory.id }).then(function(){ aiEmpty(); }).catch(function(){});
  });
  if(aiText) aiText.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); aiSendMsg(); } });

  // ---- The Paddock: multi-agent QA testing team (shared context board) ----
  (function(){
    var btn = document.getElementById("paddockBtn"), app = document.getElementById("app"), view = document.getElementById("paddockView");
    var f1Btn = document.getElementById("f1Btn");
    if(!btn || !app || !view) return;
    var agents = [], agentBy = {}, ready = false, loadedMeta = false;
    var sessions = [], cur = null, curAgent = null, busy = false, newWs = ws;

    var elRoster = document.getElementById("pdkRoster"), elSlist = document.getElementById("pdkSlist");
    var elMsgs = document.getElementById("pdkMsgs"), elCompose = document.getElementById("pdkCompose");
    var elAgent = document.getElementById("pdkAgent"), elText = document.getElementById("pdkText"), elSend = document.getElementById("pdkSend");
    var elTitle = document.getElementById("pdkChTitle"), elChips = document.getElementById("pdkChChips");
    var elBoard = document.getElementById("pdkBoard"), elClear = document.getElementById("pdkClear");

    function scLink(wsk,id){ return "https://app.shortcut.com/"+wsk+"/story/"+id; }
    function dot(a, cls){                                             // official F1 driver headshot, emoji fallback on load error
      return '<span class="'+(cls||"pw-dot")+' pw-av" style="color:'+a.color+'">'+
        '<img class="pw-photo" src="assets/drivers/'+esc(a.handle)+'.webp" alt="" '+
        'onerror="this.remove();this.parentNode.classList.add(\'noimg\')" />'+
        '<span class="pw-emoji">'+(a.emoji||"🏎️")+'</span></span>';
    }

    // --- agents ---
    function loadMeta(){
      return apiGet("/api/paddock/agents").then(function(res){
        ready = !!res.ready; agents = res.agents||[]; agentBy = {};
        agents.forEach(function(a){ agentBy[a.handle]=a; });
        if(!curAgent && agents.length) curAgent = agents[0].handle;
        renderRoster(); renderPicker();
      });
    }
    function renderRoster(){
      elRoster.innerHTML = agents.map(function(a){
        return '<button class="pdk-avatar" data-h="'+a.handle+'" title="'+esc(a.description)+'">'+
          dot(a,"pa-dot")+'<span><span class="pa-nm" style="color:'+a.color+'">'+esc(a.name)+'</span> '+
          '<span class="pa-role">'+esc(a.role)+'</span></span></button>';
      }).join("");
      elRoster.querySelectorAll(".pdk-avatar").forEach(function(b){
        b.addEventListener("click", function(){ curAgent=b.dataset.h; renderPicker(); if(cur){ elText.focus(); } });
      });
    }
    function renderPicker(){
      elAgent.innerHTML = agents.map(function(a){ return '<option value="'+a.handle+'">'+esc(a.name)+' · '+esc(a.role)+'</option>'; }).join("");
      if(curAgent) elAgent.value = curAgent;
    }

    // --- sessions list ---
    function loadSessions(){
      return apiGet("/api/paddock/sessions").then(function(res){ sessions = res.sessions||[]; renderList(); });
    }
    function renderList(){
      if(!sessions.length){ elSlist.innerHTML = '<div class="pdk-slist-empty">No sessions yet — start one.</div>'; return; }
      elSlist.innerHTML = sessions.map(function(s){
        return '<div class="pdk-scard'+(cur&&cur.id===s.id?" active":"")+'" data-id="'+s.id+'">'+
          '<button class="ps-del" data-id="'+s.id+'" title="Delete session">✕</button>'+
          '<div class="ps-t">'+esc(s.title)+'</div>'+
          '<div class="ps-meta"><span>'+s.ws+'</span><span>'+(s.stories?s.stories.length:0)+' 🏁</span><span>'+(s.turns||0)+' msg</span></div></div>';
      }).join("");
      elSlist.querySelectorAll(".pdk-scard").forEach(function(c){
        c.addEventListener("click", function(e){ if(e.target.classList.contains("ps-del")) return; openSession(c.dataset.id); });
      });
      elSlist.querySelectorAll(".ps-del").forEach(function(d){
        d.addEventListener("click", function(e){ e.stopPropagation(); delSession(d.dataset.id); });
      });
    }
    function delSession(id){
      apiPost("/api/paddock/session/delete", { id:id }).then(function(){
        if(cur && cur.id===id){ cur=null; showNoSession(); }
        loadSessions();
      });
    }

    // --- open + render a session ---
    function openSession(id){
      apiGet("/api/paddock/session?id="+encodeURIComponent(id)).then(function(res){
        if(!res.ok || !res.session){ toast("Couldn't load session.","err"); return; }
        cur = res.session; renderList(); renderSession();
      });
    }
    function showNoSession(){
      elTitle.textContent = "No session selected"; elChips.innerHTML=""; elClear.hidden=true; elCompose.hidden=true;
      elMsgs.innerHTML = '<div class="pdk-empty">Create a session to brief the team.</div>';
      elBoard.innerHTML = '<div class="pdk-board-empty">The shared context appears here — requirement, stories under test, and every contribution.</div>';
    }
    function renderSession(){
      if(!cur){ showNoSession(); return; }
      elTitle.textContent = cur.title;
      elChips.innerHTML = (cur.stories||[]).map(function(s){
        return '<span class="pdk-chip"><a href="'+scLink(cur.ws,s.id)+'" target="_blank" rel="noopener">#'+s.id+' '+esc((s.name||"").slice(0,40))+'</a></span>';
      }).join("") || '<span class="pdk-chip">no stories pinned</span>';
      elClear.hidden = false; elCompose.hidden = !ready;
      renderMsgs(); renderBoard();
      if(!ready){ elMsgs.innerHTML = '<div class="pdk-empty">The Paddock is offline — the Claude Code CLI wasn’t found.<br><br>Install Claude Code and log in (it runs on your plan), then restart the server.</div>'; }
    }
    function renderMsgs(){
      var b = cur.board||[];
      if(!b.length){ elMsgs.innerHTML = '<div class="pdk-empty">Brief a driver to get started.<br><br>Pick who answers below, or type <b>@name</b> to switch. Everyone shares this session\'s context.</div>'; return; }
      elMsgs.innerHTML = ""; b.forEach(addBubble); scrollMsgs();
    }
    function addBubble(entry){
      var d = document.createElement("div");
      d.id = "pdk-m-"+entry.id;
      if(entry.kind==="user"){
        d.className = "pdk-msg user";
        d.innerHTML = '<div class="pdk-who">You</div><div class="pdk-bubble"></div>';
        d.querySelector(".pdk-bubble").textContent = entry.text;
      } else {
        var a = agentBy[entry.handle] || entry;
        d.className = "pdk-msg agent";
        var bub = document.createElement("div"); bub.className="pdk-bubble md"; bub.style.borderLeftColor = entry.color||"#2e3645";
        bub.innerHTML = md(entry.text); enhanceMedia(bub);
        d.innerHTML = '<div class="pdk-who" style="color:'+(entry.color||"#cfd6df")+'">'+dot(a)+'<span>'+esc(entry.name)+'</span> <span class="pw-role">'+esc(entry.role||"")+'</span></div>';
        d.appendChild(bub);
      }
      elMsgs.appendChild(d); return d;
    }
    function scrollMsgs(){ elMsgs.scrollTop = elMsgs.scrollHeight; }
    function renderBoard(){
      var parts = [];
      parts.push('<div><div class="pdk-bsec-lab">Requirement</div><div class="pdk-breq">'+(cur.requirement?esc(cur.requirement):"<span style=\"color:var(--muted2)\">none specified</span>")+'</div></div>');
      if((cur.stories||[]).length){
        parts.push('<div><div class="pdk-bsec-lab">Stories under test</div>'+cur.stories.map(function(s){
          return '<a class="pdk-bstory" href="'+scLink(cur.ws,s.id)+'" target="_blank" rel="noopener"><span class="pb-id">#'+s.id+'</span><div class="pb-nm">'+esc(s.name||"")+'</div><div class="pb-meta">'+esc(s.type||"")+' · '+esc(s.state||"")+'</div></a>';
        }).join("")+'</div>');
      }
      var contribs = (cur.board||[]).filter(function(e){ return e.kind==="agent"; });
      if(contribs.length){
        parts.push('<div><div class="pdk-bsec-lab">Contributions ('+contribs.length+')</div>'+contribs.map(function(e){
          return '<div class="pdk-bcontrib" data-mid="'+e.id+'"><span class="bc-dot" style="color:'+(e.color||"#888")+'">'+(e.emoji||"🏎️")+'</span><div><div class="bc-nm" style="color:'+(e.color||"#cfd6df")+'">'+esc(e.name)+'</div><div class="bc-snip">'+esc((e.text||"").replace(/[#*`>|-]/g," ").replace(/\s+/g," ").slice(0,90))+'</div></div></div>';
        }).join("")+'</div>');
      }
      elBoard.innerHTML = parts.join("");
      elBoard.querySelectorAll(".pdk-bcontrib").forEach(function(c){
        c.addEventListener("click", function(){ var m=document.getElementById("pdk-m-"+c.dataset.mid); if(m) m.scrollIntoView({behavior:"smooth",block:"center"}); });
      });
    }

    // --- send a turn ---
    function send(){
      if(busy || !cur || !ready) return;
      var raw = (elText.value||"").trim(); if(!raw) return;
      // @mention switches the target driver
      var mm = raw.match(/^@([a-z]+)\b\s*/i);
      if(mm && agentBy[mm[1].toLowerCase()]){ curAgent = mm[1].toLowerCase(); elAgent.value=curAgent; raw = raw.slice(mm[0].length).trim(); if(!raw){ elText.value=""; return; } }
      var handle = curAgent || elAgent.value, a = agentBy[handle];
      if(elMsgs.querySelector(".pdk-empty")) elMsgs.innerHTML="";
      addBubble({ id:"tmp-u", kind:"user", text:raw }); scrollMsgs();
      elText.value=""; elText.style.height="";
      busy=true; elSend.disabled=true;
      var typing = document.createElement("div"); typing.className="pdk-typing"; typing.textContent = (a?a.name:"Driver")+" is on it…";
      elMsgs.appendChild(typing); scrollMsgs();
      var sid = cur.id;
      apiPost("/api/paddock/chat", { id:sid, handle:handle, message:raw }).then(function(res){
        typing.remove();
        if(!cur || cur.id!==sid) return;
        if(res.ok){ cur.board.push(res.user, res.entry); var u=document.getElementById("pdk-m-tmp-u"); if(u) u.id="pdk-m-"+res.user.id; addBubble(res.entry); scrollMsgs(); renderBoard(); loadSessions(); }
        else { var e=addBubble({id:"err",kind:"agent",name:(a?a.name:"Paddock"),role:"",color:"#e10600",handle:handle,text:res.error||"Something went wrong."}); e.querySelector(".pdk-bubble").classList.add("err"); scrollMsgs(); }
      }).catch(function(err){ typing.remove(); var e=addBubble({id:"err",kind:"agent",name:"Paddock",role:"",color:"#e10600",handle:handle,text:"Request failed: "+err.message}); e.querySelector(".pdk-bubble").classList.add("err"); scrollMsgs(); })
      .finally(function(){ busy=false; elSend.disabled=false; elText.focus(); });
    }
    elSend.addEventListener("click", send);
    elText.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
    elAgent.addEventListener("change", function(){ curAgent = elAgent.value; });
    elClear.addEventListener("click", function(){
      if(!cur) return; if(!confirm("Clear this session's context board and all agent threads?")) return;
      apiPost("/api/paddock/clear", { id:cur.id }).then(function(){ cur.board=[]; renderMsgs(); renderBoard(); loadSessions(); });
    });

    // --- new session modal ---
    var modal = document.getElementById("pdkModal");
    var pdkSel = [];  // stories chosen for this session: {id,ws,name,state}
    var elSearch=document.getElementById("pdkStorySearch"), elResults=document.getElementById("pdkStoryResults"), elChips=document.getElementById("pdkStoryChips");
    var searchTimer=null, lastResults=[];
    function renderChips(){
      elChips.innerHTML = pdkSel.map(function(s,i){
        return '<span class="pdk-chip2"><span class="c2-id">#'+s.id+'</span><span class="c2-nm">'+esc(s.name||"")+'</span><button type="button" class="c2-x" data-i="'+i+'" title="Remove">✕</button></span>';
      }).join("");
      elChips.querySelectorAll(".c2-x").forEach(function(b){ b.addEventListener("click", function(){ pdkSel.splice(+b.dataset.i,1); renderChips(); }); });
    }
    function hideResults(){ elResults.hidden=true; elResults.innerHTML=""; }
    function has(s){ return pdkSel.some(function(x){ return +x.id===+s.id && x.ws===s.ws; }); }
    function addStory(s){ if(!has(s)) pdkSel.push(s); renderChips(); elSearch.value=""; hideResults(); elSearch.focus(); }
    function runSearch(q){
      apiGet("/api/paddock/story-search?ws="+encodeURIComponent(newWs)+"&q="+encodeURIComponent(q)).then(function(res){
        if(!res.ok){ elResults.innerHTML='<div class="pdk-smsg">'+esc(res.error||"Search failed")+'</div>'; elResults.hidden=false; return; }
        lastResults=res.stories||[];
        if(!lastResults.length){ elResults.innerHTML='<div class="pdk-smsg">No matches.</div>'; elResults.hidden=false; return; }
        elResults.innerHTML = lastResults.map(function(s){
          var chosen=has(s);
          return '<button type="button" class="pdk-sresult'+(chosen?" dim":"")+'" data-id="'+s.id+'"'+(chosen?" disabled":"")+'>'+
            '<span class="sr-id">#'+s.id+'</span><span class="sr-nm">'+esc(s.name||"")+'</span>'+(s.state?'<span class="sr-st">'+esc(s.state)+'</span>':'')+'</button>';
        }).join("");
        elResults.hidden=false;
        elResults.querySelectorAll(".pdk-sresult:not(.dim)").forEach(function(b){
          b.addEventListener("click", function(){ var s=lastResults.filter(function(x){ return String(x.id)===b.dataset.id; })[0]; if(s) addStory(s); });
        });
      }).catch(function(e){ elResults.innerHTML='<div class="pdk-smsg">Search error: '+esc(e.message)+'</div>'; elResults.hidden=false; });
    }
    if(elSearch){
      elSearch.addEventListener("input", function(){
        var q=elSearch.value.trim(); clearTimeout(searchTimer);
        if(q.length<2){ hideResults(); return; }
        elResults.innerHTML='<div class="pdk-smsg">Searching…</div>'; elResults.hidden=false;
        searchTimer=setTimeout(function(){ runSearch(q); }, 300);
      });
      elSearch.addEventListener("keydown", function(e){ if(e.key==="Escape") hideResults(); });
    }
    document.addEventListener("click", function(e){ var sel=document.querySelector(".pdk-storysel"); if(elResults && !elResults.hidden && sel && !sel.contains(e.target)) hideResults(); });

    function openModal(){
      newWs = ws; pdkSel = [];
      document.getElementById("pdkTitle").value=""; document.getElementById("pdkReq").value=""; elSearch.value="";
      hideResults(); renderChips();
      document.getElementById("pdkCreateStatus").textContent="";
      modal.querySelectorAll("#pdkWsSeg a").forEach(function(x){ x.classList.toggle("active", x.dataset.ws===newWs); });
      modal.classList.add("show"); setTimeout(function(){ document.getElementById("pdkTitle").focus(); }, 120);
    }
    function closeModal(){ modal.classList.remove("show"); }
    document.getElementById("pdkNew").addEventListener("click", function(){ if(!isServed){ toast("Start the local server to use the Paddock.","err"); return; } openModal(); });
    document.getElementById("pdkModalClose").addEventListener("click", closeModal);
    modal.addEventListener("click", function(e){ if(e.target===modal) closeModal(); });
    modal.querySelectorAll("#pdkWsSeg a").forEach(function(x){
      x.addEventListener("click", function(){ if(newWs!==x.dataset.ws){ newWs=x.dataset.ws; pdkSel=[]; renderChips(); } elSearch.value=""; hideResults(); modal.querySelectorAll("#pdkWsSeg a").forEach(function(y){ y.classList.toggle("active", y===x); }); });
    });
    document.getElementById("pdkCreate").addEventListener("click", function(){
      var title=document.getElementById("pdkTitle").value.trim();
      var storyIds=pdkSel.map(function(s){ return s.id; });
      var req=document.getElementById("pdkReq").value.trim();
      var st=document.getElementById("pdkCreateStatus"); st.textContent="Creating…";
      apiPost("/api/paddock/session", { title:title, ws:newWs, storyIds:storyIds, requirement:req }).then(function(res){
        if(!res.ok){ st.textContent=res.error||"Failed."; return; }
        closeModal(); cur=res.session; loadSessions(); renderSession();
      }).catch(function(e){ st.textContent="Failed: "+e.message; });
    });

    // --- view toggle (mutually exclusive with F1 mode) ---
    function setOn(on, animate){
      if(animate) playViewWipe();
      app.classList.toggle("pdk-mode", on);                             // exclusivity is handled centrally (see the view coordinator)
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on?"true":"false");
      if(on){
        window.scrollTo(0,0);
        if(!loadedMeta){ loadedMeta=true; loadMeta().then(loadSessions).then(function(){ if(!cur) showNoSession(); }); }
      }
    }
    btn.addEventListener("click", function(){ setOn(!app.classList.contains("pdk-mode"), true); });
    var hm = (location.hash||"").match(/^#paddock(?:=(.+))?$/i);       // deep-link: #paddock or #paddock=<sessionId>
    if(hm){ setOn(true); if(hm[1]){ var want=decodeURIComponent(hm[1]); var iv=setInterval(function(){ if(loadedMeta && sessions.length){ clearInterval(iv); openSession(want); } }, 120); setTimeout(function(){ clearInterval(iv); }, 8000); } }
  })();
  if(aiText) aiText.addEventListener("input", function(){ aiText.style.height="auto"; aiText.style.height=Math.min(140, aiText.scrollHeight)+"px"; });
  document.addEventListener("keydown", function(e){ if(e.key==="Escape" && aiPanel && aiPanel.classList.contains("show")) closeAi(); });

  var edClose = document.getElementById("edClose");
  if(edClose) edClose.addEventListener("click", closeEditor);
  function copyText(t){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function(res){ var ta=document.createElement("textarea"); ta.value=t; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }catch(e){} document.body.removeChild(ta); res(); });
  }
  function flashCopied(el){ if(!el) return; el.classList.add("copied"); setTimeout(function(){ el.classList.remove("copied"); }, 1400); }
  function copyStoryLink(iconEl){
    if(!editStory) return;
    copyText(D.meta.baseUrl + editStory.id).then(function(){
      var title = document.getElementById("edTitle");
      flashCopied(title);                                  // "copied ✓" appears below #id
      if(iconEl && iconEl !== title) flashCopied(iconEl);  // green flash on the copy icon
      toast("Story link copied", "ok");
    }).catch(function(){ toast("Couldn’t copy link", "err"); });
  }
  var edCopy = document.getElementById("edCopy");
  if(edCopy) edCopy.addEventListener("click", function(){ copyStoryLink(edCopy); });
  var edTitleBtn = document.getElementById("edTitle");
  if(edTitleBtn) edTitleBtn.addEventListener("click", function(){ copyStoryLink(edTitleBtn); });
  var editModalEl = document.getElementById("editModal");
  if(editModalEl) editModalEl.addEventListener("click", function(ev){ if(ev.target===editModalEl) closeEditor(); });
  document.addEventListener("keydown", function(ev){ if(ev.key==="Escape") closeEditor(); });

  // ---- Generate Report (summary metrics + full story list -> .xlsx + HTML) ----
  (function(){
    var modal = document.getElementById("reportModal"), btn = document.getElementById("reportBtn");
    if(!modal || !btn) return;
    var seg = document.getElementById("repSeg"), wsLbl = document.getElementById("repWs"), statusEl = document.getElementById("repStatus");
    var repWin = win;
    function syncSeg(){ if(seg) seg.querySelectorAll("a").forEach(function(a){ a.classList.toggle("active", a.dataset.win===repWin); }); }
    function open(){
      repWin = win; syncSeg();
      if(wsLbl) wsLbl.innerHTML = '<img src="'+(LOGOS[ws]||"")+'" alt="" /> '+ esc(D.meta.workspace || ws.toUpperCase());
      if(statusEl) statusEl.textContent = "";
      modal.classList.add("show");
    }
    function close(){ modal.classList.remove("show"); }
    btn.addEventListener("click", open);
    var closeBtn = document.getElementById("reportClose"); if(closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function(ev){ if(ev.target===modal) close(); });
    document.addEventListener("keydown", function(ev){ if(ev.key==="Escape" && modal.classList.contains("show")) close(); });
    if(seg) seg.querySelectorAll("a").forEach(function(a){
      a.addEventListener("click", function(ev){ ev.preventDefault(); repWin = a.dataset.win; syncSeg(); });
    });
    // exact start/end dates for the window, recomputed from the snapshot date so the report
    // shows real dates (e.g. "21 May – 19 Jun 2026") instead of the baked label
    function windowRange(winKey, generatedAt){
      if(winKey==="all") return { name:"All Time", from:null, to:null };
      var pad = function(n){ return (n<10?"0":"")+n; };
      var toStr = String(generatedAt || new Date().toISOString()).slice(0,10);   // snapshot's calendar date
      var off = winKey==="week" ? 6 : winKey==="month" ? 29 : 0;
      var endUTC = new Date(toStr+"T00:00:00Z");
      var startUTC = new Date(endUTC.getTime() - off*86400000);
      var iso = function(dt){ return dt.getUTCFullYear()+"-"+pad(dt.getUTCMonth()+1)+"-"+pad(dt.getUTCDate()); };
      var name = winKey==="today" ? "Today" : winKey==="week" ? "This Week" : "This Month";
      return { name:name, from:iso(startUTC), to:toStr };
    }
    function download(format){
      var d = ALL[ws] && ALL[ws][repWin];
      if(!d){ toast("No data for that timeframe — Sync first.", "err"); return; }
      var rng = windowRange(repWin, d.meta.generatedAt);
      var payload = {
        format: format,
        workspace: d.meta.workspace, windowLabel: d.meta.windowLabel,
        windowName: rng.name, from: rng.from, to: rng.to,
        generatedAt: d.meta.generatedAt, baseUrl: d.meta.baseUrl,
        metrics: (d.metrics||[]).map(function(m){ return { key:m.key, label:m.label, value:m.value, stories:m.stories||[] }; })
      };
      if(statusEl) statusEl.textContent = "Generating…";
      fetch("/api/report", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) })
        .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.blob(); })
        .then(function(blob){
          var fname = "PitWall_"+String(payload.workspace||"report").replace(/[^\w]+/g,"")+"_"+String(payload.windowName||payload.windowLabel||"").replace(/[^\w]+/g,"")+(format==="xlsx"?".xlsx":".html");
          var u = URL.createObjectURL(blob), a = document.createElement("a");
          a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(u); }, 2000);
          if(statusEl) statusEl.textContent = "✓ "+fname;
          toast("Report generated · "+payload.windowLabel, "ok");
        })
        .catch(function(e){ if(statusEl) statusEl.textContent = "Failed"; toast("Report failed: "+(e.message||e), "err"); });
    }
    var bx = document.getElementById("repXlsx"); if(bx) bx.addEventListener("click", function(){ download("xlsx"); });
    var bh = document.getElementById("repHtml"); if(bh) bh.addEventListener("click", function(){ download("html"); });
  })();

  // ---- Real F1: dedicated view (standings · next race + countdown · last race · news) ----
  (function(){
    var btn = document.getElementById("f1Btn"), app = document.getElementById("app"), view = document.getElementById("f1View");
    if(!btn || !app || !view) return;
    var loaded = false, nextDate = null, cdTimer = null;
    // official-ish team colours — the strongest F1 visual cue
    var TEAM_COLORS = {
      "ferrari":"#E8002D", "mercedes":"#27F4D2", "red bull":"#3671C6", "mclaren":"#FF8000",
      "aston martin":"#229971", "alpine":"#0093CC", "williams":"#64C4FF",
      "racing bulls":"#6692FF", "rb f1":"#6692FF", "visa":"#6692FF",
      "kick sauber":"#52E252", "sauber":"#52E252", "audi":"#00424B",
      "haas":"#B6BABD", "cadillac":"#C5A572"
    };
    function teamColor(name){ var n=String(name||"").toLowerCase(); for(var k in TEAM_COLORS){ if(n.indexOf(k)>=0) return TEAM_COLORS[k]; } return "var(--line2)"; }
    var TEAM_ABBR = { "ferrari":"FER", "mercedes":"MER", "red bull":"RBR", "mclaren":"MCL", "aston martin":"AST", "alpine":"ALP", "williams":"WIL", "racing bulls":"RB", "rb f1":"RB", "visa":"RB", "kick sauber":"SAU", "sauber":"SAU", "audi":"AUD", "haas":"HAS", "cadillac":"CAD" };
    function teamAbbr(name){ var n=String(name||"").toLowerCase(); for(var k in TEAM_ABBR){ if(n.indexOf(k)>=0) return TEAM_ABBR[k]; } return String(name||"").replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase(); }
    function teamBadge(name){ var c=teamColor(name); return '<span class="f1-badge" style="color:'+c+';border-color:'+c+'">'+esc(teamAbbr(name))+'</span>'; }
    // real team logo if present in logos/f1/<id>.(png|svg); falls back to the colour badge
    function teamLogo(name, teamId){
      if(!teamId) return teamBadge(name);
      return '<span class="f1-logo-wrap">'+teamBadge(name)+'<img class="f1-logo" alt="" src="logos/f1/'+encodeURIComponent(teamId)+'.png"></span>';
    }
    function wireLogos(scope){
      (scope||view).querySelectorAll(".f1-logo").forEach(function(img){
        img.addEventListener("load", function(){ if(img.parentNode) img.parentNode.classList.add("has-logo"); });
        img.addEventListener("error", function(){
          if(img.getAttribute("data-svg")!=="1"){ img.setAttribute("data-svg","1"); img.src = img.src.replace(/\.png(\?.*)?$/, ".svg"); }
          else { img.remove(); }
        });
      });
    }
    function fmtNewsDate(s){ var d=new Date(s); return isNaN(d.getTime())?"":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}); }
    function fmtRaceDateTime(dt){ return dt.toLocaleString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
    function fmtRaceDate(s){ var d=new Date(s+"T00:00:00"); return isNaN(d.getTime())?s:d.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}); }
    // nationality → flag emoji (demonym as returned by Ergast). Nice telemetry touch; unknowns fall through.
    var NAT_FLAG = { "British":"🇬🇧","Dutch":"🇳🇱","Italian":"🇮🇹","German":"🇩🇪","Spanish":"🇪🇸","French":"🇫🇷","Mexican":"🇲🇽","Monegasque":"🇲🇨","Australian":"🇦🇺","Finnish":"🇫🇮","Canadian":"🇨🇦","Thai":"🇹🇭","Japanese":"🇯🇵","American":"🇺🇸","Danish":"🇩🇰","Chinese":"🇨🇳","Argentine":"🇦🇷","Argentinian":"🇦🇷","Brazilian":"🇧🇷","Austrian":"🇦🇹","Swiss":"🇨🇭","Belgian":"🇧🇪","New Zealander":"🇳🇿" };
    function flag(nat){ return NAT_FLAG[nat] || ""; }
    // country name (as Ergast reports circuit locations) → flag; falls back to the checkered flag
    var COUNTRY_FLAG = { "Australia":"🇦🇺","China":"🇨🇳","Japan":"🇯🇵","Bahrain":"🇧🇭","Saudi Arabia":"🇸🇦","USA":"🇺🇸","United States":"🇺🇸","United States of America":"🇺🇸","Italy":"🇮🇹","Monaco":"🇲🇨","Spain":"🇪🇸","Canada":"🇨🇦","Austria":"🇦🇹","UK":"🇬🇧","United Kingdom":"🇬🇧","Great Britain":"🇬🇧","Belgium":"🇧🇪","Hungary":"🇭🇺","Netherlands":"🇳🇱","Azerbaijan":"🇦🇿","Singapore":"🇸🇬","Mexico":"🇲🇽","Brazil":"🇧🇷","Qatar":"🇶🇦","UAE":"🇦🇪","United Arab Emirates":"🇦🇪","France":"🇫🇷","Germany":"🇩🇪","Portugal":"🇵🇹","Turkey":"🇹🇷","Russia":"🇷🇺","South Africa":"🇿🇦","Argentina":"🇦🇷","Korea":"🇰🇷","South Korea":"🇰🇷","India":"🇮🇳","Malaysia":"🇲🇾","Vietnam":"🇻🇳","Thailand":"🇹🇭" };
    function cflag(country){ return COUNTRY_FLAG[country] || flag(country) || "🏁"; }
    // one standings row: rank · code/flag · name+team · points bar · wins · gap · points
    function standRow(x, leaderPts, isCon){
      var pos = x.pos, cls = pos<=3 ? " p"+pos : "";
      var tName = isCon ? x.name : x.team;
      var lead = isCon ? teamLogo(x.name, x.teamId)
                       : '<div class="f1-code">'+esc(x.code||"")+'</div>';
      var pct = leaderPts>0 ? Math.max(3, Math.round(+x.pts/leaderPts*100)) : 0;
      var sub = isCon ? (flag(x.nat)?flag(x.nat)+" ":"")+esc(x.nat||"")
                      : (flag(x.nat)?flag(x.nat)+" ":"")+esc(x.team||"");
      var wins = +x.wins ? '<span class="f1-wins" title="Race wins">'+x.wins+'<small>W</small></span>' : '';
      var gapv = leaderPts>0 ? (leaderPts - +x.pts) : 0;     // computed here so it never depends on the API field
      var gap = pos===1 ? '<span class="f1-gap f1-gap-lead">LEADER</span>' : '<span class="f1-gap">−'+gapv+'</span>';
      return '<div class="f1-row'+cls+'" style="--tc:'+teamColor(tName)+'"><div class="fp">'+pos+'</div>'+ lead +
        '<div class="fn"><div class="f1-name">'+esc(x.name)+'</div>'+
        '<div class="f1-team">'+sub+'</div>'+
        '<div class="f1-bar"><span style="width:'+pct+'%"></span></div></div>'+
        '<div class="f1-rmeta">'+wins+gap+'</div>'+
        '<div class="f1-pts">'+esc(x.pts)+'<small> PTS</small></div></div>';
    }
    function tick(){
      var cd=document.getElementById("f1Cd"); if(!cd) return;
      if(!nextDate){ cd.innerHTML=""; return; }
      var ms = nextDate.getTime() - Date.now();
      if(ms<=0){ cd.innerHTML='<div class="f1-cd-live">Race weekend</div>'; return; }
      var s=Math.floor(ms/1000), d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), ss=s%60;
      function u(v,l){ return '<div class="u"><div class="uv">'+(v<10?"0"+v:v)+'</div><div class="ul">'+l+'</div></div>'; }
      cd.innerHTML = u(d,"days")+u(h,"hrs")+u(m,"min")+u(ss,"sec");
    }
    function startCd(){ stopCd(); if(nextDate) cdTimer=setInterval(tick, 1000); }
    function stopCd(){ if(cdTimer){ clearInterval(cdTimer); cdTimer=null; } }
    function renderNext(n){
      var el=document.getElementById("f1Next");
      if(!n){ nextDate=null; el.innerHTML='<div class="f1-msg">No upcoming race.</div>'; return; }
      nextDate = n.date ? new Date(n.date+"T"+(n.time||"00:00:00Z")) : null;
      el.innerHTML = '<div class="f1-cardtop"><div class="f1-cardlab">Round '+esc(n.round)+' · Up Next</div>'+
        (n.country?'<span class="f1-flagbig">'+cflag(n.country)+'</span>':'')+'</div>'+
        '<div class="f1-cardname">'+esc(n.name)+'</div>'+
        '<div class="f1-cardsub">'+esc(n.circuit||"")+(n.locality?' · '+esc(n.locality):'')+'</div>'+
        '<div class="f1-cd" id="f1Cd"></div>'+
        (nextDate ? '<div class="f1-cardfoot"><span class="f1-lights">●●●●●</span>'+esc(fmtRaceDateTime(nextDate))+'</div>' : '')+
        '<button class="f1-nextcal" id="f1NextCalBtn" type="button" aria-expanded="false"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M9 3v4M15 3v4"/></svg><span class="lbl">View full race calendar</span><span class="f1-nextcal-arr">▾</span></button>';
      tick();
    }
    function renderLast(l){
      var el=document.getElementById("f1Last"); var medals=["🥇","🥈","🥉"];
      if(!l){ el.innerHTML='<div class="f1-msg">No recent race.</div>'; return; }
      var extras = '';
      if(l.fastestLap) extras += '<div class="f1-hl f1-hl-fl" style="--tc:'+teamColor(l.fastestLap.team)+'"><span class="f1-hl-ic">⏱</span><div class="f1-hl-txt"><div class="f1-hl-lab">Fastest Lap</div><div class="f1-hl-val"><b>'+esc(l.fastestLap.code||l.fastestLap.name)+'</b> '+esc(l.fastestLap.flTime||"")+'</div></div></div>';
      if(l.pole) extras += '<div class="f1-hl f1-hl-pole" style="--tc:'+teamColor(l.pole.team)+'"><span class="f1-hl-ic">P1</span><div class="f1-hl-txt"><div class="f1-hl-lab">Pole Position</div><div class="f1-hl-val"><b>'+esc(l.pole.code||l.pole.name)+'</b> '+esc(l.pole.team||"")+'</div></div></div>';
      el.innerHTML = '<div class="f1-cardtop"><div class="f1-cardlab">Round '+esc(l.round)+' · Last Race</div>'+
        '<span class="f1-cardsub2">'+esc(fmtRaceDate(l.date))+'</span></div>'+
        '<div class="f1-cardname">'+esc(l.name)+'</div>'+
        '<div class="f1-pod">'+(l.podium||[]).map(function(p,i){
          return '<div class="f1-pod-row" style="--tc:'+teamColor(p.team)+'"><div class="f1-medal">'+(medals[i]||"")+'</div>'+teamLogo(p.team, p.teamId)+'<div class="fn"><div class="f1-name">'+(p.code?'<b>'+esc(p.code)+'</b> ':'')+esc(p.name)+'</div><div class="f1-team">'+esc(p.team)+'</div></div><div class="f1-pts">'+esc(p.time)+'</div></div>';
        }).join("")+'</div>'+
        (extras?'<div class="f1-hls">'+extras+'</div>':'');
    }
    function renderStats(d){
      var el=document.getElementById("f1Stats"); if(!el) return;
      var meta=document.getElementById("f1SeasonMeta");
      var dl=(d.drivers||[])[0], d2=(d.drivers||[])[1], cl=(d.constructors||[])[0];
      var winLeader=(d.drivers||[]).slice().sort(function(a,b){ return (+b.wins)-(+a.wins); })[0];
      var rnd=+d.round||0, tot=+d.totalRounds||0, left=tot?Math.max(0,tot-rnd):null;
      if(meta) meta.textContent = tot?("Round "+rnd+" of "+tot):"";
      function tile(lab,val,sub,tc){ return '<div class="f1-stat"'+(tc?' style="--tc:'+tc+'"':'')+'><div class="f1-stat-lab">'+lab+'</div><div class="f1-stat-val">'+val+'</div>'+(sub?'<div class="f1-stat-sub">'+sub+'</div>':'')+'</div>'; }
      var tiles=[];
      if(dl) tiles.push(tile("Championship Leader",'<span class="f1-stat-flag">'+flag(dl.nat)+'</span>'+esc(dl.code||dl.name), esc(dl.team)+' · '+dl.pts+' pts', teamColor(dl.team)));
      if(dl&&d2){ var margin=(+dl.pts)-(+d2.pts); tiles.push(tile("Leader's Margin","+"+margin+'<small> pts</small>', "over "+esc(d2.code||d2.name))); }
      if(cl) tiles.push(tile("Constructors' Leader", esc(cl.name), cl.pts+' pts · '+cl.wins+' wins', teamColor(cl.name)));
      if(winLeader&&+winLeader.wins) tiles.push(tile("Most Wins", winLeader.wins+'<small> wins</small>', esc(winLeader.code||winLeader.name), teamColor(winLeader.team)));
      if(left!=null) tiles.push(tile("Races Remaining", left, "of "+tot+" this season"));
      if(d.nextRace) tiles.push(tile("Next Round", "R"+esc(d.nextRace.round), esc(d.nextRace.name)));
      el.innerHTML = tiles.join("") || '<div class="f1-msg">No data.</div>';
      // season progress bar
      var pb=document.getElementById("f1Progress");
      if(pb){
        if(tot){ var pct=Math.round(rnd/tot*100);
          pb.innerHTML = '<div class="f1-pbtrack"><span style="width:'+pct+'%"></span></div><div class="f1-pblab"><span>'+rnd+' / '+tot+' rounds</span><span>'+pct+'% complete</span></div>';
        } else pb.innerHTML='';
      }
    }
    function renderResults(l){
      var el=document.getElementById("f1Results"); if(!el) return;
      var meta=document.getElementById("f1ResultsMeta");
      if(!l||!l.results||!l.results.length){ el.innerHTML='<div class="f1-msg">No race results yet.</div>'; if(meta) meta.textContent=""; return; }
      if(meta) meta.textContent = esc(l.name)+(l.locality?" · "+esc(l.locality):"");
      var head='<div class="f1-rtrow f1-rthead"><div class="rc-pos">Pos</div><div class="rc-drv">Driver</div><div class="rc-team">Team</div><div class="rc-grid">Grid</div><div class="rc-delta">+/−</div><div class="rc-time">Time / Status</div><div class="rc-pts">Pts</div></div>';
      var rows=l.results.map(function(x){
        var cls=x.pos<=3?" p"+x.pos:"";
        var delta = x.delta>0 ? '<span class="dt-up">▲'+x.delta+'</span>' : (x.delta<0 ? '<span class="dt-dn">▼'+(-x.delta)+'</span>' : '<span class="dt-eq">—</span>');
        var fl = x.fl ? ' <span class="rc-fl" title="Fastest lap">FL</span>' : '';
        return '<div class="f1-rtrow'+cls+'" style="--tc:'+teamColor(x.team)+'">'+
          '<div class="rc-pos">'+x.pos+'</div>'+
          '<div class="rc-drv"><b>'+esc(x.code||"")+'</b> '+esc(x.name)+fl+'</div>'+
          '<div class="rc-team">'+teamBadge(x.team)+'<span class="rc-teamn">'+esc(x.team)+'</span></div>'+
          '<div class="rc-grid">P'+x.grid+'</div>'+
          '<div class="rc-delta">'+delta+'</div>'+
          '<div class="rc-time">'+esc(x.time)+'</div>'+
          '<div class="rc-pts">'+esc(x.pts)+'</div></div>';
      }).join("");
      el.innerHTML = head+rows;
    }
    function fmtCalDate(s){ var dt=new Date(s+"T00:00:00"); return isNaN(dt.getTime())?s:dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}); }
    function renderCalendar(d){
      var el=document.getElementById("f1Calendar"); if(!el) return;
      var sched=d.schedule||[]; if(!sched.length){ el.innerHTML='<div class="f1-msg">No calendar.</div>'; return; }
      var nextR = d.nextRace ? +d.nextRace.round : 0;
      var meta=document.getElementById("f1CalMeta");
      if(meta){ var done=sched.filter(function(r){return r.done;}).length; meta.textContent = done+" run · "+(sched.length-done)+" to go"; }
      el.innerHTML = sched.map(function(r){
        var st = r.round===nextR ? "next" : (r.done ? "done" : "up");
        var badge = r.round===nextR ? '<span class="cc-badge next">Up Next</span>'
                  : (r.done ? '<span class="cc-badge done">✓ Finished</span>' : '<span class="cc-badge up">Upcoming</span>');
        // finished → who won; next → highlighted; upcoming → just the date
        var foot;
        if(r.winner) foot = '<div class="cc-win" style="--tc:'+teamColor(r.winner.team)+'"><span class="cc-trophy">🏆</span><span class="cc-wname"><b>'+esc(r.winner.code||"")+'</b> '+esc(r.winner.name)+'</span><span class="cc-wteam">'+esc(r.winner.team)+'</span></div>';
        else if(r.round===nextR) foot = '<div class="cc-win cc-soon"><span class="cc-trophy">🏁</span><span class="cc-wname">Race weekend ahead</span></div>';
        else foot = '<div class="cc-win cc-soon"><span class="cc-trophy">📅</span><span class="cc-wname">Yet to run</span></div>';
        return '<div class="f1-cc '+st+'">'+
          '<div class="cc-top"><span class="cc-rnd">R'+r.round+'</span><span class="cc-flag">'+cflag(r.country)+'</span>'+badge+'</div>'+
          '<div class="cc-name">'+esc(r.name.replace(/ Grand Prix$/," GP"))+'</div>'+
          '<div class="cc-loc">'+esc(r.locality?(r.locality+", "+r.country):(r.country||r.circuit||""))+'</div>'+
          '<div class="cc-date">'+esc(fmtCalDate(r.date))+'</div>'+
          foot+'</div>';
      }).join("");
    }
    function render(d){
      var se=document.getElementById("f1Season"); if(se) se.textContent = (d.season||"")+(d.round?" · Round "+d.round:"");
      renderStats(d); renderNext(d.nextRace); renderLast(d.lastRace); renderResults(d.lastRace); renderCalendar(d);
      var dLead = (d.drivers||[])[0] ? +d.drivers[0].pts : 0;
      var cLead = (d.constructors||[])[0] ? +d.constructors[0].pts : 0;
      document.getElementById("f1Drivers").innerHTML = (d.drivers||[]).map(function(x){ return standRow(x, dLead, false); }).join("") || '<div class="f1-msg">No data.</div>';
      document.getElementById("f1Constructors").innerHTML = (d.constructors||[]).map(function(x){ return standRow(x, cLead, true); }).join("") || '<div class="f1-msg">No data.</div>';
      document.getElementById("f1News").innerHTML = (d.news||[]).map(function(n){
        return '<a class="f1-newslink" href="'+esc(n.link)+'" data-title="'+esc(n.title)+'" data-date="'+esc(n.date||"")+'">'+esc(n.title)+(n.date?'<span class="fd">'+esc(fmtNewsDate(n.date))+'</span>':'')+'</a>';
      }).join("") || '<div class="f1-msg">No news.</div>';
      wireLogos(view);
      if(app.classList.contains("f1-mode")) startCd();
    }
    // client-side schedule fallback (direct from Jolpica, CORS-enabled) — keeps the calendar/progress working
    // even when the app server predates the /api/f1 schedule field. Silently no-ops on failure.
    function fillSchedule(d){
      Promise.all([
        fetch("https://api.jolpi.ca/ergast/f1/current.json").then(function(r){ return r.json(); }),
        fetch("https://api.jolpi.ca/ergast/f1/current/results/1.json?limit=100").then(function(r){ return r.json(); }).catch(function(){ return null; })
      ]).then(function(res){
        var j=res[0], wj=res[1];
        var races = (j && j.MRData && j.MRData.RaceTable && j.MRData.RaceTable.Races) || [];
        if(!races.length) return;
        var winners = {};
        try{ ((wj&&wj.MRData.RaceTable.Races)||[]).forEach(function(r){ var w=r.Results&&r.Results[0]; if(w) winners[r.round]={ code:w.Driver.code||"", name:w.Driver.givenName+" "+w.Driver.familyName, team:w.Constructor.name, teamId:w.Constructor.constructorId }; }); }catch(e){}
        var today = new Date().toISOString().slice(0,10);
        d.totalRounds = races.length;
        d.schedule = races.map(function(r){
          var loc = r.Circuit && r.Circuit.Location ? r.Circuit.Location : {};
          return { round:+r.round, name:r.raceName, locality:loc.locality||"", country:loc.country||"",
                   circuit:r.Circuit?r.Circuit.circuitName:"", date:r.date, time:r.time||"",
                   done: !!winners[r.round] || r.date<today, winner: winners[r.round]||null };
        });
        renderStats(d); renderCalendar(d);
      }).catch(function(){});
    }
    function load(){
      loaded = true;
      var hint=document.getElementById("f1Hint"); if(hint) hint.textContent = "Loading…";
      fetch("/api/f1").then(function(r){ return r.json(); }).then(function(d){
        if(!d.ok) throw new Error(d.error||"failed");
        render(d);
        // older server builds don't return the schedule — pull it straight from the source so the calendar + progress still work
        if(!(d.schedule && d.schedule.length)) fillSchedule(d);
        if(hint) hint.textContent = "Updated "+fmtNewsDate(d.fetchedAt)+" · live";
      }).catch(function(e){
        loaded = false;
        if(hint) hint.textContent = "Couldn’t load";
        document.getElementById("f1Next").innerHTML = '<div class="f1-msg">Couldn’t load F1 data — '+esc(String(e.message||e))+'. Check your connection and toggle again.</div>';
        ["f1Last","f1Drivers","f1Constructors","f1News"].forEach(function(id){ document.getElementById(id).innerHTML=""; });
      });
    }
    function setOn(on, animate){
      if(animate) playViewWipe();
      app.classList.toggle("f1-mode", on);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on?"true":"false");
      try{ sessionStorage.setItem("pitwall_f1", on?"1":"0"); }catch(e){}
      if(on){ window.scrollTo(0,0); if(!loaded) load(); else startCd(); }
      else { stopCd(); }
    }
    btn.addEventListener("click", function(){ setOn(!app.classList.contains("f1-mode"), true); });

    // the full season calendar lives inside the Race Weekend section, revealed inline by the next-race card button
    function setCalOpen(open){
      var wrap=document.getElementById("f1CalWrap"), btn=document.getElementById("f1NextCalBtn");
      if(wrap) wrap.classList.toggle("show", open);
      if(btn){ btn.classList.toggle("open", open); btn.setAttribute("aria-expanded", open?"true":"false");
        var lbl=btn.querySelector(".lbl"); if(lbl) lbl.textContent = open ? "Hide race calendar" : "View full race calendar"; }
    }
    view.addEventListener("click", function(ev){
      if(!ev.target.closest("#f1NextCalBtn")) return;
      var wrap=document.getElementById("f1CalWrap");
      var open = !(wrap && wrap.classList.contains("show"));
      setCalOpen(open);
      if(open && wrap) setTimeout(function(){ wrap.scrollIntoView({behavior:"smooth", block:"nearest"}); }, 80);
    });

    // news opens in an in-app reader dialog (fetches the full article from the server)
    var newsEl = document.getElementById("f1News");
    var reader = document.getElementById("f1Reader");
    var rTitle = document.getElementById("f1ReaderTitle");
    var rMeta = document.getElementById("f1ReaderMeta");
    var rBody = document.getElementById("f1ReaderBody");
    var rExt = document.getElementById("f1ReaderExternal");
    var rReq = 0;
    function closeReader(){ if(reader) reader.classList.remove("show"); }
    function fallbackMsg(url){ return '<div class="reader-msg">Couldn’t load the full article here. <a href="'+esc(url)+'" target="_blank" rel="noopener">Read it on the original site ↗</a></div>'; }
    function openReader(url, title, date){
      if(!reader){ window.open(url, "pitwall-reader"); return; }  // safety net if modal missing
      var my = ++rReq;
      rTitle.textContent = title || "Article";
      rMeta.textContent = date ? fmtNewsDate(date) : "";
      rExt.href = url;
      rBody.innerHTML = '<div class="reader-msg">Loading article…</div>';
      reader.classList.add("show");
      fetch("/api/f1/article?url="+encodeURIComponent(url)).then(function(r){ return r.json(); }).then(function(d){
        if(my!==rReq) return;  // a newer article was opened — ignore this response
        if(!d.ok || !d.paragraphs || !d.paragraphs.length){ rBody.innerHTML = fallbackMsg(url); return; }
        if(d.title) rTitle.textContent = d.title;
        var html = d.image ? '<img src="'+esc(d.image)+'" alt="">' : '';
        html += d.paragraphs.map(function(p){ return '<p>'+esc(p)+'</p>'; }).join("");
        rBody.innerHTML = html; rBody.scrollTop = 0;
      }).catch(function(){ if(my===rReq) rBody.innerHTML = fallbackMsg(url); });
    }
    if(newsEl) newsEl.addEventListener("click", function(ev){
      var a = ev.target.closest("a"); if(!a || !a.href) return;
      ev.preventDefault();
      openReader(a.href, a.getAttribute("data-title"), a.getAttribute("data-date"));
    });
    var rClose = document.getElementById("f1ReaderClose");
    if(rClose) rClose.addEventListener("click", closeReader);
    if(reader) reader.addEventListener("click", function(ev){ if(ev.target===reader) closeReader(); });
    document.addEventListener("keydown", function(ev){ if(ev.key==="Escape" && reader && reader.classList.contains("show")) closeReader(); });
    var saved="0"; try{ saved = sessionStorage.getItem("pitwall_f1")||"0"; }catch(e){}
    if(saved==="1") setOn(true);
  })();

  var orderEl = document.getElementById("order");
  if(orderEl) orderEl.addEventListener("click", function(ev){
    var row = ev.target.closest(".lb-row"); if(!row) return;
    var i = +row.dataset.i;
    if(curFeedStories[i]) openEditor(curFeedStories[i]);
  });

  // running-order paste controls (modal dialog)
  var orderBtn=document.getElementById("orderBtn"), orderModal=document.getElementById("orderModal");
  function openOrderModal(){
    if(!orderModal) return;
    var ta=document.getElementById("orderInput");
    if(ta){ var ord=getOrder(); ta.value = ord.length ? ord.map(function(e){ return e.ws ? (e.ws+"/story/"+e.id) : ("#"+e.id); }).join("\n") : ""; }
    orderModal.classList.add("show");
    setTimeout(function(){ if(ta) ta.focus(); }, 60);
  }
  function closeOrderModal(){ if(orderModal) orderModal.classList.remove("show"); }
  if(orderBtn) orderBtn.addEventListener("click", openOrderModal);
  var omClose=document.getElementById("orderModalClose"); if(omClose) omClose.addEventListener("click", closeOrderModal);
  if(orderModal) orderModal.addEventListener("click", function(ev){ if(ev.target===orderModal) closeOrderModal(); });
  document.addEventListener("keydown", function(ev){ if(ev.key==="Escape") closeOrderModal(); });
  var oApply=document.getElementById("orderApply"); if(oApply) oApply.addEventListener("click", applyOrder);
  var oClear=document.getElementById("orderClear"); if(oClear) oClear.addEventListener("click", clearOrder);
  var orderListEl=document.getElementById("orderList");
  if(orderListEl) orderListEl.addEventListener("click", function(ev){
    var chk=ev.target.closest(".ol-check");
    if(chk){ ev.stopPropagation(); toggleOrderDone(chk.dataset.ws, +chk.dataset.id); return; }
    var row=ev.target.closest(".ol-row"); if(!row || row.classList.contains("err")) return;
    var w=row.dataset.ws, id=+row.dataset.id, nm=row.querySelector(".ol-name");
    if(w && w!==ws) setWorkspace(w);   // retarget the dashboard so the editor uses the right workspace
    openEditor({ id:id, name:nm?nm.textContent:("#"+id), ws:w });
  });
  refreshOrderUI();
  buildOrderList();

  // ---- Reflex Ring mini-game (mini-osu) ----
  (function initReflexRing(){
    var modal=document.getElementById("pitGame"); if(!modal) return;
    var stage=document.getElementById("osuStage"), scoreEl=document.getElementById("pgScore"),
        bestEl=document.getElementById("pgBest"), promptEl=document.getElementById("pgPrompt"),
        goBtn=document.getElementById("pgGo");
    if(!stage) return;
    var N=10, HITR=0.088, dots=[], centers=[], active=-1, score=0, win=1500, lives=3, alive=false, missTO=0, best=0, lastMx=-1, lastMy=-1;
    try{ best=parseInt(localStorage.getItem("pitwall_reflex_best"),10)||0; }catch(e){}

    // lay 10 circles evenly around the ring (positions stored as 0..1 fractions of the stage)
    for(var i=0;i<N;i++){
      var ang=(i/N)*Math.PI*2 - Math.PI/2;
      var cx=0.5+0.42*Math.cos(ang), cy=0.5+0.42*Math.sin(ang);
      var d=document.createElement("div"); d.className="osu-dot";
      d.style.left=(cx*100)+"%"; d.style.top=(cy*100)+"%";
      d.innerHTML='<span class="osu-appr"></span>';
      stage.appendChild(d); dots.push(d); centers.push({x:cx,y:cy});
    }
    function setBest(){ bestEl.textContent = best>0 ? ("Best "+best) : "Best —"; }
    function hearts(){ var h=""; for(var k=0;k<3;k++) h+=(k<lives?"♥":"♡"); return h; }
    function showPlaying(){ promptEl.innerHTML='<span class="pg-lives">'+hearts()+'</span> &nbsp;hover the glowing circle'; }
    function clearActive(){
      if(active<0) return;
      var d=dots[active]; d.classList.remove("on");
      var ap=d.querySelector(".osu-appr"); ap.style.transition="none"; ap.style.opacity="0"; ap.style.transform="scale(2.4)";
      active=-1;
    }
    function activate(i){
      active=i; var d=dots[i]; d.classList.add("on");
      var ap=d.querySelector(".osu-appr");
      ap.style.transition="none"; ap.style.opacity="1"; ap.style.transform="scale(2.4)"; void ap.offsetWidth;
      ap.style.transition="transform "+win+"ms linear, opacity "+win+"ms linear";
      ap.style.transform="scale(1)"; ap.style.opacity=".2";
      clearTimeout(missTO); missTO=setTimeout(miss, win);
      // already hovering this circle when it lit up? count it
      setTimeout(function(){ if(alive && active===i && lastMx>=0){ var c=centers[i], dx=lastMx-c.x, dy=lastMy-c.y; if(dx*dx+dy*dy<=HITR*HITR) doHit(); } }, 0);
    }
    function next(){ var i; do{ i=Math.floor(Math.random()*N); }while(i===active && N>1); activate(i); }
    function doHit(){
      clearTimeout(missTO); clearActive();
      score++; scoreEl.innerHTML=score+'<small>hits</small>';
      win=Math.max(380, win*0.94);
      next();
    }
    function rate(s){ return s>=40?"🏆 Inhuman reflexes":s>=25?"🟢 Sharp":s>=12?"🟡 Decent":"🔴 Keep practising"; }
    function miss(){
      lives--;
      if(lives<=0){ gameOver(); return; }
      clearActive(); showPlaying();
      stage.classList.remove("miss"); void stage.offsetWidth; stage.classList.add("miss");
      next();
    }
    function gameOver(){
      alive=false; clearTimeout(missTO); clearActive();
      var beat = score>best;
      if(beat){ best=score; try{ localStorage.setItem("pitwall_reflex_best",String(best)); }catch(e){} }
      setBest();
      promptEl.innerHTML='<b>'+score+' hits</b> — '+rate(score)+(beat&&score>0?' · <b>new best!</b>':'');
      goBtn.style.display=""; goBtn.textContent="Go again";
    }
    function start(){
      clearTimeout(missTO); clearActive();
      score=0; win=1500; lives=3; alive=true; scoreEl.innerHTML='0<small>hits</small>';
      showPlaying(); goBtn.style.display="none"; next();
    }
    function reset(){
      alive=false; clearTimeout(missTO); clearActive(); score=0; lives=3;
      scoreEl.innerHTML='0<small>hits</small>';
      promptEl.innerHTML="Hover the glowing circle. It only gets faster."; goBtn.style.display=""; goBtn.textContent="Start"; setBest();
    }
    // hit detection by cursor proximity to the active circle (robust vs mouseenter edge cases)
    stage.addEventListener("mousemove", function(e){
      var r=stage.getBoundingClientRect();
      lastMx=(e.clientX-r.left)/r.width; lastMy=(e.clientY-r.top)/r.height;
      if(!alive || active<0) return;
      var c=centers[active], dx=lastMx-c.x, dy=lastMy-c.y;
      if(dx*dx+dy*dy<=HITR*HITR) doHit();
    });
    function open(){ modal.classList.add("show"); reset(); }
    function close(){ modal.classList.remove("show"); alive=false; clearTimeout(missTO); clearActive(); }

    document.getElementById("pgClose").addEventListener("click", close);
    modal.addEventListener("click", function(ev){ if(ev.target===modal) close(); });
    goBtn.addEventListener("click", start);
    document.addEventListener("keydown", function(ev){ if(ev.key==="Escape" && modal.classList.contains("show")) close(); });
    var launch=document.getElementById("pitGameBtn"); if(launch) launch.addEventListener("click", open);
    setBest();
  })();

  // ---- Activity feed + team-radio sound (other people's comments + tasks assigned to me) ----
  var radio = document.getElementById("radio");
  var audioPrimed = false, soundMuted = false;
  try{ soundMuted = localStorage.getItem("pitwall_mute") === "1"; }catch(e){}
  var muteChk = document.getElementById("muteChk");
  if(muteChk){ muteChk.checked = soundMuted; muteChk.addEventListener("change", function(){
    soundMuted = muteChk.checked;
    try{ localStorage.setItem("pitwall_mute", soundMuted?"1":"0"); }catch(e){}
    if(soundMuted && radio){ try{ radio.pause(); radio.currentTime=0; }catch(e){} }   // stop any clip already playing
  }); }
  function primeAudio(){ if(audioPrimed||!radio) return; var p=radio.play(); if(p&&p.then) p.then(function(){ radio.pause(); radio.currentTime=0; audioPrimed=true; }).catch(function(){}); }
  document.addEventListener("click", primeAudio);
  function playRadio(){ if(soundMuted||!radio) return; try{ radio.currentTime=0; var p=radio.play(); if(p&&p.catch) p.catch(function(){}); }catch(e){} }

  var actSeen = Object.create(null), actBaseline = false, notifList = [], unread = 0;
  function fmtAgo(ts){ try{ var s=Math.max(0,(Date.now()-new Date(ts))/1000); if(s<60) return "just now"; if(s<3600) return Math.floor(s/60)+"m ago"; if(s<86400) return Math.floor(s/3600)+"h ago"; return Math.floor(s/86400)+"d ago"; }catch(e){ return ""; } }
  function renderNotif(){
    var badge=document.getElementById("bellBadge");
    if(badge){ if(unread>0){ badge.hidden=false; badge.textContent = unread>9?"9+":unread; } else badge.hidden=true; }
    var list=document.getElementById("notifList"); if(!list) return;
    if(!notifList.length){ list.innerHTML='<div class="notif-empty">Listening for activity…</div>'; return; }
    list.innerHTML = notifList.slice(0,40).map(function(a){
      var head = a.kind==="comment" ? ('💬 '+esc(a.who)+' commented') : '🏁 Assigned to you';
      var meta = a.kind==="comment" ? esc(a.text||"") : (esc(a.state)+" · "+a.ws.toUpperCase());
      return '<a class="notif-item" href="'+a.app_url+'" target="_blank" rel="noopener">'+
        '<span class="notif-dot '+a.ws+'"></span>'+
        '<div><div class="notif-name">'+head+' · '+esc(a.name)+'</div><div class="notif-meta">'+meta+'</div></div>'+
        '<span class="notif-time">'+fmtAgo(a.ts)+'</span></a>';
    }).join("");
  }
  function ringBell(){ var b=document.getElementById("bellBtn"); if(!b) return; b.classList.add("ring"); setTimeout(function(){ b.classList.remove("ring"); }, 700); }
  function pollActivity(){
    if(!isServed) return;
    fetch("/api/activity").then(function(r){ return r.json(); }).then(function(res){
      if(!res.ok || !res.activity) return;
      renderTicker(res.activity);
      var fresh = [];
      res.activity.forEach(function(a){ if(actSeen[a.key]) return; actSeen[a.key]=1; if(actBaseline) fresh.push(a); });
      if(!actBaseline){ actBaseline=true; renderNotif(); return; }  // first poll = baseline, don't alert
      if(fresh.length){ notifList = fresh.concat(notifList); if(notifList.length>60) notifList.length=60; unread+=fresh.length; renderNotif(); ringBell(); playRadio(); saverFlash(fresh[0]); }
    }).catch(function(){});
  }
  var bellBtn=document.getElementById("bellBtn"), notifPanel=document.getElementById("notifPanel");
  if(bellBtn) bellBtn.addEventListener("click", function(ev){ ev.stopPropagation(); primeAudio(); if(!notifPanel) return; var open=notifPanel.classList.toggle("show"); if(open){ unread=0; renderNotif(); } });
  document.addEventListener("click", function(ev){ if(notifPanel && notifPanel.classList.contains("show") && !ev.target.closest(".bell-wrap")) notifPanel.classList.remove("show"); });
  renderTicker([]);   // default content until the first activity poll lands
  if(isServed){ pollActivity(); setInterval(pollActivity, 60000); }

  // ---- Idle screensaver: telemetry stream + shift countdown ----
  var saverEl = document.getElementById("saver");
  var saverCanvas = document.getElementById("saverCanvas");
  var saverOn = false, saverRaf = null, saverCdTimer = null, saverFlashT = null;
  var IDLE_MS = 600000, idleTimer = null;

  // rev-light LEDs (5 green · 5 red · 5 blue)
  (function(){
    var rev = document.getElementById("saverRev"); if(!rev) return;
    var cls = ["g","g","g","g","g","r","r","r","r","r","b","b","b","b","b"];
    rev.innerHTML = cls.map(function(c){ return '<span class="rev-led '+c+'"></span>'; }).join("");
  })();
  var revLeds = saverEl ? saverEl.querySelectorAll(".rev-led") : [];

  // ---- Reaction start-lights mini-game (lives inside the saver) ----
  var sgLights = document.getElementById("sgLights");
  var sgStatusEl = document.getElementById("sgStatus");
  var sgTimeEl = document.getElementById("sgTime");
  if(sgLights){
    var pods = "";
    for(var p=0;p<5;p++) pods += '<div class="sg-pod"><span class="sg-lamp"></span><span class="sg-lamp"></span></div>';
    sgLights.innerHTML = pods;
  }
  var sgPods = sgLights ? sgLights.querySelectorAll(".sg-pod") : [];
  var sgState = "idle";   // idle | lighting | hold | go | result | false
  var sgTimers = [], sgT0 = 0, sgBest = null;

  function sgClearTimers(){ sgTimers.forEach(clearTimeout); sgTimers = []; }
  function sgLit(n){ for(var i=0;i<sgPods.length;i++) sgPods[i].classList.toggle("on", i<n); }
  function sgSay(text, cls){ if(sgStatusEl){ sgStatusEl.textContent = text; sgStatusEl.className = "sg-status" + (cls?(" "+cls):""); } }
  function sgShowTime(text, cls){ if(sgTimeEl){ sgTimeEl.textContent = text; sgTimeEl.className = "sg-time" + (cls?(" "+cls):""); } }
  function sgGrade(ms){
    if(ms<150) return "Lightning reflexes";
    if(ms<220) return "Pro grid";
    if(ms<300) return "Quick";
    if(ms<450) return "Solid";
    return "Asleep at the line";
  }
  function sgReset(){
    sgClearTimers(); sgState = "idle"; sgLit(0);
    if(saverEl) saverEl.classList.remove("playing");   // restore the telemetry surroundings
    sgSay("▶ Press SPACE — reaction test");
    sgShowTime(sgBest!=null ? ("best "+sgBest+" ms") : "");
  }
  function sgArm(){
    if(saverEl) saverEl.classList.add("playing");      // recede the surroundings → focus on the game
    sgClearTimers(); sgState = "lighting"; sgLit(0); sgShowTime("");
    sgSay("Lights coming on…", "wait");
    var i = 0;
    function next(){
      i++; sgLit(i);
      if(i >= 5){
        sgState = "hold"; sgSay("Wait for it…", "wait");
        sgTimers.push(setTimeout(sgGo, 1100 + Math.floor(Math.random()*2200)));
      } else {
        sgTimers.push(setTimeout(next, 1000));
      }
    }
    sgTimers.push(setTimeout(next, 600));
  }
  function sgGo(){ sgState = "go"; sgLit(0); sgT0 = performance.now(); sgSay("GO!", "go"); }
  function sgReact(){
    var ms = Math.round(performance.now() - sgT0);
    sgState = "result";
    if(sgBest==null || ms<sgBest) sgBest = ms;
    sgShowTime(ms+" ms", "good");
    sgSay(sgGrade(ms)+" · SPACE to retry");
  }
  function sgFalse(){
    sgClearTimers(); sgState = "false"; sgLit(5);
    sgShowTime("JUMP START", "bad");
    sgSay("Too early — SPACE to retry");
  }
  function sgPress(){
    switch(sgState){
      case "idle": case "result": case "false": sgArm(); break;
      case "lighting": case "hold": sgFalse(); break;   // anticipated the lights
      case "go": sgReact(); break;
    }
  }

  function pad2(n){ return (n<10?"0":"")+n; }
  function updateCountdown(){
    var now = new Date(), lab="Chequered Flag In", sub="Race ends 18:00", target;
    var start = new Date(now); start.setHours(9,0,0,0);
    var end = new Date(now); end.setHours(18,0,0,0);
    var cd = document.getElementById("svCd");
    if(now < start){ target=start; lab="Shift starts in"; sub="Lights out 09:00"; }
    else if(now < end){ target=end; lab="Chequered Flag In"; sub="Race ends 18:00"; }
    else { document.getElementById("svLab").textContent="Shift complete"; if(cd) cd.textContent="🏁"; document.getElementById("svSub").textContent="Off the clock"; return; }
    var ms = target - now, s=Math.floor(ms/1000);
    var hh=Math.floor(s/3600), mm=Math.floor((s%3600)/60), ss=s%60;
    document.getElementById("svLab").textContent = lab;
    if(cd) cd.textContent = pad2(hh)+":"+pad2(mm)+":"+pad2(ss);
    document.getElementById("svSub").textContent = sub;
  }

  function saverStats(){
    var box=document.getElementById("svStats"); if(!box) return;
    var m=metricMap(D);
    var cells=[
      { l:"Ongoing", v:(m.ongoing_tasks||0) },
      { l:"Ready for QA", v:(m.ready_for_qa||0) },
      { l:"Tested", v:(m.tested||0) }
    ];
    box.innerHTML = cells.map(function(c){ return '<div class="saver-cell"><div class="sc-v">'+c.v+'</div><div class="sc-l">'+c.l+'</div></div>'; }).join("");
    var foot=document.getElementById("svFoot");
    if(foot) foot.textContent = D.meta.workspace+" · "+D.meta.windowLabel+" · press ENTER or ESC to resume";
  }

  function trace(ctx,w,h,t,o){
    ctx.beginPath();
    for(var i=0;i<=w;i+=6){
      var p=i/w, v=o.base + o.amp*(Math.sin(p*o.f1*6.2832 + t*o.s1)*0.6 + Math.sin(p*o.f2*6.2832 - t*o.s2)*0.4);
      var y=h*(1-v); if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y);
    }
    ctx.save(); ctx.globalAlpha=0.55; ctx.strokeStyle=o.color; ctx.lineWidth=1.8; ctx.shadowBlur=7; ctx.shadowColor=o.color; ctx.stroke(); ctx.restore();
  }
  function saverFrame(ts){
    if(!saverOn) return;
    var ctx=saverCanvas.getContext("2d"), w=saverCanvas.width, h=saverCanvas.height, t=ts/1000;
    ctx.clearRect(0,0,w,h);
    // faint scrolling grid
    ctx.strokeStyle="rgba(90,106,125,.10)"; ctx.lineWidth=1; ctx.beginPath();
    var off=(t*8)% 70;
    for(var gx=-off; gx<w; gx+=70){ ctx.moveTo(gx,0); ctx.lineTo(gx,h); }
    for(var gy=0; gy<h; gy+=70){ ctx.moveTo(0,gy); ctx.lineTo(w,gy); }
    ctx.stroke();
    // telemetry traces (speed / throttle / brake) — very slow, calm backdrop
    var st=t*0.22;
    trace(ctx,w,h,st,{base:.56,amp:.17,f1:3,f2:7,s1:1.1,s2:1.7,color:"#19c2e6"});
    trace(ctx,w,h,st,{base:.34,amp:.13,f1:5,f2:11,s1:1.6,s2:2.3,color:"#37d67a"});
    trace(ctx,w,h,st,{base:.18,amp:.12,f1:8,f2:4,s1:2.4,s2:1.2,color:"#e10600"});
    // rev lights + readouts (sawtooth rev that shifts)
    var rev=(t*0.85)%1, lit=Math.floor(rev*revLeds.length)+1;
    for(var i=0;i<revLeds.length;i++) revLeds[i].classList.toggle("on", i<lit);
    var spd=Math.round(70 + rev*270 + Math.sin(t*3)*8);
    var spEl=document.getElementById("svSpd"); if(spEl) spEl.textContent=spd;
    var gEl=document.getElementById("svGear"); if(gEl) gEl.textContent=Math.min(8, Math.floor(rev*8)+1);
    saverRaf=requestAnimationFrame(saverFrame);
  }

  function sizeSaver(){ if(!saverCanvas) return; var dpr=Math.min(2, window.devicePixelRatio||1); saverCanvas.width=Math.floor(window.innerWidth*dpr); saverCanvas.height=Math.floor(window.innerHeight*dpr); }
  function modalOpen(){ return !!document.querySelector(".fmodal.show"); }
  var SAVER_QUOTES = [
    "Onto fresher tires",
    "He's on cold tires now",
    "Where will he emerge?",
    "Limiters off",
    "Working the tires",
    "Into the pit window",
    "The undercut is on",
    "He's got DRS",
    "Tires coming alive",
    "Lifting and coasting",
    "Managing the gap",
    "Backing the pack up",
    "That's a purple sector",
    "Box, box this lap",
    "Track position is everything",
    "Hammer down now",
    "Out lap on the softs",
    "He's struggling for grip"
  ];
  function randomQuote(){ return SAVER_QUOTES[Math.floor(Math.random()*SAVER_QUOTES.length)]; }
  function showSaver(){
    if(saverOn || !saverEl || !isServed || modalOpen()) return;
    saverOn=true; sizeSaver(); saverStats(); updateCountdown(); sgReset();
    saverEl.classList.remove("resuming");
    saverEl.classList.add("show");
    saverCdTimer=setInterval(updateCountdown, 1000);
    saverRaf=requestAnimationFrame(saverFrame);
  }
  function hideSaver(){
    if(!saverOn) return;
    saverOn=false;
    if(saverRaf) cancelAnimationFrame(saverRaf);
    if(saverCdTimer) clearInterval(saverCdTimer);
    sgClearTimers();
    // resume: checkered wipe + a random commentary line flashes, then reveal the dashboard
    var go=document.getElementById("svGo"); if(go) go.textContent=randomQuote();
    saverEl.classList.add("resuming");
    setTimeout(function(){ saverEl.classList.remove("show","resuming"); }, 1260);
  }
  function saverFlash(a){
    if(!saverOn || !a) return;
    var el=document.getElementById("svFlash"); if(!el) return;
    el.textContent = (a.kind==="comment" ? ("💬 "+a.who+" commented") : "🏁 Assigned to you") + " · " + a.name;
    el.classList.add("show");
    clearTimeout(saverFlashT); saverFlashT=setTimeout(function(){ el.classList.remove("show"); }, 6000);
  }
  // Resume requires ENTER. Activity only matters for the idle timer while the saver is OFF.
  function resumeSaver(){ hideSaver(); clearTimeout(idleTimer); idleTimer=setTimeout(showSaver, IDLE_MS); }
  function resetIdle(){
    if(saverOn) return;            // saver showing → ignore mouse/keys; wait for ENTER
    clearTimeout(idleTimer); idleTimer=setTimeout(showSaver, IDLE_MS);
  }
  // Manual trigger: the screensaver / lock button in the header.
  var saverBtn = document.getElementById("logoSaver");
  if(saverBtn) saverBtn.addEventListener("click", function(e){
    e.preventDefault(); e.stopPropagation();
    if(saverOn || modalOpen()) return;
    clearTimeout(idleTimer);
    saverBtn.blur();   // so a stray key doesn't re-click the button
    showSaver();
  });
  // While the saver is up: SPACE plays the reaction game, ENTER/ESC resume, everything else is swallowed.
  // Captured before the bubble-phase listeners so the mouse can never resume the dashboard.
  window.addEventListener("keydown", function(e){
    if(!saverOn) return;
    if(e.code==="Space" || e.key===" " || e.key==="Spacebar"){
      e.preventDefault(); e.stopPropagation(); sgPress(); return;
    }
    if(e.code==="Enter" || e.code==="NumpadEnter" || e.key==="Enter" || e.code==="Escape" || e.key==="Escape"){
      e.preventDefault(); e.stopPropagation(); resumeSaver(); return;
    }
    e.stopPropagation();   // no other key (and no mouse) resumes — lock-screen behavior
  }, true);
  ["mousemove","mousedown","keydown","wheel","touchstart"].forEach(function(ev){ document.addEventListener(ev, resetIdle, {passive:true}); });
  window.addEventListener("resize", function(){ if(saverOn) sizeSaver(); });
  resetIdle();

  // ---- Sync loader: spinning F1 tyre ----
  var LD_PHRASES = ["Lights out","Box, box","Hammer time","Push now","Full send","Sector purple","DRS enabled","Pit window open","Get in there"];
  var TYRE_SVG =
    '<svg class="ld-wheel" viewBox="0 0 100 100">'+
      '<circle class="ld-tyre-o" cx="50" cy="50" r="40"/>'+
      '<circle class="ld-tread" cx="50" cy="50" r="40"/>'+
      '<circle class="ld-rim" cx="50" cy="50" r="27"/>'+
      '<line class="ld-spoke" x1="50" y1="50" x2="50" y2="26"/>'+
      '<line class="ld-spoke" x1="50" y1="50" x2="72.8" y2="42.6"/>'+
      '<line class="ld-spoke" x1="50" y1="50" x2="64.1" y2="69.4"/>'+
      '<line class="ld-spoke" x1="50" y1="50" x2="35.9" y2="69.4"/>'+
      '<line class="ld-spoke" x1="50" y1="50" x2="27.2" y2="42.6"/>'+
      '<circle class="ld-hub" cx="50" cy="50" r="6"/>'+
      '<circle class="ld-brake" cx="50" cy="14" r="3.4"/>'+
    '</svg>';
  var loaderAt = 0;
  function showLoader(){
    var L=document.getElementById("loader"), T=document.getElementById("loaderTrack");
    if(!L||!T) return;
    var nm=document.getElementById("loaderName"); if(nm) nm.textContent = LD_PHRASES[Math.floor(Math.random()*LD_PHRASES.length)];
    T.innerHTML = TYRE_SVG;
    L.classList.add("show"); loaderAt = Date.now();
  }
  function hideLoader(){
    var L=document.getElementById("loader"); if(!L) return;
    var wait = Math.max(0, 1100 - (Date.now()-loaderAt));
    setTimeout(function(){ L.classList.remove("show"); }, wait);
  }

  // ---- Sync (button + hourly auto-refresh) ----
  var btn = document.getElementById("syncBtn");
  var label = document.getElementById("syncLabel");
  var syncing = false;
  // ---- persistent connection/freshness status in the header (survives after the toast fades) ----
  function setSyncStatus(state, msg){
    var up=document.querySelector(".tb-upd"); if(!up) return;
    up.classList.remove("is-ok","is-sync","is-err","is-stale","is-offline");
    up.classList.add("is-"+state);
    var lab=up.querySelector(".tb-updlab");
    var labels={ ok:"Updated", sync:"Syncing…", err:"Sync failed", stale:"Stale", offline:"Offline" };
    if(lab) lab.textContent = labels[state]||"Updated";
    up.title = msg || (state==="err"?"Click to retry":state==="stale"?"Snapshot is old — click to refresh":"");
    var bar=document.getElementById("syncBar"); if(bar) bar.classList.toggle("go", state==="sync");
  }
  function checkFreshness(){                                          // flags a stale snapshot so old numbers don't look live
    var up=document.querySelector(".tb-upd"); if(!up) return;
    if(up.classList.contains("is-sync")||up.classList.contains("is-err")||up.classList.contains("is-offline")) return;
    var t = (D && D.meta && D.meta.generatedAt) ? new Date(D.meta.generatedAt).getTime() : 0;
    var age = t ? (Date.now()-t) : 0;
    if(t && age > 2*3600*1000) setSyncStatus("stale", "Snapshot is ~"+Math.round(age/3600000)+"h old — click to refresh");
    else setSyncStatus("ok");
  }

  function doSync(auto){
    if(!isServed){
      if(!auto) toast("Open via the local server for live sync →  node server.js  →  http://localhost:4173", "err");
      return;
    }
    if(syncing) return;
    syncing = true;
    setSyncStatus("sync", auto ? "Auto-syncing…" : "Syncing…");
    if(!auto) showLoader();
    if(btn){ btn.disabled = true; btn.classList.add("spin"); }
    if(label) label.textContent = auto ? "Auto…" : "Syncing…";
    fetch("/api/refresh").then(function(r){ return r.json(); }).then(function(res){
      if(res.ok && res.snapshot && res.snapshot[ws] && res.snapshot[ws][win]){
        ALL = window.SC_DATA = res.snapshot;
        if(!ALL[ws][win]) win = Object.keys(ALL[ws])[0];
        D = dataset();
        renderAll(false);
        orderResolved = {};   // drop cached per-story states so the running order re-pulls live status on every sync
        buildOrderList();
        setSyncStatus("ok");
        toast((auto?"Auto-synced":"Synced")+" — live · " + D.meta.workspace + " · " + D.meta.windowLabel, "ok");
      } else {
        var err = res.error || "unknown error";
        var tokenIssue = /token/i.test(err);
        setSyncStatus("err", err);
        toast((tokenIssue?"Sync failed — check your Shortcut token: ":"Sync failed: ") + err, "err");
      }
    }).catch(function(e){
      var offline = (typeof navigator!=="undefined" && navigator.onLine===false);
      setSyncStatus(offline?"offline":"err", offline?"You appear to be offline":e.message);
      toast(offline ? "Offline — can't reach the server." : ("Sync failed: " + e.message), "err");
    }).finally(function(){
      syncing = false;
      if(!auto) hideLoader();
      if(btn){ btn.disabled = false; btn.classList.remove("spin"); }
      if(label) label.textContent = "Sync";
    });
  }
  if(btn) btn.addEventListener("click", function(){ doSync(false); });
  // auto-refresh every hour
  if(isServed) setInterval(function(){ doSync(true); }, 3600000);
  setInterval(checkFreshness, 60000);                                // keep the freshness dot honest between syncs
  (function(){ var up=document.querySelector(".tb-upd"); if(!up) return;   // click the status to retry when failed/stale
    up.style.cursor="pointer";
    up.addEventListener("click", function(){ if(up.classList.contains("is-err")||up.classList.contains("is-stale")||up.classList.contains("is-offline")) doSync(false); });
  })();

  // ---- lift the sticky top nav with a shadow once the page scrolls beneath it ----
  (function(){
    var tb = document.querySelector(".topbar"); if(!tb) return;
    var ticking = false;
    function upd(){ tb.classList.toggle("condensed", (window.scrollY || document.documentElement.scrollTop || 0) > 8); ticking = false; }
    window.addEventListener("scroll", function(){ if(!ticking){ ticking = true; requestAnimationFrame(upd); } }, {passive:true});
    upd();
  })();

  // ================= The Garage — Playwright automation manager =================
  (function(){
    var btn=document.getElementById("garageBtn"), app=document.getElementById("app"), view=document.getElementById("garageView");
    if(!btn || !view) return;
    var f1Btn=document.getElementById("f1Btn"), pdkBtn=document.getElementById("paddockBtn");
    var loaded=false, cfg=null, tree=[], current=null, dirty=false, runId=null, pollT=null;

    var elTree=document.getElementById("grgTree"), elFilter=document.getElementById("grgFilter"),
        elPath=document.getElementById("grgPath"), elCode=document.getElementById("grgCode"),
        elSave=document.getElementById("grgSave"), elRun=document.getElementById("grgRun"),
        elProject=document.getElementById("grgProject"), elDirty=document.getElementById("grgDirty"),
        elSaveStatus=document.getElementById("grgSaveStatus"), elStop=document.getElementById("grgStop"),
        elResFlag=document.getElementById("grgResFlag"), elResSummary=document.getElementById("grgResSummary"),
        elResBody=document.getElementById("grgResBody"), elSub=document.getElementById("grgSub");

    function setOn(on){
      app.classList.toggle("garage-mode", on);                          // exclusivity is handled centrally (see the view coordinator)
      view.classList.toggle("show", on);
      btn.setAttribute("aria-pressed", on?"true":"false");
      btn.classList.toggle("on", on);
      if(on && !loaded){ loaded=true; init(); }
    }
    btn.addEventListener("click", function(){ setOn(!app.classList.contains("garage-mode")); });

    function notice(html){ elResBody.innerHTML='<div class="grg-notice">'+html+'</div>'; }
    function setFlag(kind, label){ elResFlag.className="grg-res-flag "+kind; elResFlag.textContent=label; }

    function init(){
      if(!isServed){ elTree.innerHTML='<div class="grg-tree-empty">Start the local server (<code>node server.js</code>) to manage tests.</div>'; return; }
      apiGet("/api/garage/config").then(function(res){
        cfg=res;
        if(!res.ok || !res.exists){ elTree.innerHTML='<div class="grg-tree-empty">Playwright project not found. Set <code>root</code> in <code>.garage.json</code>.</div>'; elSub.textContent="Configure .garage.json"; return; }
        elSub.textContent=res.root;
        elProject.innerHTML='<option value="">All projects</option>'+(res.projects||[]).map(function(p){ return '<option value="'+esc(p)+'">'+esc(p)+'</option>'; }).join("");
        var gb=document.getElementById("grgGenBtn");
        if(gb && !res.cliAvailable){ gb.disabled=true; gb.title="Claude Code CLI not found — generation needs your Claude plan"; }
        loadTree();
      }).catch(function(e){ elTree.innerHTML='<div class="grg-tree-empty">Config error: '+esc(e.message)+'</div>'; });
    }

    function loadTree(){ apiGet("/api/garage/tree").then(function(res){ tree=res.files||[]; renderTree(); }); }

    function renderTree(){
      var q=(elFilter.value||"").toLowerCase();
      var files=tree.filter(function(f){ return !q || f.path.toLowerCase().indexOf(q)>=0; });
      if(!files.length){ elTree.innerHTML='<div class="grg-tree-empty">'+(tree.length?"No specs match.":"No specs found.")+'</div>'; return; }
      var groups={};
      files.forEach(function(f){ (groups[f.dir]=groups[f.dir]||[]).push(f); });
      elTree.innerHTML=Object.keys(groups).sort().map(function(dir){
        var items=groups[dir].map(function(f){
          return '<div class="grg-file'+(current&&current.path===f.path?" active":"")+'" data-path="'+esc(f.path)+'" title="'+esc(f.path)+'" role="button" tabindex="0">'+
            '<svg class="gf-ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>'+
            '<span class="gf-nm">'+esc(f.name)+'</span></div>';
        }).join("");
        return '<div class="grg-grp"><div class="grg-grp-h"><span class="grg-caret">▼</span>'+esc(dir==="."?"root":dir)+'</div>'+items+'</div>';
      }).join("");
      elTree.querySelectorAll(".grg-grp-h").forEach(function(h){ h.addEventListener("click", function(){ h.parentNode.classList.toggle("collapsed"); }); });
      elTree.querySelectorAll(".grg-file").forEach(function(el){
        el.addEventListener("click", function(){ openFile(el.dataset.path); });
        el.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openFile(el.dataset.path); } });
      });
    }

    function setDirty(d){ dirty=d; elDirty.hidden=!d; }

    function openFile(path){
      if(current && current.path===path && !current.isNew) return;
      if(dirty && !confirm("Discard unsaved changes to this spec?")) return;
      elSaveStatus.textContent="Loading…";
      apiGet("/api/garage/file?path="+encodeURIComponent(path)).then(function(res){
        if(!res.ok){ elSaveStatus.textContent=res.error||"Load failed"; return; }
        current={path:path}; elCode.value=res.content; elCode.disabled=false;
        elPath.textContent=path; setDirty(false); elSave.disabled=false; elRun.disabled=false; elSaveStatus.textContent="";
        if(/story-test/.test(path) && elProject.querySelector('option[value="story-tests"]')) elProject.value="story-tests";
        renderTree();
      });
    }

    elCode.addEventListener("input", function(){ if(current) setDirty(true); });
    elCode.addEventListener("keydown", function(e){
      if((e.metaKey||e.ctrlKey) && (e.key==="s"||e.key==="S")){ e.preventDefault(); save(); return; }
      if(e.key==="Tab"){ e.preventDefault(); var s=elCode.selectionStart, en=elCode.selectionEnd; elCode.value=elCode.value.slice(0,s)+"  "+elCode.value.slice(en); elCode.selectionStart=elCode.selectionEnd=s+2; if(current) setDirty(true); }
    });

    function save(cb){
      if(!current) return;
      elSaveStatus.textContent="Saving…";
      apiPost("/api/garage/save", {path:current.path, content:elCode.value}).then(function(res){
        if(!res.ok){ elSaveStatus.textContent=res.error||"Save failed"; return; }
        var wasNew=current.isNew; current.isNew=false; setDirty(false);
        elPath.textContent=current.path; elSaveStatus.textContent="Saved ✓";
        setTimeout(function(){ if(elSaveStatus.textContent==="Saved ✓") elSaveStatus.textContent=""; }, 2500);
        if(wasNew) loadTree();
        if(cb) cb();
      });
    }
    elSave.addEventListener("click", function(){ save(); });

    // ---- run + poll ----
    function run(){ if(!current) return; if(dirty){ save(doRun); } else doRun(); }
    function doRun(){
      clearRun(); elResBody.innerHTML=""; elResSummary.innerHTML="";
      setFlag("run","RUNNING"); elStop.hidden=false; elRun.disabled=true;
      apiPost("/api/garage/run", {path:current.path, project:elProject.value||undefined}).then(function(res){
        if(!res.ok){ setFlag("fail","ERROR"); notice("<b>Couldn't start run:</b> "+esc(res.error||"")); return endRun(); }
        runId=res.runId; poll();
      }).catch(function(e){ setFlag("fail","ERROR"); notice(esc(e.message)); endRun(); });
    }
    function poll(){
      if(!runId) return;
      apiGet("/api/garage/run-status?id="+encodeURIComponent(runId)).then(function(res){
        if(!res.ok){ setFlag("fail","ERROR"); notice(esc(res.error||"Lost the run.")); return endRun(); }
        renderResults(res);
        if(res.status==="running") pollT=setTimeout(poll, 1500);
        else endRun();
      }).catch(function(){ pollT=setTimeout(poll, 2500); });
    }
    function endRun(){ elStop.hidden=true; elRun.disabled=false; runId=null; }
    function clearRun(){ if(pollT){ clearTimeout(pollT); pollT=null; } }
    elRun.addEventListener("click", run);
    elStop.addEventListener("click", function(){ if(runId) apiPost("/api/garage/stop",{runId:runId}); clearRun(); setFlag("fail","STOPPED"); endRun(); });

    function renderResults(res){
      var r=res.results, elapsed=Math.round((res.elapsedMs||0)/1000);
      if(res.status==="running" && (!r || !r.tests || !r.tests.length)){
        notice("<b>Running…</b> "+esc(current?current.path:"")+" · "+elapsed+"s"+(res.project?" · "+esc(res.project):"")+"<br><small>Playwright reports full results when the run finishes.</small>");
        return;
      }
      if(!r || !r.tests){
        if(res.status!=="running"){ setFlag(res.code===0?"pass":"fail", res.code===0?"DONE":"NO RESULTS"); notice("<b>No parsed results.</b>"+(res.tail?"<br><br><code>"+esc(res.tail)+"</code>":"")); }
        return;
      }
      var st=r.stats||{}, pass=st.expected||0, fail=st.unexpected||0, skip=st.skipped||0;
      if(res.status!=="running") setFlag(fail>0?"fail":"pass", fail>0?"FAILED":"PASSED");
      elResSummary.innerHTML=
        '<div class="grg-sumcell ok"><b>'+pass+'</b><span>Passed</span></div>'+
        '<div class="grg-sumcell '+(fail>0?"bad":"")+'"><b>'+fail+'</b><span>Failed</span></div>'+
        '<div class="grg-sumcell"><b>'+skip+'</b><span>Skipped</span></div>'+
        '<div class="grg-sumcell"><b>'+(Math.round((st.duration||0)/100)/10)+'s</b><span>Time</span></div>';
      elResBody.innerHTML=r.tests.map(function(t){
        return '<div class="grg-test '+(t.ok?"pass":"fail")+'">'+
          '<div class="grg-test-h"><span class="grg-test-pill"></span><span class="grg-test-t">'+esc(t.title||"(test)")+(t.project?' · '+esc(t.project):'')+'</span><span class="grg-test-dur">'+(Math.round(t.duration)||0)+'ms</span></div>'+
          (t.error?'<div class="grg-test-err" hidden>'+esc(t.error)+'</div>':'')+'</div>';
      }).join("");
      elResBody.querySelectorAll(".grg-test").forEach(function(el){
        el.querySelector(".grg-test-h").addEventListener("click", function(){ var e=el.querySelector(".grg-test-err"); if(e) e.hidden=!e.hidden; });
      });
    }

    var elReload=document.getElementById("grgReload");
    if(elReload) elReload.addEventListener("click", function(){ loadTree(); toast("Suite rescanned.",""); });
    elFilter.addEventListener("input", renderTree);

    // ---- generate a spec from a Shortcut story ----
    (function(){
      var modal=document.getElementById("grgGenModal"); if(!modal) return;
      var genWs=ws, chosen=null;
      var elSearch=document.getElementById("grgStorySearch"), elResults=document.getElementById("grgStoryResults"),
          elChip=document.getElementById("grgStoryChip"), elReq=document.getElementById("grgReq"),
          elStatus=document.getElementById("grgGenStatus"), searchTimer=null, lastResults=[];
      function renderChip(){
        elChip.innerHTML = chosen ? '<span class="pdk-chip2"><span class="c2-id">#'+chosen.id+'</span><span class="c2-nm">'+esc(chosen.name||"")+'</span><button type="button" class="c2-x" title="Remove">✕</button></span>' : "";
        var x=elChip.querySelector(".c2-x"); if(x) x.addEventListener("click", function(){ chosen=null; renderChip(); });
      }
      function hideResults(){ elResults.hidden=true; elResults.innerHTML=""; }
      function runSearch(q){
        apiGet("/api/paddock/story-search?ws="+encodeURIComponent(genWs)+"&q="+encodeURIComponent(q)).then(function(res){
          if(!res.ok){ elResults.innerHTML='<div class="pdk-smsg">'+esc(res.error||"Search failed")+'</div>'; elResults.hidden=false; return; }
          lastResults=res.stories||[];
          if(!lastResults.length){ elResults.innerHTML='<div class="pdk-smsg">No matches.</div>'; elResults.hidden=false; return; }
          elResults.innerHTML=lastResults.map(function(s){ return '<button type="button" class="pdk-sresult" data-id="'+s.id+'"><span class="sr-id">#'+s.id+'</span><span class="sr-nm">'+esc(s.name||"")+'</span>'+(s.state?'<span class="sr-st">'+esc(s.state)+'</span>':'')+'</button>'; }).join("");
          elResults.hidden=false;
          elResults.querySelectorAll(".pdk-sresult").forEach(function(b){ b.addEventListener("click", function(){ chosen=lastResults.filter(function(x){ return String(x.id)===b.dataset.id; })[0]||null; renderChip(); elSearch.value=""; hideResults(); }); });
        }).catch(function(e){ elResults.innerHTML='<div class="pdk-smsg">'+esc(e.message)+'</div>'; elResults.hidden=false; });
      }
      elSearch.addEventListener("input", function(){ var q=elSearch.value.trim(); clearTimeout(searchTimer); if(q.length<2){ hideResults(); return; } elResults.innerHTML='<div class="pdk-smsg">Searching…</div>'; elResults.hidden=false; searchTimer=setTimeout(function(){ runSearch(q); }, 300); });
      document.addEventListener("click", function(e){ var sel=modal.querySelector(".pdk-storysel"); if(elResults && !elResults.hidden && sel && !sel.contains(e.target)) hideResults(); });
      modal.querySelectorAll("#grgGenWsSeg a").forEach(function(x){ x.addEventListener("click", function(){ genWs=x.dataset.ws; chosen=null; renderChip(); hideResults(); modal.querySelectorAll("#grgGenWsSeg a").forEach(function(y){ y.classList.toggle("active", y===x); }); }); });
      function openGen(){ if(!isServed){ toast("Start the local server to use the Garage.","err"); return; } genWs=ws; chosen=null; elSearch.value=""; elReq.value=""; elStatus.textContent=""; hideResults(); renderChip(); modal.querySelectorAll("#grgGenWsSeg a").forEach(function(y){ y.classList.toggle("active", y.dataset.ws===genWs); }); modal.classList.add("show"); }
      function closeGen(){ modal.classList.remove("show"); }
      var gb=document.getElementById("grgGenBtn"); if(gb) gb.addEventListener("click", openGen);
      document.getElementById("grgGenClose").addEventListener("click", closeGen);
      modal.addEventListener("click", function(e){ if(e.target===modal) closeGen(); });
      document.addEventListener("keydown", function(e){ if(e.key==="Escape" && modal.classList.contains("show")) closeGen(); });
      document.getElementById("grgGenGo").addEventListener("click", function(){
        var req=elReq.value.trim();
        if(!chosen && !req){ elStatus.textContent="Pick a story or describe the scope."; return; }
        elStatus.textContent="Generating with Claude… (~30s)";
        apiPost("/api/garage/generate", {ws:genWs, storyId:chosen?chosen.id:undefined, requirement:req}).then(function(res){
          if(!res.ok){ elStatus.textContent=res.error||"Generation failed"; return; }
          closeGen();
          current={path:res.suggestedPath, isNew:true}; elCode.value=res.content; elCode.disabled=false;
          elPath.textContent=res.suggestedPath+"  ·  NEW — Save to create"; setDirty(true); elSave.disabled=false; elRun.disabled=false;
          elSaveStatus.textContent="Generated — review, then Save";
          if(/story-test/.test(res.suggestedPath) && elProject.querySelector('option[value="story-tests"]')) elProject.value="story-tests";
          toast("Spec drafted — review it, then Save.","ok");
        }).catch(function(e){ elStatus.textContent=e.message; });
      });
    })();
  })();

  // ---- Single view coordinator: guarantees exactly one subview open at a time (Board = none) ----
  (function(){
    var app=document.getElementById("app"); if(!app) return;
    var VIEWS=[["paddockBtn","pdk-mode"],["garageBtn","garage-mode"],["f1Btn","f1-mode"]];
    var switching=false;
    document.addEventListener("click", function(e){
      if(switching) return;
      var hit=null;
      for(var i=0;i<VIEWS.length;i++){ var b=document.getElementById(VIEWS[i][0]); if(b && (e.target===b || (b.contains && b.contains(e.target)))){ hit=VIEWS[i]; break; } }
      if(!hit) return;
      switching=true;                                       // close every OTHER open subview before the clicked one opens
      VIEWS.forEach(function(v){
        if(v[0]!==hit[0] && app.classList.contains(v[1])){ var ob=document.getElementById(v[0]); if(ob) ob.click(); }
      });
      switching=false;
    }, true);                                               // capture phase → runs before the clicked button's own toggle
  })();

  // ---- Left rail view switcher: Board = home; keeps active state + topbar breadcrumb in sync with the active view ----
  (function(){
    var app=document.getElementById("app"), rail=document.getElementById("railNav");
    if(!app || !rail) return;
    var board=document.getElementById("boardBtn"), tbView=document.getElementById("tbView");
    var MODES=[["pdk-mode","paddockBtn","The Paddock"],["garage-mode","garageBtn","The Garage"],["f1-mode","f1Btn","Formula 1"]];
    function byId(id){ return document.getElementById(id); }
    if(board) board.addEventListener("click", function(){          // close whichever subview is open → back to the board
      MODES.forEach(function(m){ if(app.classList.contains(m[0])){ var b=byId(m[1]); if(b) b.click(); } });
    });
    function syncState(){
      var active=null;
      MODES.forEach(function(m){ if(app.classList.contains(m[0])) active=m; });
      if(board){ board.classList.toggle("on", !active); board.setAttribute("aria-selected", !active?"true":"false"); }
      MODES.forEach(function(m){ var b=byId(m[1]); if(b) b.setAttribute("aria-selected", m===active?"true":"false"); });
      if(tbView){ if(active){ tbView.textContent=active[2]; tbView.hidden=false; } else { tbView.hidden=true; tbView.textContent=""; } }
    }
    try{ new MutationObserver(syncState).observe(app, {attributes:true, attributeFilter:["class"]}); }catch(e){}
    syncState();
    rail.addEventListener("keydown", function(e){                   // ↑/↓ move focus across the rail
      if(e.key!=="ArrowDown" && e.key!=="ArrowUp") return;
      var tabs=Array.prototype.slice.call(rail.querySelectorAll(".rail-btn"));
      var i=tabs.indexOf(document.activeElement); if(i<0) return;
      e.preventDefault();
      tabs[(i+(e.key==="ArrowDown"?1:-1)+tabs.length)%tabs.length].focus();
    });
  })();

  // ---- Scroll lock: freeze the background page whenever an overlay/modal/panel sits on top ----
  (function(){
    var root=document.documentElement;
    function anyOpen(){
      if(document.querySelector(".fmodal.show, .ai-panel.show")) return true;   // story editor, report, paddock/garage modals, readers, Pit Crew radio
      var s=document.getElementById("saver"); if(s && s.classList.contains("show")) return true;
      var l=document.getElementById("loader"); if(l && l.classList.contains("show")) return true;
      if(document.getElementById("intro")) return true;                          // start-lights intro still on screen
      return false;
    }
    var locked=false, saved=0;
    function sync(){
      var open=anyOpen();
      if(open && !locked){                                                       // freeze the page exactly where it is
        saved = window.scrollY || window.pageYOffset || 0;
        root.style.setProperty("--lock-top", (-saved)+"px");
        root.classList.add("scroll-locked"); locked=true;
      } else if(!open && locked){                                                // release and restore the scroll position
        root.classList.remove("scroll-locked"); locked=false;
        root.style.removeProperty("--lock-top");
        window.scrollTo(0, saved);
      }
    }
    var mo=new MutationObserver(sync);
    document.querySelectorAll(".fmodal, .ai-panel, .saver, .loader").forEach(function(el){ mo.observe(el, {attributes:true, attributeFilter:["class"]}); });
    mo.observe(document.body, {childList:true});                                 // catch the intro node being removed
    sync();
  })();

  // ---- Start lights (once per session, so switching pages is instant) ----
  var intro = document.getElementById("intro");
  var seen = false;
  try{ seen = sessionStorage.getItem("pitwall_intro") === "1"; }catch(e){}
  var reduceMotion = false;
  try{ reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}

  if(seen || reduceMotion){          // skip the start-lights animation for returning sessions or reduced-motion users
    intro.remove();
    var ap=document.getElementById("app"); ap.style.visibility="visible"; ap.classList.add("enter");
    var tb0=document.querySelector(".topbar"); if(tb0) tb0.classList.add("enter");
    renderAll(false);
    return;
  }

  // five red lights fill in as it loads, hold, then lights out → big "away we go" → launch
  var gantry=document.getElementById("gantry"), lights=[];
  for(var c=0;c<5;c++){ var l=document.createElement("div"); l.className="gl"; gantry.appendChild(l); lights.push(l); }
  var statusEl=document.getElementById("introStatus");
  function setStatus(html){ if(statusEl) statusEl.innerHTML=html; }
  var step=0;
  var seq=setInterval(function(){
    if(step<5){ lights[step].classList.add("on"); step++; setStatus("Lights set <b>"+step+"&thinsp;/&thinsp;5</b>"); }
    else{
      clearInterval(seq);
      setStatus("Hold&hellip;");
      setTimeout(function(){                          // all lit (loaded) → lights out
        lights.forEach(function(l){ l.classList.remove("on"); });
        intro.classList.add("lightsout");   // fade the stage, leave just the headline
        var go=document.getElementById("introGo"); if(go){ go.innerHTML='<span class="go-1">Lights Out</span><span class="go-2">And away we go</span>'; go.classList.add("show"); }
        var ap2=document.getElementById("app"); ap2.style.visibility="visible"; renderAll(true);
        try{ sessionStorage.setItem("pitwall_intro","1"); }catch(e){}
        setTimeout(function(){                         // let the headline land, then launch
          intro.classList.add("gone");
          ap2.classList.add("enter");
          var tb=document.querySelector(".topbar"); if(tb) tb.classList.add("enter");
          setTimeout(function(){ if(intro.parentNode) intro.remove(); }, 700);
        }, 1000);
      }, 480);
    }
  }, 480);
})();
