
// ===================== GLOBALS =====================
let currentUser = null;
let allIEs = [];
let allDirectores = [];

let chartCumplimiento = null;
let chartAvanceMensualObj = null;
let chartAvanceHistoricoObj = null;
let selectedAvanceIEId = null;
let currentDirectorFilter = 'pendiente';
let currentDirectorRows = [];

// ===================== API =====================
async function api(url, opts = {}) {
  const defaults = { headers: {}, credentials: 'include' };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    defaults.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...defaults, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ===================== TOAST =====================
function showToast(msg, type) {
  if (!type) type = 'info';
  const c = document.getElementById('toast-container');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = 'toast-item ' + type;
  t.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i><span>' + msg + '</span>';
  c.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 4000);
}

// ===================== MODAL =====================
function showModal(title, bodyHtml, footerHtml) {
  if (!footerHtml) footerHtml = '';
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

function descargarExcel(url) {
  var a = document.createElement('a');
  a.href = url;
  a.download = 'reporte_ugel.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ===================== AUTH & IE SELECTOR =====================
async function iniciarSelector() {
  try {
    var d = await api('/api/ies');
    allIEs = d.ies || d || [];
    renderList(allIEs);
    document.getElementById('sel-buscar').addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      var f = allIEs.filter(function(ie) {
        return ie.codigo.toLowerCase().indexOf(q) !== -1 || ie.nombre.toLowerCase().indexOf(q) !== -1;
      });
      renderList(f);
    });
  } catch (e) {}
}
function renderList(list) {
  var h = '';
  if (list.length > 0) {
    for (var i = 0; i < list.length; i++) {
      h += '<div class="sel-item" onclick="loginComoDirector(' + list[i].id + ')"><span class="sel-cod">' + list[i].codigo + '</span><span class="sel-nom">' + list[i].nombre + '</span></div>';
    }
  } else {
    h = '<div class="sel-empty">No se encontraron instituciones</div>';
  }
  document.getElementById('sel-ie-list').innerHTML = h;
}
function goToSupervisorLogin() {
  api('/api/logout', { method: 'POST' }).catch(function(e) {});
  currentUser = null;
  document.body.classList.remove('director-mode');
  document.getElementById('app-shell').style.display = 'none';
  const sel = document.getElementById('sel-screen');
  if (sel) sel.style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  const u = document.getElementById('login-usuario');
  const p = document.getElementById('login-password');
  if (u) u.value = '';
  if (p) p.value = '';
}
function showPublicDashboardFromLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  initDirectorApp();
  initPublicDashboard();
}
function formatFechaMock(dateStr) {
  if (!dateStr) return '-';
  try {
    var parts = dateStr.split('-');
    if (parts.length < 3) {
      // If it is ISO string format
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        var day = d.getDate();
        var dayStr = day < 10 ? '0' + day : '' + day;
        var months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return dayStr + ' de ' + months[d.getMonth()];
      }
      return dateStr;
    }
    var day = parts[2];
    if (day.indexOf('T') !== -1) day = day.split('T')[0];
    var dayNum = parseInt(day);
    var dayStr = dayNum < 10 ? '0' + dayNum : '' + dayNum;
    var monthIndex = parseInt(parts[1]) - 1;
    var months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return dayStr + ' de ' + months[monthIndex];
  } catch (e) {
    return dateStr;
  }
}
function normalizar(txt) {
  return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function selectSchoolForDashboard(codigo, nombre) {
  document.getElementById('dir-filter-codigo').value = nombre;
  document.getElementById('dir-filter-iename').textContent = nombre;
  document.getElementById('dir-search-autocomplete').style.display = 'none';
  var pill = document.getElementById('dir-ie-display');
  if (pill) pill.style.display = 'flex';
  loadDirectorMain(codigo);
}
function onSearchIE(q) {
  var container = document.getElementById('dir-search-autocomplete');
  if (!q || q.trim() === '') {
    container.style.display = 'none';
    return;
  }
  var query = normalizar(q);
  var matches = allIEs.filter(function(ie) {
    return normalizar(ie.codigo).indexOf(query) !== -1 || normalizar(ie.nombre).indexOf(query) !== -1;
  });
  
  var exactMatch = allIEs.find(function(ie) {
    return normalizar(ie.codigo) === query;
  });
  if (exactMatch) {
    document.getElementById('dir-filter-iename').textContent = exactMatch.nombre;
    loadDirectorMain(exactMatch.codigo);
  }
  
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:#999;font-size:0.8rem;text-align:center">No se encontraron resultados</div>';
  } else {
    var html = '';
    var limit = Math.min(matches.length, 15);
    for (var i = 0; i < limit; i++) {
      var ie = matches[i];
      var escapedNombre = ie.nombre.replace(/'/g, "\\'");
      html += '<div class="dir-ac-item" onclick="selectSchoolForDashboard(\'' + ie.codigo + '\', \'' + escapedNombre + '\')">';
      html += '<span class="ac-code">' + ie.codigo + '</span>';
      html += '<span class="ac-name">' + ie.nombre + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }
  container.style.display = 'block';
}
async function initPublicDashboard() {
  try {
    if (!allIEs || allIEs.length === 0) {
      var d = await api('/api/ies');
      allIEs = d.ies || d || [];
    }
    
    // Dejar vacío el código por defecto al ingresar
    document.getElementById('dir-filter-codigo').value = '';
    document.getElementById('dir-filter-iename').textContent = 'Seleccione una IE';
    var pill = document.getElementById('dir-ie-display');
    if (pill) pill.style.display = 'none';
    
    // Inicializar el dashboard en blanco (con KPIs en 0 y mensaje explicativo)
    loadDirectorMain('');
    
    // Resaltar el buscador y agregar el tooltip flotante
    highlightSearchInput();
    
    var input = document.getElementById('dir-filter-codigo');
    if (input && !input.dataset.hasListener) {
      input.dataset.hasListener = 'true';
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          var q = this.value;
          var query = normalizar(q);
          var match = allIEs.find(function(ie) {
            return normalizar(ie.codigo) === query || normalizar(ie.nombre).indexOf(query) !== -1;
          });
          if (match) {
            selectSchoolForDashboard(match.codigo, match.nombre);
          }
        }
      });
    }
  } catch (e) {}
}

function highlightSearchInput() {
  var input = document.getElementById('dir-filter-codigo');
  if (!input) return;
  
  // Agregar clase de resaltado
  input.classList.add('input-highlight');
  
  // Crear el tooltip flotante
  var panel = input.closest('.dir-filter-panel');
  if (panel) {
    var oldTooltip = document.getElementById('dir-search-tooltip');
    if (oldTooltip) oldTooltip.remove();
    
    var tooltip = document.createElement('div');
    tooltip.id = 'dir-search-tooltip';
    tooltip.className = 'dir-tooltip';
    tooltip.innerHTML = '💡 Ingrese aquí su código local o nombre de IE';
    
    panel.insertBefore(tooltip, input);
    
    function clearHighlight() {
      input.classList.remove('input-highlight');
      var t = document.getElementById('dir-search-tooltip');
      if (t) t.remove();
      input.removeEventListener('focus', clearHighlight);
      input.removeEventListener('input', clearHighlight);
    }
    
    input.addEventListener('focus', clearHighlight);
    input.addEventListener('input', clearHighlight);
  }
}
// Cerrar autocompletado al hacer clic fuera
document.addEventListener('click', function(e) {
  var container = document.getElementById('dir-search-autocomplete');
  var input = document.getElementById('dir-filter-codigo');
  if (container && !container.contains(e.target) && e.target !== input) {
    container.style.display = 'none';
  }
});
async function loginComoDirector(ieId) {
  try {
    var ie = null;
    for (var i = 0; i < allIEs.length; i++) { if (allIEs[i].id === ieId) { ie = allIEs[i]; break; } }
    if (!ie) { showToast('Error: IE no encontrada', 'error'); return; }
    var data = await api('/api/login', { method: 'POST', body: { usuario: 'director.' + ie.codigo, password: ie.codigo } });
    currentUser = data.usuario || data.user;
    document.getElementById('sel-screen').style.display = 'none';
    document.body.classList.add('director-mode');
    document.getElementById('app-shell').style.display = 'block';
    initDirectorApp();
    selectSchoolForDashboard(ie.codigo, ie.nombre);
    showToast('Bienvenido, ' + currentUser.nombre, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function login() {
  const usuario = document.getElementById('login-usuario').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const err = document.getElementById('login-error');
  if (!usuario || !password) {
    err.textContent = 'Ingrese usuario y contraseña.';
    err.style.display = 'block';
    return;
  }
  try {
    err.style.display = 'none';
    const data = await api('/api/login', { method: 'POST', body: { usuario, password } });
    currentUser = data.usuario || data.user;
    if (currentUser.rol === 'director') {
      err.textContent = 'Acceso denegado: los directores no pueden iniciar sesión aquí. Use el panel público.';
      err.style.display = 'block';
      currentUser = null;
      return;
    }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    initSupervisorApp();
    showToast('Bienvenido, ' + (currentUser.nombre || ''), 'success');
  } catch (e) {
    err.textContent = e.message || 'Credenciales incorrectas';
    err.style.display = 'block';
  }
}
async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  window.location.reload();
}
async function checkSession() {
  try {
    const data = await api('/api/check-session');
    if (data.usuario || data.user) {
      currentUser = data.usuario || data.user;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-shell').style.display = 'block';
      if (currentUser.rol === 'director') {
        initDirectorApp();
        selectSchoolForDashboard(currentUser.ie_codigo || '', currentUser.ie_nombre || '');
      } else {
        initSupervisorApp();
      }
    } else {
      currentUser = null;
      showPublicDashboardFromLogin();
    }
  } catch (e) {
    currentUser = null;
    showPublicDashboardFromLogin();
  }
}

// ===================== INIT =====================
function initDirectorApp() {
  var gfb = document.getElementById('global-filter-bar');
  if(gfb) gfb.style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('sidebar-footer').style.display = 'none';
  document.getElementById('sidebar-nav').style.display = 'none';
  var tb = document.querySelector('.top-bar');
  if (tb) tb.style.display = 'none';
  var m = document.querySelector('.main');
  if (m) { m.style.padding = '0'; m.style.overflow = 'hidden'; }
  document.body.style.background = '#f0f1f3';

  document.getElementById('app-shell').style.display = 'block';
  document.getElementById('login-screen').style.display = 'none';

  document.querySelectorAll('.view-section').forEach(function (s) { s.classList.remove('active'); });
  var sec = document.getElementById('view-director-main');
  if (sec) sec.classList.add('active');

  const authBtnContainer = document.getElementById('dir-auth-buttons');
  if (currentUser) {
    let html = '';
    if (currentUser.impersonated) {
      html += '<span style="font-size: 0.8rem; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 4px 10px; border-radius: 20px; margin-right: 8px;"><i class="fas fa-user-secret"></i> Simulación</span>';
      html += '<button class="btn btn-outline btn-sm" onclick="logout()" style="border-color:#dc2626; color:#dc2626; font-weight:700; border-radius:20px; padding:6px 12px; background:#fff; font-size: 0.75rem;"><i class="fas fa-undo"></i> Volver a Admin</button>';
    } else {
      html += '<span style="font-size: 0.8rem; font-weight: 700; color: var(--granate); margin-right: 8px;" id="dir-user-name"><i class="fas fa-user-circle"></i> ' + currentUser.nombre + '</span>';
      html += '<button class="btn btn-outline btn-sm" onclick="cambiarVista(\'perfil\')" style="border-color:var(--granate); color:var(--granate); font-weight:700; border-radius:20px; padding:6px 12px; background:#fff; font-size: 0.75rem;"><i class="fas fa-cog"></i> Perfil</button>';
      html += '<button class="btn btn-outline btn-sm" onclick="logout()" style="border-color:#dc2626; color:#dc2626; font-weight:700; border-radius:20px; padding:6px 12px; background:#fff; font-size: 0.75rem; margin-left: 6px;"><i class="fas fa-sign-out-alt"></i> Salir</button>';
    }
    authBtnContainer.innerHTML = html;
  } else {
    authBtnContainer.innerHTML = '<button class="btn btn-outline btn-sm" onclick="goToSupervisorLogin()" style="border-color:var(--granate);color:var(--granate);font-weight:700;border-radius:20px;padding:6px 16px;display:flex;align-items:center;gap:6px;background:#fff;transition:all 0.15s"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</button>';
  }

  loadDirectorMain();
}
function initSupervisorApp() {
  var gfb = document.getElementById('global-filter-bar');
  if(gfb) gfb.style.display = '';
  document.getElementById('sidebar').style.display = '';
  document.getElementById('sidebar-footer').style.display = '';
  document.getElementById('sidebar-nav').style.display = '';
  var tb = document.querySelector('.top-bar');
  if (tb) tb.style.display = '';
  var m = document.querySelector('.main');
  if (m) { m.style.padding = ''; m.style.overflow = ''; }
  document.body.style.background = '';
  buildSidebar();
  updateUserHeader();
  cargarTiposActividad();
  cargarSupervisores();
  loadNotifBadge();
  
  if (currentUser.rol === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
    cambiarVista('admin-usuarios');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    cambiarVista('avance-mensual');
  }
}

// ===================== SIDEBAR =====================
function buildSidebar() {
  var nav = document.getElementById('sidebar-nav');
  var ft = document.getElementById('sidebar-footer');
  if (!currentUser) return;
  
  let html = '';
  if (currentUser.rol === 'admin') {
    html += '<a href="#" data-view="admin-usuarios" onclick="cambiarVista(\'admin-usuarios\',this)"><i class="fas fa-users-cog"></i> Usuarios</a>';
  }
  
  if (currentUser.rol === 'supervisor' || currentUser.rol === 'admin') {
    html += '<a href="#" data-view="avance-mensual" onclick="cambiarVista(\'avance-mensual\',this)"><i class="fas fa-chart-line"></i> Avance / Dashboard</a>';
    html += '<a href="#" data-view="asignar-actividad" onclick="cambiarVista(\'asignar-actividad\',this)"><i class="fas fa-plus-circle"></i> Asignar</a>';
    html += '<a href="#" data-view="monitoreo" onclick="cambiarVista(\'monitoreo\',this)"><i class="fas fa-desktop"></i> Monitoreo</a>';
    html += '<a href="#" data-view="directores" onclick="cambiarVista(\'directores\',this)"><i class="fas fa-users"></i> Directores</a>';
    html += '<a href="#" data-view="ies" onclick="cambiarVista(\'ies\',this)"><i class="fas fa-school"></i> IEs</a>';
  }
  
  html += '<a href="#" data-view="perfil" onclick="cambiarVista(\'perfil\',this)"><i class="fas fa-user"></i> Mi Perfil</a>';
  
  nav.innerHTML = html;
  ft.innerHTML = '<a href="#" onclick="event.preventDefault();logout()"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a>';
}

// ===================== USER HEADER =====================
function updateUserHeader() {
  var inits = currentUser.nombre.split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent = inits;
  document.getElementById('user-name').textContent = currentUser.nombre;
  document.getElementById('user-role').textContent = currentUser.rol === 'admin' ? 'Administrador(a)' : (currentUser.rol === 'director' ? 'Director(a)' : 'Supervisor(a)');
}

// ===================== NAVIGATION =====================
var viewTitles = {
  'director-main': 'Mis Actividades',
  'dashboard-supervisor': 'Dashboard General',
  'asignar-actividad': 'Asignar',
  'avance-mensual': 'Avance Mensual',
  'monitoreo': 'Monitoreo',
  'directores': 'Directores',
  'ies': 'IEs',
  'notificaciones': 'Notificaciones',
  'perfil': 'Mi Perfil'
};

function cambiarVista(vista, el) {
  if (window.event) window.event.preventDefault();
  document.querySelectorAll('.view-section').forEach(function (s) { s.classList.remove('active'); });
  var sec = document.getElementById('view-' + vista);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('#sidebar-nav a').forEach(function (a) { a.classList.remove('active'); });
  if (el) { el.classList.add('active'); } else {
    var l = document.querySelector('#sidebar-nav a[data-view="' + vista + '"]');
    if (l) l.classList.add('active');
  }
  document.getElementById('sidebar').classList.remove('show');
  document.getElementById('sidebar-overlay').classList.remove('show');
  loadViewData(vista);
  if (vista === 'perfil' && currentUser) {
    var inits = currentUser.nombre.split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
    document.getElementById('perfil-avatar-letter').textContent = inits;
  }
}

function loadViewData(vista) {
  switch (vista) {
    case 'director-main': loadDirectorMain(); break;
    case 'dashboard-supervisor': loadDashboardSupervisor(); break;
    case 'asignar-actividad': loadIEsForAsignar(); break;
    case 'avance-mensual': loadAvanceMensual(); break;
    case 'monitoreo': loadMonitoreo(); break;
    case 'directores': loadDirectores(); break;
    case 'ies': loadIEs(); break;
    case 'notificaciones': loadNotificaciones(); loadDirectoresForNotif(); break;
    case 'perfil': loadPerfil(); break;
    case 'admin-usuarios': loadAdminUsuarios(); break;
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('show');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

function refreshCurrentView() {
  var a = document.querySelector('.view-section.active');
  if (a) loadViewData(a.id.replace('view-', ''));
  if (currentUser && currentUser.rol === 'supervisor') loadNotifBadge();
}

function onFilterChange() {
  var a = document.querySelector('.view-section.active');
  if (a) {
    var id = a.id.replace('view-', '');
    if (id === 'dashboard-supervisor') loadViewData(id);
  }
}
function getNivelFilter() {
  return document.getElementById('filter-nivel').value;
}
function getFilterParams() {
  var p = new URLSearchParams();
  var n = document.getElementById('filter-nivel').value;
  var e = document.getElementById('filter-estado').value;
  if (n) p.set('nivel', n);
  if (e) p.set('estado', e);
  return p.toString();
}

// ===================== TIPOS =====================
async function cargarTiposActividad() {
  try {
    var d = await api('/api/tipos-actividad');
    var sel = document.getElementById('as-tipo');
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    var tipos = d.tipos || d || [];
    for (var i = 0; i < tipos.length; i++) {
      sel.innerHTML += '<option value="' + tipos[i].id + '">' + tipos[i].nombre + '</option>';
    }
  } catch (e) {}
}

async function cargarSupervisores() {
  try {
    var sel = document.getElementById('mon-asignador');
    if (!sel || sel.dataset.loaded) return;
    var d = await api('/api/supervisores');
    var lista = d || [];
    for (var i = 0; i < lista.length; i++) {
      sel.innerHTML += '<option value="' + lista[i].id + '">' + lista[i].nombre_completo + ' (' + (lista[i].dependencia || '-') + ')</option>';
    }
    sel.dataset.loaded = '1';
  } catch (e) {}
}

// ===================== DONUT =====================
function renderDonut(completadas, pendientes, vencidas, containerId) {
  var c = document.getElementById(containerId);
  if (!c) return;
  var total = completadas + pendientes + vencidas;
  var pc = total > 0 ? Math.round(completadas / total * 100) : 0;
  var pp = total > 0 ? Math.round(pendientes / total * 100) : 0;
  var pv = total > 0 ? Math.round(vencidas / total * 100) : 0;
  c.innerHTML = '<div class="donut-wrap"><div class="donut-canvas"><canvas id="donut-canvas-el" width="120" height="120"></canvas></div><div class="donut-legend"><div class="item"><span class="dot" style="background:var(--green)"></span> Completadas: <strong>' + completadas + '</strong> (' + pc + '%)</div><div class="item"><span class="dot" style="background:var(--amber)"></span> Pendientes: <strong>' + pendientes + '</strong> (' + pp + '%)</div><div class="item"><span class="dot" style="background:var(--red)"></span> Vencidas: <strong>' + vencidas + '</strong> (' + pv + '%)</div></div></div>';
  var cv = document.getElementById('donut-canvas-el');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var cx = 60, cy = 60, r = 44, sw = 14;
  var sa = -Math.PI / 2;
  var segs = [
    { v: completadas, c: '#059669', p: pc },
    { v: pendientes, c: '#d97706', p: pp },
    { v: vencidas, c: '#dc2626', p: pv }
  ];
  ctx.clearRect(0, 0, 120, 120);
  for (var i = 0; i < segs.length; i++) {
    if (segs[i].v === 0) continue;
    var ea = sa + (segs[i].p / 100) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, sa, ea);
    ctx.strokeStyle = segs[i].c;
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.stroke();
    sa = ea;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pc + '%', cx, cy);
}

// ===================== DIRECTOR MAIN VIEW =====================
async function loadDirectorMain(ieCodigo) {
  try {
    var codigo = ieCodigo !== undefined ? ieCodigo : document.getElementById('dir-filter-codigo').value;
    if (!codigo) {
      document.getElementById('kpi-total').textContent = '0';
      document.getElementById('kpi-pendientes').textContent = '0';
      document.getElementById('kpi-cumplidas').textContent = '0';
      document.getElementById('kpi-vencidas').textContent = '0';
      
      var ctx = document.getElementById('dir-pie-chart');
      if (ctx) {
        if (window.dirChart) window.dirChart.destroy();
        var ctx2d = ctx.getContext('2d');
        var gradGray = ctx2d.createLinearGradient(0, 0, 0, 160);
        gradGray.addColorStop(0, '#f3f4f6');
        gradGray.addColorStop(1, '#e0e0e0');
        
        window.dirChart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: ['Sin datos'],
            datasets: [{
              data: [1],
              backgroundColor: [gradGray],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10, family: 'Inter' } } },
              tooltip: { enabled: false }
            }
          }
        });
      }
      currentDirectorRows = [];
      renderDirectorActividadesTable();
      return;
    }
    var d = await api('/api/asignaciones?ie_codigo=' + encodeURIComponent(codigo));
    var rows = d.asignaciones || d || [];
    currentDirectorRows = rows;
    var hoy = new Date().toLocaleString('sv', { timeZone: 'America/Lima' }).split(' ')[0];
    var total = rows.length;
    var pendientes = 0, completadas = 0, vencidas = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.estado === 'completada') completadas++;
      else if (r.estado === 'no_cumplida') vencidas++;
      else if (r.fecha_limite && r.fecha_limite < hoy) vencidas++;
      else pendientes++;
    }
    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-pendientes').textContent = pendientes;
    document.getElementById('kpi-cumplidas').textContent = completadas;
    document.getElementById('kpi-vencidas').textContent = vencidas;

    var ctx = document.getElementById('dir-pie-chart');
    if (ctx) {
      if (window.dirChart) window.dirChart.destroy();
      
      var ctx2d = ctx.getContext('2d');
      var gradGreen = ctx2d.createLinearGradient(0, 0, 0, 160);
      gradGreen.addColorStop(0, '#34d399');
      gradGreen.addColorStop(1, '#059669');

      var gradYellow = ctx2d.createLinearGradient(0, 0, 0, 160);
      gradYellow.addColorStop(0, '#fbbf24');
      gradYellow.addColorStop(1, '#d97706');

      var gradRed = ctx2d.createLinearGradient(0, 0, 0, 160);
      gradRed.addColorStop(0, '#f87171');
      gradRed.addColorStop(1, '#dc2626');

      var gradGray = ctx2d.createLinearGradient(0, 0, 0, 160);
      gradGray.addColorStop(0, '#f3f4f6');
      gradGray.addColorStop(1, '#e0e0e0');

      window.dirChart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: total > 0 ? ['Cumplidas', 'Pendientes', 'Vencidas'] : ['Sin datos'],
          datasets: [{
            data: total > 0 ? [completadas, pendientes, vencidas] : [1],
            backgroundColor: total > 0 ? [gradGreen, gradYellow, gradRed] : [gradGray],
            borderWidth: 1.5,
            borderColor: '#ffffff',
            offset: total > 0 ? 8 : 0,
            hoverOffset: total > 0 ? 16 : 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10, family: 'Inter' } } },
            tooltip: { callbacks: { label: function(tt) { var val = tt.parsed || 0; var pct = total > 0 ? Math.round(val / total * 100) : 0; return tt.label + ': ' + val + ' (' + pct + '%)'; } } }
          }
        },
        plugins: [{
          id: 'threeDStyle',
          beforeDatasetsDraw: function(chart) {
            var ctx = chart.ctx;
            var meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || meta.data.length === 0) return;

            ctx.save();
            
            var thickness = 8;
            var sideWallColors = total > 0 ? ['#046a4a', '#9a5303', '#991b1b'] : ['#b5b5b5'];
            
            ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = thickness + 4;
            
            meta.data.forEach(function(element, index) {
              if (!chart.getDataVisibility(index)) return;
              if (element.outerRadius <= 0 || element.startAngle === element.endAngle) return;
              
              var x = element.x;
              var y = element.y;
              var outerRadius = element.outerRadius;
              var startAngle = element.startAngle;
              var endAngle = element.endAngle;
              
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.arc(x, y, outerRadius, startAngle, endAngle);
              ctx.closePath();
              ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
              ctx.fill();
            });
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            for (var h = thickness; h > 0; h--) {
              meta.data.forEach(function(element, index) {
                if (!chart.getDataVisibility(index)) return;
                if (element.outerRadius <= 0 || element.startAngle === element.endAngle) return;
                
                var x = element.x;
                var y = element.y + h;
                var outerRadius = element.outerRadius;
                var startAngle = element.startAngle;
                var endAngle = element.endAngle;
                
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.arc(x, y, outerRadius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = sideWallColors[index] || '#b5b5b5';
                ctx.fill();
                
                ctx.strokeStyle = sideWallColors[index] || '#b5b5b5';
                ctx.lineWidth = 1;
                ctx.stroke();
              });
            }
            
            ctx.restore();
          }
        }]
      });
    }

    document.querySelectorAll('.dir-kpi').forEach(el => {
      el.classList.remove('active-kpi-filter');
    });
    if (currentDirectorFilter === 'completada') {
      document.querySelector('.dir-kpi.cumplidas')?.classList.add('active-kpi-filter');
    } else if (currentDirectorFilter === 'vencida') {
      document.querySelector('.dir-kpi.vencidas')?.classList.add('active-kpi-filter');
    } else if (currentDirectorFilter === 'all') {
      document.querySelector('.dir-kpi.total')?.classList.add('active-kpi-filter');
    } else {
      currentDirectorFilter = 'pendiente';
      document.querySelector('.dir-kpi.pendientes')?.classList.add('active-kpi-filter');
    }
    
    const cards = [
      { class: 'total', type: 'all' },
      { class: 'pendientes', type: 'pendiente' },
      { class: 'cumplidas', type: 'completada' },
      { class: 'vencidas', type: 'vencida' }
    ];
    cards.forEach(c => {
      const el = document.querySelector('.dir-kpi.' + c.class);
      if (el && !el.dataset.hasListener) {
        el.dataset.hasListener = 'true';
        el.addEventListener('click', () => setDirectorFilter(c.type));
      }
    });

    renderDirectorActividadesTable();
  } catch (e) {
    showToast('Error al cargar actividades: ' + e.message, 'error');
  }
}

