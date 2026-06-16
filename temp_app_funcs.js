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