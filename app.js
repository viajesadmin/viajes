// URL de la aplicación web de Google Apps Script (paso 3 del README).
const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbxlpfqXwb9L6Wxi_b0gz7C78rdhYTO3ovEUFins-sy2eu3TUYxXkTf7tv3Edj0EisSp/exec';

const formulario = document.getElementById('formulario');
const boton = document.getElementById('boton-enviar');
const mensaje = document.getElementById('mensaje');

const modal = document.getElementById('modal');
const modalProcesando = document.getElementById('modal-procesando');
const modalExito = document.getElementById('modal-exito');
const modalCerrar = document.getElementById('modal-cerrar');

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

// Cambia qué estado del modal se ve: 'procesando' o 'exito'.
function mostrarModal(estado) {
  modalProcesando.hidden = estado !== 'procesando';
  modalExito.hidden = estado !== 'exito';
  if (!modal.open) modal.showModal();
  if (estado === 'exito') modalCerrar.focus();
}

// Mientras se procesa, la tecla Escape no debe cerrar el modal:
// la persona podría pensar que canceló el envío (y no es así).
modal.addEventListener('cancel', (evento) => {
  if (!modalProcesando.hidden) evento.preventDefault();
});

modalCerrar.addEventListener('click', () => modal.close());

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formulario.classList.add('intentado');

  // Validación en el navegador: revisa los campos con "required".
  if (!formulario.checkValidity()) {
    formulario.reportValidity();
    mostrarMensaje('Por favor completa los campos obligatorios.', 'error');
    return;
  }

  if (URL_APPS_SCRIPT.startsWith('PEGA_AQUI')) {
    mostrarMensaje('Falta configurar la URL de Apps Script en app.js.', 'error');
    return;
  }

  // Convierte el formulario en un objeto { nombre: '...', objetivo: '...', ... }
  const datos = Object.fromEntries(new FormData(formulario));

  boton.disabled = true;
  mostrarMensaje('', '');
  mostrarModal('procesando');

  try {
    // Sin cabecera Content-Type: el navegador envía "text/plain", que es una
    // "petición simple" y evita la verificación previa CORS (preflight) que
    // Apps Script no sabe responder.
    const respuesta = await fetch(URL_APPS_SCRIPT, {
      method: 'POST',
      body: JSON.stringify(datos),
    });
    const resultado = await respuesta.json();

    if (!resultado.ok) {
      throw new Error(resultado.error || 'No se pudo guardar la respuesta.');
    }

    formulario.reset();
    formulario.classList.remove('intentado');
    mostrarModal('exito');
  } catch (error) {
    // Si falla, se cierra el modal y el error se muestra bajo el botón,
    // conservando lo que la persona escribió para que pueda reintentar.
    modal.close();
    mostrarMensaje(`Ocurrió un error: ${error.message} Intenta de nuevo.`, 'error');
  } finally {
    boton.disabled = false;
  }
});