function setDirectorFilter(filterType) {
  currentDirectorFilter = filterType;
  
  document.querySelectorAll('.dir-kpi').forEach(el => {
    el.classList.remove('active-kpi-filter');
  });
  
  if (currentDirectorFilter === 'completada') {
    document.querySelector('.dir-kpi.cumplidas')?.classList.add('active-kpi-filter');
  } else if (currentDirectorFilter === 'pendiente') {
    document.querySelector('.dir-kpi.pendientes')?.classList.add('active-kpi-filter');
  } else if (currentDirectorFilter === 'vencida') {
    document.querySelector('.dir-kpi.vencidas')?.classList.add('active-kpi-filter');
  } else if (currentDirectorFilter === 'all') {
    document.querySelector('.dir-kpi.total')?.classList.add('active-kpi-filter');
  }
  
  renderDirectorActividadesTable();
}

function renderMiniCalendar(containerId, activities) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  const firstDay = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month + 1, 0).getDate();

  const activityDates = {};
  activities.forEach(a => {
    if (a.fecha_limite) {
      const dateStr = a.fecha_limite.split('T')[0];
      if (!activityDates[dateStr]) {
        activityDates[dateStr] = [];
      }
      activityDates[dateStr].push(a);
    }
  });

  let html = `
    <div class="mini-calendar" style="width: 100%; max-width: 300px; background: #fff; border: 1px solid #dde0e3; border-radius: 12px; padding: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div class="calendar-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:800; font-size:0.78rem; color:var(--granate); text-transform:uppercase;">${monthNames[month]} ${year}</span>
        <span style="font-size:0.68rem; font-weight:700; color:var(--text2);">Vencimientos</span>
      </div>
      <div class="calendar-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; text-align:center; font-size:0.7rem; font-weight:700; line-height: 1;">
        <div style="color:var(--text3); padding: 4px 0;">D</div>
        <div style="color:var(--text3); padding: 4px 0;">L</div>
        <div style="color:var(--text3); padding: 4px 0;">M</div>
        <div style="color:var(--text3); padding: 4px 0;">M</div>
        <div style="color:var(--text3); padding: 4px 0;">J</div>
        <div style="color:var(--text3); padding: 4px 0;">V</div>
        <div style="color:var(--text3); padding: 4px 0;">S</div>
  `;

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-day empty" style="height:24px;"></div>`;
  }

  const todayStr = now.toLocaleString('sv', { timeZone: 'America/Lima' }).split(' ')[0];
  for (let day = 1; day <= numDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hasActivities = activityDates[dateStr] && activityDates[dateStr].length > 0;
    
    let dayStyle = `display:flex; align-items:center; justify-content:center; height:24px; width:24px; margin:2px auto; border-radius:50%; position:relative; font-size:0.72rem;`;
    let tooltipTitle = "";

    if (hasActivities) {
      const activeActs = activityDates[dateStr];
      const hasVencida = activeActs.some(a => a.estado === 'no_cumplida' || ((a.estado === 'pendiente' || a.estado === 'inconclusa') && a.fecha_limite < todayStr));
      const hasCumplida = activeActs.every(a => a.estado === 'completada');
      
      if (hasVencida) {
        dayStyle += `background:#fee2e2; color:#dc2626; font-weight:800; cursor:pointer;`;
      } else if (hasCumplida) {
        dayStyle += `background:#d1fae5; color:#059669; font-weight:800; cursor:pointer;`;
      } else {
        dayStyle += `background:#fef3c7; color:#d97706; font-weight:800; cursor:pointer;`;
      }

      tooltipTitle = activeActs.map(a => `${a.estado === 'completada' ? '✓' : '•'} ${a.actividad_titulo || a.titulo}`).join('\\n');
    } else {
      dayStyle += `color:var(--text);`;
    }

    if (dateStr === todayStr) {
      dayStyle += `border: 1.5px solid var(--granate); font-weight:800;`;
    }

    html += `
      <div class="calendar-day" style="${dayStyle}" ${hasActivities ? `title="${tooltipTitle}" onclick="showCalendarDateActivities('${dateStr}')"` : ''}>
        ${day}
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function showCalendarDateActivities(dateStr) {
  const acts = currentDirectorRows.filter(a => a.fecha_limite && a.fecha_limite.split('T')[0] === dateStr);
  if (acts.length === 1) {
    mostrarDetalleActividad(acts[0].id);
  } else if (acts.length > 1) {
    let html = '<div style="display:flex; flex-direction:column; gap:10px; font-family:\'Inter\',sans-serif;">';
    acts.forEach(a => {
      let icon = a.estado === 'completada' ? 'fa-check-circle text-success' : 'fa-clock text-warning';
      html += `
        <div onclick="closeModal(); mostrarDetalleActividad(${a.id})" style="padding:10px; border:1px solid #dde0e3; border-radius:8px; cursor:pointer; background:#f9fafb; display:flex; align-items:center; gap:10px; transition:background 0.15s;">
          <i class="fas ${icon}" style="font-size: 1.1rem;"></i>
          <div style="flex:1; text-align:left;">
            <strong style="font-size:0.82rem; color:var(--text);">${a.actividad_titulo || a.titulo}</strong>
            <div style="font-size:0.72rem; color:var(--text2);">${a.tipo_nombre || a.tipo || ''}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    abrirModalHtml('Actividades para el ' + formatFechaMock(dateStr), html);
  }
}

function abrirModalHtml(titulo, htmlContent) {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-body').innerHTML = htmlContent;
  document.getElementById('modal-footer').innerHTML = '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>';
  document.getElementById('modal-overlay').classList.add('show');
}

