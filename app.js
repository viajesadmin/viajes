// URL de la aplicación web de Google Apps Script (paso 3 del README).
const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbzVXYDknlm86G8fuzWVRElYrQXXpNYO3R2KOXARWUhSOD65I_OXVNULHdFDMPLw91zc/exec';

const formulario = document.getElementById('formulario');
const boton = document.getElementById('boton-enviar');
const mensaje = document.getElementById('mensaje');

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

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
  boton.textContent = 'Enviando...';
  mostrarMensaje('', '');

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
    mostrarMensaje('¡Gracias! Tu evaluación fue registrada.', 'exito');
  } catch (error) {
    mostrarMensaje(`Ocurrió un error: ${error.message} Intenta de nuevo.`, 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar evaluación';
  }
});