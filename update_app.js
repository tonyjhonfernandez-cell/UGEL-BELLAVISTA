const fs = require('fs');
let content = fs.readFileSync('public/js/app.js', 'utf8');

const newFunc = `
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
          alert('Algunas filas no pudieron ser procesadas:\\n\\n' + res.errors.join('\\n'));
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
`;

content += '\n' + newFunc;
fs.writeFileSync('public/js/app.js', content);
console.log('App.js updated');