function renderDirectorActividadesTable() {
  const hoy = new Date().toLocaleString('sv', { timeZone: 'America/Lima' }).split(' ')[0];
  const rows = currentDirectorRows;

  // Si no hay código seleccionado, mostrar un mensaje instructivo muy claro
  const codigoLocal = document.getElementById('dir-filter-codigo').value;
  if (!codigoLocal) {
    const tableArea = document.getElementById('dir-table-content-area');
    const emptyArea = document.getElementById('dir-empty-state-area');
    const exportContainer = document.getElementById('dir-export-container');
    if (tableArea) tableArea.style.display = 'none';
    if (exportContainer) exportContainer.style.display = 'none';
    if (emptyArea) {
      emptyArea.style.display = 'block';
      emptyArea.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 40px 20px; background: rgba(255, 255, 255, 0.4); border-radius: 12px; border: 1.5px dashed var(--slate-300); backdrop-filter: blur(8px); min-height: 220px; width: 100%;">
          <div style="width: 64px; height: 64px; background: #eff6ff; color: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 16px; box-shadow: 0 8px 16px rgba(59,130,246,0.08);">
            <i class="fas fa-search"></i>
          </div>
          <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--slate-900); margin-bottom: 6px;">Consulte el estado de su IE</h4>
          <p style="font-size: 0.85rem; color: var(--slate-600); max-width: 380px; line-height: 1.45; margin: 0 0 16px 0;">Use el buscador lateral para ingresar el <strong>Código Local</strong> o nombre de su Institución Educativa y visualizar sus actividades asignadas.</p>
          <span style="font-size: 0.75rem; background: #fee2e2; color: #991b1b; padding: 6px 14px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fas fa-arrow-left"></i> Ingrese el código en el panel de filtrado lateral
          </span>
        </div>
      `;
    }
    return;
  }
  var filteredItems = [];
  if (currentDirectorFilter === 'pendiente') {
    filteredItems = rows.filter(r => (r.estado === 'pendiente' || r.estado === 'inconclusa') && !(r.fecha_limite && r.fecha_limite < hoy));
  } else if (currentDirectorFilter === 'completada') {
    filteredItems = rows.filter(r => r.estado === 'completada');
  } else if (currentDirectorFilter === 'vencida') {
    filteredItems = rows.filter(r => r.estado === 'no_cumplida' || ((r.estado === 'pendiente' || r.estado === 'inconclusa') && r.fecha_limite && r.fecha_limite < hoy));
  } else {
    filteredItems = rows;
  }

  var titleEl = document.getElementById('dir-table-title');
  if (titleEl) {
    var filterText = 'ACTIVIDADES ASIGNADAS';
    if (currentDirectorFilter === 'pendiente') filterText = 'ACTIVIDADES PENDIENTES';
    else if (currentDirectorFilter === 'completada') filterText = 'ACTIVIDADES CUMPLIDAS';
    else if (currentDirectorFilter === 'vencida') filterText = 'ACTIVIDADES VENCIDAS';
    titleEl.textContent = 'LISTADO DE ' + filterText + ' (' + filteredItems.length + ')';
  }

  const tableBody = document.getElementById('director-actividades-table');
  const tableArea = document.getElementById('dir-table-content-area');
  const emptyArea = document.getElementById('dir-empty-state-area');
  const exportContainer = document.getElementById('dir-export-container');

  if (!tableBody || !tableArea || !emptyArea) return;

  if (filteredItems.length === 0) {
    tableArea.style.display = 'none';
    if (exportContainer) exportContainer.style.display = 'none';
    emptyArea.style.display = 'block';

    const pendingCount = rows.filter(r => (r.estado === 'pendiente' || r.estado === 'inconclusa') && !(r.fecha_limite && r.fecha_limite < hoy)).length;
    
    if (pendingCount === 0 && (currentDirectorFilter === 'pendiente' || currentDirectorFilter === 'all')) {
      const vencidasCount = rows.filter(r => r.estado === 'no_cumplida' || ((r.estado === 'pendiente' || r.estado === 'inconclusa') && r.fecha_limite && r.fecha_limite < hoy)).length;
      
      if (vencidasCount === 0) {
        emptyArea.innerHTML = `
          <div style="display:flex; flex-direction:row; align-items:center; justify-content:center; gap:32px; flex-wrap:wrap; width:100%;">
            <div style="flex:1; min-width:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
              <div style="width: 72px; height: 72px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin-bottom: 16px; box-shadow: 0 8px 16px rgba(5,150,105,0.08);">
                <i class="fas fa-check-circle"></i>
              </div>
              <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900); margin-bottom: 6px;">¡Al día con todo!</h4>
              <p style="font-size: 0.85rem; color: var(--slate-600); max-width: 260px; line-height: 1.4; margin: 0;">¡Felicidades! Estás al día con tus actividades pendientes.</p>
            </div>
            <div id="dir-mini-calendar-container" style="flex:1; min-width:280px; display:flex; justify-content:center;"></div>
          </div>
        `;
      } else {
        emptyArea.innerHTML = `
          <div style="display:flex; flex-direction:row; align-items:center; justify-content:center; gap:32px; flex-wrap:wrap; width:100%;">
            <div style="flex:1; min-width:240px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
              <div style="width: 72px; height: 72px; background: #fff7ed; color: #ea580c; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin-bottom: 16px; box-shadow: 0 8px 16px rgba(234,88,12,0.08);">
                <i class="fas fa-exclamation-triangle"></i>
              </div>
              <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--slate-900); margin-bottom: 6px;">Actividades Vencidas</h4>
              <p style="font-size: 0.85rem; color: var(--slate-600); max-width: 260px; line-height: 1.4; margin: 0;">Tienes <strong>${vencidasCount}</strong> actividad(es) vencida(s) o no cumplida(s) este periodo. Por favor, regulariza con tu supervisor.</p>
            </div>
            <div id="dir-mini-calendar-container" style="flex:1; min-width:280px; display:flex; justify-content:center;"></div>
          </div>
        `;
      }
      renderMiniCalendar('dir-mini-calendar-container', rows);
    } else {
      emptyArea.innerHTML = `
        <div style="text-align:center; padding:30px 10px; color:var(--text3);">
          <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 12px; color: var(--slate-300);"></i>
          <p style="margin:0; font-size: 0.85rem; font-weight: 500;">No se encontraron actividades en esta categoría.</p>
        </div>
      `;
    }
    return;
  }

  tableArea.style.display = 'block';
  emptyArea.style.display = 'none';
  if (exportContainer) {
    exportContainer.style.display = 'block';
    const btnExport = document.getElementById('btn-export-director');
    if (btnExport) {
      btnExport.onclick = () => {
        const codigo = document.getElementById('dir-filter-codigo').value;
        descargarExcel('/api/export/asignaciones?buscar=' + encodeURIComponent(codigo) + (currentDirectorFilter !== 'all' ? '&estado=' + (currentDirectorFilter === 'pendiente' ? 'pendiente' : currentDirectorFilter === 'completada' ? 'completada' : 'no_cumplida') : ''));
      };
    }
  }

  var html = filteredItems.map(a => {
    const titulo = a.actividad_titulo || a.titulo || '-';
    const tipo   = a.tipo_nombre || a.tipo || '';
    const resp_nombre = a.asignador_nombre || '';
    const area   = a.area || '';
    const subarea = a.subarea || '';
    const estado = a.estado || 'pendiente';
    
    var fechaDisplay = '-';
    if (a.fecha_limite) {
      if (a.fecha_inicio && a.fecha_inicio !== a.fecha_limite) {
        var fi = formatFechaMock(a.fecha_inicio);
        var fl = formatFechaMock(a.fecha_limite);
        fechaDisplay = `<div style="line-height:1.2;">${fi}<br><span style="font-size: 0.72rem; color: #6b7280; font-weight: normal;">al ${fl}</span></div>`;
      } else {
        fechaDisplay = formatFechaMock(a.fecha_limite);
      }
    }

    var badgeClass = 'green', badgeText = 'Cumplido', rowClass = 'row-cumplida';
    if (estado === 'pendiente') { 
      var isOverdue = a.fecha_limite && a.fecha_limite < hoy;
      if (isOverdue) {
        badgeClass = 'red'; badgeText = 'Vencido'; rowClass = 'row-vencida';
      } else {
        badgeClass = 'yellow'; badgeText = 'Pendiente'; rowClass = 'row-pendiente';
      }
    }
    else if (estado === 'no_cumplida') {
      badgeClass = 'red'; badgeText = 'Vencido'; rowClass = 'row-vencida';
    }
    else if (estado === 'inconclusa') {
      var isOverdue = a.fecha_limite && a.fecha_limite < hoy;
      if (isOverdue) {
        badgeClass = 'red'; badgeText = 'Inconclusa (Vencida)'; rowClass = 'row-vencida';
      } else {
        badgeClass = 'orange'; badgeText = 'Inconclusa'; rowClass = 'row-pendiente';
      }
    }

    var resp = '-';
    if (resp_nombre && area && subarea) resp = resp_nombre + ' <br><small class="text-muted">(' + area + ' - ' + subarea + ')</small>';
    else if (resp_nombre && area) resp = resp_nombre + ' <br><small class="text-muted">(' + area + ')</small>';
    else if (resp_nombre) resp = resp_nombre;
    else if (area) resp = area;

    var waLink = '-';
    if (a.asignador_telefono) {
      waLink = `
        <a href="https://wa.me/51${a.asignador_telefono}?text=${encodeURIComponent('Hola, le escribo para consultar sobre la actividad: "' + titulo + '"')}" target="_blank" style="color: #16a34a; text-decoration: none; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; background: #f0fdf4; padding: 6px 12px; border-radius: 20px; border: 1px solid #bbf7d0; font-size: 0.8rem; transition: all 0.15s; white-space: nowrap;" onclick="event.stopPropagation();" onmouseover="this.style.background='#dcfce7'; this.style.borderColor='#86efac';" onmouseout="this.style.background='#f0fdf4'; this.style.borderColor='#bbf7d0';">
          <i class="fab fa-whatsapp" style="font-size: 15px; color: #25D366;"></i> ${a.asignador_telefono}
        </a>
      `;
    } else if (resp_nombre) {
      waLink = `
        <a href="#" style="color: var(--granate); text-decoration: none; font-size: 12px; font-weight: 700; display: inline-flex; align-items:center; gap: 4px;" onclick="event.stopPropagation(); event.preventDefault(); contactarSupervisor(${a.id}, '${resp_nombre.replace(/'/g, "\\'")}')">
          <i class="far fa-paper-plane" style="font-size: 11px;"></i> Enviar Mensaje
        </a>
      `;
    }

    var badgeTipoHtml = tipo ? `<div style="margin-top: 4px;"><span class="badge badge-info" style="font-size: 0.68rem; text-transform: uppercase; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; background-color: #e5e7eb; color: #4b5563;">${tipo}</span></div>` : '';

    var nivelesArr = a.niveles_aplicados ? a.niveles_aplicados.split(',') : [];
    var nivelesStr = '';
    if (nivelesArr.length > 0) {
      var codes = [];
      if (nivelesArr.includes('inicial') && a.cm_inicial) codes.push('Ini: ' + a.cm_inicial);
      if (nivelesArr.includes('primaria') && a.cm_primaria) codes.push('Pri: ' + a.cm_primaria);
      if (nivelesArr.includes('secundaria') && a.cm_secundaria) codes.push('Sec: ' + a.cm_secundaria);
      if (codes.length > 0) {
        nivelesStr = '<div style="margin-top:4px;"><small style="color:#2563eb; font-weight:700;">Aplica a: ' + codes.join(' | ') + '</small></div>';
      } else {
        nivelesStr = '<div style="margin-top:4px;"><small style="color:#2563eb; font-weight:700;">Aplica a: ' + nivelesArr.join(', ').toUpperCase() + '</small></div>';
      }
    } else {
      nivelesStr = '<div style="margin-top:4px;"><small style="color:#6b7280; font-weight:600;">IE Completa</small></div>';
    }

    return `<tr class="${rowClass}" onclick="mostrarDetalleActividad(${a.id})">
      <td data-label="Actividad"><strong>${titulo}</strong>${badgeTipoHtml}${nivelesStr}</td>
      <td data-label="Fecha Límite">${fechaDisplay}</td>
      <td data-label="Estado"><span class="dir-badge ${badgeClass}">${badgeText}</span></td>
      <td data-label="Responsable">${resp}</td>
      <td data-label="Teléfono">${waLink}</td>
    </tr>`;
  }).join('');

  tableBody.innerHTML = html;
}

function mostrarDetalleActividad(id) {
  var row = currentDirectorRows.find(function(r) { return r.id === id; });
  if (!row) return;

  var titulo = row.actividad_titulo || row.titulo || 'Sin título';
  var fechaInicio = row.fecha_inicio ? formatFechaMock(row.fecha_inicio) : '';
  var fechaLimite = row.fecha_limite ? formatFechaMock(row.fecha_limite) : 'Sin fecha';
  var rangoFechas = fechaInicio && fechaInicio !== fechaLimite ? `Del ${fechaInicio} al ${fechaLimite}` : fechaLimite;
  var hora = row.hora_limite || '23:59';
  var tipo = row.tipo_nombre || row.tipo || 'Sin tipo';
  var resp = row.asignador_nombre || '';
  var area = row.area || '';
  var subarea = row.subarea || '';
  var telefono = row.asignador_telefono || '';
  var desc = row.actividad_descripcion || row.descripcion || 'Sin descripción';
  var estado = row.estado || 'pendiente';
  var notas = row.notas_supervisor || '';
  var completadoFecha = row.fecha_completado || '';

  var stateBadge = '';
  if (estado === 'completada') {
    stateBadge = '<span class="badge badge-completada" style="background-color:#059669; color:#fff; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.65rem;">CUMPLIDA</span>';
  } else if (estado === 'no_cumplida') {
    stateBadge = '<span class="badge badge-no_cumplida" style="background-color:#dc2626; color:#fff; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.65rem;">VENCIDA</span>';
  } else if (estado === 'inconclusa') {
    stateBadge = '<span class="badge badge-inconclusa" style="background-color:#ea580c; color:#fff; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.65rem;">INCONCLUSA</span>';
  } else {
    var hoy = new Date().toLocaleString('sv', { timeZone: 'America/Lima' }).split(' ')[0];
    if (row.fecha_limite && row.fecha_limite < hoy) {
      stateBadge = '<span class="badge badge-no_cumplida" style="background-color:#dc2626; color:#fff; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.65rem;">VENCIDA</span>';
    } else {
      stateBadge = '<span class="badge badge-pendiente" style="background-color:#d97706; color:#fff; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.65rem;">PENDIENTE</span>';
    }
  }

  var contactBtn = resp ? `
    <button class="btn btn-primary" onclick="event.stopPropagation(); closeModal(); contactarSupervisor(${row.id}, '${resp.replace(/'/g, "\\'")}')">
      <i class="far fa-paper-plane"></i> Contactar
    </button>
  ` : '';

  var bodyHtml = `
    <div style="font-family:'Inter',sans-serif; color:#1f2937;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span class="badge badge-info" style="font-size:0.65rem; text-transform:uppercase; font-weight:700; padding:4px 10px; border-radius:6px;">${tipo}</span>
        ${stateBadge}
      </div>
      <h3 style="font-size:1.15rem; font-weight:800; color:#111827; margin:0 0 12px 0; text-transform:uppercase; border-bottom:2px solid #e5e7eb; padding-bottom:8px; line-height:1.4;">${titulo}</h3>
      
      <div style="margin-bottom:16px;">
        <h5 style="font-size:0.75rem; font-weight:700; color:#4b5563; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:0.5px;">Descripción</h5>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:12px; font-size:0.85rem; color:#374151; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${desc}</div>
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:16px; background:#f3f4f6; border-radius:12px; padding:12px;">
        <div>
          <div style="font-size:0.65rem; font-weight:700; color:#6b7280; text-transform:uppercase;">Plazo de Ejecución</div>
          <div style="font-size:0.8rem; font-weight:600; color:#1f2937; margin-top:2px;"><i class="far fa-calendar-alt" style="margin-right:4px;"></i> ${rangoFechas}</div>
        </div>
        <div>
          <div style="font-size:0.65rem; font-weight:700; color:#6b7280; text-transform:uppercase;">Hora Límite</div>
          <div style="font-size:0.8rem; font-weight:600; color:#1f2937; margin-top:2px;"><i class="far fa-clock" style="margin-right:4px;"></i> ${hora}</div>
        </div>
        <div>
          <div style="font-size:0.65rem; font-weight:700; color:#6b7280; text-transform:uppercase;">Asignador / Área</div>
          <div style="font-size:0.8rem; font-weight:600; color:#1f2937; margin-top:2px;">
            <i class="far fa-user" style="margin-right:4px;"></i> ${resp || '-'}
            ${area ? `<div style="font-size:0.7rem; color:#6b7280; margin-left:14px; font-weight:normal;">${area} ${subarea ? `(${subarea})` : ''}</div>` : ''}
          </div>
        </div>
        ${telefono ? `
        <div>
          <div style="font-size:0.65rem; font-weight:700; color:#6b7280; text-transform:uppercase;">Contacto Asignador</div>
          <div style="font-size:0.8rem; font-weight:600; color:#1f2937; margin-top:2px;"><i class="fas fa-phone-alt" style="margin-right:4px; color:#059669;"></i> ${telefono}</div>
        </div>
        ` : ''}
      </div>

      ${completadoFecha ? `
      <div style="margin-bottom:16px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:12px;">
        <div style="font-size:0.65rem; font-weight:700; color:#047857; text-transform:uppercase;">Fecha de Completado</div>
        <div style="font-size:0.8rem; font-weight:600; color:#065f46; margin-top:2px;">
          <i class="fas fa-calendar-check" style="margin-right:4px;"></i> ${new Date(completadoFecha).toLocaleString('es-PE')}
        </div>
      </div>
      ` : ''}

      ${estado === 'inconclusa' && notas ? `
      <div style="margin-bottom:16px; background:#fff7ed; border:1px solid #ffedd5; border-radius:12px; padding:12px; border-left: 4px solid #ea580c;">
        <div style="font-size:0.65rem; font-weight:700; color:#ea580c; text-transform:uppercase; letter-spacing:0.5px;">Observaciones del Supervisor (Pendiente por Completar)</div>
        <div style="font-size:0.82rem; color:#9a3412; margin-top:4px; font-weight: 500; font-style:italic;">"${notas}"</div>
      </div>
      ` : (notas ? `
      <div style="margin-bottom:16px; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:12px;">
        <div style="font-size:0.65rem; font-weight:700; color:#b45309; text-transform:uppercase;">Notas del Supervisor</div>
        <div style="font-size:0.8rem; color:#78350f; margin-top:4px; font-style:italic;">"${notas}"</div>
      </div>
      ` : '')}
    </div>
  `;

  var footerHtml = `
    <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
    ${contactBtn}
  `;

  showModal(titulo, bodyHtml, footerHtml);
}

function contactarSupervisor(asignacionId, nombre) {
  showModal('Responder a ' + nombre,
    '<div class="mb-3"><label class="form-label">Mensaje</label><textarea class="form-control" id="contact-msg" rows="4" placeholder="Escriba su mensaje..."></textarea></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="enviarContacto(' + asignacionId + ')">Enviar</button>');
}
async function enviarContacto(asignacionId) {
  var msg = document.getElementById('contact-msg').value.trim();
  if (!msg) { showToast('Escriba un mensaje', 'error'); return; }
  try {
    await api('/api/responder', { method: 'POST', body: { actividad_id: asignacionId, mensaje: msg } });
    showToast('Mensaje enviado al supervisor', 'success');
    closeModal();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}



// ===================== DASHBOARD SUPERVISOR =====================
async function loadDashboardSupervisor() {
  try {
    var d = await api('/api/dashboard?' + getFilterParams());
    var t = d.total || 0;
    var c = d.completadas || 0;
    var p = d.pendientes || 0;
    var v = d.vencidas || 0;
    var ti = d.total_ies || d.totalIEs || 0;
    var td = d.total_directores || d.totalDirectores || 0;
    var pct = t > 0 ? Math.round(c / t * 100) : 0;
    document.getElementById('supervisor-stats').innerHTML =
      '<div class="kpi-card green"><div class="kpi-icon"><i class="fas fa-clipboard-list"></i></div><div class="kpi-body"><div class="kpi-label">Total Actividades</div><div class="kpi-value">' + t + '</div><div class="kpi-sub">' + c + ' completadas</div></div></div>' +
      '<div class="kpi-card amber"><div class="kpi-icon"><i class="fas fa-clock"></i></div><div class="kpi-body"><div class="kpi-label">Pendientes</div><div class="kpi-value">' + p + '</div><div class="kpi-sub">' + v + ' vencidas</div></div></div>' +
      '<div class="kpi-card granate"><div class="kpi-icon"><i class="fas fa-school"></i></div><div class="kpi-body"><div class="kpi-label">Instituciones</div><div class="kpi-value">' + ti + '</div><div class="kpi-sub">IEs registradas</div></div></div>' +
      '<div class="kpi-card"><div class="kpi-icon" style="background:var(--granate-light);color:var(--granate)"><i class="fas fa-users"></i></div><div class="kpi-body"><div class="kpi-label">Directores</div><div class="kpi-value">' + td + '</div><div class="kpi-sub">' + pct + '% cumplimiento</div></div></div>';
    document.getElementById('supervisor-compliance-bar').innerHTML =
      '<div class="compliance-card"><div class="clabel"><span><i class="fas fa-chart-line" style="color:var(--granate)"></i>Cumplimiento General</span><span>' + pct + '%</span></div><div class="track"><div class="fill ' + (pct >= 70 ? 'alto' : (pct >= 40 ? 'medio' : 'bajo')) + '" style="width:' + pct + '%"></div></div></div>';
    
    var topHtml = '';
      if (d.por_ie && d.por_ie.length > 0) {
        for (var i = 0; i < d.por_ie.length; i++) {
          topHtml += '<tr><td>' + (d.por_ie[i].nombre || '-') + '</td><td><span class="badge badge-danger">' + d.por_ie[i].no_cumplidas + '</span></td></tr>';
        }
      } else {
        topHtml = '<tr class="empty"><td colspan="2">No hay vencidas</td></tr>';
      }
      document.getElementById('top-vencidas-table').innerHTML = topHtml;

      var rankHtml = '';
      if (d.ranking_ies && d.ranking_ies.length > 0) {
        for (var i = 0; i < d.ranking_ies.length; i++) {
          rankHtml += '<tr><td>' + (d.ranking_ies[i].nombre || '-') + '</td><td><span class="badge badge-success">' + d.ranking_ies[i].completadas + '</span></td><td><span class="badge badge-danger">' + d.ranking_ies[i].no_cumplidas + '</span></td></tr>';
        }
      } else {
        rankHtml = '<tr class="empty"><td colspan="3">No hay datos</td></tr>';
      }
      if(document.getElementById('ranking-ies-table')) document.getElementById('ranking-ies-table').innerHTML = rankHtml;
      
    var rec = d.recientes || d.asignaciones || [];
    rec = rec.slice(0, 10);
    var htmlR = '';
    if (rec.length > 0) {
      for (var i = 0; i < rec.length; i++) {
        var a = rec[i];
        var est = a.asignacion_estado || a.estado || 'pendiente';
        htmlR += '<tr><td>' + (a.ie_nombre || '-') + '</td><td>' + (a.actividad_titulo || a.titulo || '-') + '</td><td><span class="badge badge-' + est + '">' + est.replace('_', ' ').toUpperCase() + '</span></td></tr>';
      }
    } else {
      htmlR = '<tr class="empty"><td colspan="3">Sin datos</td></tr>';
    }
    document.getElementById('supervisor-recent-table').innerHTML = htmlR;
    renderChartCumplimiento(c, p, v);
  } catch (e) {
    showToast('Error al cargar dashboard: ' + e.message, 'error');
  }
}

function renderChartCumplimiento(c, p, v) {
  var ctx = document.getElementById('chart-cumplimiento');
  if (!ctx) return;
  if (chartCumplimiento) chartCumplimiento.destroy();
  chartCumplimiento = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Completadas', 'Pendientes', 'Vencidas'], datasets: [{ data: [c, p, v], backgroundColor: ['#059669', '#d97706', '#dc2626'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { family: 'Inter' } } } } }
  });
}

// ===================== ASIGNAR =====================
let selectedIEIds = new Set();

function syncSelectedIEs() {
  var cbs = document.querySelectorAll('.ie-checkbox');
  for (var i = 0; i < cbs.length; i++) {
    var val = parseInt(cbs[i].value);
    if (cbs[i].checked) {
      selectedIEIds.add(val);
    } else {
      selectedIEIds.delete(val);
    }
  }
}

async function loadIEsForAsignar() {
  try {
    var d = await api('/api/ies');
    allIEs = d.ies || d || [];
    selectedIEIds.clear();
    renderIECheckboxes(allIEs);
    onChangeAlcance(document.getElementById('as-alcance').value);
  } catch (e) {}
}

function renderIECheckboxes(ies) {
  var html = '';
  for (var i = 0; i < ies.length; i++) {
    var ie = ies[i];
    var isChecked = selectedIEIds.has(ie.id) ? 'checked' : '';
    html += '<label class="ie-item"><input type="checkbox" class="ie-checkbox" onchange="syncSelectedIEs()" value="' + ie.id + '" ' + isChecked + '><span class="ie-codigo" style="min-width:65px; display:inline-block;">' + ie.codigo + '</span><span class="ie-nombre">' + ie.nombre + '</span></label>';
  }
  document.getElementById('ie-checkbox-list').innerHTML = html;
}

function filterIEList() {
  syncSelectedIEs();
  var q = document.getElementById('ie-search').value.toLowerCase();
  var n = document.getElementById('ie-filter-nivel').value;
  
  var filtered = allIEs.filter(function(ie) {
    var c1 = ie.cm_inicial || '';
    var c2 = ie.cm_primaria || '';
    var c3 = ie.cm_secundaria || '';
    var matchSearch = ie.codigo.toLowerCase().indexOf(q) !== -1 || ie.nombre.toLowerCase().indexOf(q) !== -1 || c1.toLowerCase().indexOf(q) !== -1 || c2.toLowerCase().indexOf(q) !== -1 || c3.toLowerCase().indexOf(q) !== -1;
    var matchNivel = true;
    if (n === 'inicial') matchNivel = ie.tiene_inicial;
    else if (n === 'primaria') matchNivel = ie.tiene_primaria;
    else if (n === 'secundaria') matchNivel = ie.tiene_secundaria;
    else if (n === 'otros') matchNivel = ie.tiene_otros;
    return matchSearch && matchNivel;
  });
  
  renderIECheckboxes(filtered);
}

function toggleAllIEs(s) {
  var cbs = document.querySelectorAll('.ie-checkbox');
  for (var i = 0; i < cbs.length; i++) { 
    cbs[i].checked = s; 
    var val = parseInt(cbs[i].value);
    if (s) {
      selectedIEIds.add(val);
    } else {
      selectedIEIds.delete(val);
    }
  }
}

var selectedSpecificIEIds = new Set();

function onChangeAlcance(val) {
  document.getElementById('alcance-nivel-container').style.display = (val === 'nivel') ? 'block' : 'none';
  document.getElementById('alcance-especifico-container').style.display = (val === 'modular' || val === 'institucion') ? 'block' : 'none';
  document.getElementById('alcance-manual-container').style.display = (val === 'manual') ? 'block' : 'none';
  document.getElementById('niveles-global-container').style.display = (val === 'manual' || val === 'institucion') ? 'block' : 'none';
  
  if (val === 'modular') {
    document.getElementById('as-search-ie').placeholder = 'Escriba código modular o nombre de IE para asignar un nivel...';
  } else if (val === 'institucion') {
    document.getElementById('as-search-ie').placeholder = 'Escriba código local o nombre de IE para asignar toda la IE...';
  }
  
  selectedSpecificIEIds.clear();
  renderSpecificIETags();
}

function onSearchIEAsignar(q) {
  var container = document.getElementById('as-search-autocomplete');
  if (!q || q.trim() === '') {
    container.style.display = 'none';
    return;
  }
  var query = normalizar(q);
  var alcance = document.getElementById('as-alcance').value;
  var matches = [];
  
  if (alcance === 'modular') {
    allIEs.forEach(function(ie) {
      var normNombre = normalizar(ie.nombre);
      if (ie.tiene_inicial && ie.cm_inicial && (normalizar(ie.cm_inicial).indexOf(query) !== -1 || normNombre.indexOf(query) !== -1)) {
          matches.push({ id: ie.id, val: ie.id + '|inicial', displayId: ie.cm_inicial, nivel: 'inicial', nombre: ie.nombre });
      }
      if (ie.tiene_primaria && ie.cm_primaria && (normalizar(ie.cm_primaria).indexOf(query) !== -1 || normNombre.indexOf(query) !== -1)) {
          matches.push({ id: ie.id, val: ie.id + '|primaria', displayId: ie.cm_primaria, nivel: 'primaria', nombre: ie.nombre });
      }
      if (ie.tiene_secundaria && ie.cm_secundaria && (normalizar(ie.cm_secundaria).indexOf(query) !== -1 || normNombre.indexOf(query) !== -1)) {
          matches.push({ id: ie.id, val: ie.id + '|secundaria', displayId: ie.cm_secundaria, nivel: 'secundaria', nombre: ie.nombre });
      }
    });
  } else if (alcance === 'institucion') {
    allIEs.forEach(function(ie) {
      if (normalizar(ie.codigo).indexOf(query) !== -1 || normalizar(ie.nombre).indexOf(query) !== -1) {
          matches.push({ id: ie.id, val: ie.id.toString(), displayId: ie.codigo, nivel: null, nombre: ie.nombre });
      }
    });
  }
  
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:#999;font-size:0.8rem;text-align:center">No se encontraron resultados</div>';
  } else {
    var html = '';
    var limit = Math.min(matches.length, 15);
    for (var i = 0; i < limit; i++) {
      var item = matches[i];
      if (selectedSpecificIEIds.has(item.val)) continue;
      
      var escapedNombre = item.nombre.replace(/'/g, "\\'");
      var param2 = item.nivel ? ("'" + item.nivel + "'") : 'null';
      html += '<div class="as-autocomplete-item" onclick="addSpecificIE(' + item.id + ', ' + param2 + ', \'' + item.displayId + '\', \'' + escapedNombre + '\')" style="padding:10px 14px;border-bottom:1px solid #f0f1f3;cursor:pointer;font-size:0.8rem;transition:background 0.15s" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">';
      html += '<span style="font-weight:700;color:var(--granate);margin-right:8px">' + item.displayId + '</span>';
      html += '<span style="color:#333">' + item.nombre;
      if (item.nivel) {
         html += ' <small style="color:#6b7280; font-weight:600;">(' + item.nivel.charAt(0).toUpperCase() + item.nivel.slice(1) + ')</small>';
      }
      html += '</span></div>';
    }
    container.innerHTML = html;
  }
  container.style.display = 'block';
}

function addSpecificIE(id, nivel, displayId, nombre) {
  var val = nivel ? (id + '|' + nivel) : id.toString();
  selectedSpecificIEIds.add(val);
  document.getElementById('as-search-ie').value = '';
  document.getElementById('as-search-autocomplete').style.display = 'none';
  renderSpecificIETags();
}

function removeSpecificIE(val) {
  selectedSpecificIEIds.delete(val);
  renderSpecificIETags();
}

function renderSpecificIETags() {
  var container = document.getElementById('as-selected-ies-tags');
  var html = '';
  var alcance = document.getElementById('as-alcance').value;
  selectedSpecificIEIds.forEach(function(val) {
    var isModular = val.indexOf('|') !== -1;
    var parts = val.split('|');
    var id = parseInt(parts[0]);
    var nivel = isModular ? parts[1] : null;
    var ie = allIEs.find(function(item) { return item.id === id; });
    
    if (ie) {
      var displayId = ie.codigo;
      var textExtra = '';
      if (isModular) {
         displayId = (nivel === 'inicial') ? ie.cm_inicial : (nivel === 'primaria') ? ie.cm_primaria : ie.cm_secundaria;
         textExtra = ' (' + nivel.substring(0,3).toUpperCase() + ')';
      }
      html += '<span class="badge badge-info" style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; font-size:0.75rem; border-radius:20px; background:var(--granate); color:#fff; font-weight:700; border:none; margin-right:4px; margin-bottom:4px;">' +
        displayId + ' - ' + ie.nombre + textExtra +
        '<i class="fas fa-times" onclick="removeSpecificIE(\'' + val + '\')" style="cursor:pointer; font-size:0.7rem; opacity:0.8; margin-left:6px;"></i>' +
        '</span>';
    }
  });
  container.innerHTML = html;
}

async function submitAsignar() {
  var tit = document.getElementById('as-titulo').value.trim();
  var ti = document.getElementById('as-tipo').value;
  var desc = document.getElementById('as-descripcion').value.trim();
  var fecInicio = document.getElementById('as-fecha-inicio').value;
  var fec = document.getElementById('as-fecha').value;
  var hor = document.getElementById('as-hora').value;
  
  if (!tit || !ti || !fec || !hor || !fecInicio) { showToast('Complete campos obligatorios', 'error'); return; }
  if (fecInicio > fec) { showToast('La fecha de inicio no puede ser posterior a la fecha límite', 'error'); return; }
  
  var alcance = document.getElementById('as-alcance').value;
  var ids = [];
  var targetIes = [];
  
  var cbs = document.querySelectorAll('.as-nivel-cb:checked');
  var globalNiveles = [];
  for (var i = 0; i < cbs.length; i++) globalNiveles.push(cbs[i].value);
  
  if (alcance === 'manual') {
    syncSelectedIEs();
    if (selectedIEIds.size === 0) { showToast('Seleccione al menos una institución de la lista', 'error'); return; }
    ids = Array.from(selectedIEIds);
    targetIes = ids.map(function(id) { return { id: parseInt(id), niveles: globalNiveles.length > 0 ? globalNiveles : null }; });
  } else if (alcance === 'institucion') {
    if (selectedSpecificIEIds.size === 0) { showToast('Agregue al menos una IE específica', 'error'); return; }
    ids = Array.from(selectedSpecificIEIds).map(function(v) { return parseInt(v); });
    targetIes = ids.map(function(id) { return { id: parseInt(id), niveles: globalNiveles.length > 0 ? globalNiveles : null }; });
  } else if (alcance === 'modular') {
    if (selectedSpecificIEIds.size === 0) { showToast('Agregue al menos un código modular', 'error'); return; }
    var targetIesMap = {};
    Array.from(selectedSpecificIEIds).forEach(function(val) {
       var parts = val.split('|');
       var ieId = parseInt(parts[0]);
       var nivel = parts[1];
       if (!targetIesMap[ieId]) targetIesMap[ieId] = [];
       targetIesMap[ieId].push(nivel);
    });
    targetIes = Object.keys(targetIesMap).map(function(id) { return { id: parseInt(id), niveles: targetIesMap[id] }; });
    ids = targetIes.map(function(t) { return t.id; });
  } else if (alcance === 'nivel') {
    var nivelVal = document.getElementById('as-alcance-nivel').value;
    var matchingIEs = allIEs.filter(function(ie) {
      if (nivelVal === 'inicial') return ie.tiene_inicial;
      if (nivelVal === 'primaria') return ie.tiene_primaria;
      if (nivelVal === 'secundaria') return ie.tiene_secundaria;
      if (nivelVal === 'otros') return ie.tiene_otros;
      return false;
    });
    targetIes = matchingIEs.map(function(ie) { return { id: ie.id, niveles: [nivelVal] }; });
    ids = targetIes.map(function(t) { return t.id; });
    if (targetIes.length === 0) { showToast('No se encontraron IEs para el nivel seleccionado', 'error'); return; }
  }
  
  var btnSubmit = document.querySelector('#asignar-form button[type="submit"]');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Asignando...';
  }
  
  try {
    await api('/api/actividades', { method: 'POST', body: { titulo: tit, tipo_id: ti, descripcion: desc, fecha_limite: fec, hora_limite: hor, ies: targetIes, ie_ids: ids, fecha_inicio: fecInicio } });
    showToast('Actividad asignada con éxito', 'success');
    document.getElementById('asignar-form').reset();
    document.getElementById('ie-filter-nivel').value = '';
    document.getElementById('ie-search').value = '';
    selectedIEIds.clear();
    renderIECheckboxes(allIEs);
    selectedSpecificIEIds.clear();
    renderSpecificIETags();
    document.getElementById('as-alcance').value = 'nivel';
    onChangeAlcance('nivel');
  } catch (e) { 
    showToast('Error: ' + e.message, 'error'); 
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = 'Asignar Actividad';
    }
  }
}

// ===================== MONITOREO =====================
async function loadMonitoreo() {
  try {
    cargarSupervisores();
    var es = document.getElementById('mon-estado').value;
    var bu = document.getElementById('mon-buscar').value;
    var n = document.getElementById('mon-nivel').value;
    var as = document.getElementById('mon-asignador').value;
    var u = '/api/asignaciones?';
    if (es) u += 'estado=' + encodeURIComponent(es) + '&';
    if (bu) u += 'buscar=' + encodeURIComponent(bu) + '&';
    if (n) u += 'nivel=' + encodeURIComponent(n) + '&';
    if (as) u += 'asignador_id=' + encodeURIComponent(as) + '&';
    var d = await api(u);
    var rows = d.asignaciones || d || [];
    var html = '';
    if (rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var a = rows[i];
        var act = a.actividad_id || a.id;
        var actionBtns = '';
        if (a.estado !== 'completada') {
          actionBtns += '<button class="btn btn-xs btn-success me-1" onclick="cambiarEstadoAsignacion(' + a.id + ',\'completada\')" title="Marcar completada"><i class="fas fa-check"></i></button>';
        }
        if (a.estado !== 'no_cumplida') {
          actionBtns += '<button class="btn btn-xs btn-danger me-1" onclick="cambiarEstadoAsignacion(' + a.id + ',\'no_cumplida\')" title="Marcar no cumplida (vencida)"><i class="fas fa-times"></i></button>';
        }
        if (a.estado !== 'inconclusa') {
          actionBtns += '<button class="btn btn-xs me-1" style="background-color: #ea580c; border-color: #ea580c; color: white;" onclick="cambiarEstadoAsignacion(' + a.id + ',\'inconclusa\')" title="Marcar inconclusa"><i class="fas fa-exclamation-triangle"></i></button>';
        }
        
        var ieCell = '<div style="font-weight:700; color:#1f2937; text-transform:uppercase; font-size:0.78rem;">' + (a.ie_nombre || '-') + '</div>' +
          '<div style="font-size:0.68rem; color:#6b7280; font-weight:600; margin-top:2px;">CÓDIGO: ' + (a.ie_codigo || '-') + '</div>';
        
        var nivelesArr = a.niveles_aplicados ? a.niveles_aplicados.split(',') : [];
        var nivelesStr = '';
        if (nivelesArr.length > 0) {
          var codes = [];
          if (nivelesArr.includes('inicial') && a.cm_inicial) codes.push('Ini: ' + a.cm_inicial);
          if (nivelesArr.includes('primaria') && a.cm_primaria) codes.push('Pri: ' + a.cm_primaria);
          if (nivelesArr.includes('secundaria') && a.cm_secundaria) codes.push('Sec: ' + a.cm_secundaria);
          if (codes.length > 0) {
            nivelesStr = '<div style="font-size:0.7rem; color:#2563eb; font-weight:700; margin-top:4px;">Aplica a: ' + codes.join(' | ') + '</div>';
          } else {
            nivelesStr = '<div style="font-size:0.7rem; color:#2563eb; font-weight:700; margin-top:4px;">Aplica a: ' + nivelesArr.join(', ').toUpperCase() + '</div>';
          }
        } else {
          nivelesStr = '<div style="font-size:0.7rem; color:#6b7280; font-weight:600; margin-top:4px;">Aplica a: IE Completa</div>';
        }

        var actCell = '<div style="font-weight:800; color:#1e1e2f; font-size:0.78rem; text-transform:uppercase;">' + (a.actividad_titulo || a.titulo || '-') + '</div>' +
          '<div style="font-size:0.68rem; color:#6b7280; font-weight:600; margin-top:2px;">ASIGNADO POR: ' + (a.asignador_nombre || '-') + ' (' + (a.area || '-') + ' - ' + (a.subarea || '-') + ')</div>' + nivelesStr;
        
        var dateText = a.fecha_limite ? new Date(a.fecha_limite).toLocaleDateString('es-PE') : '-';
        var dateCell = '<div style="font-weight:700; color:#4b5563; font-size:0.72rem; text-align:center;">' + dateText + '</div>';
        
        var stateCell = '<div style="text-align:center;"><span class="badge badge-' + a.estado + '" style="font-size:0.65rem;">' + a.estado.replace('_', ' ').toUpperCase() + '</span></div>';
        
        var actionsCell = '<div style="text-align:center; display:flex; gap:4px; justify-content:center;">' + actionBtns + 
          '<button class="btn btn-xs btn-warning" onclick="editarActividadModal(' + act + ')" title="Editar / Eliminar"><i class="fas fa-edit"></i></button></div>';
 
        html += '<tr>' +
          '<td style="text-align: center;"><input type="checkbox" class="mon-row-checkbox" value="' + act + '" onchange="updateBulkDeleteButtonState()"></td>' +
          '<td>' + ieCell + '</td>' +
          '<td>' + actCell + '</td>' +
          '<td>' + dateCell + '</td>' +
          '<td>' + stateCell + '</td>' +
          '<td>' + actionsCell + '</td>' +
          '</tr>';
      }
    } else {
      html = '<tr class="empty"><td colspan="6">No se encontraron asignaciones</td></tr>';
    }
    document.getElementById('monitoreo-table').innerHTML = html;
    var masterCheckbox = document.getElementById('select-all-mon');
    if (masterCheckbox) masterCheckbox.checked = false;
    updateBulkDeleteButtonState();
  } catch (e) { showToast('Error al cargar monitoreo: ' + e.message, 'error'); }
}
 
function cambiarEstadoAsignacion(id, est) {
  var title = 'Marcar COMPLETADA';
  var btnClass = 'btn-success';
  var placeholder = 'Observaciones...';
  
  if (est === 'no_cumplida') {
    title = 'Marcar NO CUMPLIDA (VENCIDA)';
    btnClass = 'btn-danger';
  } else if (est === 'inconclusa') {
    title = 'Marcar INCONCLUSA';
    btnClass = 'btn-warning';
    placeholder = 'Escriba qué es lo que falta para cumplir la actividad...';
  }
  
  showModal(title,
    '<div class="mb-3"><label class="form-label">Notas / Observaciones</label><textarea class="form-control" id="notas-supervisor" rows="3" placeholder="' + placeholder + '"></textarea></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn ' + btnClass + '" onclick="confirmarEstado(' + id + ',\'' + est + '\')">Confirmar</button>');
}
async function confirmarEstado(id, est) {
  var n = document.getElementById('notas-supervisor').value.trim();
  if (est === 'inconclusa' && !n) {
    showToast('Debe ingresar qué es lo que falta para cumplir la actividad', 'error');
    return;
  }
  try {
    await api('/api/asignaciones/' + id + '/estado', { method: 'PUT', body: { estado: est, notas_supervisor: n } });
    showToast('Estado actualizado', 'success');
    closeModal();
    loadMonitoreo();
  } catch (e) { 
    showToast('Error: ' + e.message, 'error'); 
  }
}

async function verDetalleAsignacion(id) {
  try {
    var d = await api('/api/asignaciones/' + id);
    var a = d.asignacion || d;
    var html = '<div class="row">' +
      '<div class="col-6"><strong>IE:</strong> ' + (a.ie_nombre || '-') + '</div>' +
      '<div class="col-6"><strong>Código:</strong> ' + (a.ie_codigo || '-') + '</div>' +

      '<div class="col-6"><strong>Director:</strong> ' + (a.director_nombre || '-') + '</div>' +
      '<div class="col-6"><strong>Área:</strong> ' + (a.area || '-') + '</div>' +
      '<div class="col-6"><strong>Subárea:</strong> ' + (a.subarea || '-') + '</div>' +
      '<div class="col-12"><strong>Actividad:</strong> ' + (a.actividad_titulo || a.titulo || '-') + '</div>' +
      '<div class="col-12"><strong>Descripción:</strong> ' + (a.descripcion || a.actividad_descripcion || '-') + '</div>' +
      '<div class="col-6"><strong>Tipo:</strong> ' + (a.tipo_nombre || a.tipo || '-') + '</div>' +
      '<div class="col-6"><strong>Fecha:</strong> ' + (a.fecha_limite ? new Date(a.fecha_limite).toLocaleDateString('es-PE') : '-') + '</div>' +
      '<div class="col-6"><strong>Hora:</strong> ' + (a.hora_limite || '-') + '</div>' +
      '<div class="col-6"><strong>Estado:</strong> <span class="badge badge-' + a.estado + '">' + a.estado.replace('_', ' ').toUpperCase() + '</span></div>' +
      (a.notas_supervisor ? '<div class="col-12"><strong>Notas:</strong> ' + a.notas_supervisor + '</div>' : '') +
      '</div>';
    showModal('Detalle de Asignación', html);
  } catch (e) { showToast('Error al cargar detalle', 'error'); }
}

function eliminarActividad(actividadId) {
  showModal('Confirmar Eliminación',
    '<p>¿Está seguro de eliminar esta actividad? También se eliminarán todas las asignaciones relacionadas.</p>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="confirmarEliminarActividad(' + actividadId + ')">Eliminar</button>');
}
async function confirmarEliminarActividad(id) {
  try {
    await api('/api/actividades/' + id, { method: 'DELETE' });
    showToast('Actividad eliminada', 'success');
    closeModal();
    loadMonitoreo();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function toggleSelectAllMonitoreo(master) {
  var checkboxes = document.querySelectorAll('.mon-row-checkbox');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = master.checked;
  }
  updateBulkDeleteButtonState();
}

function updateBulkDeleteButtonState() {
  var checkboxes = document.querySelectorAll('.mon-row-checkbox');
  var count = 0;
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      count++;
    }
  }
  
  var btn = document.getElementById('btn-bulk-delete');
  var countSpan = document.getElementById('bulk-delete-count');
  var masterCheckbox = document.getElementById('select-all-mon');
  
  if (countSpan) countSpan.innerText = count;
  
  if (btn) {
    if (count > 0) {
      btn.style.display = 'inline-flex';
    } else {
      btn.style.display = 'none';
    }
  }

  if (masterCheckbox) {
    if (checkboxes.length === 0) {
      masterCheckbox.checked = false;
    } else {
      masterCheckbox.checked = (count === checkboxes.length);
    }
  }
}

function eliminarActividadesSeleccionadas() {
  var checkboxes = document.querySelectorAll('.mon-row-checkbox');
  var ids = [];
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      var val = parseInt(checkboxes[i].value);
      if (!isNaN(val)) ids.push(val);
    }
  }
  
  if (ids.length === 0) return;
  
  showModal('Confirmar Eliminación Múltiple',
    '<p>¿Está seguro de eliminar las <strong>' + ids.length + '</strong> actividades seleccionadas? También se eliminarán todas las asignaciones relacionadas.</p>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="confirmarEliminarMultiplesActividades([' + ids.join(',') + '])">Eliminar</button>');
}

async function confirmarEliminarMultiplesActividades(ids) {
  try {
    await api('/api/actividades/bulk-delete', { method: 'POST', body: { ids: ids } });
    showToast('Actividades eliminadas', 'success');
    closeModal();
    var masterCheckbox = document.getElementById('select-all-mon');
    if (masterCheckbox) masterCheckbox.checked = false;
    loadMonitoreo();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function editarActividadModal(actividadId) {
  try {
    var d = await api('/api/actividades/' + actividadId);
    var act = d.actividad || d;
    var tipos = await api('/api/tipos-actividad');
    var opts = '<option value="">Seleccionar...</option>';
    var tlist = tipos.tipos || tipos || [];
    for (var i = 0; i < tlist.length; i++) {
      opts += '<option value="' + tlist[i].id + '"' + (tlist[i].id === act.tipo_id ? ' selected' : '') + '>' + tlist[i].nombre + '</option>';
    }
    showModal('Editar Actividad',
      '<form id="editar-act-form"><div class="mb-3"><label class="form-label">Título</label><input class="form-control" id="ea-titulo" value="' + (act.titulo || '') + '"></div><div class="mb-3"><label class="form-label">Descripción</label><textarea class="form-control" id="ea-descripcion" rows="3">' + (act.descripcion || '') + '</textarea></div><div class="row"><div class="col-md-4 mb-3"><label class="form-label">Tipo</label><select class="form-select" id="ea-tipo">' + opts + '</select></div><div class="col-md-4 mb-3"><label class="form-label">Fecha de Inicio</label><input type="date" class="form-control" id="ea-fecha-inicio" value="' + (act.fecha_inicio || '') + '"></div><div class="col-md-4 mb-3"><label class="form-label">Fecha Límite</label><input type="date" class="form-control" id="ea-fecha" value="' + (act.fecha_limite || '') + '"></div></div></form>',
      '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger me-auto" onclick="eliminarActividad(' + actividadId + ')"><i class="fas fa-trash"></i> Eliminar</button><button class="btn btn-primary" onclick="guardarEdicionActividad(' + actividadId + ')">Guardar</button>');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function guardarEdicionActividad(id) {
  var body = {
    titulo: document.getElementById('ea-titulo').value.trim(),
    descripcion: document.getElementById('ea-descripcion').value.trim(),
    tipo_id: document.getElementById('ea-tipo').value,
    fecha_inicio: document.getElementById('ea-fecha-inicio').value,
    fecha_limite: document.getElementById('ea-fecha').value
  };
  if (!body.titulo || !body.tipo_id || !body.fecha_limite || !body.fecha_inicio) { showToast('Complete campos obligatorios', 'error'); return; }
  if (body.fecha_inicio > body.fecha_limite) { showToast('La fecha de inicio no puede ser posterior a la fecha límite', 'error'); return; }
  try {
    await api('/api/actividades/' + id, { method: 'PUT', body: body });
    showToast('Actividad actualizada', 'success');
    closeModal();
    loadMonitoreo();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function editarDirector(id) {
  var dir = null;
  for (var i = 0; i < allDirectores.length; i++) {
    if (allDirectores[i].id === id) { dir = allDirectores[i]; break; }
  }
  if (!dir) { showToast('Director no encontrado', 'error'); return; }
  showModal('Editar Director',
    '<div class="mb-3"><label class="form-label">Nombre completo</label><input class="form-control" id="ed-nombre" value="' + (dir.nombre_completo || dir.nombre || '') + '"></div><div class="row"><div class="col-md-6 mb-3"><label class="form-label">Email</label><input class="form-control" id="ed-email" value="' + (dir.email || '') + '"></div><div class="col-md-6 mb-3"><label class="form-label">Teléfono</label><input class="form-control" id="ed-telefono" value="' + (dir.telefono || '') + '"></div></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="guardarDirector(' + id + ')">Guardar</button>');
}

async function guardarDirector(id) {
  var nombre = document.getElementById('ed-nombre').value.trim();
  var email = document.getElementById('ed-email').value.trim();
  var telefono = document.getElementById('ed-telefono').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  try {
    await api('/api/directores/' + id, { method: 'PUT', body: { nombre_completo: nombre, email: email, telefono: telefono } });
    showToast('Director actualizado', 'success');
    closeModal();
    loadDirectores();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function verHistorialDirector(id) {
  var dir = null;
  for (var i = 0; i < allDirectores.length; i++) {
    if (allDirectores[i].id === id) { dir = allDirectores[i]; break; }
  }
  if (!dir) { showToast('Director no encontrado', 'error'); return; }

  try {
    const historial = await api('/api/directores/' + id + '/historial');
    let html = '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Actividad</th><th>Fecha Límite</th><th>Estado</th><th>Asignado por</th><th>Notas</th></tr></thead><tbody>';
    
    if (historial.length === 0) {
      html += '<tr><td colspan="5" class="text-center">No hay actividades registradas</td></tr>';
    } else {
      for (const h of historial) {
        let badge = '<span class="badge bg-warning">Pendiente</span>';
        if (h.estado === 'completada') badge = '<span class="badge bg-success">Cumplido</span>';
        else if (h.estado === 'no_cumplida') badge = '<span class="badge bg-danger">Vencido</span>';
        
        const notas = h.notas_supervisor ? h.notas_supervisor : '-';
        html += `<tr><td>${h.titulo}</td><td>${h.fecha_limite ? formatFechaMock(h.fecha_limite) : '-'}</td><td>${badge}</td><td>${h.asignador_nombre || '-'}</td><td>${notas}</td></tr>`;
      }
    }
    html += '</tbody></table></div>';
    
    showModal('Historial: ' + (dir.ie_nombre || dir.nombre_completo || 'Director'), html, '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>', 'modal-lg');
  } catch (e) {
    showToast('Error al cargar historial: ' + e.message, 'error');
  }
}

// ===================== DIRECTORES =====================
async function loadDirectores() {
  try {
    var d = await api('/api/directores');
    allDirectores = d.directores || d || [];
    var areaFilter = document.getElementById('dir-area-filter');
    var buscar = (document.getElementById('dir-buscar').value || '').toLowerCase();
    var areas = {};
    for (var i = 0; i < allDirectores.length; i++) {
      var ar = (allDirectores[i].areas || 'Sin área').split(', ');
      for (var j = 0; j < ar.length; j++) { areas[ar[j]] = true; }
    }
    var areaKeys = Object.keys(areas).filter(function(a){return a;}).sort();
    var prevSelected = areaFilter.value;
    areaFilter.innerHTML = '<option value="">Todas las áreas</option>';
    for (var k = 0; k < areaKeys.length; k++) {
      areaFilter.innerHTML += '<option value="' + areaKeys[k] + '">' + areaKeys[k] + '</option>';
    }
    if (prevSelected) areaFilter.value = prevSelected;
    var filtroArea = areaFilter.value;
    var filtered = [];
    for (var i = 0; i < allDirectores.length; i++) {
      var dir = allDirectores[i];
      if (filtroArea) {
        var dirAreas = (dir.areas || 'Sin área').split(', ');
        if (dirAreas.indexOf(filtroArea) === -1) continue;
      }
      if (buscar) {
        var haystack = (dir.nombre_completo || dir.nombre || '').toLowerCase() + ' ' + (dir.ie_nombre || '').toLowerCase();
        if (haystack.indexOf(buscar) === -1) continue;
      }
      filtered.push(dir);
    }
    var html = '';
    if (filtered.length > 0) {
      var groups = {};
      for (var i = 0; i < filtered.length; i++) {
        var dir = filtered[i];
        var ga = dir.areas || 'Sin área';
        if (!groups[ga]) groups[ga] = [];
        groups[ga].push(dir);
      }
      var gKeys = Object.keys(groups).sort();
      for (var g = 0; g < gKeys.length; g++) {
        var gName = gKeys[g];
        var list = groups[gName];
        html += '<tr class="area-group"><td colspan="7"><strong>' + gName + '</strong> <span class="badge bg-secondary">' + list.length + '</span></td></tr>';
        for (var j = 0; j < list.length; j++) {
          var dr = list[j];
          var areaBadge = '';
          if (dr.areas) {
            var aa = dr.areas.split(', ');
            for (var ai = 0; ai < aa.length; ai++) {
              areaBadge += '<span class="badge bg-secondary me-1" style="font-size:.7rem">' + aa[ai] + '</span>';
            }
          }
          html += '<tr><td>' + (dr.nombre_completo || dr.nombre || '-') + '</td><td>' + (dr.dni || '-') + '</td><td>' + areaBadge + '</td><td>' + (dr.ie_nombre || '-') + '</td><td>' + (dr.email || '-') + '</td><td>' + (dr.telefono || '-') + '</td><td><button class="btn btn-xs btn-outline" onclick="editarDirector(' + dr.id + ')" title="Editar Director"><i class="fas fa-edit"></i></button> <button class="btn btn-xs btn-outline" style="margin-left: 4px;" onclick="verHistorialDirector(' + dr.id + ')" title="Ver Historial"><i class="fas fa-history"></i></button></td></tr>';
        }
      }
    } else {
      html = '<tr class="empty"><td colspan="7">No hay directores</td></tr>';
    }
    document.getElementById('directores-table').innerHTML = html;
  } catch (e) { showToast('Error al cargar directores', 'error'); }
}

// ===================== IEs =====================
async function loadIEs() {
  try {
    var n = document.getElementById('ie-nivel-filter').value;
    var b = document.getElementById('ie-search-text').value;
    var u = '/api/ies?';
    if (n) u += 'nivel=' + encodeURIComponent(n) + '&';
    if (b) u += 'buscar=' + encodeURIComponent(b) + '&';
    var d = await api(u);
    var ies = d.ies || d || [];
    var html = '';
    
    const adminHeaders = document.querySelectorAll('.admin-only');
    if (currentUser && currentUser.rol === 'admin') {
      adminHeaders.forEach(el => el.style.display = '');
    } else {
      adminHeaders.forEach(el => el.style.display = 'none');
    }
    
    if (ies.length > 0) {
      for (var i = 0; i < ies.length; i++) {
        var ie = ies[i];
        let actionCell = '';
        if (currentUser && currentUser.rol === 'admin') {
          actionCell = `<td style="text-align:center;">
            <button class="btn btn-xs btn-outline me-1" onclick="abrirModalIE(${ie.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-xs btn-outline text-danger" onclick="eliminarIE(${ie.id}, '${ie.nombre.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
          </td>`;
        }
        
        let hasLevels = false;
        if (ie.tiene_inicial) {
          html += '<tr><td style="font-weight:bold; color:var(--granate);">' + (ie.cm_inicial || '-') + '</td><td style="font-size:0.85em; color:#666;">' + ie.codigo + '</td><td>' + ie.nombre + '</td><td><span class="badge bg-info">Inicial</span></td>' + actionCell + '</tr>';
          hasLevels = true;
        }
        if (ie.tiene_primaria) {
          html += '<tr><td style="font-weight:bold; color:var(--granate);">' + (ie.cm_primaria || '-') + '</td><td style="font-size:0.85em; color:#666;">' + ie.codigo + '</td><td>' + ie.nombre + '</td><td><span class="badge bg-primary">Primaria</span></td>' + actionCell + '</tr>';
          hasLevels = true;
        }
        if (ie.tiene_secundaria) {
          html += '<tr><td style="font-weight:bold; color:var(--granate);">' + (ie.cm_secundaria || '-') + '</td><td style="font-size:0.85em; color:#666;">' + ie.codigo + '</td><td>' + ie.nombre + '</td><td><span class="badge bg-success">Secundaria</span></td>' + actionCell + '</tr>';
          hasLevels = true;
        }
        if (ie.tiene_otros) {
          html += '<tr><td style="font-weight:bold; color:var(--granate);">-</td><td style="font-size:0.85em; color:#666;">' + ie.codigo + '</td><td>' + ie.nombre + '</td><td><span class="badge bg-secondary">' + (ie.tipo_otros || 'Otros') + '</span></td>' + actionCell + '</tr>';
          hasLevels = true;
        }
        if (!hasLevels) {
           html += '<tr><td style="font-weight:bold; color:var(--granate);">-</td><td style="font-size:0.85em; color:#666;">' + ie.codigo + '</td><td>' + ie.nombre + '</td><td><span class="text-muted">Sin niveles</span></td>' + actionCell + '</tr>';
        }
      }
    } else {
      const colSpan = (currentUser && currentUser.rol === 'admin') ? 5 : 4;
      html = '<tr class="empty"><td colspan="' + colSpan + '">No hay IEs</td></tr>';
    }
    document.getElementById('ies-table').innerHTML = html;
  } catch (e) { showToast('Error al cargar IEs', 'error'); }
}

// ===================== NOTIFICACIONES =====================
async function loadNotificaciones() {
  try {
    var d = await api('/api/notificaciones');
    var rows = d.notificaciones || d || [];
    var html = '';
    if (rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var n = rows[i];
        html += '<tr><td>' + (n.remitente_nombre || (n.tipo === 'respuesta' ? 'Director' : 'Supervisor') || '-') + '</td><td>' + (n.titulo || '-') + '</td><td>' + (n.mensaje || '-').substring(0, 80) + ((n.mensaje || '').length > 80 ? '...' : '') + '</td><td>' + (n.created_at ? new Date(n.created_at).toLocaleString('es-PE') : '-') + '</td><td><span class="badge ' + (n.leida ? 'bg-secondary' : 'bg-warning') + '">' + (n.leida ? 'Sí' : 'No') + '</span></td></tr>';
      }
    } else {
      html = '<tr class="empty"><td colspan="5">No hay notificaciones</td></tr>';
    }
    document.getElementById('notificaciones-table').innerHTML = html;
  } catch (e) { showToast('Error al cargar', 'error'); }
}
async function loadDirectoresForNotif() {
  try {
    var d = await api('/api/directores');
    var dirs = d.directores || d || [];
    var sel = document.getElementById('notif-director');
    sel.innerHTML = '<option value="">Seleccionar...</option>';
    for (var i = 0; i < dirs.length; i++) {
      sel.innerHTML += '<option value="' + dirs[i].id + '">' + dirs[i].nombre + ' - ' + (dirs[i].ie_nombre || dirs[i].ie_codigo || '') + '</option>';
    }
  } catch (e) {}
}
async function sendNotificacion() {
  var di = document.getElementById('notif-director').value;
  var ti = document.getElementById('notif-titulo').value.trim();
  var me = document.getElementById('notif-mensaje').value.trim();
  if (!di || !ti || !me) { showToast('Complete todos los campos', 'error'); return; }
  try {
    await api('/api/notificaciones', { method: 'POST', body: { usuario_id: di, titulo: ti, mensaje: me, tipo: 'manual' } });
    showToast('Notificación enviada', 'success');
    document.getElementById('notif-director').value = '';
    document.getElementById('notif-titulo').value = '';
    document.getElementById('notif-mensaje').value = '';
    loadNotificaciones();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function loadNotifBadge() {
  try {
    var d = await api('/api/notificaciones/no-leidas');
    var c = d.count || d.no_leidas || 0;
    var b = document.getElementById('notif-badge');
    if (c > 0) { b.textContent = c; b.style.display = 'flex'; }
    else { b.style.display = 'none'; }
  } catch (e) {}
}
function toggleNotifDropdown() {
  document.getElementById('notif-dropdown').classList.toggle('show');
}
async function marcarLeidas() {
  try {
    await api('/api/notificaciones/marcar-leidas', { method: 'PUT' });
    loadNotifBadge();
    loadNotificaciones();
    showToast('Marcadas como leídas', 'success');
  } catch (e) {}
}
document.addEventListener('click', function (e) {
  var dd = document.getElementById('notif-dropdown');
  var btn = document.querySelector('.notif-btn');
  if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
    dd.classList.remove('show');
  }
});

// ===================== PERFIL =====================
async function loadPerfil() {
  try {
    var d = await api('/api/perfil');
    var p = d.perfil || d;
    document.getElementById('perfil-nombre').value = p.nombre_completo || p.nombre || '';
    document.getElementById('perfil-dni').value = p.dni || '';
    document.getElementById('perfil-ie').value = p.ie_nombre || p.institucion || '';
    document.getElementById('perfil-rol').value = p.rol === 'admin' ? 'Administrador(a)' : (p.rol === 'director' ? 'Director(a)' : 'Supervisor(a)');
    document.getElementById('perfil-dependencia').value = p.dependencia || '';
    document.getElementById('perfil-puesto').value = p.puesto || '';
    document.getElementById('perfil-email').value = p.email || '';
    document.getElementById('perfil-telefono').value = p.telefono || '';
    document.getElementById('perfil-password').value = '';

    if (p.rol === 'supervisor' || p.rol === 'admin') {
      document.getElementById('perfil-ie-container').style.display = 'none';
      document.getElementById('perfil-dependencia-container').style.display = 'block';
      document.getElementById('perfil-puesto-container').style.display = 'block';
    } else {
      document.getElementById('perfil-ie-container').style.display = 'block';
      document.getElementById('perfil-dependencia-container').style.display = 'none';
      document.getElementById('perfil-puesto-container').style.display = 'none';
    }
    
    const volverBtn = document.getElementById('btn-perfil-volver');
    if (p.rol === 'director') {
      volverBtn.style.display = 'inline-block';
    } else {
      volverBtn.style.display = 'none';
    }
  } catch (e) { showToast('Error al cargar perfil', 'error'); }
}
async function savePerfil() {
  var nombre = document.getElementById('perfil-nombre').value.trim();
  const password = document.getElementById('perfil-password').value.trim();
  var body = {
    nombre: nombre,
    email: document.getElementById('perfil-email').value.trim(),
    telefono: document.getElementById('perfil-telefono').value.trim(),
    dni: document.getElementById('perfil-dni').value.trim(),
    dependencia: document.getElementById('perfil-dependencia').value.trim(),
    puesto: document.getElementById('perfil-puesto').value.trim()
  };
  if (password) {
    body.password = password;
  }
  try {
    await api('/api/perfil', { method: 'PUT', body: body });
    if (currentUser) currentUser.nombre = nombre;
    updateUserHeader();
    showToast('Perfil actualizado con éxito', 'success');
    document.getElementById('perfil-password').value = '';
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
function volverDePerfil() {
  if (currentUser && currentUser.rol === 'director') {
    initDirectorApp();
  }
}

// ===================== AVANCE MENSUAL =====================
var MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
var avanceSelectedMonth = new Date().getMonth();
// chartAvanceMensualObj ya declarado globalmente arriba
var expandedAvanceActivityIds = new Set();

function renderAvanceMonthSlider() {
  var slider = document.getElementById('avance-month-slider');
  if (!slider) return;
  var html = '';
  for (var i = 0; i < MONTHS.length; i++) {
    var activeClass = (avanceSelectedMonth === i) ? 'bg-primary text-white shadow' : '';
    var activeStyle = (avanceSelectedMonth === i) ? 'background:var(--granate); color:#fff;' : 'background:transparent; color:#cbd5e1;';
    html += '<button onclick="setAvanceMonth(' + i + ')" class="btn btn-xs ' + activeClass + '" style="flex-shrink:0; padding:8px 16px; border-radius:10px; font-weight:700; font-size:0.7rem; border:none; transition:all 0.2s; ' + activeStyle + '">' + 
            MONTHS[i].toUpperCase() + 
            '</button>';
  }
  slider.innerHTML = html;
}

function setAvanceMonth(monthIndex) {
  if (typeof expandedAvanceActivityIds !== 'undefined') expandedAvanceActivityIds.clear();
  avanceSelectedMonth = monthIndex;
  renderAvanceMonthSlider();
  loadAvanceMensual();
}

// Autocomplete search for Avance
async function filterAvanceIESearch(q) {
  var container = document.getElementById('avance-ie-autocomplete');
  var clearBtn = document.getElementById('btn-clear-avance-ie');
  
  if (!q || q.trim() === '') {
    container.style.display = 'none';
    clearBtn.style.display = 'none';
    return;
  }
  
  clearBtn.style.display = 'inline-block';
  
  if (allIEs.length === 0) {
    try {
      const d = await api('/api/ies');
      allIEs = d.ies || d || [];
    } catch(err) {}
  }
  
  var query = normalizar(q);
  var matches = allIEs.filter(function(ie) {
    return normalizar(ie.codigo).indexOf(query) !== -1 || normalizar(ie.nombre).indexOf(query) !== -1;
  });
  
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:#999;font-size:0.8rem;text-align:center">No se encontraron resultados</div>';
  } else {
    var html = '';
    var limit = Math.min(matches.length, 10);
    for (var i = 0; i < limit; i++) {
      var ie = matches[i];
      var escapedNombre = ie.nombre.replace(/'/g, "\\'");
      html += '<div class="autocomplete-item" onclick="selectAvanceIE(' + ie.id + ', \'' + ie.codigo + '\', \'' + escapedNombre + '\')" style="padding:10px 14px;border-bottom:1px solid #f0f1f3;cursor:pointer;font-size:0.8rem;transition:background 0.15s" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">';
      html += '<span style="font-weight:700;color:var(--granate);margin-right:8px">' + ie.codigo + '</span>';
      html += '<span style="color:#333">' + ie.nombre + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }
  container.style.display = 'block';
}

function selectAvanceIE(id, codigo, nombre) {
  selectedAvanceIEId = id;
  document.getElementById('avance-ie-search').value = codigo + ' - ' + nombre;
  document.getElementById('avance-ie-autocomplete').style.display = 'none';
  document.getElementById('btn-clear-avance-ie').style.display = 'inline-block';
  if (typeof expandedAvanceActivityIds !== 'undefined') expandedAvanceActivityIds.clear();
  loadAvanceMensual();
}

function clearAvanceIESelection() {
  selectedAvanceIEId = null;
  document.getElementById('avance-ie-search').value = '';
  document.getElementById('avance-ie-autocomplete').style.display = 'none';
  document.getElementById('btn-clear-avance-ie').style.display = 'none';
  if (typeof expandedAvanceActivityIds !== 'undefined') expandedAvanceActivityIds.clear();
  loadAvanceMensual();
}

// Click outside to close autocomplete
document.addEventListener('click', function(e) {
  var container = document.getElementById('avance-ie-autocomplete');
  var input = document.getElementById('avance-ie-search');
  if (container && !container.contains(e.target) && e.target !== input) {
    container.style.display = 'none';
  }
});

async function loadAvanceMensual() {
  try {
    renderAvanceMonthSlider();

    var inputAvance = document.getElementById('avance-ie-search');
    if (inputAvance && !inputAvance.dataset.hasListener) {
      inputAvance.dataset.hasListener = 'true';
      inputAvance.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          var q = this.value;
          if (!q || q.trim() === '') return;
          var query = normalizar(q);
          var match = allIEs.find(function(ie) {
            return normalizar(ie.codigo) === query || normalizar(ie.nombre).indexOf(query) !== -1;
          });
          if (match) {
            selectAvanceIE(match.id, match.codigo, match.nombre);
          }
        }
      });
    }

    var d = await api('/api/asignaciones');
    var rows = d.asignaciones || d || [];

    var selectedIEId = selectedAvanceIEId;
    var filteredRows = rows.filter(function(a) {
      if (!a.fecha_limite) return false;
      var limitDate = a.fecha_limite;
      var dateStr = '';
      if (limitDate instanceof Date) {
        var y = limitDate.getFullYear();
        var m = limitDate.getMonth() + 1;
        var d = limitDate.getDate();
        dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
      } else if (typeof limitDate === 'string') {
        dateStr = limitDate.substring(0, 10);
      } else {
        dateStr = String(limitDate || '').substring(0, 10);
      }
      var parts = dateStr.split('-');
      var monthIndex = parseInt(parts[1], 10) - 1;
      
      if (selectedIEId && String(a.ie_id) !== String(selectedIEId)) {
        return false;
      }
      return monthIndex === avanceSelectedMonth;
    });

    // Deduplicate assignments by ie_id + activity title + deadline, prioritizing completed status
    var uniqueMap = {};
    for (var i = 0; i < filteredRows.length; i++) {
      var a = filteredRows[i];
      var actTitle = a.actividad_titulo || a.titulo || '';
      var actFecha = a.fecha_limite || '';
      var dateStr = '';
      if (actFecha instanceof Date) {
        var y = actFecha.getFullYear();
        var m = actFecha.getMonth() + 1;
        var d = actFecha.getDate();
        dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
      } else if (typeof actFecha === 'string') {
        dateStr = actFecha.substring(0, 10);
      } else {
        dateStr = String(actFecha || '').substring(0, 10);
      }
      var key = a.ie_id + '_' + actTitle.trim().toLowerCase() + '_' + dateStr;
      
      if (!uniqueMap[key] || a.estado === 'completada') {
        uniqueMap[key] = a;
      }
    }
    filteredRows = Object.values(uniqueMap);

    var cumplidas = 0;
    var pendientes = 0;
    var vencidas = 0;

    for (var i = 0; i < filteredRows.length; i++) {
      var a = filteredRows[i];
      if (a.estado === 'completada') cumplidas++;
      else if (a.estado === 'no_cumplida') vencidas++;
      else pendientes++;
    }

    var total = filteredRows.length;
    var pct = total > 0 ? Math.round((cumplidas / total) * 100) : 0;

    document.getElementById('avance-kpi-cumplidas').textContent = cumplidas;
    document.getElementById('avance-kpi-pendientes').textContent = pendientes;
    document.getElementById('avance-kpi-vencidas').textContent = vencidas;
    document.getElementById('avance-chart-pct').textContent = pct + '%';

    var ctx = document.getElementById('chart-avance-mensual').getContext('2d');
    if (chartAvanceMensualObj) {
      chartAvanceMensualObj.destroy();
    }
    
    var dataVals = [];
    var dataColors = [];
    var dataLabels = [];

    if (cumplidas > 0) { dataVals.push(cumplidas); dataColors.push('#10b981'); dataLabels.push('Cumplido'); }
    if (pendientes > 0) { dataVals.push(pendientes); dataColors.push('#f59e0b'); dataLabels.push('Pendiente'); }
    if (vencidas > 0) { dataVals.push(vencidas); dataColors.push('#ef4444'); dataLabels.push('Vencido'); }

    if (dataVals.length === 0) {
      dataVals = [1];
      dataColors = ['#f3f4f6'];
      dataLabels = ['Sin actividades'];
    }

    chartAvanceMensualObj = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: dataLabels,
        datasets: [{
          data: dataVals,
          backgroundColor: dataColors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: dataLabels[0] !== 'Sin actividades' }
        },
        cutout: '75%'
      }
    });

    // Historical Chart rendering (only when an IE is selected)
    var historicoCard = document.getElementById('avance-historico-card');
    if (selectedIEId) {
      historicoCard.style.display = 'block';
      
      // Filter all rows for this IE (regardless of month)
      var ieRows = rows.filter(function(a) {
        return String(a.ie_id) === String(selectedIEId) && a.fecha_limite;
      });
      
      // Group by month
      var monthlyCumplidas = new Array(12).fill(0);
      var monthlyPendientes = new Array(12).fill(0);
      var monthlyVencidas = new Array(12).fill(0);
      
      // Deduplicate ieRows by activity title + deadline
      var uniqueIEMap = {};
      for (var i = 0; i < ieRows.length; i++) {
        var a = ieRows[i];
        var actTitle = a.actividad_titulo || a.titulo || '';
        var actFecha = a.fecha_limite || '';
        var dateStr = '';
        if (actFecha instanceof Date) {
          var y = actFecha.getFullYear();
          var m = actFecha.getMonth() + 1;
          var d = actFecha.getDate();
          dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
        } else if (typeof actFecha === 'string') {
          dateStr = actFecha.substring(0, 10);
        } else {
          dateStr = String(actFecha || '').substring(0, 10);
        }
        var key = actTitle.trim().toLowerCase() + '_' + dateStr;
        if (!uniqueIEMap[key] || a.estado === 'completada') {
          uniqueIEMap[key] = a;
        }
      }
      var uniqueIERows = Object.values(uniqueIEMap);
      
      for (var i = 0; i < uniqueIERows.length; i++) {
        var a = uniqueIERows[i];
        var limitDate = a.fecha_limite;
        var dateStr = '';
        if (limitDate instanceof Date) {
          var y = limitDate.getFullYear();
          var m = limitDate.getMonth() + 1;
          var d = limitDate.getDate();
          dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
        } else if (typeof limitDate === 'string') {
          dateStr = limitDate.substring(0, 10);
        } else {
          dateStr = String(limitDate || '').substring(0, 10);
        }
        var parts = dateStr.split('-');
        var monthIndex = parseInt(parts[1], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          if (a.estado === 'completada') {
            monthlyCumplidas[monthIndex]++;
          } else if (a.estado === 'no_cumplida') {
            monthlyVencidas[monthIndex]++;
          } else {
            monthlyPendientes[monthIndex]++;
          }
        }
      }
      
      
      var totalIEAllTime = uniqueIERows.length;
      var cumplidasIEAllTime = 0;
      var pendientesIEAllTime = 0;
      var vencidasIEAllTime = 0;
      for (var i = 0; i < uniqueIERows.length; i++) {
        if (uniqueIERows[i].estado === 'completada') {
          cumplidasIEAllTime++;
        } else if (uniqueIERows[i].estado === 'no_cumplida') {
          vencidasIEAllTime++;
        } else {
          pendientesIEAllTime++;
        }
      }

      var statsContainer = document.getElementById('avance-historico-stats');
      if (statsContainer) {
        var pctIE = totalIEAllTime > 0 ? Math.round((cumplidasIEAllTime / totalIEAllTime) * 100) : 0;
        statsContainer.innerHTML = `
          <h4 style="font-size: 0.72rem; font-weight: 800; color: #475569; margin: 0 0 12px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;">Resumen Histórico</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 8px 12px; border-radius: var(--radius-sm);">
              <div style="font-size: 0.65rem; font-weight: 700; color: #047857; text-transform: uppercase;">Cumplidas</div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #065f46;">${cumplidasIEAllTime} <span style="font-size: 0.72rem; font-weight: 600; color: #047857;">(${pctIE}%)</span></div>
            </div>
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 8px 12px; border-radius: var(--radius-sm);">
              <div style="font-size: 0.65rem; font-weight: 700; color: #b45309; text-transform: uppercase;">Pendientes</div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #92400e;">${pendientesIEAllTime}</div>
            </div>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 8px 12px; border-radius: var(--radius-sm);">
              <div style="font-size: 0.65rem; font-weight: 700; color: #b91c1c; text-transform: uppercase;">Vencidas</div>
              <div style="font-size: 1.25rem; font-weight: 800; color: #991b1b;">${vencidasIEAllTime}</div>
            </div>
            <div style="background: #f1f5f9; padding: 8px 12px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <span style="font-size: 0.7rem; font-weight: 700; color: #475569;">TOTAL TAREAS:</span>
              <span style="font-size: 0.95rem; font-weight: 800; color: #1f2937;">${totalIEAllTime}</span>
            </div>
          </div>
        `;
      }
      
      var ctxH = document.getElementById('chart-avance-historico').getContext('2d');
      if (window.chartAvanceHistoricoObj) {
        window.chartAvanceHistoricoObj.destroy();
      }
      window.chartAvanceHistoricoObj = new Chart(ctxH, {
        type: 'bar',
        data: {
          labels: MONTHS,
          datasets: [
            {
              label: 'Cumplidas',
              data: monthlyCumplidas,
              backgroundColor: '#10b981',
              borderRadius: 4
            },
            {
              label: 'Pendientes',
              data: monthlyPendientes,
              backgroundColor: '#f59e0b',
              borderRadius: 4
            },
            {
              label: 'Vencidas',
              data: monthlyVencidas,
              backgroundColor: '#ef4444',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, ticks: { font: { family: 'Inter', weight: 'bold' } } },
            y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Inter' } } }
          },
          plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'Inter' } } }
          }
        }
      });
    } else {
      historicoCard.style.display = 'none';
    }

    var activitiesMap = {};
    for (var i = 0; i < filteredRows.length; i++) {
      var a = filteredRows[i];
      var actTitle = a.actividad_titulo || a.titulo || '';
      var actFecha = a.fecha_limite || '';
      var actKey = actTitle.trim().toLowerCase() + '_' + actFecha;
      
      if (!activitiesMap[actKey]) {
        activitiesMap[actKey] = {
          id: a.actividad_id || a.id,
          titulo: actTitle,
          fecha_limite: actFecha,
          descripcion: a.actividad_descripcion || a.descripcion || '',
          area: a.area,
          subarea: a.subarea,
          asignador: a.asignador_nombre,
          completadas: 0,
          pendientes: 0,
          no_cumplidas: 0,
          total: 0,
          asignaciones: []
        };
      }
      activitiesMap[actKey].total++;
      activitiesMap[actKey].asignaciones.push(a);
      if (a.estado === 'completada') activitiesMap[actKey].completadas++;
      else if (a.estado === 'no_cumplida') activitiesMap[actKey].no_cumplidas++;
      else activitiesMap[actKey].pendientes++;
    }

    var activitiesList = Object.values(activitiesMap);
    for (var i = 0; i < activitiesList.length; i++) {
      activitiesList[i].asignaciones.sort(function(x, y) {
        var xDone = (x.estado === 'completada') ? 1 : 0;
        var yDone = (y.estado === 'completada') ? 1 : 0;
        if (xDone !== yDone) {
          return xDone - yDone;
        }
        return (x.ie_nombre || '').localeCompare(y.ie_nombre || '');
      });
    }
    activitiesList.sort(function(a, b) {
      return new Date(a.fecha_limite).getTime() - new Date(b.fecha_limite).getTime();
    });

    document.getElementById('avance-count-badge').textContent = activitiesList.length + ' Actividades';

    var listHtml = '';
    if (activitiesList.length > 0) {
      for (var i = 0; i < activitiesList.length; i++) {
        var act = activitiesList[i];
        var progPercent = act.total > 0 ? Math.round((act.completadas / act.total) * 100) : 0;
        
        var progColor = 'var(--red)';
        if (progPercent > 80) progColor = 'var(--green)';
        else if (progPercent > 40) progColor = 'var(--amber)';

        var limitDate = act.fecha_limite;
        var dateStr = '';
        if (limitDate instanceof Date) {
          var y = limitDate.getFullYear();
          var m = limitDate.getMonth() + 1;
          var d = limitDate.getDate();
          dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
        } else if (typeof limitDate === 'string') {
          dateStr = limitDate.substring(0, 10);
        } else {
          dateStr = String(limitDate || '').substring(0, 10);
        }

        var daysLeft = Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        var daysText = isNaN(daysLeft) ? '-' : (daysLeft < 0 ? 'Vencido hace ' + Math.abs(daysLeft) + ' días' : 'Faltan ' + daysLeft + ' días');
        var daysBadgeClass = daysLeft < 0 ? 'badge-no_cumplida' : 'badge-pendiente';
        var isExpanded = expandedAvanceActivityIds.has(act.id);
        var listDisplay = isExpanded ? 'block' : 'none';
        var listBtnText = isExpanded ? 'CERRAR DETALLE' : 'LISTADO DE CUMPLIMIENTO';
        var listBtnIcon = isExpanded ? 'fa-chevron-up' : 'fa-chevron-down';

        var formattedDate = '-';
        if (dateStr) {
          var parts = dateStr.split('-');
          formattedDate = parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        listHtml += '<div style="background:#fff; border:1px solid #e5e7eb; border-radius:24px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
          '<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:16px; margin-bottom:12px;">' +
            '<div style="flex:1; min-w:250px;">' +
              '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; align-items:center;">' +
                '<span class="badge ' + (act.completadas === act.total ? 'badge-completada' : daysBadgeClass) + '" style="font-size:0.65rem;">' +
                  (act.completadas === act.total ? 'LOGRADA' : daysText.toUpperCase()) +
                '</span>' +
                '<span class="badge badge-info" style="font-size:0.65rem;">LÍMITE: ' + formattedDate + '</span>' +
              '</div>' +
              '<h4 style="font-size:1.05rem; font-weight:800; color:#1f2937; margin:0 0 6px 0; text-transform:uppercase;">' + act.titulo + '</h4>' +
              '<p style="font-size:0.75rem; color:#6b7280; margin:0 0 4px 0;">' + (act.descripcion || 'Sin descripción') + '</p>' +
              '<p style="font-size:0.68rem; font-weight:700; color:var(--text3); margin:0;">ÁREA RESPONSABLE: ' + (act.area || '-') + ' (' + (act.subarea || '-') + ')</p>' +
            '</div>' +
            '<div style="min-w:180px; text-align:right; display:flex; flex-direction:column; align-items:end;">' +
              '<div style="font-size:1.1rem; font-weight:800; color:#1f2937;">' + progPercent + '%</div>' +
              '<div style="font-size:0.6rem; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Cumplimiento</div>' +
              '<div style="width:140px; height:6px; background:#f3f4f6; border-radius:10px; overflow:hidden; margin-bottom:6px;">' +
                '<div style="height:100%; background:' + progColor + '; width:' + progPercent + '%; border-radius:10px;"></div>' +
              '</div>' +
              '<div style="font-size:0.65rem; font-weight:700; color:#6b7280;">' + act.completadas + ' de ' + act.total + ' IEs cumplieron</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:16px; border-top:1px solid #f3f4f6; padding-top:12px;">' +
            '<button class="btn btn-xs" onclick="toggleAvanceIEList(' + act.id + ')" id="btn-toggle-avance-' + act.id + '" style="font-weight:700; font-size:0.68rem; display:inline-flex; align-items:center; gap:6px; border:1px solid #e5e7eb; background:#f9fafb; border-radius:8px; padding:6px 12px; cursor:pointer;">' +
              '<i class="fas fa-list-check"></i> ' + listBtnText + ' <i class="fas ' + listBtnIcon + '" style="font-size:0.6rem;"></i>' +
            '</button>' +
            '<div id="avance-ie-list-' + act.id + '" style="display:' + listDisplay + '; margin-top:16px; background:#f8fafc; border-radius:16px; padding:16px; border:1px dashed #e2e8f0;">' +
              renderAvanceIEBadges(act) +
            '</div>' +
          '</div>' +
        '</div>';
      }
    } else {
      listHtml = '<div style="text-align:center; padding:60px 20px; border:2px dashed #e5e7eb; border-radius:24px; color:#9ca3af;">' +
        '<i class="fas fa-calendar-minus" style="font-size:2rem; margin-bottom:12px; display:block;"></i>' +
        '<p style="font-weight:700; font-size:0.8rem; text-transform:uppercase; margin:0;">No se registran actividades para este mes</p>' +
      '</div>';
    }
    document.getElementById('avance-activities-list').innerHTML = listHtml;
  } catch (e) {
    showToast('Error al cargar avance: ' + e.message, 'error');
  }
}

function toggleAvanceIEList(actId) {
  var el = document.getElementById('avance-ie-list-' + actId);
  var btn = document.getElementById('btn-toggle-avance-' + actId);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    btn.innerHTML = '<i class="fas fa-list-check"></i> CERRAR DETALLE <i class="fas fa-chevron-up" style="font-size:0.6rem;"></i>';
    expandedAvanceActivityIds.add(actId);
  } else {
    el.style.display = 'none';
    btn.innerHTML = '<i class="fas fa-list-check"></i> LISTADO DE CUMPLIMIENTO <i class="fas fa-chevron-down" style="font-size:0.6rem;"></i>';
    expandedAvanceActivityIds.delete(actId);
  }
}

function renderAvanceIEBadges(act) {
  var html = '<div style="display:flex; flex-direction:column; gap:8px; width:100%;">';
  for (var i = 0; i < act.asignaciones.length; i++) {
    var asig = act.asignaciones[i];
    var isDone = asig.estado === 'completada';
    var badgeClass = 'badge-' + asig.estado;
    var btnClass = isDone ? 'btn-secondary' : 'btn-success';
    var btnText = isDone ? 'Revertir a Pendiente' : 'Marcar Completado';
    var nextState = isDone ? 'pendiente' : 'completada';
    
    html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; background:#fff; border:1px solid #f1f5f9; border-radius:16px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">' +
      '<div style="text-align:left; min-width:0; flex:1; padding-right:16px;">' +
        '<div style="font-size:0.8rem; font-weight:800; color:#1f2937; text-transform:uppercase;">' + (asig.ie_codigo || '-') + ' — ' + (asig.ie_nombre || '-') + '</div>' +
        '<div style="font-size:0.7rem; color:#9ca3af; margin-top:2px; text-transform:uppercase;">DIRECTOR(A): ' + (asig.director_nombre || '-') + '</div>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:16px; flex-shrink:0;">' +
        '<span class="badge ' + badgeClass + '" style="font-size:0.65rem;">' + asig.estado.replace('_', ' ').toUpperCase() + '</span>' +
        '<button onclick="toggleAsignacionAvanceState(' + asig.id + ', \'' + nextState + '\')" class="btn btn-xs ' + btnClass + '" style="font-weight:700; font-size:0.68rem; padding:6px 12px; border-radius:8px; cursor:pointer;">' +
          btnText +
        '</button>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

async function toggleAsignacionAvanceState(id, nextState) {
  try {
    var notes = nextState === 'completada' ? 'Completado desde Avance Mensual' : 'Revertido a pendiente desde Avance Mensual';
    await api('/api/asignaciones/' + id + '/estado', { method: 'PUT', body: { estado: nextState, notas_supervisor: notes } });
    showToast('Estado de IE actualizado', 'success');
    loadAvanceMensual();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ===================== ADMIN HANDLERS =====================
async function loadAdminUsuarios() {
  try {
    const list = await api('/api/admin/users');
    const q = normalizar(document.getElementById('admin-user-buscar').value);
    const filtered = list.filter(u => {
      return normalizar(u.nombre_completo).indexOf(q) !== -1 ||
             normalizar(u.usuario).indexOf(q) !== -1 ||
             normalizar(u.dni).indexOf(q) !== -1 ||
             normalizar(u.ie_codigo).indexOf(q) !== -1;
    });
    
    let html = '';
    if (filtered.length > 0) {
      for (const u of filtered) {
        const dniOrIe = u.rol === 'director' ? `IE: ${u.ie_codigo || '-'}` : `DNI: ${u.dni || '-'}`;
        const emailOrTel = `${u.email || '-'}<br><small class="text-muted">${u.telefono || '-'}</small>`;
        const impersonateBtn = u.id !== currentUser.id ? `<button class="btn btn-xs btn-outline" onclick="impersonarUsuario(${u.id})" title="Entrar como"><i class="fas fa-user-secret"></i> Entrar como</button>` : '';
        const passwordBtn = `<button class="btn btn-xs btn-outline" onclick="abrirModalCambiarPassword(${u.id}, '${u.nombre_completo.replace(/'/g, "\\'")}')" title="Cambiar Contraseña"><i class="fas fa-key"></i> Pass</button>`;
        const editBtn = `<button class="btn btn-xs btn-outline" onclick="abrirModalEditarUsuario(${u.id})" title="Editar Usuario"><i class="fas fa-edit"></i></button>`;
        const activeToggle = u.activo ? `<span class="badge bg-success" style="cursor:pointer" onclick="toggleActivoUsuario(${u.id}, ${u.activo})" title="Click para desactivar">Activo</span>` : `<span class="badge bg-secondary" style="cursor:pointer" onclick="toggleActivoUsuario(${u.id}, ${u.activo})" title="Click para activar">Inactivo</span>`;
        
        html += `<tr>
          <td><strong>${u.nombre_completo}</strong> ${activeToggle}</td>
          <td><span class="badge ${u.rol === 'admin' ? 'bg-danger' : (u.rol === 'supervisor' ? 'bg-primary' : 'bg-success')}">${u.rol.toUpperCase()}</span></td>
          <td><code>${u.usuario || '-'}</code></td>
          <td>${dniOrIe}</td>
          <td>${emailOrTel}</td>
          <td style="text-align:center;">
            <div style="display:flex; gap:6px; justify-content:center;">
              ${editBtn}
              ${passwordBtn}
              ${impersonateBtn}
            </div>
          </td>
        </tr>`;
      }
    } else {
      html = '<tr><td colspan="6" class="text-center text-muted">No se encontraron usuarios</td></tr>';
    }
    document.getElementById('admin-usuarios-table').innerHTML = html;
  } catch (err) {
    showToast('Error al cargar usuarios: ' + err.message, 'error');
  }
}

