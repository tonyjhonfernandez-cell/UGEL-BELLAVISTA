
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
  const defaults = { headers: {}, credentials: 'include', cache: 'no-store' };
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
      var item = list[i];
      var nombreMostrar = item.nombre;
      if (item.codigo && item.codigo.endsWith('-EBA')) {
        nombreMostrar += ' (EBA)';
      } else if (item.codigo && item.codigo.endsWith('-CET')) {
        nombreMostrar += ' (CETPRO)';
      }
      h += '<div class="sel-item" onclick="loginComoDirector(' + item.id + ')"><span class="sel-cod">' + item.codigo + '</span><span class="sel-nom">' + nombreMostrar + '</span></div>';
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
      var escapedNombre = ie.nombre.replace(/'/g, "\'");
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
    loadDirectorEvaluationSettings();
    
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
    tooltip.innerHTML = '💡 Ingresa aquí';
    
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
  const params = new URLSearchParams(window.location.search);
  const capId = params.get('capacitacion');
  
  if (capId) {
    showPublicCapacitacionForm(capId);
    return;
  }
  
  initThemeColor();
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
const THEME_MAP = {
  indigo: {
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: 'rgba(99, 102, 241, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    sidebarActive: '#818cf8',
    sidebarActiveBg: 'rgba(99, 102, 241, 0.12)'
  },
  blue: {
    primary: '#3b82f6',
    primaryDark: '#1d4ed8',
    primaryLight: 'rgba(59, 130, 246, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    sidebarActive: '#60a5fa',
    sidebarActiveBg: 'rgba(59, 130, 246, 0.12)'
  },
  sky: {
    primary: '#0ea5e9',
    primaryDark: '#0284c7',
    primaryLight: 'rgba(14, 165, 233, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    sidebarActive: '#38bdf8',
    sidebarActiveBg: 'rgba(14, 165, 233, 0.12)'
  },
  teal: {
    primary: '#0d9488',
    primaryDark: '#0f766e',
    primaryLight: 'rgba(13, 148, 136, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    sidebarActive: '#2dd4bf',
    sidebarActiveBg: 'rgba(13, 148, 136, 0.12)'
  },
  emerald: {
    primary: '#10b981',
    primaryDark: '#059669',
    primaryLight: 'rgba(16, 185, 129, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    sidebarActive: '#34d399',
    sidebarActiveBg: 'rgba(16, 185, 129, 0.12)'
  },
  violet: {
    primary: '#8b5cf6',
    primaryDark: '#6d28d9',
    primaryLight: 'rgba(139, 92, 246, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    sidebarActive: '#a78bfa',
    sidebarActiveBg: 'rgba(139, 92, 246, 0.12)'
  },
  rose: {
    primary: '#f43f5e',
    primaryDark: '#be123c',
    primaryLight: 'rgba(244, 63, 94, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
    sidebarActive: '#fb7185',
    sidebarActiveBg: 'rgba(244, 63, 94, 0.12)'
  },
  amber: {
    primary: '#f59e0b',
    primaryDark: '#d97706',
    primaryLight: 'rgba(245, 158, 11, 0.08)',
    primaryGrad: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    sidebarActive: '#fbbf24',
    sidebarActiveBg: 'rgba(245, 158, 11, 0.12)'
  }
};

window._currentThemeColor = 'indigo';

function selectThemeColor(theme) {
  if (!THEME_MAP[theme]) theme = 'indigo';
  window._currentThemeColor = theme;
  
  const colors = THEME_MAP[theme];
  const root = document.documentElement;
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-dark', colors.primaryDark);
  root.style.setProperty('--primary-light', colors.primaryLight);
  root.style.setProperty('--primary-grad', colors.primaryGrad);
  root.style.setProperty('--sidebar-active', colors.sidebarActive);
  root.style.setProperty('--sidebar-active-bg', colors.sidebarActiveBg);
  
  document.querySelectorAll('.theme-color-btn').forEach(btn => {
    const btnTheme = btn.getAttribute('data-theme');
    if (btnTheme === theme) {
      btn.classList.add('active');
      btn.style.boxShadow = `0 0 0 2px ${colors.primary}`;
    } else {
      btn.classList.remove('active');
      btn.style.boxShadow = '0 0 0 1px #cbd5e1';
    }
  });
}

async function initThemeColor() {
  try {
    const settings = await api('/api/system-settings');
    if (settings && settings.theme_color) {
      selectThemeColor(settings.theme_color);
    } else {
      selectThemeColor('indigo');
    }
  } catch(e) {
    console.error('Error al inicializar color de tema:', e);
    selectThemeColor('indigo');
  }
}

function onBoxTypeChange(val) {
  const urlGroup = document.getElementById('config-box-url-group');
  if (urlGroup) {
    urlGroup.style.display = 'block';
  }
}

function toggleConfigEvaluationDetails() {
  const active = document.getElementById('config-active-box').checked;
  const details = document.getElementById('config-evaluation-details');
  if (details) {
    details.style.display = active ? 'block' : 'none';
  }
}

async function loadSystemSettings() {
  try {
    const settings = await api('/api/system-settings');
    document.getElementById('config-active-box').checked = settings.active_evaluation_box || false;
    document.getElementById('config-box-title').value = settings.evaluation_box_title || '';
    document.getElementById('config-box-url').value = settings.evaluation_box_url || '';
    toggleConfigEvaluationDetails();
    
    const boxType = settings.evaluation_box_type || 'external';
    const typeSelect = document.getElementById('config-box-type');
    if (typeSelect) {
      typeSelect.value = boxType;
    }
    onBoxTypeChange(boxType);
    
    const theme = settings.theme_color || 'indigo';
    selectThemeColor(theme);
  } catch(e) {
    showToast('Error al cargar configuración: ' + e.message, 'error');
  }
}

async function saveSystemSettings() {
  try {
    const active = document.getElementById('config-active-box').checked;
    const title = document.getElementById('config-box-title').value.trim();
    const url = document.getElementById('config-box-url').value.trim();
    const type = document.getElementById('config-box-type').value;
    const themeColor = window._currentThemeColor || 'indigo';
    
    if (active && !title) {
      showToast('Debe ingresar un título para el recuadro especial', 'error');
      return;
    }
    if (active && type === 'external' && !url) {
      showToast('Debe ingresar el enlace/URL', 'error');
      return;
    }
    
    await api('/api/system-settings', {
      method: 'PUT',
      body: {
        active_evaluation_box: active,
        evaluation_box_title: title,
        evaluation_box_url: url,
        evaluation_box_type: type,
        theme_color: themeColor
      }
    });
    
    showToast('Configuración del sistema guardada con éxito', 'success');
  } catch(e) {
    showToast('Error al guardar configuración: ' + e.message, 'error');
  }
}

async function loadDirectorEvaluationSettings() {
  try {
    const settings = await api('/api/system-settings');
    const evalBox = document.getElementById('dir-evaluation-box');
    window._evaluationBoxType = settings.evaluation_box_type || 'external';
    window._evaluationBoxUrl = settings.evaluation_box_url || '';
    if (settings && settings.active_evaluation_box) {
      document.getElementById('dir-eval-title').textContent = settings.evaluation_box_title || 'Evaluación de Actividad';
      evalBox.style.display = 'flex';
    } else {
      evalBox.style.display = 'none';
    }
  } catch(e) {
    console.error('Error al cargar configuración de evaluación:', e);
  }
}

function openEvaluationLink() {
  if (window._evaluationBoxUrl) {
    window.open(window._evaluationBoxUrl, '_blank');
  }
}

function initDirectorApp() {
  document.body.classList.add('director-mode');
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
  loadDirectorEvaluationSettings();
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
  loadNiveles();
  
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

  if (currentUser.rol === 'director') {
    html += '<div class="label">Principal</div>';
    html += '<a href="#" data-view="cap" onclick="cambiarVista(\'cap\',this)"><i class="fas fa-id-card-alt"></i> CAP</a>';
    
    html += '<div class="label">Cuenta</div>';
    html += '<a href="#" data-view="calendario" onclick="cambiarVista(\'calendario\',this)"><i class="fas fa-calendar-alt"></i> Mi Calendario</a>';
    html += '<a href="#" data-view="perfil" onclick="cambiarVista(\'perfil\',this)"><i class="fas fa-user-circle"></i> Mi Perfil</a>';
  }

  if (currentUser.rol === 'supervisor' || currentUser.rol === 'admin') {
    // 1. Gestión (Dashboard)
    html += '<div class="label">Gestión</div>';
    html += '<a href="#" data-view="avance-mensual" onclick="cambiarVista(\'avance-mensual\',this)"><i class="fas fa-chart-line"></i> Dashboard</a>';
    html += '<a href="#" data-view="cap" onclick="cambiarVista(\'cap\',this)"><i class="fas fa-id-card-alt"></i> CAP</a>';

    // 2. Principal (Asignar actividades, Monitoreo de Actividades, Capacitaciones, Monitoreo de Capacitaciones)
    html += '<div class="label">Principal</div>';
    html += '<a href="#" data-view="asignar-actividad" onclick="cambiarVista(\'asignar-actividad\',this)"><i class="fas fa-plus-circle"></i> Asignar Actividades</a>';
    html += '<a href="#" data-view="monitoreo" onclick="cambiarVista(\'monitoreo\',this)"><i class="fas fa-tasks"></i> Monitoreo de Actividades</a>';
    html += '<a href="#" data-view="capacitaciones" onclick="cambiarVista(\'capacitaciones\',this)"><i class="fas fa-plus-square"></i> Capacitaciones</a>';
    html += '<a href="#" data-view="monitoreo-capacitaciones" onclick="cambiarVista(\'monitoreo-capacitaciones\',this)"><i class="fas fa-chalkboard-teacher"></i> Monitoreo de Capacitaciones</a>';

    // 3. Administración (Instituciones Educativas, Usuarios y Configuraciones)
    if (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez') {
      html += '<div class="label">Administración</div>';
      html += '<a href="#" data-view="ies" onclick="cambiarVista(\'ies\',this)"><i class="fas fa-school"></i> Inst. Educativas</a>';
      if (currentUser.rol === 'admin') {
        html += '<a href="#" data-view="admin-usuarios" onclick="cambiarVista(\'admin-usuarios\',this)"><i class="fas fa-users-cog"></i> Usuarios</a>';
      }
    }
    
    html += '<div class="label">Cuenta</div>';
    html += '<a href="#" data-view="calendario" onclick="cambiarVista(\'calendario\',this)"><i class="fas fa-calendar-alt"></i> Mi Calendario</a>';
    if (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez') {
      html += '<a href="#" data-view="perfil" onclick="cambiarVista(\'perfil\',this)"><i class="fas fa-cog"></i> Configuraciones</a>';
    } else {
      html += '<a href="#" data-view="perfil" onclick="cambiarVista(\'perfil\',this)"><i class="fas fa-user-circle"></i> Mi Perfil</a>';
    }
  }

  nav.innerHTML = html;

  // User footer + logout
  var inits = currentUser.nombre.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
  var rolLabel = currentUser.rol === 'admin' ? 'Administrador(a)' : (currentUser.rol === 'director' ? 'Director(a)' : 'Supervisor(a)');
  ft.innerHTML =
    '<div class="sidebar-user-footer">' +
      '<div class="su-avatar">' + inits + '</div>' +
      '<div class="su-info">' +
        '<div class="su-name">' + currentUser.nombre + '</div>' +
        '<div class="su-role">' + rolLabel + '</div>' +
      '</div>' +
    '</div>' +
    '<a href="#" class="logout" onclick="event.preventDefault();logout()" style="margin-top:4px;"><i class="fas fa-sign-out-alt"></i> Cerrar Sesión</a>';
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
  'consolidado': 'Consolidado',
  'monitoreo': 'Monitoreo',
  'directores': 'Directores',
  'ies': 'IEs',
  'notificaciones': 'Notificaciones',
  'perfil': 'Mi Perfil',
  'cap': 'CAP',
  'capacitaciones': 'Capacitaciones',
  'monitoreo-capacitaciones': 'Monitoreo de Capacitaciones',
  'public-capacitacion': 'Registro de Asistencia'
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
    case 'consolidado': loadConsolidado(); break;
    case 'monitoreo': loadMonitoreo(); break;
    case 'directores': loadDirectores(); break;
    case 'ies': loadIEs(); break;
    case 'notificaciones': loadNotificaciones(); loadDirectoresForNotif(); break;
    case 'calendario': loadCalendario(); break;
    case 'perfil': loadPerfil(); break;
    case 'admin-usuarios': loadAdminUsuarios(); break;
    case 'cap': capInitView(); break;
    case 'capacitaciones':
      if (document.getElementById('cap-titulo')) document.getElementById('cap-titulo').value = '';
      if (document.getElementById('cap-descripcion')) document.getElementById('cap-descripcion').value = '';
      if (document.getElementById('cap-fecha')) document.getElementById('cap-fecha').value = '';
      if (document.getElementById('cap-incluye-encuesta')) document.getElementById('cap-incluye-encuesta').checked = false;
      if (document.getElementById('cap-alc-todas')) { document.getElementById('cap-alc-todas').checked = true; onChangeAlcanceCap('todas'); }
      break;
    case 'monitoreo-capacitaciones': loadCapacitaciones(); break;
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
async function abrirModalRankingIEs() {
    document.getElementById('modalRankingIEs').style.display = 'flex';
    document.getElementById('ranking-loading').style.display = 'block';
    document.getElementById('ranking-content').style.display = 'none';
    
    try {
        const ranking = await api('/api/ranking-ies');
        
        const contentDiv = document.getElementById('ranking-content');
        if (!ranking || ranking.length === 0) {
            contentDiv.innerHTML = '<div style="text-align:center; color:#64748b; padding:20px;">No hay datos de asignaciones.</div>';
        } else {
            let html = `
                <table class="table" style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e2e8f0;">
                            <th style="padding:12px 8px; text-align:center; color:#475569; font-size:0.85rem;">Pos</th>
                            <th style="padding:12px 8px; text-align:left; color:#475569; font-size:0.85rem;">Institución</th>
                            <th style="padding:12px 8px; text-align:center; color:#475569; font-size:0.85rem;">Progreso</th>
                            <th style="padding:12px 8px; text-align:center; color:#475569; font-size:0.85rem;">Efectividad</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            ranking.forEach((ie, index) => {
                let badge = `<span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; border-radius:50%; background:#f1f5f9; color:#64748b; font-weight:bold; font-size:0.8rem;">${index + 1}</span>`;
                if (index === 0) badge = `<span style="font-size:1.2rem;">🥇</span>`;
                if (index === 1) badge = `<span style="font-size:1.2rem;">🥈</span>`;
                if (index === 2) badge = `<span style="font-size:1.2rem;">🥉</span>`;
                
                let percentColor = '#10b981'; // Green
                if (ie.porcentaje < 50) percentColor = '#ef4444'; // Red
                else if (ie.porcentaje < 80) percentColor = '#f59e0b'; // Amber
                
                html += `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding:12px 8px; text-align:center;">${badge}</td>
                        <td style="padding:12px 8px;">
                            <div style="font-weight:600; color:#1e293b; font-size:0.9rem;">${ie.nombre || 'IE Sin Nombre'}</div>
                            <div style="font-size:0.75rem; color:#64748b;">${ie.codigo || '-'} | ${ie.ruralidad || '-'}</div>
                        </td>
                        <td style="padding:12px 8px; vertical-align:middle; width:30%;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; color:#64748b;">
                                <span>${ie.total_cumplidas} / ${ie.total_asignadas} acts.</span>
                            </div>
                            <div style="width:100%; background:#e2e8f0; border-radius:4px; height:6px; overflow:hidden;">
                                <div style="width:${ie.porcentaje}%; background:${percentColor}; height:100%; border-radius:4px; transition:width 1s ease;"></div>
                            </div>
                        </td>
                        <td style="padding:12px 8px; text-align:center; font-weight:700; color:${percentColor}; font-size:1.1rem;">
                            ${ie.porcentaje}%
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            contentDiv.innerHTML = html;
        }
        
        document.getElementById('ranking-loading').style.display = 'none';
        document.getElementById('ranking-content').style.display = 'block';
    } catch (e) {
        document.getElementById('ranking-loading').innerHTML = '<div style="color:#ef4444;">Error al cargar el ranking.</div>';
    }
}

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
        <a href="#" style="color: var(--granate); text-decoration: none; font-size: 12px; font-weight: 700; display: inline-flex; align-items:center; gap: 4px;" onclick="event.stopPropagation(); event.preventDefault(); contactarSupervisor(${a.id}, '${resp_nombre.replace(/'/g, "\'")}')">
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
  var desc = row.actividad_descripcion || row.descripcion || '';
  var linkUrl = row.link_url || '';
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
    <button class="btn btn-primary" onclick="event.stopPropagation(); closeModal(); contactarSupervisor(${row.id}, '${resp.replace(/'/g, "\'")}')">
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
      
      ${desc ? `<div style="margin-bottom:16px;">
        <h5 style="font-size:0.75rem; font-weight:700; color:#4b5563; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:0.5px;">Descripción</h5>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:12px; font-size:0.85rem; color:#374151; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${desc}</div>
      </div>` : ''}
      ${linkUrl ? `<div style="margin-bottom:16px;">
        <h5 style="font-size:0.75rem; font-weight:700; color:#4b5563; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:0.5px;"><i class="fas fa-link" style="margin-right:4px;color:var(--granate);"></i> Enlace</h5>
        <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem; color:#2563eb; word-break:break-all;">${linkUrl}</a>
      </div>` : ''}
      
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
let selectedIEIds = {};

function syncSelectedIEs() {
  // Empty as we use syncIEMaster and syncIESub now
}

function syncIEMaster(cb, id) {
  var card = document.getElementById('ie-card-' + id);
  var container = document.getElementById('ie-pill-container-' + id);
  if (cb.checked) {
    selectedIEIds[id] = 'ALL';
    if (card) card.classList.add('active');
    if (container) container.style.display = 'flex';
    document.querySelectorAll('.ie-subcb-' + id).forEach(el => {
      el.checked = true;
      var pill = document.getElementById('ie-pill-' + id + '-' + el.value);
      if (pill) pill.classList.add('active');
    });
  } else {
    delete selectedIEIds[id];
    if (card) card.classList.remove('active');
    if (container) container.style.display = 'none';
    document.querySelectorAll('.ie-subcb-' + id).forEach(el => {
      el.checked = false;
      var pill = document.getElementById('ie-pill-' + id + '-' + el.value);
      if (pill) pill.classList.remove('active');
    });
  }
}

function syncIESub(id, cb, clave) {
  var pill = document.getElementById('ie-pill-' + id + '-' + clave);
  if (pill) {
    if (cb.checked) pill.classList.add('active');
    else pill.classList.remove('active');
  }

  var subs = document.querySelectorAll('.ie-subcb-' + id);
  var checkedClaves = [];
  var allChecked = true;
  subs.forEach(el => {
    if (el.checked) checkedClaves.push(el.value);
    else allChecked = false;
  });
  var masterCb = document.querySelector('.ie-checkbox[value="' + id + '"]');
  var card = document.getElementById('ie-card-' + id);
  if (checkedClaves.length === 0) {
    delete selectedIEIds[id];
    if (masterCb) masterCb.checked = false;
    if (card) card.classList.remove('active');
  } else if (allChecked) {
    selectedIEIds[id] = 'ALL';
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  } else {
    selectedIEIds[id] = checkedClaves;
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  }
}

async function loadIEsForAsignar() {
  try {
    var d = await api('/api/ies');
    allIEs = d.ies || d || [];
    selectedIEIds = {};
    renderIECheckboxes(allIEs);
    // Populate nivel filter dropdown
    var nf = document.getElementById('ie-filter-nivel');
    if (nf) {
      nf.innerHTML = '<option value="">Todos los niveles</option>';
      if (window.nivelesCache) {
        window.nivelesCache.forEach(function(nv) {
          nf.innerHTML += '<option value="' + nv.clave + '">' + nv.nombre + '</option>';
        });
      }
    }
    // Populate activity niveles checkboxes
    var actNivCont = document.getElementById('as-niveles-actividad-container');
    if (actNivCont && window.nivelesCache) {
      var html = '';
      window.nivelesCache.forEach(function(nv) {
        html += '<div class="form-check"><input class="form-check-input as-act-nivel-cb" type="checkbox" value="' + nv.clave + '" id="cb-act-niv-' + nv.clave + '"><label class="form-check-label" for="cb-act-niv-' + nv.clave + '">' + nv.nombre + '</label></div>';
      });
      actNivCont.innerHTML = html;
    }
    // Populate alcance niveles checkboxes
    var alcNivCont = document.getElementById('as-alcance-niveles-container');
    if (alcNivCont && window.nivelesCache) {
      var html2 = '';
      window.nivelesCache.forEach(function(nv) {
        html2 += '<div class="form-check"><input class="form-check-input as-alc-nivel-cb" type="checkbox" value="' + nv.clave + '" id="cb-alc-niv-' + nv.clave + '"><label class="form-check-label" for="cb-alc-niv-' + nv.clave + '">' + nv.nombre + '</label></div>';
      });
      alcNivCont.innerHTML = html2;
    }
    onChangeAlcanceNew('todas');
  } catch (e) {}
}

function onChangeAlcanceNew(val) {
  document.getElementById('alcance-new-nivel').style.display = (val === 'nivel') ? 'block' : 'none';
  document.getElementById('alcance-new-manual').style.display = (val === 'manual') ? 'block' : 'none';
  document.getElementById('alcance-new-lista').style.display = (val === 'lista') ? 'block' : 'none';
  if (val === 'lista') cargarListasIE();
}

async function cargarListasIE() {
  try {
    var listas = await api('/api/listas-ie');
    var cont = document.getElementById('listas-ie-container');
    if (!cont) return;
    if (!listas || listas.length === 0) {
      cont.innerHTML = '<div style="color:#9ca3af; font-size:0.8rem;">No hay listas guardadas. Crea una con el botón de arriba.</div>';
      return;
    }
    var html = '';
    listas.forEach(function(lista) {
      var ids = JSON.parse(lista.ie_ids || '[]');
      html += '<div class="form-check" style="padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb;">' +
        '<input class="form-check-input as-lista-radio" type="radio" name="as-lista-sel" value="' + lista.id + '" id="lista-' + lista.id + '" data-ie-ids=\'' + lista.ie_ids + '\'>' +
        '<label class="form-check-label" for="lista-' + lista.id + '" style="font-weight:600;">' + lista.nombre + ' <span style="color:#6b7280; font-weight:400; font-size:0.78rem;">(' + ids.length + ' IEs)</span></label>' +
        '<button type="button" class="btn btn-xs btn-danger ms-2" onclick="eliminarLista(' + lista.id + ')"><i class="fas fa-trash"></i></button>' +
        '</div>';
    });
    cont.innerHTML = html;
  } catch (e) { /* ignore */ }
}

async function eliminarLista(id) {
  try {
    await api('/api/listas-ie/' + id, { method: 'DELETE' });
    showToast('Lista eliminada', 'success');
    cargarListasIE();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

var selectedNLIEs = {};

function mostrarCrearLista() {
  selectedNLIEs = {};
  showModal('Nueva Lista de IEs',
    '<div class="mb-3"><label class="form-label">Nombre de la lista *</label><input class="form-control" id="nl-nombre" placeholder="Ej: Escuelas rurales zona norte"></div>' +
    '<div class="mb-2"><label class="form-label">Buscar IEs <span style="font-size:0.75rem; color:#6b7280;">(escribe para filtrar)</span></label>' +
    '<input class="form-control mb-2" id="nl-search" placeholder="Código o nombre..." oninput="filterNLList()"></div>' +
    '<div id="nl-ie-list" style="max-height:280px; overflow-y:auto; border:1px solid #e5e7eb; border-radius:8px; padding:8px;"></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="guardarNuevaLista()">Guardar lista</button>');
  renderNLList(allIEs);
}

var _nlSearchTimeout = null;
function filterNLList() {
  clearTimeout(_nlSearchTimeout);
  _nlSearchTimeout = setTimeout(function() {
    var q = document.getElementById('nl-search') ? document.getElementById('nl-search').value.toLowerCase() : '';
    var filtered = allIEs.filter(function(ie) {
      return ie.nombre.toLowerCase().indexOf(q) !== -1 || ie.codigo.toLowerCase().indexOf(q) !== -1;
    });
    renderNLList(filtered);
  }, 300);
}

function renderNLList(ies) {
  var cont = document.getElementById('nl-ie-list');
  if (!cont) return;
  var html = '';
  ies.forEach(function(ie) {
    var hasLevels = ie.niveles && ie.niveles.length > 0;
    var isSelected = !!selectedNLIEs[ie.id];
    var activeClass = isSelected ? 'active' : '';
    html += '<div class="ie-item-card ' + activeClass + '" id="nl-card-' + ie.id + '">';
    html += '  <label class="ie-item-header">';
    html += '    <input type="checkbox" class="nl-ie-cb" value="' + ie.id + '" onchange="syncNLMaster(this, ' + ie.id + ')" ' + (isSelected ? 'checked' : '') + '>';
    html += '    <div class="ie-item-title"><span>' + ie.codigo + '</span> ' + ie.nombre + '</div>';
    html += '  </label>';
    
    if (hasLevels) {
      html += '  <div class="level-pill-container" ' + (isSelected ? '' : 'style="display:none;"') + ' id="nl-pill-container-' + ie.id + '">';
      ie.niveles.forEach(function(nv) {
        var isNvChecked = false;
        if (selectedNLIEs[ie.id]) {
          if (Array.isArray(selectedNLIEs[ie.id])) {
            isNvChecked = selectedNLIEs[ie.id].includes(nv.clave);
          } else {
            isNvChecked = true;
          }
        }
        var pillClass = isNvChecked ? 'active' : '';
        html += '    <label class="level-pill ' + pillClass + '" id="nl-pill-' + ie.id + '-' + nv.clave + '">';
        html += '      <input type="checkbox" class="nl-ie-subcb-' + ie.id + '" value="' + nv.clave + '" onchange="syncNLSub(' + ie.id + ', this, \'' + nv.clave + '\')" ' + (isNvChecked ? 'checked' : '') + '>';
        html += '      ' + nv.nombre;
        html += '    </label>';
      });
      html += '  </div>';
    }
    html += '</div>';
  });
  cont.innerHTML = html || '<div style="color:#9ca3af; font-size:0.8rem; padding:8px; text-align:center;">No se encontraron IEs en la búsqueda</div>';
}

function syncNLMaster(cb, id) {
  var card = document.getElementById('nl-card-' + id);
  var container = document.getElementById('nl-pill-container-' + id);
  if (cb.checked) {
    selectedNLIEs[id] = 'ALL';
    if (card) card.classList.add('active');
    if (container) container.style.display = 'flex';
    document.querySelectorAll('.nl-ie-subcb-' + id).forEach(el => {
      el.checked = true;
      var pill = document.getElementById('nl-pill-' + id + '-' + el.value);
      if(pill) pill.classList.add('active');
    });
  } else {
    delete selectedNLIEs[id];
    if (card) card.classList.remove('active');
    if (container) container.style.display = 'none';
    document.querySelectorAll('.nl-ie-subcb-' + id).forEach(el => {
      el.checked = false;
      var pill = document.getElementById('nl-pill-' + id + '-' + el.value);
      if(pill) pill.classList.remove('active');
    });
  }
}

function syncNLSub(id, cb, clave) {
  var pill = document.getElementById('nl-pill-' + id + '-' + clave);
  if (pill) {
    if (cb.checked) pill.classList.add('active');
    else pill.classList.remove('active');
  }

  var subs = document.querySelectorAll('.nl-ie-subcb-' + id);
  var checkedClaves = [];
  var allChecked = true;
  subs.forEach(el => {
    if (el.checked) checkedClaves.push(el.value);
    else allChecked = false;
  });
  var masterCb = document.querySelector('input.nl-ie-cb[value="' + id + '"]');
  var card = document.getElementById('nl-card-' + id);
  if (checkedClaves.length === 0) {
    delete selectedNLIEs[id];
    if (masterCb) masterCb.checked = false;
    if (card) card.classList.remove('active');
  } else if (allChecked) {
    selectedNLIEs[id] = 'ALL';
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  } else {
    selectedNLIEs[id] = checkedClaves;
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  }
}

async function guardarNuevaLista() {
  var nombre = document.getElementById('nl-nombre') ? document.getElementById('nl-nombre').value.trim() : '';
  if (!nombre) { showToast('Ingrese un nombre para la lista', 'error'); return; }
  var ids = [];
  for (var k in selectedNLIEs) {
    if (selectedNLIEs[k] === 'ALL') ids.push({ id: parseInt(k), niveles: null });
    else ids.push({ id: parseInt(k), niveles: selectedNLIEs[k] });
  }
  if (ids.length === 0) { showToast('Seleccione al menos una IE', 'error'); return; }
  try {
    await api('/api/listas-ie', { method: 'POST', body: { nombre: nombre, ie_ids: ids } });
    showToast('Lista guardada con éxito', 'success');
    closeModal();
    cargarListasIE();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

function renderIECheckboxes(ies) {
  var html = '';
  for (var i = 0; i < ies.length; i++) {
    var ie = ies[i];
    var hasLevels = ie.niveles && ie.niveles.length > 0;
    var isSelected = !!selectedIEIds[ie.id];
    var activeClass = isSelected ? 'active' : '';
    
    html += '<div class="col-md-6 mb-2">';
    html += '<div class="ie-item-card ' + activeClass + '" id="ie-card-' + ie.id + '">';
    html += '  <label class="ie-item-header">';
    html += '    <input type="checkbox" class="ie-checkbox" onchange="syncIEMaster(this, ' + ie.id + ')" value="' + ie.id + '" ' + (isSelected ? 'checked' : '') + '>';
    html += '    <div class="ie-item-title"><span>' + ie.codigo + '</span> ' + ie.nombre + '</div>';
    html += '  </label>';
    
    if (hasLevels) {
      html += '  <div class="level-pill-container" ' + (isSelected ? '' : 'style="display:none;"') + ' id="ie-pill-container-' + ie.id + '">';
      ie.niveles.forEach(function(nv) {
        var isNvChecked = false;
        if (selectedIEIds[ie.id]) {
          if (Array.isArray(selectedIEIds[ie.id])) {
            isNvChecked = selectedIEIds[ie.id].includes(nv.clave);
          } else {
            isNvChecked = true;
          }
        }
        var pillClass = isNvChecked ? 'active' : '';
        html += '    <label class="level-pill ' + pillClass + '" id="ie-pill-' + ie.id + '-' + nv.clave + '">';
        html += '      <input type="checkbox" class="ie-subcb-' + ie.id + '" value="' + nv.clave + '" onchange="syncIESub(' + ie.id + ', this, \'' + nv.clave + '\')" ' + (isNvChecked ? 'checked' : '') + '>';
        html += '      ' + nv.nombre;
        html += '    </label>';
      });
      html += '  </div>';
    }
    html += '</div></div>';
  }
  
  var container = document.getElementById('ie-checkbox-list');
  if(container) {
    container.className = 'row';
    container.innerHTML = html || '<div class="col-12 text-muted">No se encontraron instituciones</div>';
  }
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
      selectedIEIds[val] = 'ALL';
      var card = document.getElementById('ie-card-' + val);
      if(card) card.classList.add('active');
      var container = document.getElementById('ie-pill-container-' + val);
      if(container) container.style.display = 'flex';
      document.querySelectorAll('.ie-subcb-' + val).forEach(function(el) {
        el.checked = true;
        var pill = document.getElementById('ie-pill-' + val + '-' + el.value);
        if(pill) pill.classList.add('active');
      });
    } else {
      delete selectedIEIds[val];
      var card = document.getElementById('ie-card-' + val);
      if(card) card.classList.remove('active');
      var container = document.getElementById('ie-pill-container-' + val);
      if(container) container.style.display = 'none';
      document.querySelectorAll('.ie-subcb-' + val).forEach(function(el) {
        el.checked = false;
        var pill = document.getElementById('ie-pill-' + val + '-' + el.value);
        if(pill) pill.classList.remove('active');
      });
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
      
      var escapedNombre = item.nombre.replace(/'/g, "\'");
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
  var tit = document.getElementById('as-titulo').value.trim().toUpperCase();
  var desc = document.getElementById('as-descripcion').value.trim();
  var fec = document.getElementById('as-fecha').value;
  var linkSi = document.getElementById('as-link-si') && document.getElementById('as-link-si').checked;
  var linkUrl = linkSi ? (document.getElementById('as-link-url').value.trim() || null) : null;

  if (!tit || !fec) { showToast('Complete campos obligatorios (título y fecha límite)', 'error'); return; }

  // Collect activity-level niveles
  var actNivCbs = document.querySelectorAll('.as-act-nivel-cb:checked');
  var actNiveles = [];
  actNivCbs.forEach(function(cb) { actNiveles.push(cb.value); });

  // Determine alcance
  var alcanceRadio = document.querySelector('input[name="as-alcance-radio"]:checked');
  var alcance = alcanceRadio ? alcanceRadio.value : 'todas';
  var targetIes = [];

  if (alcance === 'todas') {
    targetIes = allIEs.map(function(ie) { return { id: ie.id, niveles: actNiveles.length > 0 ? actNiveles : null }; });
    if (targetIes.length === 0) { showToast('No hay IEs activas', 'error'); return; }
  } else if (alcance === 'nivel') {
    var alcNivCbs = document.querySelectorAll('.as-alc-nivel-cb:checked');
    var alcNiveles = [];
    alcNivCbs.forEach(function(cb) { alcNiveles.push(cb.value); });
    if (alcNiveles.length === 0) { showToast('Seleccione al menos un nivel', 'error'); return; }
    // Filter IEs that have at least one of the selected niveles
    var matchingIEs = allIEs.filter(function(ie) {
      if (!ie.niveles) return false;
      return ie.niveles.some(function(nv) { return alcNiveles.indexOf(nv.clave) !== -1; });
    });
    targetIes = matchingIEs.map(function(ie) { return { id: ie.id, niveles: alcNiveles }; });
    if (targetIes.length === 0) { showToast('No se encontraron IEs para los niveles seleccionados', 'error'); return; }
  } else if (alcance === 'manual') {
    syncSelectedIEs();
    if (Object.keys(selectedIEIds).length === 0) { showToast('Seleccione al menos una institución', 'error'); return; }
    targetIes = [];
    for (var k in selectedIEIds) {
      targetIes.push({ id: parseInt(k), niveles: selectedIEIds[k] === 'ALL' ? null : selectedIEIds[k] });
    }
  } else if (alcance === 'lista') {
    var listaRadio = document.querySelector('input[name="as-lista-sel"]:checked');
    if (!listaRadio) { showToast('Seleccione una lista guardada', 'error'); return; }
    var listaIds = JSON.parse(listaRadio.dataset.ieIds || '[]');
    if (listaIds.length === 0) { showToast('La lista seleccionada está vacía', 'error'); return; }
    targetIes = listaIds.map(function(item) {
      if (typeof item === 'object') return item;
      return { id: parseInt(item), niveles: actNiveles.length > 0 ? actNiveles : null };
    });
  }

  var btnSubmit = document.querySelector('#asignar-form button[type="submit"]');
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Asignando...'; }

  try {
    var ids = targetIes.map(function(t) { return t.id; });
    await api('/api/actividades', { method: 'POST', body: {
      titulo: tit, descripcion: desc, fecha_limite: fec,
      link_url: linkUrl, niveles_aplicados: actNiveles.length > 0 ? actNiveles.join(',') : null,
      ies: targetIes, ie_ids: ids
    }});
    showToast('Actividad asignada con éxito (' + targetIes.length + ' IEs)', 'success');
    document.getElementById('asignar-form').reset();
    document.getElementById('as-link-no').checked = true;
    document.getElementById('as-link-container').style.display = 'none';
    selectedIEIds = {};
    renderIECheckboxes(allIEs);
    onChangeAlcanceNew('todas');
    document.getElementById('as-alc-todas').checked = true;
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = 'Asignar Actividad'; }
  }
}

// ===================== MONITOREO =====================
var monitoreoData = {}; // actId -> group data

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

    // Group by actividad_id while preserving order
    var actMap = {};
    var actIds = [];
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i];
      var actId = a.actividad_id;
      if (!actMap[actId]) {
        actIds.push(actId);
        actMap[actId] = {
          id: actId,
          titulo: a.actividad_titulo || '-',
          descripcion: a.actividad_descripcion || a.descripcion || '',
          fecha_limite: a.fecha_limite,
          link_url: a.link_url || '',
          asignador_nombre: a.asignador_nombre,
          asignador_id: a.asignador_id,
          area: a.area,
          ies: []
        };
      }
      actMap[actId].ies.push(a);
    }
    monitoreoData = actMap;

    var container = document.getElementById('monitoreo-cards-container');

    if (actIds.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3);"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:12px;display:block;color:#cbd5e1;"></i><div style="font-weight:600;margin-bottom:4px;">No se encontraron asignaciones</div><div style="font-size:.8rem;">Intente con otros filtros</div></div>';
      updateBulkDeleteButtonState();
      return;
    }

    var html = '';
    for (var k = 0; k < actIds.length; k++) {
      var grp = actMap[actIds[k]];
      var total = grp.ies.length;
      var completadas = grp.ies.filter(function(x){ return x.estado === 'completada'; }).length;
      var inconclusas = grp.ies.filter(function(x){ return x.estado === 'inconclusa'; }).length;
      var noCumplidas = grp.ies.filter(function(x){ return x.estado === 'no_cumplida'; }).length;
      var pendientes = total - completadas - inconclusas - noCumplidas;
      var pct = total > 0 ? Math.round(completadas / total * 100) : 0;
      var dateText = grp.fecha_limite ? new Date(grp.fecha_limite).toLocaleDateString('es-PE') : '-';
      var pctColor = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';

      // Build stacked progress bar segments
      var pctC = total > 0 ? (completadas/total*100).toFixed(1) : 0;
      var pctI = total > 0 ? (inconclusas/total*100).toFixed(1) : 0;
      var pctN = total > 0 ? (noCumplidas/total*100).toFixed(1) : 0;
      var pctP = total > 0 ? (pendientes/total*100).toFixed(1) : 0;

      var canEdit = (currentUser && (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez' || currentUser.id == grp.asignador_id));
      var editBtn = canEdit ? '<button class="btn btn-xs btn-warning" onclick="event.stopPropagation();editarActividadModal(' + grp.id + ')" title="Editar actividad" style="padding:5px 8px;"><i class="fas fa-pen"></i></button>' : '';
      var checkboxHtml = canEdit ? '<input type="checkbox" class="mon-row-checkbox" value="' + grp.id + '" onclick="event.stopPropagation()" onchange="updateBulkDeleteButtonState()" style="width:14px;height:14px;accent-color:var(--primary);flex-shrink:0;">' : '<div style="width:14px;height:14px;flex-shrink:0;"></div>';

      html += '<div class="mon-act-card">' +
        '<div class="mon-act-hd" onclick="openMonModal(' + grp.id + ')">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              checkboxHtml +
              '<span class="act-title">' + grp.titulo + '</span>' +
            '</div>' +
            '<div class="act-meta">Por: ' + (grp.asignador_nombre || '-') + (grp.area ? ' · ' + grp.area : '') + ' &nbsp;·&nbsp; <span style="color:var(--text2);font-weight:700;">' + completadas + ' completadas · ' + pendientes + ' pendientes · ' + inconclusas + ' inconclusas de ' + total + '</span></div>' +
            '<div style="margin-top:8px;height:6px;border-radius:3px;background:#e2e8f0;overflow:hidden;display:flex;">' +
              '<div style="width:' + pctC + '%;background:var(--success);height:100%;"></div>' +
              '<div style="width:' + pctI + '%;background:var(--warning);height:100%;"></div>' +
              '<div style="width:' + pctN + '%;background:var(--danger);height:100%;"></div>' +
              '<div style="width:' + pctP + '%;background:#cbd5e1;height:100%;"></div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:16px;">' +
            '<div class="act-date-badge"><i class="fas fa-calendar-alt" style="margin-right:5px;color:var(--text3);"></i>' + dateText + '</div>' +
            '<div style="text-align:right;min-width:52px;">' +
              '<div style="font-size:1.1rem;font-weight:800;color:' + pctColor + ';">' + pct + '%</div>' +
              '<div style="font-size:.62rem;color:var(--text3);font-weight:600;">cumplim.</div>' +
            '</div>' +
            editBtn +
          '</div>' +
        '</div>' +
      '</div>';
    }

    container.innerHTML = html;
    updateBulkDeleteButtonState();
  } catch (e) { showToast('Error al cargar monitoreo: ' + e.message, 'error'); }
}

function openMonModal(actId) {
  var grp = monitoreoData[actId];
  if (!grp) return;
  window._monCurrentActId = actId;
  window._monCurrentGroup = grp;

  // Header info
  var infoHtml = '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:200px;">' +
      '<div style="font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Actividad</div>' +
      '<div style="font-weight:800;font-size:.95rem;color:var(--text1);text-transform:uppercase;margin-bottom:6px;">' + grp.titulo + '</div>' +
      (grp.descripcion ? '<div style="font-size:.8rem;color:var(--text2);">' + grp.descripcion + '</div>' : '') +
      (grp.link_url ? '<div style="margin-top:6px;"><a href="' + grp.link_url + '" target="_blank" style="color:var(--primary);font-size:.78rem;font-weight:600;"><i class="fas fa-link" style="margin-right:4px;"></i>' + grp.link_url + '</a></div>' : '') +
    '</div>' +
    '<div style="flex-shrink:0;text-align:right;">' +
      '<div style="font-size:.68rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Fecha Límite</div>' +
      '<div style="font-weight:700;color:var(--text1);">' + (grp.fecha_limite ? new Date(grp.fecha_limite).toLocaleDateString('es-PE') : '-') + '</div>' +
      '<div style="margin-top:8px;font-size:.7rem;color:var(--text3);">Asignado por: <strong style="color:var(--text2);">' + (grp.asignador_nombre || '-') + '</strong></div>' +
    '</div>' +
  '</div>';

  document.getElementById('mon-modal-title').textContent = 'Monitoreo: ' + grp.titulo;
  document.getElementById('mon-modal-search').value = '';

  
  var canEditAct = (currentUser && (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez' || currentUser.id == grp.asignador_id));
  var btnImport = document.getElementById('btn-import-excel');
  var btnAddIes = document.getElementById('btn-add-ies-act');
  if (btnAddIes) {
    if (canEditAct) {
      btnAddIes.style.display = 'inline-block';
      btnAddIes.onclick = function() { abrirAgregarIEsModal(grp.id, grp.ies); };
    } else {
      btnAddIes.style.display = 'none';
    }
  }

  if (btnImport) {
    var canEditAct = (currentUser && (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez' || currentUser.id == grp.asignador_id));
    if (canEditAct) {
      btnImport.style.display = 'inline-block';
    } else {
      btnImport.style.display = 'none';
    }
  }

  document.getElementById('mon-modal-act-info').innerHTML = infoHtml;
  document.getElementById('mon-modal-search').value = '';

  // Render table rows
  renderMonModalRows(grp.ies, '');
  document.getElementById('mon-detail-modal').classList.add('show');
}

function renderMonModalRows(ies, filter) {
  var filtered = filter ? ies.filter(function(ie) {
    var q = filter.toLowerCase();
    return (ie.ie_nombre || '').toLowerCase().indexOf(q) !== -1 || (ie.ie_codigo || '').toLowerCase().indexOf(q) !== -1;
  }) : ies;

  var html = '';
  if (filtered.length === 0) {
    html = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3);">No se encontraron instituciones</td></tr>';
  } else {
    for (var j = 0; j < filtered.length; j++) {
      var ie = filtered[j];
      var badgeCls = ie.estado === 'completada' ? 'badge-completada' : ie.estado === 'no_cumplida' ? 'badge-no_cumplida' : ie.estado === 'inconclusa' ? 'badge-inconclusa' : 'badge-pendiente';
      var badge = '<span class="badge ' + badgeCls + '">' + (ie.estado || 'pendiente').replace('_',' ').toUpperCase() + '</span>';
      var btns = '';
      var canEdit = (currentUser && (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez' || currentUser.id == ie.asignador_id));
      if (canEdit) {
        if (ie.estado !== 'completada') {
          btns += '<button class="btn btn-xs btn-success me-1" onclick="monModalCambiarEstado(' + ie.id + ',\'completada\')" title="Marcar Completada" style="padding:5px 8px;"><i class="fas fa-check-circle"></i></button>';
        }
        btns += '<button class="btn btn-xs me-1" style="background:#f97316;color:#fff;padding:5px 8px;" onclick="monModalCambiarEstado(' + ie.id + ',\'inconclusa\')" title="Marcar Inconclusa"><i class="fas fa-times"></i></button>';
        btns += '<button class="btn btn-xs btn-danger" style="padding:5px 8px;" onclick="monModalEliminar(' + ie.id + ',' + ie.actividad_id + ')" title="Eliminar asignación"><i class="fas fa-trash-alt"></i></button>';
      } else {
        btns = '<span style="font-size:0.75rem; color:var(--text3);"><i class="fas fa-lock" title="No puedes editar actividades de otros"></i></span>';
      }
      html += '<tr>' +
        '<td style="padding:10px 22px;">' +
          '<div style="font-weight:700;font-size:.82rem;color:var(--text1);">' + (ie.ie_nombre || '-') + '</div>' +
          (ie.ie_nivel_nombre ? '<div style="font-size:.68rem;color:var(--text3);margin-top:1px;">' + ie.ie_nivel_nombre + '</div>' : '') +
        '</td>' +
        '<td style="padding:10px 16px;font-size:.78rem;font-weight:600;color:var(--text3);">' + (ie.ie_codigo || '-') + '</td>' +
        '<td style="padding:10px 16px;">' + badge +
          (ie.estado === 'inconclusa' ? '<div style="font-size:.68rem;color:#f97316;margin-top:3px;font-weight:600;"><i class="fas fa-info-circle" style="margin-right:3px;"></i>Se reflejará como inconclusa en el reporte</div>' : '') +
        '</td>' +
        '<td style="padding:10px 16px;text-align:center;white-space:nowrap;">' + btns + '</td>' +
      '</tr>';
    }
  }
  document.getElementById('mon-modal-tbody').innerHTML = html;
}

function filterMonModalTable(q) {
  // Find current open activity
  var modal = document.getElementById('mon-detail-modal');
  if (!modal.classList.contains('show')) return;
  var title = document.getElementById('mon-modal-title').textContent.replace('Monitoreo: ', '').trim();
  var grp = null;
  for (var id in monitoreoData) {
    if (monitoreoData[id].titulo === title) { grp = monitoreoData[id]; break; }
  }
  if (grp) renderMonModalRows(grp.ies, q);
}

async function monModalCambiarEstado(id, est) {
  // Completada: directo sin modal
  if (est === 'completada') {
    try {
      await api('/api/asignaciones/' + id + '/estado', { method: 'PUT', body: { estado: 'completada', notas_supervisor: '' } });
      showToast('Marcada como completada', 'success');
      var grp = window._monCurrentGroup;
      if (grp) { var ie = grp.ies.find(function(x){return x.id===id;}); if(ie) ie.estado='completada'; renderMonModalRows(grp.ies, ''); }
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
    return;
  }
  var title = 'Marcar INCONCLUSA';
  var btnCls = 'btn-warning';
  var placeholder = 'Escriba qué falta para cumplir la actividad...';
  showModal(title,
    '<div class="mb-3"><label class="form-label">Notas / Observaciones</label><textarea class="form-control" id="notas-supervisor" rows="3" placeholder="' + placeholder + '"></textarea></div>' +
    '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;font-size:.78rem;color:#c2410c;"><i class="fas fa-info-circle" style="margin-right:6px;"></i>Se reflejará como inconclusa en el reporte de cumplimiento.</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn ' + btnCls + '" onclick="monModalConfirmarEstado(' + id + ',\'' + est + '\')">Confirmar</button>');
}

async function monModalConfirmarEstado(id, est) {
  var n = document.getElementById('notas-supervisor').value.trim();
  if (est === 'inconclusa' && !n) { showToast('Debe ingresar qué falta para cumplir la actividad', 'error'); return; }
  try {
    await api('/api/asignaciones/' + id + '/estado', { method: 'PUT', body: { estado: est, notas_supervisor: n } });
    showToast('Estado actualizado', 'success');
    closeModal();
    await loadMonitoreo();
    // Re-open modal if still visible
    var modal = document.getElementById('mon-detail-modal');
    if (modal.classList.contains('show')) {
      var titleEl = document.getElementById('mon-modal-title').textContent.replace('Monitoreo: ', '').trim();
      for (var actId in monitoreoData) {
        if (monitoreoData[actId].titulo === titleEl) { openMonModal(parseInt(actId)); break; }
      }
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function monModalEliminar(asignacionId, actividadId) {
  showModal('Eliminar Asignación',
    '<p>¿Eliminar la asignación de esta IE? La actividad continuará para las demás IEs.</p>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="monModalConfirmarEliminar(' + asignacionId + ',' + actividadId + ')">Eliminar</button>');
}

async function monModalConfirmarEliminar(asignacionId, actividadId) {
  try {
    await api('/api/asignaciones/' + asignacionId, { method: 'DELETE' });
    showToast('Asignación eliminada con éxito', 'success');
    closeModal();
    await loadMonitoreo();
    var modal = document.getElementById('mon-detail-modal');
    if (modal.classList.contains('show')) {
      var titleEl = document.getElementById('mon-modal-title').textContent.replace('Monitoreo: ', '').trim();
      for (var actId in monitoreoData) {
        if (monitoreoData[actId].titulo === titleEl) { openMonModal(parseInt(actId)); break; }
      }
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function toggleMonGroup(actId) {
  // Legacy stub — no longer used but kept for safety
}

async function eliminarAsignacion(asignacionId, actividadId) {
  showModal('Eliminar Asignación',
    '<p>¿Eliminar la asignación de esta IE? La actividad continuará para las demás IEs.</p>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger" onclick="confirmarEliminarAsignacion(' + asignacionId + ',' + actividadId + ')">Eliminar</button>');
}

async function confirmarEliminarAsignacion(asignacionId, actividadId) {
  try {
    // Delete just this assignment via the actividad delete? We need a dedicated endpoint.
    // Use bulk-delete on the actividad if it's the only one, otherwise we need to mark or use a workaround.
    // For now, call DELETE /api/actividades/:id only if single; otherwise show message.
    await api('/api/asignaciones/' + asignacionId + '/estado', { method: 'PUT', body: { estado: 'no_cumplida', notas_supervisor: 'Eliminado manualmente' } });
    showToast('Asignación marcada como no cumplida', 'success');
    closeModal();
    loadMonitoreo();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
 
async function cambiarEstadoAsignacion(id, est) {
  // Completada: directo sin modal
  if (est === 'completada') {
    try {
      await api('/api/asignaciones/' + id + '/estado', { method: 'PUT', body: { estado: 'completada', notas_supervisor: '' } });
      showToast('Marcada como completada', 'success');
      loadMonitoreo();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    return;
  }

  var title = est === 'no_cumplida' ? 'Marcar NO CUMPLIDA (VENCIDA)' : 'Marcar INCONCLUSA';
  var btnClass = est === 'no_cumplida' ? 'btn-danger' : 'btn-warning';
  var placeholder = est === 'inconclusa' ? 'Escriba qué es lo que falta para cumplir la actividad...' : 'Observaciones...';

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
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
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
    var linkChecked = act.link_url ? 'checked' : '';
    var linkDisplay = act.link_url ? 'block' : 'none';
    showModal('Editar Actividad',
      '<form id="editar-act-form">' +
      '<div class="mb-3"><label class="form-label">Título</label><input class="form-control" id="ea-titulo" value="' + (act.titulo || '').replace(/"/g,'&quot;') + '" oninput="this.value=this.value.toUpperCase()" style="text-transform:uppercase;"></div>' +
      '<div class="mb-3"><label class="form-label">Descripción <span style="font-size:0.75rem;color:#6b7280;font-weight:400;">(referencia interna)</span></label><textarea class="form-control" id="ea-descripcion" rows="2">' + (act.descripcion || '') + '</textarea></div>' +
      '<div class="mb-3"><label class="form-label">Fecha Límite</label><input type="date" class="form-control" id="ea-fecha" value="' + (act.fecha_limite || '') + '"></div>' +
      '<div class="mb-3"><label class="form-label">¿Incluye enlace?</label>' +
      '<div class="d-flex gap-3 mb-2"><div class="form-check"><input class="form-check-input" type="radio" name="ea-link-toggle" id="ea-link-no" value="no" ' + (act.link_url ? '' : 'checked') + ' onchange="document.getElementById(\'ea-link-box\').style.display=\'none\'"><label class="form-check-label" for="ea-link-no">No</label></div>' +
      '<div class="form-check"><input class="form-check-input" type="radio" name="ea-link-toggle" id="ea-link-si" value="si" ' + linkChecked + ' onchange="document.getElementById(\'ea-link-box\').style.display=\'block\'"><label class="form-check-label" for="ea-link-si">Sí</label></div></div>' +
      '<div id="ea-link-box" style="display:' + linkDisplay + ';"><input type="url" class="form-control" id="ea-link-url" value="' + (act.link_url || '') + '" placeholder="https://..."></div>' +
      '</div></form>',
      '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-danger me-auto" onclick="eliminarActividad(' + actividadId + ')"><i class="fas fa-trash"></i> Eliminar</button><button class="btn btn-primary" onclick="guardarEdicionActividad(' + actividadId + ')">Guardar</button>');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
async function guardarEdicionActividad(id) {
  var titulo = document.getElementById('ea-titulo').value.trim().toUpperCase();
  var descripcion = document.getElementById('ea-descripcion').value.trim();
  var fecha_limite = document.getElementById('ea-fecha').value;
  var linkSi = document.getElementById('ea-link-si') && document.getElementById('ea-link-si').checked;
  var link_url = linkSi ? (document.getElementById('ea-link-url').value.trim() || null) : null;
  if (!titulo || !fecha_limite) { showToast('Título y fecha límite son obligatorios', 'error'); return; }
  try {
    await api('/api/actividades/' + id, { method: 'PUT', body: { titulo, descripcion, fecha_limite, link_url, fecha_inicio: fecha_limite } });
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
    
    let renderedRows = 0;

    // Agrupar IEs por código local (una IE = un código local)
    const ieMap = {};
    const ieOrder = [];
    for (var i = 0; i < ies.length; i++) {
      var ie = ies[i];
      if (!ieMap[ie.codigo]) {
        ieMap[ie.codigo] = { ie: ie, niveles: [] };
        ieOrder.push(ie.codigo);
      }
      // Merge niveles filtrados
      (ie.niveles || []).forEach(function(nv) {
        if (!n || n === nv.clave) {
          // Avoid duplicates
          var already = ieMap[ie.codigo].niveles.some(function(x) { return x.nivel_id === nv.nivel_id; });
          if (!already) ieMap[ie.codigo].niveles.push(nv);
        }
      });
    }

    if (ieOrder.length > 0) {
      for (var i = 0; i < ieOrder.length; i++) {
        var entry = ieMap[ieOrder[i]];
        var ie = entry.ie;
        var nivelesIE = entry.niveles;

        // Skip if filter active and no matching niveles
        if (n && nivelesIE.length === 0) continue;

        let actionCell = '';
        if (currentUser && currentUser.rol === 'admin') {
          actionCell = `<td style="text-align:center;vertical-align:top;padding-top:14px;">
            <button class="btn btn-xs btn-outline me-1" onclick="abrirModalIE(${ie.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-xs btn-outline text-danger" onclick="eliminarIE(${ie.id}, '${ie.nombre.replace(/'/g, "\'")}')"><i class="fas fa-trash"></i></button>
          </td>`;
        }

        let zonaClass = 'bg-secondary';
        if (ie.ruralidad === 'URBANO') zonaClass = 'bg-success-light';
        else if (ie.ruralidad && ie.ruralidad.includes('RURAL 3')) zonaClass = 'bg-danger-light';
        else if (ie.ruralidad && ie.ruralidad.includes('RURAL 2')) zonaClass = 'bg-warning-light';
        else if (ie.ruralidad && ie.ruralidad.includes('RURAL 1')) zonaClass = 'bg-info-light';
        else if (ie.ruralidad === 'RURAL') zonaClass = 'bg-warning-light';

        let tipoClass = 'bg-neutral-light';
        if (ie.tipo === 'POLIDOCENTE COMPLETO') tipoClass = 'bg-primary-light';
        else if (ie.tipo === 'MULTIGRADO') tipoClass = 'bg-warning-light';
        else if (ie.tipo === 'UNIDOCENTE') tipoClass = 'bg-danger-light';

        // Nombre principal = primer nivel o el nombre de la IE
        var nombrePrincipal = ie.nombre;

        // Construir lista de niveles con código modular
        var nivelesHtml = '';
        if (nivelesIE.length > 0) {
          nivelesHtml = '<div style="margin-top:5px;display:flex;flex-direction:column;gap:3px;">';
          for (var j = 0; j < nivelesIE.length; j++) {
            var nv = nivelesIE[j];
            nivelesHtml +=
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span class="badge ' + (nv.color || 'bg-info-light') + '" style="font-size:0.63rem;padding:1px 6px;white-space:nowrap;">' + nv.nombre + '</span>' +
                (nv.codigo_modular && nv.codigo_modular !== '-'
                  ? '<span style="font-size:0.72rem;color:#64748b;">CM: <span style="font-weight:600;color:#475569;">' + nv.codigo_modular + '</span></span>'
                  : '<span style="font-size:0.72rem;color:#94a3b8;">Sin cód. modular</span>') +
              '</div>';
          }
          nivelesHtml += '</div>';
        } else {
          nivelesHtml = '<div style="margin-top:4px;"><span class="badge bg-neutral-light" style="font-size:0.63rem;">Sin nivel asignado</span></div>';
        }

        // Col 2: Código local + modulares
        var codigosHtml =
          '<div style="font-size:0.8rem;color:#64748b;">Local: <span style="font-weight:700;color:#334155;">' + ie.codigo + '</span></div>';
        if (nivelesIE.length > 1) {
          codigosHtml += '<div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">' + nivelesIE.length + ' servicios</div>';
        }

        html += '<tr>' +
          // Col #
          '<td style="vertical-align:top;text-align:center;padding-top:14px;font-size:0.78rem;font-weight:700;color:var(--text3);white-space:nowrap;">' + (renderedRows + 1) + '</td>' +
          // Col 1: Nombre + niveles
          '<td style="vertical-align:top;">' +
            '<div style="font-weight:700;color:#1e293b;font-size:0.88rem;line-height:1.3;">' + nombrePrincipal + '</div>' +
            '<div style="margin-top:3px;"><span class="badge ' + tipoClass + '" style="font-size:0.63rem;padding:1px 6px;">' + (ie.tipo || 'NO APLICA') + '</span></div>' +
            nivelesHtml +
          '</td>' +
          // Col 2: Códigos
          '<td style="vertical-align:top;white-space:nowrap;">' + codigosHtml + '</td>' +
          // Col 3: Ubicación
          '<td style="vertical-align:top;">' +
            '<div style="font-weight:500;color:#334155;font-size:0.82rem;line-height:1.25;">' + (ie.lugar || '-') + '</div>' +
            '<div style="font-size:0.76rem;color:#64748b;margin-top:2px;">' + (ie.distrito || '-') + ' / ' + (ie.provincia || '-') + '</div>' +
          '</td>' +
          // Col 4: Director
          '<td style="vertical-align:top;">' +
            '<div style="font-weight:600;color:#334155;font-size:0.82rem;">' + (ie.director_nombre || 'Sin director') + '</div>' +
            '<div style="font-size:0.76rem;color:#64748b;margin-top:2px;display:flex;flex-direction:column;gap:1px;line-height:1.2;">' +
              (ie.director_telefono ? '<span><i class="fas fa-phone-alt" style="font-size:0.7rem;width:12px;color:#94a3b8;"></i> ' + ie.director_telefono + '</span>' : '') +
              (ie.director_email ? '<span><i class="far fa-envelope" style="font-size:0.7rem;width:12px;color:#94a3b8;"></i> ' + ie.director_email + '</span>' : '') +
            '</div>' +
          '</td>' +
          // Col 5: Zona
          '<td style="vertical-align:top;">' +
            '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">' +
              '<span class="badge ' + zonaClass + '" style="font-size:0.68rem;padding:2px 6px;">' + (ie.ruralidad || 'URBANO') + '</span>' +
              '<span class="bg-success-pill" style="font-size:0.65rem;padding:1px 6px;">Activa</span>' +
            '</div>' +
          '</td>' +
          actionCell +
          '</tr>';
        renderedRows++;
      }
    }
    
    if (renderedRows === 0) {
      const colSpan = (currentUser && currentUser.rol === 'admin') ? 6 : 5;
      html = '<tr class="empty"><td colspan="' + colSpan + '">No hay IEs</td></tr>';
    }

    document.getElementById('ies-table').innerHTML = html;

    // Resumen de conteo por nivel (dinámico)
    var counts = {};
    for (var k = 0; k < ies.length; k++) {
      (ies[k].niveles || []).forEach(function(nv) { counts[nv.nombre] = (counts[nv.nombre] || 0) + 1; });
    }
    var resumenHtml = '';
    (window.nivelesCache || []).forEach(function(nv) {
      if (counts[nv.nombre]) {
        resumenHtml += '<span class="badge ' + (nv.color || 'bg-info-light') + '" style="font-size:0.78rem;padding:4px 10px;border-radius:12px;">' + nv.nombre + ': <strong>' + counts[nv.nombre] + '</strong></span>';
      }
    });
    document.getElementById('ie-resumen-niveles').innerHTML = resumenHtml;
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
      if (p.rol === 'admin') { loadSystemSettings(); }
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

// ===================== CONTROL MENSUAL (D6) =====================
async function loadControlMensual() {
  var mes = document.getElementById('ctrl-mes') ? document.getElementById('ctrl-mes').value : new Date().getMonth() + 1;
  var anio = document.getElementById('ctrl-anio') ? document.getElementById('ctrl-anio').value : new Date().getFullYear();
  var tbody = document.getElementById('ctrl-mensual-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
  try {
    var d = await api('/api/asignaciones?mes=' + mes + '&anio=' + anio);
    var rows = d.asignaciones || d || [];
    // Group by actividad
    var actMap = {};
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i];
      var actId = a.actividad_id;
      if (!actMap[actId]) {
        actMap[actId] = { titulo: a.actividad_titulo || '-', completadas: 0, inconclusas: 0, no_cumplidas: 0, pendientes: 0, total: 0 };
      }
      actMap[actId].total++;
      if (a.estado === 'completada') actMap[actId].completadas++;
      else if (a.estado === 'inconclusa') actMap[actId].inconclusas++;
      else if (a.estado === 'no_cumplida') actMap[actId].no_cumplidas++;
      else actMap[actId].pendientes++;
    }
    var ids = Object.keys(actMap);
    if (ids.length === 0) {
      tbody.innerHTML = '<tr class="empty"><td colspan="7">No hay actividades para este período</td></tr>';
      return;
    }
    var html = '';
    for (var k = 0; k < ids.length; k++) {
      var g = actMap[ids[k]];
      var pct = g.total > 0 ? Math.round(g.completadas / g.total * 100) : 0;
      var pctColor = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
      html += '<tr>' +
        '<td style="font-weight:600;color:var(--text1);">' + g.titulo + '</td>' +
        '<td style="text-align:center;font-weight:700;">' + g.total + '</td>' +
        '<td style="text-align:center;"><span style="color:var(--success);font-weight:700;">' + g.completadas + '</span></td>' +
        '<td style="text-align:center;"><span style="color:var(--warning);font-weight:700;">' + g.inconclusas + '</span></td>' +
        '<td style="text-align:center;"><span style="color:var(--danger);font-weight:700;">' + g.no_cumplidas + '</span></td>' +
        '<td style="text-align:center;"><span style="color:var(--text3);font-weight:700;">' + g.pendientes + '</span></td>' +
        '<td style="text-align:center;"><span style="color:' + pctColor + ';font-weight:800;">' + pct + '%</span></td>' +
      '</tr>';
    }
    tbody.innerHTML = html;
  } catch(e) {
    tbody.innerHTML = '<tr class="empty"><td colspan="7">Error al cargar datos</td></tr>';
  }
}

function descargarCtrlExcel() {
  var mes = document.getElementById('ctrl-mes') ? document.getElementById('ctrl-mes').value : new Date().getMonth() + 1;
  var anio = document.getElementById('ctrl-anio') ? document.getElementById('ctrl-anio').value : new Date().getFullYear();
  descargarExcel('/api/export/asignaciones?mes=' + mes + '&anio=' + anio);
}

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
      var escapedNombre = ie.nombre.replace(/'/g, "\'");
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
    // Set ctrl-mes to current month on first load
    var ctrlMes = document.getElementById('ctrl-mes');
    if (ctrlMes && !ctrlMes.dataset.initialized) {
      ctrlMes.value = String(new Date().getMonth() + 1);
      ctrlMes.dataset.initialized = '1';
      var ctrlAnio = document.getElementById('ctrl-anio');
      if (ctrlAnio) ctrlAnio.value = String(new Date().getFullYear());
    }
    loadControlMensual();
    // Load dashboard stats cards
    try {
      await loadDashboardIEStats();
    } catch(se) { /* stats optional */ }

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

    // Populate actividad dropdown on first load
    var actSel = document.getElementById('dash-filtro-actividad');
    if (actSel && actSel.options.length <= 1) {
      var actMap = {};
      rows.forEach(function(a) {
        var id = a.actividad_id || a.id;
        var t = a.actividad_titulo || a.titulo || '';
        if (id && t && !actMap[id]) actMap[id] = t;
      });
      Object.keys(actMap).forEach(function(id) {
        var o = document.createElement('option');
        o.value = id; o.textContent = actMap[id];
        actSel.appendChild(o);
      });
    }

    var filtroActividad = (actSel && actSel.value) ? String(actSel.value) : '';
    var filtroMes = document.getElementById('dash-filtro-mes') ? document.getElementById('dash-filtro-mes').value : '';

    var filteredRows = rows.filter(function(a) {
      if (!a.fecha_limite) return false;
      if (filtroActividad) {
        var aid = String(a.actividad_id || a.id || '');
        if (aid !== filtroActividad) return false;
      }
      if (filtroMes) {
        var dateStr = typeof a.fecha_limite === 'string' ? a.fecha_limite.substring(0,10) : String(a.fecha_limite||'').substring(0,10);
        var mes = parseInt(dateStr.split('-')[1], 10);
        if (mes !== parseInt(filtroMes, 10)) return false;
      }
      return true;
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
    var inconclusas = 0;

    for (var i = 0; i < filteredRows.length; i++) {
      var a = filteredRows[i];
      if (a.estado === 'completada') cumplidas++;
      else if (a.estado === 'no_cumplida') vencidas++;
      else if (a.estado === 'inconclusa') inconclusas++;
      else pendientes++;
    }

    var total = filteredRows.length;
    var pct = total > 0 ? Math.round((cumplidas / total) * 100) : 0;

    var elC = document.getElementById('avance-kpi-cumplidas'); if (elC) elC.textContent = cumplidas;
    var elP = document.getElementById('avance-kpi-pendientes'); if (elP) elP.textContent = pendientes;
    var elI = document.getElementById('avance-kpi-inconclusas'); if (elI) elI.textContent = inconclusas;
    var elV = document.getElementById('avance-kpi-vencidas'); if (elV) elV.textContent = vencidas;
    var elPct = document.getElementById('avance-chart-pct'); if (elPct) elPct.textContent = pct + '%';

    var canvasEl = document.getElementById('chart-avance-mensual');
    if (!canvasEl) { throw new Error('canvas no encontrado'); }
    var ctx = canvasEl.getContext('2d');
    if (chartAvanceMensualObj) {
      chartAvanceMensualObj.destroy();
    }
    
    var dataVals = [];
    var dataColors = [];
    var dataLabels = [];

    if (cumplidas > 0) { dataVals.push(cumplidas); dataColors.push('#10b981'); dataLabels.push('Cumplido'); }
    if (pendientes > 0) { dataVals.push(pendientes); dataColors.push('#f59e0b'); dataLabels.push('Pendiente'); }
    if (inconclusas > 0) { dataVals.push(inconclusas); dataColors.push('#f97316'); dataLabels.push('Inconclusa'); }
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
    var selectedIEId = selectedAvanceIEId;
    if (selectedIEId && historicoCard) {
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
    } else if (historicoCard) {
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

    var badge = document.getElementById('avance-count-badge');
    if (badge) badge.textContent = activitiesList.length + ' Actividades';

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
    var actList = document.getElementById('avance-activities-list');
    if (actList) actList.innerHTML = listHtml;
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
        const passwordBtn = `<button class="btn btn-xs btn-outline" onclick="abrirModalCambiarPassword(${u.id}, '${u.nombre_completo.replace(/'/g, "\'")}')" title="Cambiar Contraseña"><i class="fas fa-key"></i> Pass</button>`;
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
  let ie = {
    codigo: '', nombre: '', niveles: [],
    ruralidad: 'URBANO', tipo: 'POLIDOCENTE COMPLETO', provincia: 'BELLAVISTA', distrito: '', lugar: '',
    director_nombre: '', director_email: '', director_telefono: ''
  };
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

  // Build dynamic nivel checkboxes
  const nivelesMap = {};
  (ie.niveles || []).forEach(function(nv) { nivelesMap[nv.nivel_id] = nv.codigo_modular || ''; });

  let nivelesGrid = '';
  (window.nivelesCache || []).forEach(function(nv) {
    const checked = nivelesMap.hasOwnProperty(nv.id) ? 'checked' : '';
    const cm = nivelesMap[nv.id] || '';
    const display = nivelesMap.hasOwnProperty(nv.id) ? 'block' : 'none';
    nivelesGrid += `
      <div>
        <label style="font-weight: 500;"><input type="checkbox" class="ie-nivel-cb" data-nivel-id="${nv.id}" ${checked} onchange="this.closest('div').querySelector('.ie-cm-input').style.display=this.checked?'block':'none';checkEbaOnly()"> ${nv.nombre}</label>
        <input type="text" class="form-control form-control-sm mt-1 ie-cm-input" data-nivel-id="${nv.id}" placeholder="Cód. Modular" value="${cm}" style="display: ${display};">
      </div>`;
  });

  const body = `
    <form id="ie-form" onsubmit="event.preventDefault()">
      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="form-label">Código Local *</label>
          <input type="text" class="form-control" id="form-ie-codigo" value="${ie.codigo}" required ${ieId ? 'readonly' : ''}>
        </div>
        <div class="col-md-6 mb-3">
          <label class="form-label">Nombre de la IE *</label>
          <input type="text" class="form-control" id="form-ie-nombre" value="${ie.nombre}" required>
        </div>
      </div>

      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="form-label">Zona (Ruralidad)</label>
          <select class="form-select" id="form-ie-ruralidad">
            <option value="URBANO" ${ie.ruralidad === 'URBANO' ? 'selected' : ''}>URBANO</option>
            <option value="RURAL" ${ie.ruralidad === 'RURAL' ? 'selected' : ''}>RURAL</option>
            <option value="RURAL 1" ${ie.ruralidad === 'RURAL 1' ? 'selected' : ''}>RURAL 1</option>
            <option value="RURAL 2" ${ie.ruralidad === 'RURAL 2' ? 'selected' : ''}>RURAL 2</option>
            <option value="RURAL 3" ${ie.ruralidad === 'RURAL 3' ? 'selected' : ''}>RURAL 3</option>
          </select>
        </div>
        <div class="col-md-6 mb-3">
          <label class="form-label">Tipo de IE</label>
          <select class="form-select" id="form-ie-tipo">
            <option value="POLIDOCENTE COMPLETO" ${ie.tipo === 'POLIDOCENTE COMPLETO' ? 'selected' : ''}>POLIDOCENTE COMPLETO</option>
            <option value="MULTIGRADO" ${ie.tipo === 'MULTIGRADO' ? 'selected' : ''}>MULTIGRADO</option>
            <option value="UNIDOCENTE" ${ie.tipo === 'UNIDOCENTE' ? 'selected' : ''}>UNIDOCENTE</option>
            <option value="NO APLICA" ${ie.tipo === 'NO APLICA' ? 'selected' : ''}>NO APLICA</option>
          </select>
        </div>
      </div>

      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Provincia</label>
          <input type="text" class="form-control" id="form-ie-provincia" value="${ie.provincia || ''}">
        </div>
        <div class="col-md-4">
          <label class="form-label">Distrito</label>
          <input type="text" class="form-control" id="form-ie-distrito" value="${ie.distrito || ''}">
        </div>
        <div class="col-md-4">
          <label class="form-label">Lugar</label>
          <input type="text" class="form-control" id="form-ie-lugar" value="${ie.lugar || ''}">
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label" style="font-weight:600;">Niveles Educativos y Códigos Modulares</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #f8fafc; padding: 12px; border-radius: 8px;" id="niveles-grid-container">
          ${nivelesGrid}
        </div>
        <div id="eba-only-notice" style="display:none;margin-top:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:.82rem;color:#1d4ed8;">
          <i class="fas fa-info-circle"></i> <strong>EBA Independiente:</strong> Se usará el <strong>código modular</strong> ingresado arriba como identificador único de esta IE. El código local ingresado es solo referencia. Esto permite tener EBA Avanzado y EBA Inicial/Intermedio como servicios separados con el mismo código local físico.
        </div>
      </div>

      <div style="border-top: 1px dashed #cbd5e1; margin: 20px 0;"></div>
      <div style="font-weight: 600; margin-bottom: 12px; color: var(--granate);"><i class="fas fa-user-tie"></i> Datos del Director</div>

      <div class="mb-3">
        <label class="form-label">Nombre Completo del Director</label>
        <input type="text" class="form-control" id="form-ie-director-nombre" value="${ie.director_nombre || ''}">
      </div>

      <div class="row">
        <div class="col-md-6 mb-3">
          <label class="form-label">Correo Electrónico</label>
          <input type="email" class="form-control" id="form-ie-director-email" value="${ie.director_email || ''}">
        </div>
        <div class="col-md-6 mb-3">
          <label class="form-label">Celular</label>
          <input type="text" class="form-control" id="form-ie-director-telefono" value="${ie.director_telefono || ''}">
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="btn-guardar-ie" onclick="this.disabled=true; this.textContent='Guardando...'; guardarIE(${ieId}).finally(() => { if(document.getElementById('btn-guardar-ie')) { document.getElementById('btn-guardar-ie').disabled=false; document.getElementById('btn-guardar-ie').textContent='Guardar'; } })">Guardar</button>
  `;

  showModal(title, body, footer);
}

function checkEbaOnly() {
  var notice = document.getElementById('eba-only-notice');
  if (!notice) return;
  var checked = document.querySelectorAll('.ie-nivel-cb:checked');
  if (checked.length === 0) { notice.style.display = 'none'; return; }
  var ebaClaves = (window.nivelesCache || []).filter(function(n){ return n.clave && n.clave.toLowerCase().includes('eba'); }).map(function(n){ return n.id; });
  var allEba = Array.from(checked).every(function(cb){ return ebaClaves.includes(parseInt(cb.dataset.nivelId)); });
  notice.style.display = allEba ? 'block' : 'none';
}

async function guardarIE(ieId = null) {
  const codigo = document.getElementById('form-ie-codigo').value.trim();
  const nombre = document.getElementById('form-ie-nombre').value.trim();
  const ruralidad = document.getElementById('form-ie-ruralidad').value;
  const tipo = document.getElementById('form-ie-tipo').value;
  const provincia = document.getElementById('form-ie-provincia').value.trim();
  const distrito = document.getElementById('form-ie-distrito').value.trim();
  const lugar = document.getElementById('form-ie-lugar').value.trim();
  const director_nombre = document.getElementById('form-ie-director-nombre').value.trim();
  const director_email = document.getElementById('form-ie-director-email').value.trim();
  const director_telefono = document.getElementById('form-ie-director-telefono').value.trim();

  if (!codigo || !nombre) {
    showToast('Código y Nombre son obligatorios', 'error');
    return;
  }

  // Collect niveles dynamically
  const nivelesArr = [];
  document.querySelectorAll('.ie-nivel-cb:checked').forEach(function(cb) {
    const nivelId = parseInt(cb.dataset.nivelId);
    const cmInput = document.querySelector('.ie-cm-input[data-nivel-id="' + nivelId + '"]');
    nivelesArr.push({ nivel_id: nivelId, codigo_modular: cmInput ? cmInput.value.trim() : '' });
  });

  const body = {
    codigo, nombre, ruralidad, tipo, provincia, distrito, lugar,
    director_nombre, director_email, director_telefono,
    niveles: nivelesArr
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

function exportarIEs() {
  window.location.href = '/api/export/instituciones';
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
// ===================== NIVELES =====================
window.nivelesCache = [];

async function loadNiveles() {
  try {
    var d = await api('/api/niveles');
    window.nivelesCache = (d || []).filter(function(n) { return n.activo; });
    // Populate filter dropdown
    var sel = document.getElementById('ie-nivel-filter');
    if (sel) {
      var html = '<option value="">Todos</option>';
      window.nivelesCache.forEach(function(n) {
        html += '<option value="' + n.clave + '">' + n.nombre + '</option>';
      });
      sel.innerHTML = html;
    }
  } catch(e) { window.nivelesCache = []; }
}

async function abrirModalNiveles() {
  const niveles = await api('/api/niveles');
  window.nivelesCache = niveles;
  let rows = '';
  niveles.forEach(function(n) {
    rows += `<tr>
      <td><span class="badge ${n.color || 'bg-info-light'}">${n.nombre}</span></td>
      <td style="font-size:0.8rem; color:#64748b;">${n.clave}</td>
      <td style="text-align:center;">
        <button class="btn btn-xs btn-outline me-1" onclick="editarNivel(${n.id}, '${n.nombre.replace(/'/g,"\'")}', '${n.color || 'bg-info-light'}', ${n.orden})"><i class="fas fa-edit"></i></button>
        <button class="btn btn-xs btn-outline text-danger" onclick="eliminarNivel(${n.id}, '${n.nombre.replace(/'/g,"\'")}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  });
  const body = `
    <div style="margin-bottom:12px;">
      <button class="btn btn-primary btn-sm" onclick="crearNivel()"><i class="fas fa-plus"></i> Nuevo Nivel</button>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:0.87rem;">
      <thead><tr style="border-bottom:2px solid #e2e8f0;">
        <th style="padding:6px 8px;">Nombre</th>
        <th style="padding:6px 8px;">Clave</th>
        <th style="padding:6px 8px; text-align:center;">Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  showModal('Gestión de Niveles Educativos', body, '<button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>');
}

async function crearNivel() {
  const nombre = prompt('Nombre del nuevo nivel (ej: Básica Alternativa - Avanzado):');
  if (!nombre || !nombre.trim()) return;
  const clave = prompt('Clave interna (solo letras minúsculas y guión bajo, ej: eba_avanzado):');
  if (!clave || !clave.trim()) return;
  const colores = ['bg-info-light','bg-primary-light','bg-success-light','bg-danger-light','bg-warning-light','bg-neutral-light','bg-purple-light','bg-eba-light'];
  const color = prompt('Color del badge (' + colores.join(', ') + '):', 'bg-info-light') || 'bg-info-light';
  try {
    await api('/api/niveles', { method: 'POST', body: { nombre: nombre.trim(), clave: clave.trim(), color, orden: 99 } });
    showToast('Nivel creado', 'success');
    abrirModalNiveles();
    loadNiveles();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function editarNivel(id, nombreActual, colorActual, ordenActual) {
  const nombre = prompt('Nombre del nivel:', nombreActual);
  if (!nombre || !nombre.trim()) return;
  const colores = ['bg-info-light','bg-primary-light','bg-success-light','bg-danger-light','bg-warning-light','bg-neutral-light','bg-purple-light','bg-eba-light'];
  const color = prompt('Color (' + colores.join(', ') + '):', colorActual) || colorActual;
  const orden = parseInt(prompt('Orden (número para ordenar):', ordenActual)) || ordenActual;
  try {
    await api('/api/niveles/' + id, { method: 'PUT', body: { nombre: nombre.trim(), color, orden } });
    showToast('Nivel actualizado', 'success');
    abrirModalNiveles();
    loadNiveles();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

async function eliminarNivel(id, nombre) {
  if (!confirm('¿Eliminar el nivel "' + nombre + '"? Solo es posible si ninguna IE lo tiene asignado.')) return;
  try {
    await api('/api/niveles/' + id, { method: 'DELETE' });
    showToast('Nivel eliminado', 'success');
    abrirModalNiveles();
    loadNiveles();
  } catch(err) { showToast('Error: ' + err.message, 'error'); }
}

// ===================== DASHBOARD IE STATS =====================
var dashIEFilters = { nivel: '', zona: '', tipo: '' };

async function loadDashboardIEStats() {
  var sc = document.getElementById('dashboard-stats-cards');
  if (!sc) return;
  var qs = new URLSearchParams();
  if (dashIEFilters.nivel) qs.set('nivel', dashIEFilters.nivel);
  if (dashIEFilters.zona) qs.set('zona', dashIEFilters.zona);
  if (dashIEFilters.tipo) qs.set('tipo', dashIEFilters.tipo);
  var stats = await api('/api/dashboard/stats?' + qs.toString());

  // Build KPI row 1
  var kpiHtml =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:20px;">' +
      '<div class="kpi-card-v2" style="border-left-color:#6366f1;">' +
        '<div style="flex:1;"><div class="kpi-lbl">Locales Educativos</div><div class="kpi-num">' + (stats.total_instituciones || 0) + '</div><div class="kpi-sub">IEs por código local (sin PRONOEI)</div></div>' +
        '<i class="fas fa-school kpi-icon-bg"></i>' +
      '</div>' +
      '<div class="kpi-card-v2" style="border-left-color:#10b981;">' +
        '<div style="flex:1;"><div class="kpi-lbl">Servicios Educativos</div><div class="kpi-num" style="color:#10b981;">' + (stats.total_servicios || 0) + '</div><div class="kpi-sub">Códigos modulares (sin PRONOEI)</div></div>' +
        '<i class="fas fa-graduation-cap kpi-icon-bg"></i>' +
      '</div>' +
      '<div class="kpi-card-v2" style="border-left-color:#7c3aed;">' +
        '<div style="flex:1;"><div class="kpi-lbl">Total PRONOEI</div><div class="kpi-num" style="color:#7c3aed;">' + (stats.total_pronoei || 0) + '</div><div class="kpi-sub">Programas no escolarizados</div></div>' +
        '<i class="fas fa-child kpi-icon-bg"></i>' +
      '</div>' +
    '</div>';

  // Row 2: two charts side by side
  var chartsHtml =
    '<div class="dash-grid" style="margin-bottom:20px;">' +
      '<div class="chart-card"><div class="chart-title"><i class="fas fa-map-marker-alt" style="color:var(--primary);margin-right:6px;"></i>Distribución por Zona</div><div class="chart-wrap" style="height:240px;position:relative;"><canvas id="chart-zona-dash"></canvas></div></div>' +
      '<div class="chart-card"><div class="chart-title"><i class="fas fa-sitemap" style="color:var(--primary);margin-right:6px;"></i>IEs por Tipo</div><div class="chart-wrap" style="height:240px;position:relative;"><canvas id="chart-tipo-dash"></canvas></div></div>' +
    '</div>';

  // Row 3: filter bar + download
  var nivelesOpts = '<option value="">Todos los niveles</option>';
  if (window.nivelesCache) {
    window.nivelesCache.filter(function(n){ return n.clave !== 'pronoei'; }).forEach(function(n){
      nivelesOpts += '<option value="' + n.clave + '"' + (dashIEFilters.nivel === n.clave ? ' selected' : '') + '>' + n.nombre + '</option>';
    });
  }
  var zonaOpts = ['','URBANO','RURAL','RURAL 1','RURAL 2','RURAL 3'].map(function(z){
    return '<option value="' + z + '"' + (dashIEFilters.zona === z ? ' selected' : '') + '>' + (z || 'Todas las zonas') + '</option>';
  }).join('');
  var tipoOpts = ['','POLIDOCENTE COMPLETO','MULTIGRADO','UNIDOCENTE'].map(function(t){
    return '<option value="' + t + '"' + (dashIEFilters.tipo === t ? ' selected' : '') + '>' + (t || 'Todos los tipos') + '</option>';
  }).join('');

  var filterHtml =
    '<div class="filter-bar" style="margin-bottom:20px;">' +
      '<div class="filter-group"><label>Nivel</label><select class="form-select" onchange="dashIEFilters.nivel=this.value;loadDashboardIEStats()">' + nivelesOpts + '</select></div>' +
      '<div class="filter-group"><label>Zona</label><select class="form-select" onchange="dashIEFilters.zona=this.value;loadDashboardIEStats()">' + zonaOpts + '</select></div>' +
      '<div class="filter-group"><label>Tipo</label><select class="form-select" onchange="dashIEFilters.tipo=this.value;loadDashboardIEStats()">' + tipoOpts + '</select></div>' +
      '<div class="filter-group" style="justify-content:flex-end;margin-top:auto;">' +
        '<button class="btn btn-outline-success btn-sm" onclick="descargarExcelIEs()"><i class="fas fa-file-excel"></i> Descargar Lista de IEs</button>' +
      '</div>' +
    '</div>';

  sc.innerHTML = kpiHtml + chartsHtml + filterHtml;

  // Render Zona donut chart
  var zonaLabels = Object.keys(stats.por_zona || {});
  var zonaData = Object.values(stats.por_zona || {});
  var zonaColors = ['#10b981','#f59e0b','#3b82f6','#8b5cf6','#ef4444','#06b6d4','#f97316'];
  if (window.chartZona) { try { window.chartZona.destroy(); } catch(e){} }
  var ctxZona = document.getElementById('chart-zona-dash');
  if (ctxZona && zonaLabels.length > 0) {
    window.chartZona = new Chart(ctxZona.getContext('2d'), {
      type: 'doughnut',
      data: { labels: zonaLabels, datasets: [{ data: zonaData, backgroundColor: zonaColors.slice(0, zonaLabels.length), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 11 }, boxWidth: 12 } } }
      }
    });
  }

  // Render Tipo horizontal bar chart
  var tipoLabels = Object.keys(stats.por_tipo || {});
  var tipoData = Object.values(stats.por_tipo || {});
  var tipoColors = { 'POLIDOCENTE COMPLETO': '#6366f1', 'MULTIGRADO': '#f59e0b', 'UNIDOCENTE': '#ef4444', 'NO APLICA': '#94a3b8' };
  var tipoBgs = tipoLabels.map(function(l){ return tipoColors[l] || '#94a3b8'; });
  if (window.chartTipo) { try { window.chartTipo.destroy(); } catch(e){} }
  var ctxTipo = document.getElementById('chart-tipo-dash');
  if (ctxTipo && tipoLabels.length > 0) {
    window.chartTipo = new Chart(ctxTipo.getContext('2d'), {
      type: 'bar',
      data: { labels: tipoLabels, datasets: [{ data: tipoData, backgroundColor: tipoBgs, borderRadius: 4, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }
}

function descargarExcelIEs() {
  var qs = new URLSearchParams();
  if (dashIEFilters.nivel) qs.set('nivel', dashIEFilters.nivel);
  if (dashIEFilters.zona) qs.set('zona', dashIEFilters.zona);
  if (dashIEFilters.tipo) qs.set('tipo', dashIEFilters.tipo);
  descargarExcel('/api/export/instituciones?' + qs.toString());
}

// ===================== CONSOLIDADO =====================
var currentConsoladoActividadId = null;

async function loadConsolidado() {
  var listEl = document.getElementById('consol-list');
  if (!listEl) return;
  poblarIEDatalist();
  var buscar = (document.getElementById('consol-buscar') || {}).value || '';
  var ieBuscar = (document.getElementById('consol-ie-buscar') || {}).value || '';
  var mes = (document.getElementById('consol-mes') || {}).value || '';
  var anio = (document.getElementById('consol-anio') || {}).value || '';
  var estadoFilter = (document.getElementById('consol-estado-filter') || {}).value || '';

  var qs = new URLSearchParams();
  if (buscar) qs.set('buscar', buscar);
  if (mes) qs.set('mes', mes);
  if (anio) qs.set('anio', anio);

  try {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">Cargando...</div>';
    var rows = await api('/api/consolidado?' + qs.toString());
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);">No se encontraron actividades.</div>';
      return;
    }

    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var html = '';
    rows.forEach(function(r) {
      // If IE buscar filter active, skip if not matching (client-side)
      // (IE filter is applied in detail modal; here we show all activities)
      var fecha = r.fecha_limite ? r.fecha_limite.substring(0,10) : '';
      var parts = fecha.split('-');
      var mesLabel = parts[1] ? (meses[parseInt(parts[1],10)-1] + ' ' + parts[0]) : '';
      var total = parseInt(r.total) || 0;
      var completadas = parseInt(r.completadas) || 0;
      var inconclusas = parseInt(r.inconclusas) || 0;
      var noCumplidas = parseInt(r.no_cumplidas) || 0;
      var pendientes = parseInt(r.pendientes) || 0;
      var pct = total > 0 ? Math.round(completadas / total * 100) : 0;

      // Filter by estado if set
      if (estadoFilter) {
        if (estadoFilter === 'completada' && completadas === 0) return;
        if (estadoFilter === 'inconclusa' && inconclusas === 0) return;
        if (estadoFilter === 'no_cumplida' && noCumplidas === 0) return;
        if (estadoFilter === 'pendiente' && pendientes === 0) return;
      }

      html +=
        '<div class="consol-row" onclick="abrirDetalleConsolidado(' + r.id + ',\'' + (r.titulo||'').replace(/'/g,"\'") + '\',\'' + fecha + '\',\'' + (r.descripcion||'').replace(/'/g,"\'").replace(/\n/g,' ') + '\')">' +
          (mesLabel ? '<span style="background:#f1f5f9;border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:.7rem;font-weight:700;color:var(--text2);flex-shrink:0;">' + mesLabel + '</span>' : '') +
          '<div style="flex:1;min-width:180px;">' +
            '<div class="cr-title">' + (r.titulo || '') + '</div>' +
            '<div class="cr-meta">Asignado por: ' + (r.asignador_nombre || '—') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<span style="font-size:.72rem;font-weight:600;color:var(--text3);">' + total + ' IEs</span>' +
            (completadas > 0 ? '<span class="badge badge-completada">' + completadas + ' Completadas</span>' : '') +
            (inconclusas > 0 ? '<span class="badge badge-inconclusa">' + inconclusas + ' Inconclusas</span>' : '') +
            (noCumplidas > 0 ? '<span class="badge badge-no_cumplida">' + noCumplidas + ' No Cumplidas</span>' : '') +
            (pendientes > 0 ? '<span class="badge badge-pendiente">' + pendientes + ' Pendientes</span>' : '') +
            '<span style="font-size:.75rem;font-weight:700;color:var(--primary);">' + pct + '%</span>' +
          '</div>' +
          '<i class="fas fa-chevron-right" style="color:var(--text3);font-size:.75rem;flex-shrink:0;"></i>' +
        '</div>';
    });

    listEl.innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--text3);">No hay actividades con ese filtro.</div>';
  } catch(e) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger);">Error al cargar: ' + e.message + '</div>';
  }
}

function abrirDetalleConsolidado(id, titulo, fecha, desc) {
  currentConsoladoActividadId = id;
  document.getElementById('consol-modal-title').textContent = titulo;
  var fechaFmt = fecha ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-PE', {day:'2-digit',month:'long',year:'numeric'}) : '';
  document.getElementById('consol-modal-meta').innerHTML =
    (fechaFmt ? '<span><i class="fas fa-calendar" style="margin-right:5px;color:var(--primary);"></i>Fecha límite: <strong>' + fechaFmt + '</strong></span>' : '') +
    (desc ? '<div style="margin-top:6px;color:var(--text2);">' + desc + '</div>' : '');
  document.getElementById('consol-det-buscar').value = '';
  document.getElementById('consol-det-estado').value = '';
  document.getElementById('modal-consolidado-detalle').classList.add('show');
  loadConsolidadoDetalle();
}

async function loadConsolidadoDetalle() {
  var tbody = document.getElementById('consol-det-tbody');
  if (!tbody || !currentConsoladoActividadId) return;
  var buscar = (document.getElementById('consol-det-buscar') || {}).value || '';
  var estado = (document.getElementById('consol-det-estado') || {}).value || '';
  var qs = new URLSearchParams();
  if (buscar) qs.set('buscar', buscar);
  if (estado) qs.set('estado', estado);
  try {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);">Cargando...</td></tr>';
    var rows = await api('/api/consolidado/' + currentConsoladoActividadId + '?' + qs.toString());
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);">Sin resultados.</td></tr>';
      return;
    }
    var html = '';
    rows.forEach(function(r, i) {
      var fechaComp = r.fecha_completado ? new Date(r.fecha_completado).toLocaleDateString('es-PE') : '—';
      html += '<tr>' +
        '<td style="padding:9px 12px;font-size:.8rem;border-bottom:1px solid #f1f5f9;">' + (i+1) + '</td>' +
        '<td style="padding:9px 12px;font-size:.8rem;border-bottom:1px solid #f1f5f9;font-weight:600;">' + (r.ie_nombre || '') + '</td>' +
        '<td style="padding:9px 12px;font-size:.8rem;border-bottom:1px solid #f1f5f9;">' + (r.ie_codigo || '') + '</td>' +
        '<td style="padding:9px 12px;font-size:.75rem;border-bottom:1px solid #f1f5f9;color:var(--text3);">' + (r.nivel_nombre || '—') + '</td>' +
        '<td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;"><span class="badge badge-' + (r.estado||'pendiente') + '">' + (r.estado||'pendiente') + '</span></td>' +
        '<td style="padding:9px 12px;font-size:.8rem;border-bottom:1px solid #f1f5f9;color:var(--text3);">' + fechaComp + '</td>' +
        '<td style="padding:9px 12px;font-size:.78rem;border-bottom:1px solid #f1f5f9;color:var(--text2);max-width:200px;">' + (r.notas_supervisor || '—') + '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--danger);">Error: ' + e.message + '</td></tr>';
  }
}

function descargarConsolidadoExcel() {
  var id = window._monCurrentActId || currentConsoladoActividadId;
  if (!id) return;
  descargarExcel('/api/export/consolidado/' + id);
}

function descargarConsolidadoGlobal() {
  var qs = new URLSearchParams();
  var fi = (document.getElementById('consol-fecha-inicio') || {}).value || '';
  var ff = (document.getElementById('consol-fecha-fin') || {}).value || '';
  var mes = (document.getElementById('consol-mes') || {}).value || '';
  var anio = (document.getElementById('consol-anio') || {}).value || '';
  if (fi) qs.set('fecha_inicio', fi);
  if (ff) qs.set('fecha_fin', ff);
  if (mes) qs.set('mes', mes);
  if (anio) qs.set('anio', anio);
  descargarExcel('/api/export/consolidado-global?' + qs.toString());
}

// Populate IE datalist for the IE report section
var _consolIEList = [];
async function poblarIEDatalist() {
  try {
    if (_consolIEList.length) return;
    var ies = await api('/api/ies');
    _consolIEList = ies || [];
    var dl = document.getElementById('consol-ie-datalist');
    if (!dl) return;
    dl.innerHTML = _consolIEList.map(function(ie) {
      return '<option value="' + (ie.codigo || '') + '">' + (ie.nombre || '') + '</option>';
    }).join('');
  } catch(e) {}
}

function filtrarIEDatalist(val) {
  // just trigger datalist, native browser handles filtering
}

function descargarReporteIE() {
  var codigo = (document.getElementById('consol-ie-codigo') || {}).value || '';
  if (!codigo) { alert('Ingrese un código o nombre de IE'); return; }
  // If user typed a name instead of code, try to find code from list
  var match = _consolIEList.find(function(ie) { return ie.nombre === codigo || ie.codigo === codigo; });
  var ieCode = match ? match.codigo : codigo;
  var qs = new URLSearchParams({ ie_codigo: ieCode });
  var desde = (document.getElementById('consol-ie-desde') || {}).value || '';
  var hasta = (document.getElementById('consol-ie-hasta') || {}).value || '';
  if (desde) qs.set('fecha_inicio', desde);
  if (hasta) qs.set('fecha_fin', hasta);
  descargarExcel('/api/export/consolidado-ie?' + qs.toString());
}

checkSession();

// ===================== CAP =====================
var capDataGlobal = [];

async function capInitView() {
  var isAdmin = currentUser && (currentUser.rol === 'admin' || currentUser.usuario === 'tony.fernandez');
  var uploadSec = document.getElementById('cap-upload-section');
  if (uploadSec) uploadSec.style.display = isAdmin ? 'block' : 'none';
  
  if (!allDirectores || allDirectores.length === 0) {
    try {
      var d = await api('/api/directores');
      allDirectores = d.directores || d || [];
    } catch(e) {}
  }

  // Load data from server if not yet loaded
  if (!capDataGlobal.length) {
    await capCargarDelServidor();
  }
  capVolverBusqueda();
}

async function capCargarDelServidor() {
  try {
    var r = await api('/api/cap/data');
    if (r && Array.isArray(r.datos) && r.datos.length) {
      capDataGlobal = r.datos;
      var msg = document.getElementById('cap-status-msg');
      if (msg) {
        var fecha = r.updated_at ? new Date(r.updated_at).toLocaleDateString('es-PE') : '';
        msg.textContent = '✓ ' + capDataGlobal.length + ' registros cargados' + (fecha ? ' (' + fecha + ')' : '') + (r.subido_por ? ' — por ' + r.subido_por : '');
        msg.style.color = '#10b981';
      }
    }
  } catch(e) { /* Silencioso */ }
}

function capVolverBusqueda() {
  document.getElementById('cap-search-panel').style.display = 'block';
  document.getElementById('cap-report-panel').style.display = 'none';
  capBuscar();
}

function capProcesarExcel() {
  var input = document.getElementById('cap-archivo-nexus');
  var msg = document.getElementById('cap-status-msg');
  if (!input.files.length) {
    msg.textContent = 'Selecciona un archivo Excel primero.';
    msg.style.color = '#dc2626';
    return;
  }
  msg.textContent = 'Procesando...';
  msg.style.color = '#6366f1';
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = new Uint8Array(e.target.result);
      var wb = XLSX.read(data, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      var headerRow = -1;
      for (var i = 0; i < Math.min(15, raw.length); i++) {
        var rowStr = raw[i].join('').toUpperCase();
        if (rowStr.includes('CODMOD I.E.') || rowStr.includes('CODIGO DE PLAZA')) {
          headerRow = i; break;
        }
      }
      var rows = [];
      if (headerRow !== -1) {
        var headers = raw[headerRow];
        for (var j = headerRow + 1; j < raw.length; j++) {
          if (raw[j].join('').trim() === '') continue;
          var obj = {};
          headers.forEach(function(h, idx) { if (h && h.toString().trim()) obj[h.toString().trim()] = raw[j][idx]; });
          rows.push(obj);
        }
      } else {
        rows = XLSX.utils.sheet_to_json(ws);
      }
      capDataGlobal = rows;
      capBuscar();
      msg.textContent = 'Guardando en servidor...';
      msg.style.color = '#6366f1';
      fetch('/api/cap/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datos: rows })
      }).then(function(r){ return r.json().then(function(j){ return {ok: r.ok, j: j}; }); })
        .then(function(res) {
          if (res.ok) {
            msg.textContent = '✓ ' + rows.length + ' registros guardados. Todos los usuarios pueden verlos.';
            msg.style.color = '#10b981';
          } else {
            msg.textContent = '✓ Cargado. Error al guardar: ' + (res.j.error || '');
            msg.style.color = '#f59e0b';
          }
        }).catch(function() {
          msg.textContent = '✓ ' + rows.length + ' registros cargados localmente.';
          msg.style.color = '#f59e0b';
        });
    } catch(err) {
      msg.textContent = 'Error al leer el Excel: ' + err.message;
      msg.style.color = '#dc2626';
    }
  };
  reader.readAsArrayBuffer(input.files[0]);
}

function capBuscar() {
  var tbody = document.getElementById('cap-tbody-resultados');
  if (!tbody) return;
  if (!capDataGlobal.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">Carga la DATA NEXUS para empezar a buscar.</td></tr>';
    return;
  }
  var valIE = (document.getElementById('cap-input-ie').value || '').toUpperCase().trim();
  var valMod = (document.getElementById('cap-input-modular').value || '').trim();
  var valPlaza = (document.getElementById('cap-input-plaza').value || '').toUpperCase().trim();

  var filtered = capDataGlobal.filter(function(f) {
    var plaza = (f['CODIGO DE PLAZA'] || '').toString().trim().toUpperCase();
    if (plaza.startsWith('T9') || plaza.startsWith('C9')) return false;
    if ((f['SUB-TIPO DE TRABAJADOR'] || '').toString().trim().toUpperCase() === 'PEC') return false;
    var ieNombre = (f['NOMBRE DE LA INSTITUCION EDUCATIVA'] || '').toString().toUpperCase();
    var codMod = (f['CODMOD I.E.'] || '').toString();
    return (!valIE || ieNombre.includes(valIE)) &&
           (!valMod || codMod.includes(valMod)) &&
           (!valPlaza || plaza.includes(valPlaza));
  });

  var seen = new Set();
  var html = '';
  filtered.forEach(function(f) {
    var key = (f['CODMOD I.E.'] || '') + '||' + (f['NIVEL EDUCATIVO'] || '');
    if (!seen.has(key) && f['CODMOD I.E.']) {
      seen.add(key);
      var cm = (f['CODMOD I.E.'] || '').toString().replace(/'/g, '');
      var nv = (f['NIVEL EDUCATIVO'] || '').toString().replace(/'/g, '');
      var directorMatch = allDirectores.find(function(d) { return d.ie_cod == cm; });
      var dDni = directorMatch ? (directorMatch.dni || '-') : '-';
      var dEmail = directorMatch ? (directorMatch.email || '-') : '-';
      var dCel = directorMatch ? (directorMatch.telefono || '-') : '-';
      html += '<tr>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">' + f['CODMOD I.E.'] + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">' + (f['NOMBRE DE LA INSTITUCION EDUCATIVA'] || '') + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">' + (f['NIVEL EDUCATIVO'] || '') + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:.8rem;">' + dDni + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:.8rem;">' + dEmail + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:.8rem;">' + dCel + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:.78rem;color:var(--text3);">' + (f['NOMBRE DEL ORGANO INTERMEDIO'] || '') + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">' +
          '<button class="btn btn-primary btn-sm" onclick="capGenerarReporte(\'' + cm + '\',\'' + nv + '\')"><i class="fas fa-eye"></i> Ver CAP</button>' +
        '</td></tr>';
    }
  });
  if (!html) html = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3);">No se encontraron resultados.</td></tr>';
  tbody.innerHTML = html;
}

function capGenerarReporte(codMod, nivel) {
  document.getElementById('cap-search-panel').style.display = 'none';
  document.getElementById('cap-report-panel').style.display = 'block';

  var plazas = capDataGlobal.filter(function(f) {
    var p = (f['CODIGO DE PLAZA'] || '').toString().trim().toUpperCase();
    return f['CODMOD I.E.'] == codMod &&
           f['NIVEL EDUCATIVO'] == nivel &&
           (f['SUB-TIPO DE TRABAJADOR'] || '').toString().trim().toUpperCase() !== 'PEC' &&
           !p.startsWith('T9') && !p.startsWith('C9');
  });

  var contenedor = document.getElementById('cap-contenedor-reporte');
  if (!plazas.length) {
    contenedor.innerHTML = '<p style="padding:20px;color:var(--text3);">No hay plazas válidas (se excluyeron PEC, T9 y C9).</p>';
    return;
  }

  window.currentCapReporteData = plazas;
  window.currentCapReporteIE = plazas[0] ? plazas[0]['NOMBRE DE LA INSTITUCION EDUCATIVA'] : 'IE';
  window.currentCapReporteNivel = nivel;

  var ordenSubtipos = ['DIRECTIVO','JERARQUICO','DOCENTE','AUXILIAR DE EDUCACION',
    'ESPECIALISTAS ADMINISTRATIVOS E INSTITUCIONALES DE LAS UGEL','AUXILIAR','TECNICO'];

  var grupos = {};
  plazas.forEach(function(p) {
    var st = (p['SUB-TIPO DE TRABAJADOR'] || 'OTROS').toString().trim().toUpperCase();
    if (!grupos[st]) grupos[st] = [];
    grupos[st].push(p);
  });

  var conteo = {};
  plazas.forEach(function(p) {
    var c = (p['CODIGO DE PLAZA'] || '').toString().trim().toUpperCase();
    if (c) conteo[c] = (conteo[c] || 0) + 1;
  });

  var subtipos = Object.keys(grupos).sort(function(a, b) {
    var ia = ordenSubtipos.indexOf(a); var ib = ordenSubtipos.indexOf(b);
    if (ia === -1) ia = 999; if (ib === -1) ib = 999;
    return ia - ib;
  });

  var ieNombre = plazas[0]['NOMBRE DE LA INSTITUCION EDUCATIVA'] || '';
  var html = '<div style="display:flex;align-items:center;padding-bottom:10px;margin-bottom:15px;border-bottom:2px solid #000;">' +
    '<div style="flex:1;">' +
      '<h1 style="margin:0;font-size:1.1em;font-weight:bold;text-transform:uppercase;">UGEL BELLAVISTA</h1>' +
      '<p style="margin:3px 0;font-size:.85em;">Programa: Educación Básica</p>' +
      '<p style="margin:3px 0;font-size:.85em;">Nivel Educativo: ' + nivel + '</p>' +
      '<p style="margin:3px 0;font-size:.85em;">Institución Educativa: ' + ieNombre + '</p>' +
    '</div>' +
  '</div>';

  var colores = {}; var colorIdx = 0;

  subtipos.forEach(function(st) {
    html += '<div style="font-size:.85em;font-weight:bold;margin:15px 0 5px;text-transform:uppercase;color:#1e293b;">' + st + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:10px;">' +
      '<thead><tr style="background:#f0f0f0;">' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;width:20px;">N°</th>' +
        '<th style="border:1px solid #000;padding:4px;">Apellidos y Nombres</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">DNI</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Correo</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Celular</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Código Plaza</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Cód. Mod.</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Situación</th>' +
        '<th style="border:1px solid #000;padding:4px;">Cargo</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">Tipo</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">C.R.</th>' +
        '<th style="border:1px solid #000;padding:4px;text-align:center;">J.L.</th>' +
        '<th style="border:1px solid #000;padding:4px;">Motivo Vacante</th>' +
      '</tr></thead><tbody>';

    var grupo = grupos[st].slice().sort(function(a, b) {
      return (a['CODIGO DE PLAZA'] || '').toString().trim().localeCompare((b['CODIGO DE PLAZA'] || '').toString().trim());
    });

    var num = 0; var prevPlaza = '';
    grupo.forEach(function(fila) {
      var codP = (fila['CODIGO DE PLAZA'] || '').toString().trim().toUpperCase();
      if (codP !== prevPlaza) { num++; prevPlaza = codP; }

      var pat = fila['APELLIDO PATERNO'] || ''; var mat = fila['APELLIDO MATERNO'] || ''; var nom = fila['NOMBRES'] || '';
      var nombre = (pat || mat || nom) ? (pat + ' ' + mat + ', ' + nom).trim() : 'VACANTE';
      var doc = fila['DOCUMENTO DE IDENTIDAD'] || fila['NRO DOCUMENTO'] || '';
      var correo = fila['CORREO'] || fila['EMAIL'] || fila['CORREO ELECTRONICO'] || '';
      var celular = fila['CELULAR'] || fila['TELEFONO'] || '';
      var sit = fila['SITUACION LABORAL'] || '';
      var cargo = fila['CARGO'] || fila['TIPO DE TRABAJADOR'] || '';
      var tipo = fila['TIPO DE REGISTRO'] || '';
      var jl = fila['JORNADA LABORAL'] || '';
      var motivo = fila['MOTIVO DE VACANTE'] || '';
      var cr = fila['CATEGORIA REMUNERATIVA'] || fila['ESCALA HISTORIAL'] || fila['DESCRIPCION ESCALA'] || '';

      var rowStyle = 'border:1px solid #000;padding:4px;';
      var bgStyle = '';
      if (conteo[codP] > 1) {
        if (colores[codP] === undefined) { colores[codP] = colorIdx++; }
        var hue = Math.floor((colores[codP] * 137.508) % 360);
        bgStyle = 'background:hsl(' + hue + ',85%,93%);';
        rowStyle = 'border:1.5px dashed hsl(' + hue + ',80%,35%);padding:4px;';
      }

      html += '<tr style="' + bgStyle + '">' +
        '<td style="' + rowStyle + 'text-align:center;font-weight:bold;">' + num + '</td>' +
        '<td style="' + rowStyle + 'font-weight:bold;">' + nombre + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + doc + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + correo + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + celular + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + codP + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + (fila['CODMOD I.E.'] || '') + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + sit + '</td>' +
        '<td style="' + rowStyle + '">' + cargo + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + tipo + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + cr + '</td>' +
        '<td style="' + rowStyle + 'text-align:center;">' + jl + '</td>' +
        '<td style="' + rowStyle + 'font-size:.9em;">' + motivo + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  });

  contenedor.innerHTML = html;
  contenedor.setAttribute('data-iename', ieNombre);
}

function capDescargarPDF() {
  var el = document.getElementById('cap-contenedor-reporte');
  var ieNombre = el.getAttribute('data-iename') || 'IE';
  var opt = {
    margin: [10,10,10,10],
    filename: 'CAP_' + ieNombre + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  if (typeof html2pdf !== 'undefined') {
    html2pdf().set(opt).from(el).save();
  } else {
    alert('Librería PDF no disponible. Usa Imprimir y guarda como PDF.');
  }
}

function capDescargarExcel() {
  if (!window.currentCapReporteData || !window.currentCapReporteData.length) {
    alert('No hay datos para exportar.');
    return;
  }
  
  var ordenSubtipos = ['DIRECTIVO','JERARQUICO','DOCENTE','AUXILIAR DE EDUCACION',
    'ESPECIALISTAS ADMINISTRATIVOS E INSTITUCIONALES DE LAS UGEL','AUXILIAR','TECNICO'];
  
  var sortedData = window.currentCapReporteData.slice().sort(function(a, b) {
    var sta = (a['SUB-TIPO DE TRABAJADOR'] || 'OTROS').toString().trim().toUpperCase();
    var stb = (b['SUB-TIPO DE TRABAJADOR'] || 'OTROS').toString().trim().toUpperCase();
    var ia = ordenSubtipos.indexOf(sta); var ib = ordenSubtipos.indexOf(stb);
    if (ia === -1) ia = 999; if (ib === -1) ib = 999;
    if (ia !== ib) return ia - ib;
    var cpa = (a['CODIGO DE PLAZA'] || '').toString().trim();
    var cpb = (b['CODIGO DE PLAZA'] || '').toString().trim();
    return cpa.localeCompare(cpb);
  });

  var data = sortedData.map(function(fila, idx) {
    var pat = fila['APELLIDO PATERNO'] || ''; var mat = fila['APELLIDO MATERNO'] || ''; var nom = fila['NOMBRES'] || '';
    var nombre = (pat || mat || nom) ? (pat + ' ' + mat + ', ' + nom).trim() : 'VACANTE';
    var doc = fila['DOCUMENTO DE IDENTIDAD'] || fila['NRO DOCUMENTO'] || '';
    var correo = fila['CORREO'] || fila['EMAIL'] || fila['CORREO ELECTRONICO'] || '';
    var celular = fila['CELULAR'] || fila['TELEFONO'] || '';
    var sit = fila['SITUACION LABORAL'] || '';
    var cargo = fila['CARGO'] || fila['TIPO DE TRABAJADOR'] || '';
    var tipo = fila['TIPO DE REGISTRO'] || '';
    var jl = fila['JORNADA LABORAL'] || '';
    var motivo = fila['MOTIVO DE VACANTE'] || '';
    var cr = fila['CATEGORIA REMUNERATIVA'] || fila['ESCALA HISTORIAL'] || fila['DESCRIPCION ESCALA'] || '';
    var codP = (fila['CODIGO DE PLAZA'] || '').toString().trim();
    var st = fila['SUB-TIPO DE TRABAJADOR'] || 'OTROS';

    return {
      "N°": idx + 1,
      "Sub-Tipo": st,
      "Apellidos y Nombres": nombre,
      "DNI": doc,
      "Correo": correo,
      "Celular": celular,
      "Código Plaza": codP,
      "Cód. Mod.": fila['CODMOD I.E.'] || '',
      "Situación": sit,
      "Cargo": cargo,
      "Tipo": tipo,
      "C.R.": cr,
      "J.L.": jl,
      "Motivo Vacante": motivo
    };
  });

  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CAP");
  var ieNombre = window.currentCapReporteIE || 'IE';
  var fileName = "CAP_" + ieNombre.replace(/[^a-zA-Z0-9_\-\ ]/g, '') + ".xlsx";
  XLSX.writeFile(wb, fileName);
}
// ===================== CALENDARIO =====================
window.calendar = null;

window.todosLosEventosCalendario = [];

async function loadCalendario() {
  var container = document.getElementById('calendar-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  try {
    var eventos = await api('/api/calendario/eventos');
    var events = eventos.map(function(e) {
      var color = '#6b21a8';
      var textC = '#ffffff';
      if (e.estado === 'Cumplida') {
          color = '#10b981';
      } else if (e.estado === 'En Proceso') {
          color = '#f59e0b';
          textC = '#000000';
      }

      let finalEnd = e.end || undefined;
      if (e.fecha_fin_actividad) {
          let f = e.fecha_fin_actividad;
          if (typeof f === 'string') f = f.substring(0,10);
          else f = new Date(f).toISOString().substring(0,10);
          
          if (!e.hora_fin) {
             let df = new Date(f + 'T12:00:00Z');
             df.setDate(df.getDate() + 1);
             finalEnd = df.toISOString().substring(0,10);
          } else {
             finalEnd = f + 'T' + e.hora_fin;
          }
      }

      var finalTitle = e.title;
      if (currentUser && currentUser.rol === 'admin' && e.creador) {
          finalTitle = e.title + ' - ' + e.creador;
      }

      return {
        id: e.id,
        title: finalTitle,
        start: e.start,
        end: finalEnd,
        allDay: !e.start.includes('T') || e.start.endsWith('00:00:00'),
        backgroundColor: color,
        borderColor: color,
        textColor: textC,
        extendedProps: e
      };
    });

    window.todosLosEventosCalendario = events;
    
    container.innerHTML = '';
    var initView = (currentUser && currentUser.rol === 'admin') ? 'listDay' : 'timeGridWeek';
    
    if (currentUser && currentUser.rol === 'admin') {
        document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
        var btnLista = document.getElementById('vbtnList');
        if (btnLista) {
            btnLista.classList.add('active');
            btnLista.setAttribute('onclick', "setCalView('listDay', this)");
        }
    }

    calendar = new FullCalendar.Calendar(container, {
      initialView: initView,
      headerToolbar: false,
      height: '100%',
      expandRows: true,
      slotDuration: '01:00:00',
      slotMinTime: '06:00:00',
      slotMaxTime: '21:00:00',
      events: events,
      locale: 'es',
      eventClick: function(info) {
        abrirModalEvento(info.event.extendedProps);
      },
      datesSet: function(info) {
        if (document.getElementById('calMainTitle')) {
          const title = info.view.title;
          document.getElementById('calMainTitle').textContent = title.charAt(0).toUpperCase() + title.slice(1);
        }
        if (typeof _miniCalDate !== 'undefined') {
            _miniCalDate = info.view.currentStart;
        }
        if(typeof renderMiniCal === 'function') renderMiniCal();
      }
    });
    calendar.render();
    
    // Update KPIs and Legend
    actualizarKpisCal(events);
    renderLeyendaCal(events);
    if(typeof renderMiniCal === 'function') renderMiniCal();

  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger)">Error al cargar calendario: ' + e.message + '</div>';
  }
}

function filtrarCalendarioLocal() {
    if (!calendar) return;
    const texto = (document.getElementById('calBuscarTexto').value || '').toLowerCase();
    const estado = document.getElementById('calFiltroEstado').value;
    
    const filtrados = window.todosLosEventosCalendario.filter(ev => {
        const textMatch = ev.title.toLowerCase().includes(texto) || (ev.extendedProps.area || '').toLowerCase().includes(texto);
        const estMatch = !estado || ev.extendedProps.estado === estado;
        return textMatch && estMatch;
    });
    
    calendar.getEvents().forEach(e => e.remove());
    filtrados.forEach(e => calendar.addEvent(e));
    
    actualizarKpisCal(filtrados);
    renderLeyendaCal(filtrados);
}

function actualizarKpisCal(eventos) {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();
    const delMes = eventos.filter(ev => {
        const d = new Date(ev.start);
        return d.getMonth() === mesActual && d.getFullYear() === anioActual;
    });
    const total = delMes.length;
    const pendiente = delMes.filter(e => e.extendedProps.estado === 'Pendiente').length;
    const cumplio = delMes.filter(e => e.extendedProps.estado === 'Cumplida').length;
    const noCumplio = delMes.filter(e => e.extendedProps.estado === 'En Proceso').length;
    const t = document.getElementById('kpiTotal'); if(t) t.textContent = total;
    const p = document.getElementById('kpiPendiente'); if(p) p.textContent = pendiente;
    const c = document.getElementById('kpiCumplio'); if(c) c.textContent = cumplio;
    const n = document.getElementById('kpiNoCumplio'); if(n) n.textContent = noCumplio;
}

function renderLeyendaCal(eventos) {
    const legendEl = document.getElementById('calLegend');
    if (!legendEl) return;
    const areas = [...new Set(eventos.map(e => e.extendedProps.area).filter(Boolean))];
    const conteos = {};
    eventos.forEach(e => { if (e.extendedProps.area) conteos[e.extendedProps.area] = (conteos[e.extendedProps.area]||0)+1; });
    
    if (areas.length === 0) {
        legendEl.innerHTML = '<p style="font-size:12px;color:#aaa;text-align:center;padding:8px 0;">Sin áreas asignadas</p>';
    } else {
        legendEl.innerHTML = areas.map(sa => {
            const cnt = conteos[sa] || 0;
            return `<div class="cal-area-chip" title="${sa}">
                <div class="cal-area-dot" style="background:var(--granate);"></div>
                <span class="cal-area-name">${sa}</span>
                <span class="cal-area-count">${cnt}</span>
            </div>`;
        }).join('');
    }
}


// ==================== CALENDARIO EVENTOS (SUPERVISORES) ====================
function abrirModalEvento(evento) {
  var title = 'Nuevo Evento';
  var isEdit = evento && evento.id;
  if (isEdit) title = 'Detalles del Evento';
  
  var isCreator = true;
  if (isEdit && currentUser && evento.supervisor_id) {
      isCreator = (evento.supervisor_id === currentUser.id);
  }
  var disabledAttr = isCreator ? '' : 'disabled';
  
  var evId = isEdit ? evento.id : '';
  var evTitulo = isEdit ? (evento.titulo || '') : '';
  var evDescripcion = isEdit ? (evento.descripcion || '') : '';
  var evEstado = isEdit ? (evento.estado || 'Pendiente') : 'Pendiente';
  
  var fechaStr = '';
  if (isEdit && evento.fecha) {
    if (typeof evento.fecha === 'string') fechaStr = evento.fecha.substring(0,10);
    else fechaStr = new Date(evento.fecha).toISOString().substring(0,10);
  }
  var evFecha = fechaStr;
  
  var fechaFinStr = '';
  if (isEdit && evento.fecha_fin_actividad) {
    if (typeof evento.fecha_fin_actividad === 'string') fechaFinStr = evento.fecha_fin_actividad.substring(0,10);
    else fechaFinStr = new Date(evento.fecha_fin_actividad).toISOString().substring(0,10);
  }
  var evFechaFin = fechaFinStr;

  var evHoraInicio = isEdit ? (evento.hora_inicio || '') : '';
  var evHoraFin = isEdit ? (evento.hora_fin || '') : '';
  
  var evArea = isEdit ? (evento.area || '') : '';

  var creadorHtml = '';
  if (isEdit && evento.creador) {
    creadorHtml = `<div style="background:#f0f2ff; padding:10px 15px; border-radius:8px; margin-bottom:15px; font-size:13px; color:#1a1a2e; border: 1px solid #d0d7ff; display:flex; align-items:center; gap:8px;">
      <i class="fas fa-user-circle" style="font-size:16px; color:#4a6cf7;"></i> 
      <span><strong>Asignado por:</strong> ${evento.creador}</span>
    </div>`;
  }

  var bodyHtml = `
    <div id="formEventoCalendario">
      <input type="hidden" id="evId" value="${evId}">
      ${creadorHtml}
      <div class="mb-3">
        <label>Título del Evento</label>
        <input type="text" id="evTitulo" class="form-control" value="${evTitulo}" required ${disabledAttr}>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:15px;">
        <div style="flex:1;">
          <label>Fecha Inicio</label>
          <input type="date" id="evFecha" class="form-control" value="${evFecha}" required ${disabledAttr}>
        </div>
        <div style="flex:1;">
          <label>Fecha Fin <small>(Opcional)</small></label>
          <input type="date" id="evFechaFin" class="form-control" value="${evFechaFin}" ${disabledAttr}>
        </div>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:15px;">
        <div style="flex:1;">
          <label>Hora Inicio</label>
          <input type="time" id="evHoraInicio" class="form-control" value="${evHoraInicio}" ${disabledAttr}>
        </div>
        <div style="flex:1;">
          <label>Hora Fin</label>
          <input type="time" id="evHoraFin" class="form-control" value="${evHoraFin}" ${disabledAttr}>
        </div>
      </div>
      <div class="mb-3">
        <label>Descripción</label>
        <textarea id="evDescripcion" class="form-control" rows="2" ${disabledAttr}>${evDescripcion}</textarea>
      </div>
      <div style="display:flex; gap:10px; margin-bottom:15px;">
        <div style="flex:1;">
          <label>Área</label>
          <input type="text" id="evArea" class="form-control" placeholder="Ej. AGP" value="${evArea}" ${disabledAttr}>
        </div>
        <div style="flex:1;">
          <label>Estado</label>
          <select id="evEstado" class="form-select" ${disabledAttr}>
            <option value="Pendiente" ${evEstado==='Pendiente'?'selected':''}>Pendiente</option>
            <option value="En Proceso" ${evEstado==='En Proceso'?'selected':''}>En Proceso</option>
            <option value="Cumplida" ${evEstado==='Cumplida'?'selected':''}>Cumplida</option>
          </select>
        </div>
      </div>
    </div>
  `;

  var footerHtml = '';
  if (isCreator) {
    if (isEdit) {
      footerHtml += `<button type="button" class="btn btn-danger" style="margin-right:auto;" onclick="eliminarEvento()">Eliminar</button>`;
    }
    footerHtml += `<button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                   <button type="button" class="btn btn-primary" onclick="guardarEvento()">Guardar</button>`;
  } else {
    footerHtml += `<button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button>`;
  }

  showModal(title, bodyHtml, footerHtml);
}

async function guardarEvento() {
  var id = document.getElementById('evId').value;
  var payload = {
    titulo: document.getElementById('evTitulo').value,
    fecha: document.getElementById('evFecha').value,
    fecha_fin_actividad: document.getElementById('evFechaFin').value,
    hora_inicio: document.getElementById('evHoraInicio').value,
    hora_fin: document.getElementById('evHoraFin').value,
    descripcion: document.getElementById('evDescripcion').value,
    area: document.getElementById('evArea').value,
    estado: document.getElementById('evEstado').value
  };

  if (!payload.titulo || !payload.fecha) {
    alert('Por favor ingrese al menos el Título y la Fecha.');
    return;
  }

  try {
    if (id) {
      await api('/api/calendario/eventos/' + id, { method: 'PUT', body: payload });
    } else {
      await api('/api/calendario/eventos', { method: 'POST', body: payload });
    }
    closeModal();
    loadCalendario();
  } catch(e) {
    alert('Error al guardar evento: ' + e.message);
  }
}

async function eliminarEvento() {
  var id = document.getElementById('evId').value;
  if (!id) return;
  if (!confirm('¿Seguro que desea eliminar este evento?')) return;
  try {
    await api('/api/calendario/eventos/' + id, { method: 'DELETE' });
    closeModal();
    loadCalendario();
  } catch(e) {
    alert('Error al eliminar evento: ' + e.message);
  }
}

function switchCalTab(tab) {
  var bCal = document.getElementById('cal-tab-btn-cal');
  var bActs = document.getElementById('cal-tab-btn-acts');
  
  if (tab === 'cal') {
    bCal.className = 'btn btn-primary';
    bCal.style.background = '';
    bCal.style.borderColor = '';
    bCal.style.color = '';
    
    bActs.className = 'btn btn-outline-primary';
    bActs.style.background = 'transparent';
    bActs.style.borderColor = 'transparent';
    bActs.style.color = 'var(--text2)';
  } else {
    bActs.className = 'btn btn-primary';
    bActs.style.background = '';
    bActs.style.borderColor = '';
    bActs.style.color = '';
    
    bCal.className = 'btn btn-outline-primary';
    bCal.style.background = 'transparent';
    bCal.style.borderColor = 'transparent';
    bCal.style.color = 'var(--text2)';
  }

  document.getElementById('cal-content-cal').style.display = tab === 'cal' ? 'block' : 'none';
  document.getElementById('cal-content-acts').style.display = tab === 'acts' ? 'block' : 'none';
  if (tab === 'cal' && calendar) {
    calendar.render();
  }
}

function descargarExcelAreas() {
  descargarExcel('/api/export/actividades-areas');
}


// ===================== CAPACITACIONES & ASISTENCIA =====================

let currentPublicCapacitacion = null;
let currentPublicRating = 0;
let capSelectedIEIds = new Set();
let allCapIEs = [];
let currentCapDetailId = null;
let currentCapDetailData = null;

async function loadCapacitaciones() {
  try {
    const data = await api('/api/capacitaciones');
    const grid = document.getElementById('cap-cards-grid');
    const emptyState = document.getElementById('cap-empty-state');
    
    document.getElementById('cap-list-subview').style.display = 'block';
    document.getElementById('cap-detail-subview').style.display = 'none';
    
    if (!data || data.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    grid.style.display = 'grid';
    
    let html = '';
    data.forEach(function(cap) {
      const totalInvitadas = parseInt(cap.total_invitadas || 0, 10);
      const totalAsistentes = parseInt(cap.total_asistentes || 0, 10);
      const pct = totalInvitadas > 0 ? Math.round((totalAsistentes / totalInvitadas) * 100) : 0;
      
      let formattedDate = cap.fecha || '';
      if (formattedDate) {
        const parts = formattedDate.split('T')[0].split('-');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      
      const surveyBadge = cap.incluye_encuesta 
        ? '<span style="background:#fef3c7; color:#d97706; padding:3px 8px; border-radius:12px; font-size:0.7rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-star"></i> Encuesta Activa</span>' 
        : '<span style="background:#f3f4f6; color:#6b7280; padding:3px 8px; border-radius:12px; font-size:0.7rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-info-circle"></i> Sin Encuesta</span>';
      
      let targetText = 'Todas las IEs';
      if (cap.niveles_aplicados && cap.niveles_aplicados !== 'todas') {
        targetText = `Nivel: ${cap.niveles_aplicados.toUpperCase()}`;
      }
      
      html += `
        <div class="t-card" style="display:flex; flex-direction:column; justify-content:space-between; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05); border:1px solid rgba(255,255,255,0.4); background:rgba(255,255,255,0.75); backdrop-filter:blur(10px); transition:transform 0.2s; position:relative;">
          <div style="height:6px; background:linear-gradient(90deg, var(--primary), #6366f1);"></div>
          <div style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <span style="font-size:0.72rem; color:#6b7280; font-weight:700; text-transform:uppercase;"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
              ${surveyBadge}
            </div>
            
            <h4 style="font-weight:800; color:var(--slate-900); font-size:1.15rem; margin:0 0 6px; text-transform:uppercase; line-height:1.3;">${cap.titulo}</h4>
            <p style="color:#4b5563; font-size:0.8rem; margin:0 0 16px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:36px;">${cap.descripcion || 'Sin descripción adicional.'}</p>
            
            <div style="background:rgba(0,0,0,0.02); border-radius:12px; padding:12px; margin-bottom:18px; border:1px solid rgba(0,0,0,0.04);">
              <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:#374151; margin-bottom:6px;">
                <span>Asistencia Realizada</span>
                <span>${totalAsistentes} / ${totalInvitadas} IEs (${pct}%)</span>
              </div>
              <div style="width:100%; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #10b981, #34d399); border-radius:4px; transition:width 0.4s ease-out;"></div>
              </div>
              <div style="margin-top:8px; font-size:0.7rem; color:#6b7280; font-weight:600;">
                <i class="fas fa-bullseye"></i> Alcance: ${targetText}
              </div>
            </div>
          </div>
          
          <div style="background:rgba(249,250,251,0.8); padding:12px 18px; border-top:1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <button class="btn btn-xs btn-outline" onclick="copyCapLink(${cap.id})" style="border-radius:12px; font-weight:700; font-size:0.72rem; padding:6px 12px; display:flex; align-items:center; gap:6px;">
              <i class="fas fa-link"></i> Copiar Enlace
            </button>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-xs btn-primary" onclick="verDetalleCapacitacion(${cap.id})" style="border-radius:12px; font-weight:700; font-size:0.72rem; padding:6px 12px;">
                Ver Detalle
              </button>
              <button class="btn btn-xs btn-danger" onclick="eliminarCapacitacion(${cap.id})" style="border-radius:12px; padding:6px 8px;">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    grid.innerHTML = html;
  } catch (err) {
    showToast('Error al cargar capacitaciones: ' + err.message, 'error');
  }
}

function mostrarCrearCapacitacion() {
  cambiarVista('capacitaciones');
}

function cancelarCrearCapacitacion() {
  cambiarVista('monitoreo-capacitaciones');
}

async function submitCrearCapacitacion() {
  const titulo = document.getElementById('cap-titulo').value.trim();
  const descripcion = document.getElementById('cap-descripcion').value.trim();
  const fecha = document.getElementById('cap-fecha').value;
  const incluye_encuesta = document.getElementById('cap-incluye-encuesta').checked;
  
  const radio = document.querySelector('input[name="cap-alcance-radio"]:checked');
  const alcance = radio ? radio.value : 'todas';
  
  const payload = {
    titulo: titulo,
    descripcion: descripcion,
    fecha: fecha,
    incluye_encuesta: incluye_encuesta,
    alcance: alcance
  };
  
  if (alcance === 'nivel') {
    const checkedBoxes = document.querySelectorAll('.cap-nivel-checkbox:checked');
    const nivelIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10));
    if (nivelIds.length === 0) {
      showToast('Debe seleccionar al menos un nivel educativo', 'error');
      return;
    }
    payload.nivelIds = nivelIds;
  } else if (alcance === 'manual') {
    const ieIds = Array.from(capSelectedIEIds);
    if (ieIds.length === 0) {
      showToast('Debe seleccionar al menos una Institución Educativa', 'error');
      return;
    }
    payload.ieIds = ieIds;
  } else if (alcance === 'lista') {
    const selectedRadio = document.querySelector('input[name="cap-lista-sel"]:checked');
    if (!selectedRadio) {
      showToast('Debe seleccionar una lista guardada', 'error');
      return;
    }
    payload.listaId = parseInt(selectedRadio.value, 10);
  }
  
  try {
    await api('/api/capacitaciones', {
      method: 'POST',
      body: payload
    });
    showToast('Capacitación creada con éxito', 'success');
    document.getElementById('cap-titulo').value = '';
    document.getElementById('cap-descripcion').value = '';
    document.getElementById('cap-fecha').value = '';
    document.getElementById('cap-incluye-encuesta').checked = false;
    cambiarVista('monitoreo-capacitaciones');
  } catch (err) {
    showToast('Error al crear capacitación: ' + err.message, 'error');
  }
}

async function eliminarCapacitacion(id) {
  if (!confirm('¿Está seguro de que desea eliminar esta capacitación? Se borrarán permanentemente todos los registros de asistencia asociados.')) {
    return;
  }
  try {
    await api('/api/capacitaciones/' + id, { method: 'DELETE' });
    showToast('Capacitación eliminada con éxito', 'success');
    loadCapacitaciones();
  } catch (err) {
    showToast('Error al eliminar capacitación: ' + err.message, 'error');
  }
}

async function verDetalleCapacitacion(id) {
  try {
    const res = await api('/api/capacitaciones/' + id + '/asistencia');
    currentCapDetailId = id;
    currentCapDetailData = res;
    
    // Switch view classes manually to avoid triggering loadViewData / loadCapacitaciones async race condition
    document.querySelectorAll('.view-section').forEach(function (s) { s.classList.remove('active'); });
    var sec = document.getElementById('view-monitoreo-capacitaciones');
    if (sec) sec.classList.add('active');
    document.querySelectorAll('#sidebar-nav a').forEach(function (a) { a.classList.remove('active'); });
    var l = document.querySelector('#sidebar-nav a[data-view="monitoreo-capacitaciones"]');
    if (l) l.classList.add('active');
    
    document.getElementById('cap-list-subview').style.display = 'none';
    document.getElementById('cap-detail-subview').style.display = 'block';
    
    document.getElementById('cap-detail-title').textContent = res.capacitacion.titulo;
    
    let formattedDate = res.capacitacion.fecha || '';
    if (formattedDate) {
      const parts = formattedDate.split('T')[0].split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    
    document.getElementById('cap-detail-meta').innerHTML = `
      <i class="far fa-calendar-alt"></i> Fecha: <strong>${formattedDate}</strong> | 
      <i class="fas fa-bullseye"></i> Alcance: <strong>${(res.capacitacion.niveles_aplicados && res.capacitacion.niveles_aplicados !== 'todas') ? 'Niveles: ' + res.capacitacion.niveles_aplicados.toUpperCase() : 'Todas las IEs'}</strong>
    `;
    
    const exportBtn = document.getElementById('btn-export-excel-asistencia');
    if (exportBtn) {
      exportBtn.onclick = function() {
        descargarExcel('/api/capacitaciones/' + id + '/export-excel');
      };
    }
    
    document.getElementById('cap-det-buscar').value = '';
    document.getElementById('cap-det-asistencia-filter').value = '';
    
    renderCapDetTable();
  } catch (err) {
    showToast('Error al cargar detalle: ' + err.message, 'error');
  }
}

function volverACapacitaciones() {
  document.getElementById('cap-detail-subview').style.display = 'none';
  document.getElementById('cap-list-subview').style.display = 'block';
  loadCapacitaciones();
}

function renderCapDetTable() {
  if (!currentCapDetailData || !currentCapDetailData.asistencia) return;
  
  const q = document.getElementById('cap-det-buscar').value.toLowerCase().trim();
  const filterAsistencia = document.getElementById('cap-det-asistencia-filter').value;
  const tbody = document.getElementById('cap-det-tbody');
  
  const filtered = currentCapDetailData.asistencia.filter(function(row) {
    const matchesSearch = !q || 
      row.ie_codigo.toLowerCase().includes(q) || 
      row.ie_nombre.toLowerCase().includes(q) || 
      (row.nombre_completo && row.nombre_completo.toLowerCase().includes(q)) || 
      (row.dni && row.dni.toLowerCase().includes(q)) || 
      (row.cargo && row.cargo.toLowerCase().includes(q));
      
    let matchesAsist = true;
    if (filterAsistencia === 'si') matchesAsist = row.asistio;
    else if (filterAsistencia === 'no') matchesAsist = !row.asistio;
    
    return matchesSearch && matchesAsist;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#9ca3af; padding:30px;">No se encontraron registros que coincidan con los filtros.</td></tr>';
    return;
  }
  
  let html = '';
  filtered.forEach(function(row) {
    let statusBadge = '';
    if (row.asistio) {
      statusBadge = '<span style="background:#d1fae5; color:#065f46; padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-check-circle"></i> SÍ</span>';
    } else {
      statusBadge = '<span style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-times-circle"></i> NO</span>';
    }
    
    let timeFormatted = '-';
    if (row.asistio && row.fecha_registro) {
      const regDate = new Date(row.fecha_registro);
      timeFormatted = regDate.toLocaleString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    
    let ratingStars = '-';
    if (row.asistio && currentCapDetailData.capacitacion.incluye_encuesta) {
      if (row.calificacion_satisfaccion) {
        ratingStars = '<span style="color:#eab308; font-size:0.9rem;">';
        for (let i = 1; i <= 5; i++) {
          if (i <= row.calificacion_satisfaccion) {
            ratingStars += '★';
          } else {
            ratingStars += '☆';
          }
        }
        ratingStars += '</span>';
      } else {
        ratingStars = '<span style="color:#9ca3af; font-size:0.8rem;">Sin calificar</span>';
      }
    }
    
    html += `
      <tr>
        <td style="font-weight:700; color:var(--primary);">${row.ie_codigo} - ${row.ie_nombre}</td>
        <td><span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:8px; font-size:0.72rem; font-weight:600;">${row.ie_niveles || 'N/A'}</span></td>
        <td style="text-align:center;">${statusBadge}</td>
        <td style="font-weight:600; color:var(--text1);">${row.nombre_completo || '-'}</td>
        <td>${row.dni || '-'}</td>
        <td><span style="font-size:0.78rem; text-transform:uppercase; color:#4b5563;">${row.cargo || '-'}</span></td>
        <td><span style="font-size:0.75rem; color:#6b7280;">${timeFormatted}</span></td>
        <td style="text-align:center;">${ratingStars}</td>
        <td><span style="font-size:0.78rem; color:#4b5563; max-width:180px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${row.sugerencias || ''}">${row.sugerencias || '-'}</span></td>
      </tr>
    `;
  });
  
  tbody.innerHTML = html;
}

function filterCapDetTable() {
  renderCapDetTable();
}

function onChangeAlcanceCap(val) {
  document.getElementById('alcance-cap-nivel').style.display = (val === 'nivel') ? 'block' : 'none';
  document.getElementById('alcance-cap-manual').style.display = (val === 'manual') ? 'block' : 'none';
  document.getElementById('alcance-cap-lista').style.display = (val === 'lista') ? 'block' : 'none';
  
  if (val === 'nivel') {
    var container = document.getElementById('cap-alcance-niveles-container');
    if (container && window.nivelesCache) {
      container.innerHTML = window.nivelesCache.map(function(n) {
        return '<div class="form-check" style="display:flex; align-items:center; gap:8px;">' +
          '<input class="form-check-input cap-nivel-checkbox" type="checkbox" value="' + n.id + '" id="cap-nivel-' + n.id + '" style="width:16px; height:16px; cursor:pointer;">' +
          '<label class="form-check-label" for="cap-nivel-' + n.id + '" style="font-weight:600; cursor:pointer; color:var(--text1);">' + n.nombre + '</label>' +
          '</div>';
      }).join('');
    }
  } else if (val === 'manual') {
    loadIEsForCapManual();
  } else if (val === 'lista') {
    cargarCapListasIE();
  }
}

async function cargarCapListasIE() {
  try {
    var listas = await api('/api/listas-ie');
    var cont = document.getElementById('cap-listas-ie-container');
    if (!cont) return;
    if (!listas || listas.length === 0) {
      cont.innerHTML = '<div style="color:#9ca3af; font-size:0.8rem;">No hay listas guardadas.</div>';
      return;
    }
    var html = '';
    listas.forEach(function(lista) {
      var ids = JSON.parse(lista.ie_ids || '[]');
      html += '<div class="form-check" style="padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; display:flex; align-items:center; gap:8px;">' +
        '<input class="form-check-input cap-lista-radio" type="radio" name="cap-lista-sel" value="' + lista.id + '" id="cap-lista-' + lista.id + '" data-ie-ids=\'' + lista.ie_ids + '\'>' +
        '<label class="form-check-label" for="cap-lista-' + lista.id + '" style="font-weight:600; cursor:pointer;">' + lista.nombre + ' <span style="color:#6b7280; font-weight:400; font-size:0.78rem;">(' + ids.length + ' IEs)</span></label>' +
        '</div>';
    });
    cont.innerHTML = html;
  } catch (e) { /* ignore */ }
}

async function loadIEsForCapManual() {
  try {
    if (!allCapIEs.length) {
      const d = await api('/api/ies');
      allCapIEs = d.ies || d || [];
    }
    
    const nf = document.getElementById('cap-ie-filter-nivel');
    if (nf && nf.options.length <= 1 && window.nivelesCache) {
      window.nivelesCache.forEach(function(nv) {
        var opt = document.createElement('option');
        opt.value = nv.clave;
        opt.textContent = nv.nombre;
        nf.appendChild(opt);
      });
    }
    
    capSelectedIEIds.clear();
    renderCapIECheckboxes(allCapIEs);
  } catch (e) {
    showToast('Error al cargar IEs: ' + e.message, 'error');
  }
}

function renderCapIECheckboxes(ies) {
  var html = '';
  for (var i = 0; i < ies.length; i++) {
    var ie = ies[i];
    var isChecked = capSelectedIEIds.has(ie.id) ? 'checked' : '';
    html += '<label class="ie-item" style="display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid #f3f4f6; cursor:pointer;">' +
      '<input type="checkbox" class="cap-ie-checkbox" onchange="onToggleCapIE(' + ie.id + ')" value="' + ie.id + '" ' + isChecked + ' style="width:16px; height:16px;">' +
      '<span class="ie-codigo" style="font-weight:700; color:var(--primary); min-width:65px; display:inline-block;">' + ie.codigo + '</span>' +
      '<span class="ie-nombre" style="color:var(--text1);">' + ie.nombre + '</span>' +
      '</label>';
  }
  document.getElementById('cap-ie-checkbox-list').innerHTML = html;
}

function onToggleCapIE(ieId) {
  const checkboxes = document.querySelectorAll('.cap-ie-checkbox');
  checkboxes.forEach(cb => {
    const val = parseInt(cb.value, 10);
    if (cb.checked) {
      capSelectedIEIds.add(val);
    } else {
      capSelectedIEIds.delete(val);
    }
  });
}

function toggleAllCapIEs(check) {
  const checkboxes = document.querySelectorAll('.cap-ie-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = check;
    const val = parseInt(cb.value, 10);
    if (check) {
      capSelectedIEIds.add(val);
    } else {
      capSelectedIEIds.delete(val);
    }
  });
}

function filterCapIEList() {
  var q = document.getElementById('cap-ie-search').value.toLowerCase().trim();
  var n = document.getElementById('cap-ie-filter-nivel').value;
  
  var filtered = allCapIEs.filter(function(ie) {
    var matchesSearch = !q || ie.codigo.toLowerCase().includes(q) || ie.nombre.toLowerCase().includes(q);
    var matchesNivel = true;
    if (n === 'inicial') matchesNivel = ie.tiene_inicial;
    else if (n === 'primaria') matchesNivel = ie.tiene_primaria;
    else if (n === 'secundaria') matchesNivel = ie.tiene_secundaria;
    else if (n === 'otros') matchesNivel = ie.tiene_otros;
    else if (n) {
      matchesNivel = String(ie.nivel_id) === String(n) || String(ie.nivel).toLowerCase().includes(n.toLowerCase());
    }
    return matchesSearch && matchesNivel;
  });
  
  renderCapIECheckboxes(filtered);
}

function copyCapLink(id) {
  const link = `${window.location.origin}${window.location.pathname}?capacitacion=${id}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('¡Enlace de asistencia copiado al portapapeles!', 'success');
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = link;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('¡Enlace de asistencia copiado!', 'success');
  });
}

// ===================== PUBLIC ATTENDANCE FORM =====================

function showPublicCapacitacionForm(capId) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  
  document.body.classList.add('director-mode');
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
  
  document.querySelectorAll('.view-section').forEach(function (s) { 
    s.classList.remove('active'); 
    s.style.display = 'none'; 
  });
  var sec = document.getElementById('view-public-capacitacion');
  if (sec) {
    sec.classList.add('active');
    sec.style.display = 'block';
  }
  
  loadPublicCapacitacionDetails(capId);
}

async function loadPublicCapacitacionDetails(capId) {
  try {
    const res = await api('/api/public/capacitaciones/' + capId);
    currentPublicCapacitacion = res.capacitacion;
    window.publicCapacitacionIEs = res.ies;
    
    document.getElementById('pub-cap-title').textContent = currentPublicCapacitacion.titulo;
    document.getElementById('pub-cap-desc').textContent = currentPublicCapacitacion.descripcion || 'Sin descripción adicional';
    
    let fechaStr = currentPublicCapacitacion.fecha;
    if (fechaStr) {
      const parts = fechaStr.split('T')[0].split('-');
      if (parts.length === 3) {
        fechaStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    document.getElementById('pub-cap-date').textContent = fechaStr || '-';
    
    const searchInput = document.getElementById('pub-cap-ie-search');
    searchInput.value = '';
    document.getElementById('pub-cap-ie-id').value = '';
    document.getElementById('pub-cap-selected-ie-badge').style.display = 'none';
    document.getElementById('pub-cap-step2').style.display = 'none';
    document.getElementById('pub-cap-step3').style.display = 'none';
    document.getElementById('pub-cap-submit-btn').style.display = 'none';
    document.getElementById('pub-cap-success').style.display = 'none';
    document.getElementById('pub-cap-form').style.display = 'block';
    
    resetStars();
    
    if (currentPublicCapacitacion.incluye_encuesta) {
      document.getElementById('pub-cap-step3').style.display = 'block';
    } else {
      document.getElementById('pub-cap-step3').style.display = 'none';
    }
  } catch (err) {
    showToast(err.message || 'Error al cargar la capacitación', 'error');
  }
}

function onSearchPublicCapIE(query) {
  const container = document.getElementById('pub-cap-autocomplete');
  if (!query || query.trim().length < 2) {
    container.style.display = 'none';
    return;
  }
  const q = query.toLowerCase().trim();
  const list = window.publicCapacitacionIEs || [];
  const matches = list.filter(ie => 
    ie.codigo.toLowerCase().includes(q) || 
    ie.nombre.toLowerCase().includes(q)
  );
  
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:#6b7280; text-align:center;">No se encontraron instituciones invitadas</div>';
  } else {
    container.innerHTML = matches.map(ie => `
      <div class="sel-item" onclick="selectPublicCapIE(${ie.id}, '${ie.codigo}', '${ie.nombre.replace(/'/g, "\'")}')" style="padding:10px 14px; cursor:pointer; font-size:0.85rem; border-bottom:1px solid #f3f4f6; text-align:left;">
        <span style="font-weight:700; color:var(--primary); margin-right:8px;">${ie.codigo}</span>
        <span style="color:#374151;">${ie.nombre}</span>
      </div>
    `).join('');
  }
  container.style.display = 'block';
}

function selectPublicCapIE(id, codigo, nombre) {
  document.getElementById('pub-cap-ie-id').value = id;
  document.getElementById('pub-cap-ie-search').value = `${codigo} - ${nombre}`;
  document.getElementById('pub-cap-autocomplete').style.display = 'none';
  
  const badge = document.getElementById('pub-cap-selected-ie-badge');
  const badgeText = document.getElementById('pub-cap-selected-ie-text');
  badgeText.textContent = `${codigo} - ${nombre}`;
  badge.style.display = 'flex';
  
  document.getElementById('pub-cap-step2').style.display = 'block';
  document.getElementById('pub-cap-submit-btn').style.display = 'block';
}

function selectSurveyRating(val) {
  currentPublicRating = val;
  document.getElementById('pub-cap-rating').value = val;
  const stars = document.querySelectorAll('.star-btn');
  stars.forEach((star, index) => {
    if (index < val) {
      star.style.color = '#eab308';
    } else {
      star.style.color = '#d1d5db';
    }
  });
}

function resetStars() {
  currentPublicRating = 0;
  document.getElementById('pub-cap-rating').value = '';
  const stars = document.querySelectorAll('.star-btn');
  stars.forEach(star => {
    star.style.color = '#d1d5db';
  });
}

async function submitPublicAsistencia() {
  const capId = currentPublicCapacitacion.id;
  const ieId = document.getElementById('pub-cap-ie-id').value;
  const nombre = document.getElementById('pub-cap-nombre').value.trim();
  const dni = document.getElementById('pub-cap-dni').value.trim();
  const cargo = document.getElementById('pub-cap-cargo').value.trim();
  const rating = document.getElementById('pub-cap-rating').value;
  const sugerencias = document.getElementById('pub-cap-sugerencias').value.trim();
  
  if (!ieId) {
    showToast('Debe seleccionar una Institución Educativa válida de la lista', 'error');
    return;
  }
  
  if (currentPublicCapacitacion.incluye_encuesta && !rating) {
    showToast('Por favor califique la capacitación en la encuesta de satisfacción', 'error');
    return;
  }
  
  try {
    const payload = {
      ie_id: parseInt(ieId, 10),
      nombre_completo: nombre,
      dni: dni,
      cargo: cargo
    };
    if (currentPublicCapacitacion.incluye_encuesta) {
      payload.calificacion_satisfaccion = parseInt(rating, 10);
      payload.sugerencias = sugerencias || null;
    }
    
    document.getElementById('pub-cap-submit-btn').disabled = true;
    document.getElementById('pub-cap-submit-btn').textContent = 'Registrando...';
    
    const res = await api('/api/public/capacitaciones/' + capId + '/registrar', {
      method: 'POST',
      body: payload
    });
    
    document.getElementById('pub-cap-form').style.display = 'none';
    const successScreen = document.getElementById('pub-cap-success');
    successScreen.style.display = 'block';
    
    document.getElementById('success-ie-name').textContent = document.getElementById('pub-cap-selected-ie-text').textContent;
    document.getElementById('success-user-name').textContent = nombre;
    
    const regDate = new Date(res.registro.fecha_registro);
    const timeFormatted = regDate.toLocaleString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    document.getElementById('success-time').textContent = timeFormatted;
    
    showToast('Asistencia registrada con éxito', 'success');
  } catch (err) {
    showToast(err.message || 'Error al registrar la asistencia', 'error');
  } finally {
    document.getElementById('pub-cap-submit-btn').disabled = false;
    document.getElementById('pub-cap-submit-btn').textContent = 'Registrar Asistencia';
  }
}

document.addEventListener('click', function(e) {
  const container = document.getElementById('pub-cap-autocomplete');
  if (container && !container.contains(e.target) && e.target.id !== 'pub-cap-ie-search') {
    container.style.display = 'none';
  }
});

async function handleExcelImport(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = async function(e) {
    var base64 = e.target.result.split(',')[1];
    var statusSpan = document.getElementById('import-excel-status');
    statusSpan.textContent = 'Procesando archivo...';
    statusSpan.style.color = 'var(--primary)';

    try {
      var res = await api('/api/actividades/' + window._monCurrentActId + '/import-excel', {
        method: 'POST',
        body: { file: base64 }
      });

      if (res.ok) {
        statusSpan.textContent = '¡Actualizado!';
        statusSpan.style.color = 'var(--success)';
        showToast(res.mensaje, 'success');

        if (res.errors && res.errors.length > 0) {
          alert('Algunas filas no pudieron ser procesadas:\n\n' + res.errors.join('\n'));
        }

        await loadMonitoreo();
        openMonModal(window._monCurrentActId);
      } else {
        statusSpan.textContent = 'Error al procesar.';
        statusSpan.style.color = 'var(--danger)';
        showToast(res.error || 'Error en el servidor', 'error');
      }
    } catch(err) {
      statusSpan.textContent = 'Error al leer archivo.';
      statusSpan.style.color = 'var(--danger)';
      showToast('Error al leer el Excel: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}


// ==================== AGREGAR IEs A ACTIVIDAD ====================
let currentActIdForAdd = null;
let currentActIesList = [];
let selectedIEIdsAdd = {};

async function abrirAgregarIEsModal(actId, iesAsignadas) {
  if (!allIEs || allIEs.length === 0) {
    try {
      var d = await api('/api/ies');
      allIEs = d.ies || d || [];
    } catch (e) {
      showToast('Error al cargar IEs: ' + e.message, 'error');
    }
  }

  currentActIdForAdd = actId;
  currentActIesList = iesAsignadas.map(a => a.ie_id);
  selectedIEIdsAdd = {};

  var html = '<div style="margin-bottom:16px;">' +
      '<input type="text" id="add-ie-search" class="form-control" placeholder="Buscar por nombre o código..." oninput="filterAddIesList()">' +
    '</div>' +
    '<div id="add-ie-checkbox-list" class="row" style="max-height: 400px; overflow-y: auto;"></div>';
  
  showModal('Agregar Instituciones', html, 
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="guardarAgregarIEs()">Agregar Seleccionadas</button>'
  );

  // Bring main-modal to front to ensure it covers mon-detail-modal
  var mainModal = document.getElementById('main-modal');
  if (mainModal) {
      mainModal.style.zIndex = "2100";
  }

  filterAddIesList();
}

function filterAddIesList() {
  var q = document.getElementById('add-ie-search') ? document.getElementById('add-ie-search').value.toLowerCase() : '';
  
  var filtered = allIEs.filter(function(ie) {
    if (currentActIesList.includes(ie.id)) return false;
    return ie.codigo.toLowerCase().indexOf(q) !== -1 || ie.nombre.toLowerCase().indexOf(q) !== -1;
  });
  
  renderIECheckboxesAdd(filtered);
}

function syncIEMasterAdd(cb, id) {
  var card = document.getElementById('add-ie-card-' + id);
  var container = document.getElementById('add-ie-pill-container-' + id);
  if (cb.checked) {
    selectedIEIdsAdd[id] = 'ALL';
    if (card) card.classList.add('active');
    if (container) container.style.display = 'flex';
    document.querySelectorAll('.add-ie-subcb-' + id).forEach(el => {
      el.checked = true;
      var pill = document.getElementById('add-ie-pill-' + id + '-' + el.value);
      if (pill) pill.classList.add('active');
    });
  } else {
    delete selectedIEIdsAdd[id];
    if (card) card.classList.remove('active');
    if (container) container.style.display = 'none';
    document.querySelectorAll('.add-ie-subcb-' + id).forEach(el => {
      el.checked = false;
      var pill = document.getElementById('add-ie-pill-' + id + '-' + el.value);
      if (pill) pill.classList.remove('active');
    });
  }
}

function syncIESubAdd(id, cb, clave) {
  var pill = document.getElementById('add-ie-pill-' + id + '-' + clave);
  if (pill) {
    if (cb.checked) pill.classList.add('active');
    else pill.classList.remove('active');
  }

  var subs = document.querySelectorAll('.add-ie-subcb-' + id);
  var checkedClaves = [];
  var allChecked = true;
  subs.forEach(el => {
    if (el.checked) checkedClaves.push(el.value);
    else allChecked = false;
  });
  var masterCb = document.querySelector('.add-ie-checkbox[value="' + id + '"]');
  var card = document.getElementById('add-ie-card-' + id);
  if (checkedClaves.length === 0) {
    delete selectedIEIdsAdd[id];
    if (masterCb) masterCb.checked = false;
    if (card) card.classList.remove('active');
  } else if (allChecked) {
    selectedIEIdsAdd[id] = 'ALL';
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  } else {
    selectedIEIdsAdd[id] = checkedClaves;
    if (masterCb) masterCb.checked = true;
    if (card) card.classList.add('active');
  }
}

function renderIECheckboxesAdd(ies) {
  var html = '';
  for (var i = 0; i < ies.length; i++) {
    var ie = ies[i];
    var hasLevels = ie.niveles && ie.niveles.length > 0;
    var isSelected = !!selectedIEIdsAdd[ie.id];
    var activeClass = isSelected ? 'active' : '';
    
    html += '<div class="col-md-6 mb-2">';
    html += '<div class="ie-item-card ' + activeClass + '" id="add-ie-card-' + ie.id + '">';
    html += '  <label class="ie-item-header">';
    html += '    <input type="checkbox" class="add-ie-checkbox" onchange="syncIEMasterAdd(this, ' + ie.id + ')" value="' + ie.id + '" ' + (isSelected ? 'checked' : '') + '>';
    html += '    <div class="ie-item-title"><span>' + ie.codigo + '</span> ' + ie.nombre + '</div>';
    html += '  </label>';
    
    if (hasLevels) {
      html += '  <div class="level-pill-container" ' + (isSelected ? '' : 'style="display:none;"') + ' id="add-ie-pill-container-' + ie.id + '">';
      ie.niveles.forEach(function(nv) {
        var isNvChecked = false;
        if (selectedIEIdsAdd[ie.id]) {
          if (Array.isArray(selectedIEIdsAdd[ie.id])) {
            isNvChecked = selectedIEIdsAdd[ie.id].includes(nv.clave);
          } else {
            isNvChecked = true;
          }
        }
        var pillClass = isNvChecked ? 'active' : '';
        html += '    <label class="level-pill ' + pillClass + '" id="add-ie-pill-' + ie.id + '-' + nv.clave + '">';
        html += '      <input type="checkbox" class="add-ie-subcb-' + ie.id + '" value="' + nv.clave + '" onchange="syncIESubAdd(' + ie.id + ', this, \'' + nv.clave + '\')" ' + (isNvChecked ? 'checked' : '') + '>';
        html += '      ' + nv.nombre;
        html += '    </label>';
      });
      html += '  </div>';
    }
    html += '</div></div>';
  }
  
  var container = document.getElementById('add-ie-checkbox-list');
  if(container) {
    container.innerHTML = html || '<div class="col-12 text-muted">No se encontraron instituciones disponibles o todas ya fueron asignadas.</div>';
  }
}

async function guardarAgregarIEs() {
  var targetIes = [];
  for (var k in selectedIEIdsAdd) {
    targetIes.push({ id: parseInt(k), niveles: selectedIEIdsAdd[k] === 'ALL' ? null : selectedIEIdsAdd[k] });
  }

  if (targetIes.length === 0) {
    showToast('Seleccione al menos una IE', 'error');
    return;
  }

  try {
    var res = await api('/api/actividades/' + currentActIdForAdd + '/agregar-ies', {
      method: 'POST',
      body: { ies: targetIes }
    });
    showToast('Se agregaron ' + res.agregadas + ' IEs a la actividad', 'success');
    closeModal();
    // close the detail modal too and reload
    document.getElementById('mon-detail-modal').classList.remove('show');
    loadMonitoreo();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}
