// URL_APPS_SCRIPT viene de config.js (se carga antes que este archivo).

const formulario = document.getElementById('formulario');
const boton = document.getElementById('boton-enviar');
const mensaje = document.getElementById('mensaje');
const avisoSinInvitacion = document.getElementById('sin-invitacion');
const administradorFijo = document.getElementById('administrador-fijo');

const modal = document.getElementById('modal');
const modalProcesando = document.getElementById('modal-procesando');
const modalExito = document.getElementById('modal-exito');
const modalCerrar = document.getElementById('modal-cerrar');

// ---------- Invitación ----------
/**
 * Lee la invitación del enlace (…/?inv=CARGA.FIRMA) y extrae el nombre del
 * administrador para MOSTRARLO.
 *
 * Ojo: aquí solo se decodifica la CARGA, no se verifica la FIRMA (para eso se
 * necesita el secreto, que solo tiene Apps Script). Si alguien altera el enlace,
 * aquí podría verse otro nombre, pero el servidor rechaza el envío porque la
 * firma no coincide. El navegador muestra; el servidor decide.
 */
function leerInvitacion() {
  const token = new URLSearchParams(window.location.search).get('inv');
  if (!token) return null;

  try {
    const [cargaB64] = token.split('.');
    // base64 "apto para URL" usa - y _ en lugar de + y /
    const base64 = cargaB64.replace(/-/g, '+').replace(/_/g, '/');
    // atob devuelve bytes; TextDecoder los convierte a texto UTF-8 (para tildes y ñ)
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const carga = JSON.parse(new TextDecoder().decode(bytes));

    if (carga.t !== 'inv' || typeof carga.n !== 'string' || !carga.n.trim()) return null;
    return { token, administrador: carga.n };
  } catch {
    return null; // enlace incompleto o modificado
  }
}

const invitacion = leerInvitacion();

if (invitacion) {
  // textContent: el nombre se muestra como texto, nunca como HTML
  administradorFijo.textContent = invitacion.administrador;
  document.getElementById('subtitulo').textContent =
    `Hola ${invitacion.administrador}, tu respuesta a este formulario nos ayuda a recopilar ` +
    'información para mejorar cada día, es de carácter obligatorio y toma menos de 2 minutos.';
  formulario.hidden = false;
} else {
  avisoSinInvitacion.hidden = false;
}

// ---------- Mensajes y modal ----------
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

// ---------- Envío ----------
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
    mostrarMensaje('Falta configurar la URL de Apps Script en config.js.', 'error');
    return;
  }

  // Convierte el formulario en un objeto { nombre: '...', objetivo: '...', ... } y agrega la invitación.
  // No se envía el administrador: el servidor lo toma de la invitación firmada.
  const datos = Object.fromEntries(new FormData(formulario));
  datos.invitacion = invitacion.token;

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

    // reset() limpia las respuestas; el administrador se conserva porque no es un
    // campo del formulario. Así el mismo enlace sirve para la siguiente visita.
    formulario.reset();
    formulario.classList.remove('intentado');
    mostrarModal('exito');
  } catch (error) {
    // Si falla, se cierra el modal y el error se muestra bajo el botón,
    // conservando lo que la persona escribió para que pueda reintentar.
    modal.close();
    // "TypeError" es lo que lanza fetch cuando no hay conexión o el servidor no responde
    // (el famoso "Failed to fetch"): se traduce a un mensaje entendible.
    const texto = error instanceof TypeError
      ? 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      : `${error.message}`;
    mostrarMensaje(texto, 'error');
  } finally {
    boton.disabled = false;
  }
});