function abrirModalCambiarPassword(id, nombre) {
  showModal(
    'Cambiar Contraseña de ' + nombre,
    `<div class="mb-3">
      <label class="form-label">Nueva Contraseña</label>
      <input type="password" class="form-control" id="new-user-password" placeholder="Escriba la nueva contraseña..." required>
     </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarPasswordUsuario(${id})">Guardar Contraseña</button>`
  );
}

async function guardarPasswordUsuario(id) {
  const newPass = document.getElementById('new-user-password').value.trim();
  if (!newPass) {
    showToast('Ingrese una contraseña', 'error');
    return;
  }
  try {
    await api('/api/admin/users/' + id + '/password', {
      method: 'POST',
      body: { password: newPass }
    });
    showToast('Contraseña actualizada con éxito', 'success');
    closeModal();
    loadAdminUsuarios();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function impersonarUsuario(id) {
  try {
    const data = await api('/api/admin/impersonate', {
      method: 'POST',
      body: { userId: id }
    });
    showToast('Simulando sesión de usuario...', 'success');
    window.location.reload();
  } catch (err) {
    showToast('Error al simular usuario: ' + err.message, 'error');
  }
}

async function abrirModalNuevoUsuario() {
  showModal(
    'Nuevo Usuario',
    `<div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Nombre Completo *</label>
        <input type="text" class="form-control" id="nu-nombre" required>
      </div>
      <div class="col-md-3">
        <label class="form-label">DNI</label>
        <input type="text" class="form-control" id="nu-dni" maxlength="8">
      </div>
      <div class="col-md-3">
        <label class="form-label">Rol</label>
        <select class="form-control" id="nu-rol">
          <option value="supervisor">Supervisor</option>
          <option value="director">Director</option>
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label">Dependencia / Área</label>
        <input type="text" class="form-control" id="nu-dependencia">
      </div>
      <div class="col-md-6">
        <label class="form-label">Puesto / Cargo</label>
        <input type="text" class="form-control" id="nu-puesto">
      </div>
      <div class="col-md-6">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" id="nu-email">
      </div>
      <div class="col-md-6">
        <label class="form-label">Teléfono</label>
        <input type="text" class="form-control" id="nu-telefono">
      </div>
      <div class="col-md-6">
        <label class="form-label">Nombre de Usuario</label>
        <input type="text" class="form-control" id="nu-usuario" placeholder="Si se deja vacío se genera automáticamente">
      </div>
      <div class="col-md-6">
        <label class="form-label">Contraseña</label>
        <input type="text" class="form-control" id="nu-password" placeholder="Si se deja vacío se usa el DNI">
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarNuevoUsuario()">Crear Usuario</button>`
  );
}

async function guardarNuevoUsuario() {
  var data = {
    nombre_completo: document.getElementById('nu-nombre').value.trim(),
    dni: document.getElementById('nu-dni').value.trim() || null,
    rol: document.getElementById('nu-rol').value,
    dependencia: document.getElementById('nu-dependencia').value.trim() || null,
    puesto: document.getElementById('nu-puesto').value.trim() || null,
    email: document.getElementById('nu-email').value.trim() || null,
    telefono: document.getElementById('nu-telefono').value.trim() || null,
    usuario: document.getElementById('nu-usuario').value.trim() || null,
    password: document.getElementById('nu-password').value.trim() || null
  };
  if (!data.nombre_completo) {
    showToast('El nombre completo es obligatorio', 'error');
    return;
  }
  try {
    await api('/api/admin/users', { method: 'POST', body: data });
    showToast('Usuario creado exitosamente', 'success');
    closeModal();
    loadAdminUsuarios();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function abrirModalEditarUsuario(id) {
  var list = await api('/api/admin/users');
  var u = list.find(x => x.id === id);
  if (!u) { showToast('Usuario no encontrado', 'error'); return; }
  
  showModal(
    'Editar Usuario: ' + u.nombre_completo,
    `<div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Nombre Completo</label>
        <input type="text" class="form-control" id="eu-nombre" value="${u.nombre_completo.replace(/"/g,'&quot;')}">
      </div>
      <div class="col-md-6">
        <label class="form-label">DNI</label>
        <input type="text" class="form-control" id="eu-dni" value="${u.dni||''}" maxlength="8">
      </div>
      <div class="col-md-6">
        <label class="form-label">Dependencia / Área</label>
        <input type="text" class="form-control" id="eu-dependencia" value="${(u.dependencia||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="col-md-6">
        <label class="form-label">Puesto / Cargo</label>
        <input type="text" class="form-control" id="eu-puesto" value="${(u.puesto||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="col-md-6">
        <label class="form-label">Email</label>
        <input type="email" class="form-control" id="eu-email" value="${(u.email||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="col-md-6">
        <label class="form-label">Teléfono</label>
        <input type="text" class="form-control" id="eu-telefono" value="${(u.telefono||'').replace(/"/g,'&quot;')}">
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="guardarEditarUsuario(${id})">Guardar Cambios</button>`
  );
}

async function guardarEditarUsuario(id) {
  var data = {
    nombre_completo: document.getElementById('eu-nombre').value.trim(),
    dni: document.getElementById('eu-dni').value.trim() || null,
    dependencia: document.getElementById('eu-dependencia').value.trim() || null,
    puesto: document.getElementById('eu-puesto').value.trim() || null,
    email: document.getElementById('eu-email').value.trim() || null,
    telefono: document.getElementById('eu-telefono').value.trim() || null
  };
  if (!data.nombre_completo) {
    showToast('El nombre es obligatorio', 'error');
    return;
  }
  try {
    await api('/api/admin/users/' + id, { method: 'PUT', body: data });
    showToast('Usuario actualizado', 'success');
    closeModal();
    loadAdminUsuarios();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function toggleActivoUsuario(id, activo) {
  try {
    await api('/api/admin/users/' + id, { method: 'PUT', body: { activo: !activo } });
    showToast(activo ? 'Usuario desactivado' : 'Usuario activado', 'success');
    loadAdminUsuarios();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function abrirModalIE(ieId = null) {
  let ie = { codigo: '', nombre: '', tiene_inicial: false, tiene_primaria: false, tiene_secundaria: false, tiene_otros: false, tipo_otros: '' };
  let title = 'Nueva Institución Educativa';
  
  if (ieId) {
    title = 'Editar Institución Educativa';
    try {
      const data = await api('/api/ies/' + ieId);
      ie = data.ie || data;
    } catch (err) {
      showToast('Error al cargar IE: ' + err.message, 'error');
      return;
    }
  }
  
  const body = `
    <form id="ie-form" onsubmit="event.preventDefault()">
      <div class="mb-3">
        <label class="form-label">Código Local *</label>
        <input type="text" class="form-control" id="form-ie-codigo" value="${ie.codigo}" required ${ieId ? 'readonly' : ''}>
      </div>
      <div class="mb-3">
        <label class="form-label">Nombre de la IE *</label>
        <input type="text" class="form-control" id="form-ie-nombre" value="${ie.nombre}" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Niveles Educativos y Códigos Modulares</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <label><input type="checkbox" id="form-ie-inicial" ${ie.tiene_inicial ? 'checked' : ''} onchange="document.getElementById('form-ie-cm-inicial').style.display = this.checked ? 'block' : 'none'"> Inicial</label>
            <input type="text" class="form-control form-control-sm mt-1" id="form-ie-cm-inicial" placeholder="Cód. Modular" value="${ie.cm_inicial || ''}" style="display: ${ie.tiene_inicial ? 'block' : 'none'};">
          </div>
          <div>
            <label><input type="checkbox" id="form-ie-primaria" ${ie.tiene_primaria ? 'checked' : ''} onchange="document.getElementById('form-ie-cm-primaria').style.display = this.checked ? 'block' : 'none'"> Primaria</label>
            <input type="text" class="form-control form-control-sm mt-1" id="form-ie-cm-primaria" placeholder="Cód. Modular" value="${ie.cm_primaria || ''}" style="display: ${ie.tiene_primaria ? 'block' : 'none'};">
          </div>
          <div>
            <label><input type="checkbox" id="form-ie-secundaria" ${ie.tiene_secundaria ? 'checked' : ''} onchange="document.getElementById('form-ie-cm-secundaria').style.display = this.checked ? 'block' : 'none'"> Secundaria</label>
            <input type="text" class="form-control form-control-sm mt-1" id="form-ie-cm-secundaria" placeholder="Cód. Modular" value="${ie.cm_secundaria || ''}" style="display: ${ie.tiene_secundaria ? 'block' : 'none'};">
          </div>
          <div>
            <label><input type="checkbox" id="form-ie-otros" ${ie.tiene_otros ? 'checked' : ''} onchange="document.getElementById('form-ie-tipo-otros-group').style.display = this.checked ? 'block' : 'none'"> Otros</label>
          </div>
        </div>
      </div>
      <div class="mb-3" id="form-ie-tipo-otros-group" style="display: ${ie.tiene_otros ? 'block' : 'none'};">
        <label class="form-label">Especificar Otros Niveles</label>
        <input type="text" class="form-control" id="form-ie-tipo-otros" value="${ie.tipo_otros || ''}">
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarIE(${ieId})">Guardar</button>
  `;
  
  showModal(title, body, footer);
}

async function guardarIE(ieId = null) {
  const codigo = document.getElementById('form-ie-codigo').value.trim();
  const nombre = document.getElementById('form-ie-nombre').value.trim();
  const tiene_inicial = document.getElementById('form-ie-inicial').checked;
  const tiene_primaria = document.getElementById('form-ie-primaria').checked;
  const tiene_secundaria = document.getElementById('form-ie-secundaria').checked;
  const tiene_otros = document.getElementById('form-ie-otros').checked;
  const tipo_otros = document.getElementById('form-ie-tipo-otros').value.trim();
  
  const cm_inicial = document.getElementById('form-ie-cm-inicial').value.trim();
  const cm_primaria = document.getElementById('form-ie-cm-primaria').value.trim();
  const cm_secundaria = document.getElementById('form-ie-cm-secundaria').value.trim();
  
  if (!codigo || !nombre) {
    showToast('Código y Nombre son obligatorios', 'error');
    return;
  }
  
  const body = { 
    codigo, nombre, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros,
    cm_inicial, cm_primaria, cm_secundaria
  };
  
  try {
    const url = ieId ? '/api/ies/' + ieId : '/api/ies';
    const method = ieId ? 'PUT' : 'POST';
    await api(url, { method, body });
    showToast(ieId ? 'IE actualizada con éxito' : 'IE creada con éxito', 'success');
    closeModal();
    loadIEs();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function eliminarIE(id, nombre) {
  showModal(
    'Eliminar Institución Educativa',
    `<p>¿Está seguro de eliminar la IE <strong>${nombre}</strong>? Esta acción no se puede deshacer.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="confirmarEliminarIE(${id})">Eliminar</button>`
  );
}

async function confirmarEliminarIE(id) {
  try {
    await api('/api/ies/' + id, { method: 'DELETE' });
    showToast('IE de alta eliminada con éxito', 'success');
    closeModal();
    loadIEs();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===================== INIT =====================
checkSession();
