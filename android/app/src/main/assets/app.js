(function () {
  "use strict";

  var STORAGE_KEY = "attendly.mobile.v2";
  var PRIVATE_BETA_URL = "https://attendly-cloudflare-preview.void-tech-shiv.workers.dev/";
  var defaults = {
    name: "Student",
    university: "KL University",
    program: "B.Tech · AI & Data Science",
    semester: "",
    cgpa: "",
    hideCgpa: true,
    theme: "light",
    demo: true,
    target: 85,
    classes: [],
    subjects: [],
    tasks: []
  };
  var state = Object.assign({}, defaults);
  try {
    var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (stored && typeof stored === "object") {
      Object.assign(state, stored);
    }
  } catch (e) {}
  ["classes", "subjects", "tasks"].forEach(function (key) {
    if (!Array.isArray(state[key])) state[key] = [];
  });

  var page = "overview";
  var drawerOpen = false;
  var modal = null;
  var currentDay = new Date().getDay();
  var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var weights = { L: 1, T: 0.5, P: 0.5, S: 0.25 };
  var paths = {
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    moon:'<path d="M20 15.7A8.5 8.5 0 0 1 8.3 4 8.5 8.5 0 1 0 20 15.7Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
    chart:'<path d="M3 3v18h18M6 16l5-5 4 3 5-8"/>',
    clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2m-7 8 2.5 2.5L16 10"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.6 1.3-1.6 2.8-2-.7a8 8 0 0 1-2 1.2l-.4 2.1h-3.2l-.4-2.1a8 8 0 0 1-2-1.2l-2 .7-1.6-2.8L7.5 15a8 8 0 0 1 0-2l-1.6-1.3 1.6-2.8 2 .7a8 8 0 0 1 2-1.2l.4-2.1h3.2l.4 2.1a8 8 0 0 1 2 1.2l2-.7 1.6 2.8-1.6 1.3a8 8 0 0 1 0 2Z" transform="translate(-.5 -2) scale(.96)"/>',
    graduate:'<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2.3V16c3.5 3 8.5 3 12 0v-4.7M22 9v7"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    shield:'<path d="m12 2 8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
    check:'<path d="m5 12 4 4 10-10"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff:'<path d="M3 3l18 18M10.5 5.2A12 12 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-4.2 4.7M6.4 6.4C3.7 8.2 2 12 2 12s4 7 10 7c1 0 1.9-.2 2.7-.5"/><path d="M10 10a3 3 0 0 0 4 4"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/>',
    trash:'<path d="M4 7h16m-10 4v7m4-7v7M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    book:'<path d="M4 5a3 3 0 0 1 3-3h13v17H7a3 3 0 0 0-3 3V5Zm0 14a3 3 0 0 1 3-3h13"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    logout:'<path d="M10 4H5v16h5m4-4 4-4-4-4m4 4H9"/>',
    link:'<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    star:'<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/>'
  };
  var titleFor = {
    overview:"Overview", timetable:"Timetable", attendance:"Attendance",
    planner:"My Planner", grades:"Grades & GPA", settings:"Settings", erp:"ERP Connection"
  };
  var demoSubjects = [
    {id:"d1",name:"Deep Learning",type:"L",attended:54,conducted:62},
    {id:"d2",name:"Database Systems",type:"T",attended:39,conducted:46},
    {id:"d3",name:"Internet of Things",type:"P",attended:67,conducted:81}
  ];
  var demoTasks = [
    {id:"dt1",title:"Revise today's notes",due:"",done:false},
    {id:"dt2",title:"Check class assignments",due:"",done:false}
  ];
  function demoSchedule() {
    return [
      {id:"dc1",day:currentDay,subject:"Deep Learning",start:"09:00",end:"09:50",room:"Academic Block"},
      {id:"dc2",day:currentDay,subject:"Database Systems",start:"11:00",end:"11:50",room:"Tutorial Room"},
      {id:"dc3",day:currentDay,subject:"Internet of Things",start:"14:00",end:"14:50",room:"IoT Lab"}
    ];
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.star) + '</svg>';
  }
  function sampleSubjects() {
    return state.subjects.length ? state.subjects : state.demo ? demoSubjects : [];
  }
  function sampleTasks() {
    return state.tasks.length ? state.tasks : state.demo ? demoTasks : [];
  }
  function sampleClasses() {
    return state.classes.length ? state.classes : state.demo ? demoSchedule() : [];
  }
  function isSample(dataType) {
    return state.demo && (!state[dataType] || !state[dataType].length);
  }
  function totalRaw(subjects) {
    var conducted = 0, attended = 0, weightedConducted = 0, weightedAttended = 0;
    subjects.forEach(function (s) {
      var n = Number(s.conducted) || 0, a = Math.min(n, Number(s.attended) || 0);
      var w = weights[s.type] || 1;
      conducted += n; attended += a; weightedConducted += n*w; weightedAttended += a*w;
    });
    return {conducted:conducted,attended:attended,
      raw:conducted ? (attended / conducted * 100) : 0,
      weighted:weightedConducted ? weightedAttended / weightedConducted * 100 : 0};
  }
  function shortTime(value) {
    var p = String(value || "").split(":");
    var h = Number(p[0]), m = p[1] || "00";
    if (!Number.isFinite(h)) return String(value || "");
    return ((h % 12) || 12) + ":" + m + (h >= 12 ? " PM" : " AM");
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }
  function demoBadge() {
    return '<span class="status-pill"><span class="dot ' + (state.demo?'':'mint') + '"></span>' +
      (state.demo ? 'SAMPLE DATA' : 'LOCAL WORKSPACE') + '</span>';
  }
  function metric(label, value, note, iconName, tone, target) {
    return '<button class="metric-card" data-page="' + esc(target) + '" style="text-align:left;color:inherit;width:100%">' +
      '<div class="card-top"><span class="card-label">' + esc(label) + '</span>' +
      '<div class="tile-icon ' + (tone || '') + '">' + icon(iconName) + '</div></div>' +
      '<div class="metric-value">' + value + '</div><div class="metric-foot">' + note + '</div></button>';
  }
  function header() {
    return '<header class="app-header"><div class="header-left">' +
      '<button class="icon-btn" data-action="drawer" aria-label="Open menu">' + icon("menu") + '</button>' +
      '<span class="header-title">' + esc(titleFor[page] || "Overview") + '</span></div>' +
      '<div class="header-actions"><button class="icon-btn" data-action="theme" aria-label="Toggle dark mode">' +
      icon(state.theme === "dark" ? "sun" : "moon") + '</button>' +
      '<button class="icon-btn dark" data-action="add" aria-label="Add item">' + icon("plus") + '</button></div></header>';
  }
  function sidebar() {
    var nav = [
      ["overview","grid","Overview"],["timetable","calendar","Timetable"],
      ["attendance","chart","Attendance"],["grades","graduate","Grades & GPA"],
      ["planner","clipboard","My Planner"],["erp","link","ERP Connection"]
    ];
    var links = nav.map(function (n) {
      return '<button class="drawer-link ' + (page===n[0]?'active':'') + '" data-page="' + n[0] + '">' +
        icon(n[1]) + '<span>' + n[2] + '</span></button>';
    }).join("");
    return '<div class="drawer-backdrop '+(drawerOpen?'open':'')+'" data-action="close-drawer"></div>' +
      '<aside class="drawer '+(drawerOpen?'open':'')+'" aria-label="Workspace menu">' +
      '<div class="brand-line"><div class="brand-logo">A</div><div><div class="brand-name">attendly.</div>' +
      '<div class="brand-sub">YOUR STUDENT SPACE</div></div></div>' +
      '<div class="uni-card"><div class="uni-letter">K</div><div><strong>'+esc(state.university)+'</strong>' +
      '<small>Student workspace</small></div></div>' +
      '<div class="drawer-links"><div class="drawer-section">WORKSPACE</div>' + links +
      '<div class="drawer-section" style="margin-top:20px">PREFERENCES</div>' +
      '<button class="drawer-link '+(page==='settings'?'active':'')+'" data-page="settings">' +
      icon("settings") + '<span>Settings</span></button></div>' +
      '<div class="drawer-spacer"></div><div class="privacy"><span style="color:#78e0bb">' + icon("shield") + '</span>' +
      '<div><b>Private by design</b><small>ERP data is not connected</small></div></div>' +
      '<div class="profile-footer"><div class="avatar">'+esc(state.name.trim().charAt(0).toUpperCase() || "S")+'</div>' +
      '<div><strong>'+esc(state.name)+'</strong><small>Local student workspace</small></div>' +
      '<button class="list-control" data-page="settings" style="margin-left:auto" aria-label="Open settings">' +
      icon("settings") + '</button></div></aside>';
  }
  function tabs() {
    var items = [["overview","grid","Home"],["timetable","calendar","Classes"],
      ["attendance","chart","Attendance"],["planner","clipboard","Planner"],["settings","settings","More"]];
    return '<nav class="bottom-tabs" aria-label="Primary navigation">' +
      items.map(function (i) {
        return '<button class="tab '+(page===i[0]?'active':'')+'" data-page="'+i[0]+'" aria-label="'+i[2]+'">' +
          icon(i[1])+'<span>'+i[2]+'</span></button>';
      }).join("")+'</nav>';
  }
  function overview() {
    var sub = sampleSubjects(), classes = sampleClasses(), tasks = sampleTasks();
    var raw = totalRaw(sub), todayClasses = classes.filter(function (c) {return Number(c.day) === currentDay;});
    var pending = tasks.filter(function (t) {return !t.done;}).length;
    var cgpa = state.hideCgpa ? '••••' :
      (state.cgpa.trim() ? esc(state.cgpa.trim()) : isSample('subjects') ? '8.69' : '—');
    var cgpaHelp = state.hideCgpa ? 'Hidden in Settings for privacy' :
      (state.cgpa.trim() ? 'Your locally saved CGPA' : state.demo ? 'Illustrative CGPA, not ERP data' : 'Set your CGPA in Settings');
    return '<div class="title-row"><div><p class="eyebrow">YOUR DAILY BRIEF</p>' +
      '<h1>'+greeting()+', '+esc(state.name)+' <span style="color:#e1a354">✦</span></h1>' +
      '<p class="subtext">Everything you need for a smoother campus day.</p></div>'+demoBadge()+'</div>' +
      '<div class="info-banner"><span class="banner-icon">'+icon("info")+'</span><div>' +
      (state.demo ? 'You are exploring with <strong>sample data</strong>. Nothing here is connected to KL ERP.' :
        'Your workspace is <strong>local to this device</strong>. Add classes, subjects and tasks to get started.') +
      '</div><button class="banner-cta" data-page="'+(state.demo?'settings':'erp')+'">' +
      (state.demo?'Customize':'ERP beta')+' '+icon("arrow")+'</button></div>' +
      '<div class="grid">' +
      metric('Overall raw attendance',sub.length?raw.raw.toFixed(1)+'%':'—',
        sub.length?raw.attended+' of '+raw.conducted+' raw classes attended':'Add attendance data','chart','','attendance')+
      metric("Today's classes",todayClasses.length?String(todayClasses.length)+' <small>sessions</small>':'—',
        todayClasses.length?shortTime(todayClasses.slice().sort(function(a,b){return a.start.localeCompare(b.start);})[0].start)+' first class':'No schedule yet','calendar','purple','timetable')+
      metric('Tasks due soon',String(pending)+' <small>tasks</small>',
        pending?'Keep your assignments on track':'All caught up','clipboard','orange','planner')+
      metric('Current CGPA',cgpa+(cgpa!=='••••' && cgpa!=='—'?' <small>/10</small>':''),
        cgpaHelp,'graduate','blue','grades')+'</div>' +
      '<section class="promo"><div class="eyebrow">✧ STAY ONE STEP AHEAD</div>' +
      '<h2>Your campus day,<br><span>under control.</span></h2>' +
      '<p>See what is next, track what matters, and make more room for learning.</p>' +
      '<button class="primary" data-page="timetable">Explore timetable '+icon("arrow")+'</button></section>' +
      '<div class="section-head"><h2>Quick access</h2></div>' +
      '<div class="two-col"><button class="mini" data-page="attendance" style="text-align:left;color:inherit">'+
      '<span style="color:#40bd9e">'+icon("chart")+'</span><b>Attendance</b><span>Track your classes</span></button>'+
      '<button class="mini" data-page="erp" style="text-align:left;color:inherit">'+
      '<span style="color:#8375d7">'+icon("shield")+'</span><b>ERP beta</b><span>Private access only</span></button></div>';
  }
  function timetable() {
    var classes=sampleClasses().filter(function(c){return Number(c.day)===Number(currentDay);})
      .slice().sort(function(a,b){return a.start.localeCompare(b.start);});
    var days=[1,2,3,4,5,6,0];
    return '<p class="eyebrow">YOUR WEEKLY SCHEDULE</p><h1>Timetable</h1>' +
      '<p class="subtext">Keep your classes organized, one day at a time.</p>' +
      '<div class="day-scroll">'+days.map(function(d){return '<button class="day-chip '+(currentDay===d?'active':'')+
      '" data-day="'+d+'">'+weekdays[d]+'</button>';}).join("")+'</div>' +
      '<div class="section-head"><h2>'+weekdays[currentDay]+' classes</h2><button class="text-btn" data-action="add-class">'+
      icon("plus")+' Add class</button></div>' +
      (isSample('classes')?'<span class="tag-label">Illustrative schedule</span>':'') +
      (classes.length ? classes.map(function(c){
        return '<article class="list-card"><div class="list-icon">'+icon("calendar")+'</div><div class="list-main">'+
        '<b>'+esc(c.subject)+'</b><span>'+shortTime(c.start)+' – '+shortTime(c.end)+
        ' · '+esc(c.room||'No room')+'</span></div>' +
        (isSample('classes')?'':'<button class="list-control" data-action="delete-class" data-id="'+esc(c.id)+'" aria-label="Delete class">'+icon("trash")+'</button>')+
        '</article>';
      }).join("") : '<div class="empty-state">'+icon("calendar")+'<h3>No classes added</h3>'+
        '<p>Add your timetable here or use sample data in Settings.</p></div>') +
      '<div class="panel"><h3>Manage your own schedule</h3><p class="helper">These classes are saved on this device. University ERP timetable is not connected yet.</p>'+
      '<button class="save" data-action="add-class">'+icon("plus")+' Add class</button></div>';
  }
  function attendance() {
    var subjects=sampleSubjects(), summary=totalRaw(subjects);
    return '<p class="eyebrow">KNOW WHERE YOU STAND</p><h1>Attendance</h1>'+
      '<p class="subtext">Track raw and LTPS-weighted attendance, without guesswork.</p>' +
      (isSample('subjects')?'<div class="info-banner">'+icon("info")+
        '<div>Numbers below are <strong>sample data</strong> and are not retrieved from university ERP.</div></div>':'') +
      '<div class="kpi"><div class="eyebrow">OVERALL RAW ATTENDANCE</div>' +
      '<div class="big">'+(subjects.length?summary.raw.toFixed(1)+'%':'—')+'</div>'+
      '<small>'+(subjects.length?summary.attended+' attended of '+summary.conducted+' conducted':'No subjects added')+'</small></div>' +
      '<div class="two-col"><div class="mini"><b>'+(subjects.length?summary.weighted.toFixed(1)+'%':'—')+
      '</b><span>LTPS weighted</span></div><div class="mini"><b>'+esc(state.target)+'%</b><span>Your attendance target</span></div></div>'+
      '<div class="section-head"><h2>Subject breakdown</h2><button class="text-btn" data-action="add-subject">+ Add subject</button></div>'+
      (subjects.length?subjects.map(function(s){
        var p=Number(s.conducted)>0 ? Math.min(100,Number(s.attended)/Number(s.conducted)*100) : 0;
        return '<article class="panel" style="margin:12px 0"><div class="line-between"><h3>'+esc(s.name)+'</h3>'+
          '<span class="tag-label">'+esc(s.type)+'</span></div>'+
          '<div class="line-between" style="margin-top:12px;gap:10px"><b style="font-size:25px">'+p.toFixed(1)+'%</b>'+
          (isSample('subjects')?'':'<button class="list-control" data-action="delete-subject" data-id="'+esc(s.id)+'" aria-label="Delete subject">'+icon("trash")+'</button>')+
          '</div><div class="progress-track"><div class="progress-fill" style="width:'+p+'%"></div></div>'+
          '<p class="helper">'+esc(s.attended)+' / '+esc(s.conducted)+' classes · LTPS weight '+Math.round((weights[s.type]||1)*100)+'%</p></article>';
      }).join(""):'<div class="empty-state">'+icon("chart")+'<h3>No attendance data yet</h3>'+
        '<p>Add your subjects manually to begin tracking attendance.</p></div>')+
      '<div class="panel"><h3>About real ERP attendance</h3>'+
      '<p class="helper">This mobile dashboard does not collect university passwords. Real ERP access remains in a protected private browser session.</p>'+
      '<button class="save" data-page="erp">'+icon("shield")+' ERP connection</button></div>';
  }
  function planner() {
    var tasks=sampleTasks();
    return '<p class="eyebrow">STAY ORGANIZED</p><h1>My planner</h1>'+
      '<p class="subtext">Small plans for smoother days.</p>'+
      '<div class="section-head"><h2>Your tasks</h2><button class="text-btn" data-action="add-task">+ New task</button></div>'+
      (isSample('tasks')?'<span class="tag-label">Sample tasks</span>':'')+
      (tasks.length?tasks.map(function(t){
        var completed=!!t.done;
        return '<article class="list-card '+(completed?'task-done':'')+'">'+
        '<button class="check '+(completed?'checked':'')+'" data-action="done-task" data-id="'+esc(t.id)+'" aria-label="Toggle task done">'+
        (completed?icon("check"):'')+'</button>'+
        '<div class="list-main"><b>'+esc(t.title)+'</b><span>'+
        (t.due?'Due '+esc(t.due):'No due date')+(completed?' · Completed':' · To do')+'</span></div>'+
        (isSample('tasks')?'':'<button class="list-control" data-action="delete-task" data-id="'+esc(t.id)+'" aria-label="Delete task">'+icon("trash")+'</button>')+
        '</article>';
      }).join(""):'<div class="empty-state">'+icon("clipboard")+'<h3>All clear</h3><p>Add your first task to get started.</p></div>')+
      '<button class="save" data-action="add-task">'+icon("plus")+' Create task</button>';
  }
  function grades() {
    var value = state.hideCgpa ? "••••" : (state.cgpa.trim() ? esc(state.cgpa) : state.demo ? "8.69" : "—");
    return '<p class="eyebrow">YOUR ACADEMIC SNAPSHOT</p><h1>Grades & GPA</h1>' +
      '<p class="subtext">Keep academic progress private and visible only when you choose.</p>'+
      '<div class="kpi"><div class="eyebrow">CURRENT CGPA</div><div class="big">'+value+'</div>'+
      '<small>'+(state.hideCgpa?'CGPA hidden by default':state.cgpa.trim()?'Saved manually on this device':state.demo?'Sample CGPA, not ERP data':'Set your CGPA in Settings')+'</small></div>'+
      '<div class="two-col"><div class="mini"><b>'+esc(state.semester || '—')+'</b><span>Current semester</span></div>'+
      '<div class="mini"><b>'+esc(state.program.split('·').slice(-1)[0].trim() || '—')+'</b><span>Academic program</span></div></div>'+
      '<div class="panel"><h3>Privacy controls</h3><p class="helper">Your CGPA stays hidden by default. You can edit it or change its visibility in Settings.</p>'+
      '<button class="save" data-action="cgpa">'+icon(state.hideCgpa?"eye":"eyeoff")+
      (state.hideCgpa?' Show CGPA':' Hide CGPA')+'</button>'+
      '<button class="secondary" style="margin-left:10px" data-page="settings">Edit details</button></div>';
  }
  function settings() {
    return '<p class="eyebrow">MAKE IT YOURS</p><h1>Settings & privacy</h1>'+
      '<p class="subtext">Your data, your choices. Workspace details are stored on this device.</p>'+
      '<section class="panel"><h2>Student profile</h2><p class="helper">Personalize your local dashboard.</p>'+
      '<form id="profile-form">'+
      '<div class="field"><label for="display-name">Display name / nickname</label>'+
      '<input id="display-name" name="name" required maxlength="32" autocomplete="off" value="'+esc(state.name)+'"></div>'+
      '<div class="field"><label for="university">University</label>'+
      '<input id="university" name="university" required maxlength="64" value="'+esc(state.university)+'"></div>'+
      '<div class="field"><label for="program">Program</label>'+
      '<input id="program" name="program" required maxlength="64" value="'+esc(state.program)+'"></div>'+
      '<div class="field"><label for="semester">Current semester</label>'+
      '<input id="semester" name="semester" maxlength="20" placeholder="Example: Semester 4" value="'+esc(state.semester)+'"></div>'+
      '<div class="field"><label for="cgpa">Current CGPA (optional)</label>'+
      '<input id="cgpa" name="cgpa" inputmode="decimal" type="number" min="0" max="10" step=".01" placeholder="Example: 8.69" value="'+esc(state.cgpa)+'"></div>'+
      '<button class="save" type="submit">'+icon("check")+' Save profile</button></form></section>'+
      '<section class="panel"><h2>Personalization</h2><p class="helper">Tune your student workspace.</p>'+
      '<div class="preference"><div><strong>Attendance target</strong><p>Used for local calculations.</p></div>'+
      '<select id="attendance-target" aria-label="Attendance target">'+
      [70,75,80,85,90,95].map(function(n){return '<option value="'+n+'" '+(Number(state.target)===n?'selected':'')+'>'+n+'%</option>';}).join("")+
      '</select></div>'+
      '<div class="preference"><div><strong>Appearance</strong><p>Switch between light and dark themes.</p></div>'+
      '<button class="icon-btn" data-action="theme" aria-label="Toggle theme">'+icon(state.theme==='dark'?'sun':'moon')+'</button></div>'+
      '<div class="preference"><div><strong>Hide CGPA</strong><p>Keep CGPA private on Overview.</p></div>'+
      '<button class="toggle '+(state.hideCgpa?'on':'')+'" data-action="cgpa" role="switch" aria-checked="'+state.hideCgpa+'" aria-label="Hide CGPA"></button></div>'+
      '<div class="preference"><div><strong>Explore sample data</strong><p>Preview cards without connecting ERP.</p></div>'+
      '<button class="toggle '+(state.demo?'on':'')+'" data-action="demo" role="switch" aria-checked="'+state.demo+'" aria-label="Sample data"></button></div>'+
      '</section>'+
      '<section class="panel"><h2>Privacy & security</h2><p class="helper">Settings, manual timetable entries and tasks stay in Android WebView storage on this device. No ERP passwords are saved by this screen.</p>'+
      '<button class="save" data-page="erp">'+icon("shield")+' Private ERP beta</button></section>';
  }
  function erp() {
    return '<p class="eyebrow">SECURE CONNECTION</p><h1>ERP connection</h1>'+
      '<p class="subtext">Your academic credentials deserve a protected session.</p>'+
      '<div class="panel"><span class="tag-label muted-tag">Private beta</span>'+
      '<h2 style="margin-top:18px">Open Attendly ERP</h2>'+
      '<p>Real university login and attendance sync are available only through the currently protected staging website.</p>'+
      '<div class="erp-notice"><b>Privacy first.</b> The app opens the Cloudflare-protected page in your browser. Login details, passwords and CAPTCHA responses are not processed by this local dashboard. This is an independent project, not an official university app.</div>'+
      '<button class="save" data-action="open-erp">'+icon("link")+' Open protected ERP beta</button></div>'+
      '<div class="panel"><h3>What works offline?</h3>'+
      '<p class="helper">Overview, custom timetable, attendance tracker, planner and settings work without login. Data is saved locally on this device.</p></div>';
  }
  function modalContent() {
    if (!modal) return "";
    var content = "", headline = "";
    if (modal === "task") {
      headline = "New task";
      content = '<div class="field"><label for="task-title">Task</label><input id="task-title" name="title" required maxlength="90" placeholder="Example: Complete lab assignment"></div>'+
        '<div class="field"><label for="task-due">Due date (optional)</label><input type="date" id="task-due" name="due"></div>';
    } else if (modal === "class") {
      headline = "Add class";
      content = '<div class="field"><label for="subject-name">Subject</label><input id="subject-name" name="subject" required maxlength="70"></div>'+
        '<div class="field"><label for="class-day">Day</label><select id="class-day" name="day">'+
        [1,2,3,4,5,6,0].map(function(d){return '<option value="'+d+'" '+(currentDay===d?'selected':'')+'>'+weekdays[d]+'</option>';}).join("")+
        '</select></div><div class="two-col"><div class="field"><label for="class-start">Start</label>'+
        '<input id="class-start" type="time" name="start" value="09:00" required></div>'+
        '<div class="field"><label for="class-end">End</label><input id="class-end" type="time" name="end" value="09:50" required></div></div>'+
        '<div class="field"><label for="class-room">Room</label><input id="class-room" name="room" maxlength="70" placeholder="Example: AB1-203"></div>';
    } else if (modal === "subject") {
      headline = "Add attendance";
      content = '<div class="field"><label for="attendance-name">Subject</label>'+
        '<input id="attendance-name" name="name" maxlength="70" required placeholder="Example: Deep Learning"></div>'+
        '<div class="field"><label for="attendance-type">LTPS component</label>'+
        '<select id="attendance-type" name="type"><option value="L">Lecture (100%)</option>'+
        '<option value="T">Tutorial (50%)</option><option value="P">Practical (50%)</option>'+
        '<option value="S">Skill (25%)</option></select></div>'+
        '<div class="two-col"><div class="field"><label for="attendance-attended">Attended</label>'+
        '<input id="attendance-attended" type="number" name="attended" required min="0" max="9999" value="0"></div>'+
        '<div class="field"><label for="attendance-conducted">Conducted</label>'+
        '<input id="attendance-conducted" type="number" name="conducted" required min="1" max="9999" value="1"></div></div>';
    }
    return '<div class="dialog-overlay" data-action="close-modal" id="modal-backdrop">'+
      '<section class="dialog" role="dialog" aria-modal="true" aria-label="'+headline+'">'+
      '<h2>'+headline+'</h2><form id="add-form" data-form="'+modal+'">'+content+
      '<div class="dialog-btns"><button type="button" class="secondary" data-action="close-modal">Cancel</button>'+
      '<button class="primary" type="submit">'+icon("check")+' Save</button></div></form></section></div>';
  }
  function render() {
    document.body.className = state.theme === "dark" ? "dark" : "";
    var views = {overview:overview,timetable:timetable,attendance:attendance,planner:planner,
      grades:grades,settings:settings,erp:erp};
    var main = (views[page] || overview)();
    document.getElementById("app").innerHTML = '<div class="app-shell">'+header()+
      '<main>'+main+'</main>'+tabs()+sidebar()+modalContent()+'</div>';
    document.title = (titleFor[page] || "Attendly") + " · Attendly";
  }
  function goto(next) {
    if (!titleFor[next]) return;
    page = next;
    drawerOpen = false;
    modal = null;
    render();
    window.scrollTo(0,0);
  }
  function toast(message) {
    var old = document.querySelector(".toast");
    if (old) old.remove();
    var div = document.createElement("div");
    div.className = "toast";
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(function(){if(div.parentNode)div.remove();},2100);
  }
  function newId() {return String(Date.now())+String(Math.floor(Math.random()*100000));}
  document.addEventListener("click",function(evt) {
    if (evt.target && evt.target.id === "modal-backdrop") {
      modal = null; render(); return;
    }
    var control=evt.target.closest("[data-page], [data-day], [data-action]");
    if (!control) return;
    if (control.dataset.page) { goto(control.dataset.page); return; }
    if (control.dataset.day !== undefined) {currentDay=Number(control.dataset.day);render();return;}
    var action=control.dataset.action;
    if (action === "drawer") {drawerOpen=true;render();}
    else if (action === "close-drawer") {drawerOpen=false;render();}
    else if (action === "theme") {state.theme=state.theme==='dark'?'light':'dark';persist();render();}
    else if (action === "cgpa") {state.hideCgpa=!state.hideCgpa;persist();render();}
    else if (action === "demo") {state.demo=!state.demo;persist();render();}
    else if (action === "add") {
      modal=page==="timetable"?"class":page==="attendance"?"subject":"task";render();
    }
    else if (action === "add-task") {modal="task";render();}
    else if (action === "add-class") {modal="class";render();}
    else if (action === "add-subject") {modal="subject";render();}
    else if (action === "close-modal") {modal=null;render();}
    else if (action === "open-erp") {window.location.href=PRIVATE_BETA_URL;}
    else if (action === "done-task") {
      var t=state.tasks.find(function(x){return x.id===control.dataset.id;});
      if(!t && isSample('tasks')) {toast("Sample tasks cannot be edited. Add your own task.");return;}
      if(t){t.done=!t.done;persist();render();}
    }
    else if (["delete-task","delete-class","delete-subject"].indexOf(action)>=0) {
      var collection=action==="delete-task"?"tasks":action==="delete-class"?"classes":"subjects";
      state[collection]=state[collection].filter(function(x){return String(x.id)!==control.dataset.id;});
      persist();render();toast("Removed from this device");
    }
  });
  document.addEventListener("change",function(evt){
    if(evt.target && evt.target.id==="attendance-target"){
      state.target=Number(evt.target.value);persist();toast("Attendance target saved");
    }
  });
  document.addEventListener("submit",function(evt){
    var form=evt.target;
    if(!form || !["profile-form","add-form"].includes(form.id))return;
    evt.preventDefault();
    var data=new FormData(form);
    if(form.id==="profile-form"){
      var nextName=String(data.get("name")||"").trim();
      if(!nextName) {toast("Enter a display name");return;}
      var nextCgpa=String(data.get("cgpa")||"").trim();
      if(nextCgpa!=="" && (Number(nextCgpa)<0 || Number(nextCgpa)>10)) {
        toast("CGPA should be between 0 and 10");return;
      }
      state.name=nextName;
      state.university=String(data.get("university")||"KL University").trim().slice(0,64);
      state.program=String(data.get("program")||"").trim().slice(0,64);
      state.semester=String(data.get("semester")||"").trim().slice(0,20);
      state.cgpa=nextCgpa;
      persist();render();toast("Profile saved");return;
    }
    var kind=form.dataset.form;
    if(kind==="task"){
      var title=String(data.get("title")||"").trim();
      if(!title){toast("Enter a task");return;}
      state.tasks.push({id:newId(),title:title.slice(0,90),due:String(data.get("due")||""),done:false});
      state.demo=false;
      page="planner";
    }else if(kind==="class"){
      var subject=String(data.get("subject")||"").trim(),start=String(data.get("start")||""),
        end=String(data.get("end")||"");
      if(!subject||!start||!end||start>=end){toast("Check the class times");return;}
      state.classes.push({id:newId(),subject:subject.slice(0,70),
        day:Number(data.get("day")),start:start,end:end,room:String(data.get("room")||"").trim().slice(0,70)});
      state.demo=false;
      page="timetable";
    }else if(kind==="subject"){
      var name=String(data.get("name")||"").trim(),attended=Number(data.get("attended")),
        conducted=Number(data.get("conducted")),type=String(data.get("type")||"L");
      if(!name||!Number.isInteger(attended)||!Number.isInteger(conducted)||conducted<1||attended<0||attended>conducted){
        toast("Attended cannot exceed conducted");return;
      }
      state.subjects.push({id:newId(),name:name.slice(0,70),attended:attended,conducted:conducted,type:type});
      state.demo=false;page="attendance";
    }
    persist();modal=null;render();toast("Saved on this device");
  });
  window.attendlyBack=function(){
    if(modal){modal=null;render();return true;}
    if(drawerOpen){drawerOpen=false;render();return true;}
    if(page!=="overview"){goto("overview");return true;}
    return false;
  };
  document.addEventListener("keydown",function(evt){
    if(evt.key==="Escape"&&window.attendlyBack())evt.preventDefault();
  });
  render();
})();
