// Panel de evaluaciones: login + tabla.
// URL_APPS_SCRIPT viene de config.js (se carga antes que este archivo).
//
// Nota de seguridad: esta página es pública (cualquiera puede ver este código).
// Por eso aquí NO se valida la contraseña ni se guardan datos: todo eso lo decide
// Apps Script. Esta página solo pide y muestra lo que el servidor autorice.

// Columnas de la tabla: "clave" es el nombre del dato que envía Apps Script.
const COLUMNAS = [
  { clave: 'fecha',         titulo: 'Fecha' },
  { clave: 'nombre',        titulo: 'Nombre de quien visita' },
  { clave: 'objetivo',      titulo: 'Objetivo de la visita' },
  { clave: 'cumplido',      titulo: '¿Se cumplió el objetivo?' },
  { clave: 'justificacion', titulo: 'Justificación' },
  { clave: 'calificacion',  titulo: 'Calificación de la visita' },
  { clave: 'temas_proxima', titulo: 'Temas para la próxima visita' },
  { clave: 'observaciones', titulo: 'Observaciones o sugerencias' },
];

const ZONA_HORARIA = 'America/Bogota';
const formatoFecha = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, dateStyle: 'medium', timeStyle: 'short' });
// 'en-CA' formatea como AAAA-MM-DD, el mismo formato que usan los <input type="date">
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });

// ---------- Elementos de la página ----------
const vistaLogin = document.getElementById('vista-login');
const vistaPanel = document.getElementById('vista-panel');
const formLogin = document.getElementById('form-login');
const botonLogin = document.getElementById('boton-login');
const mensajeLogin = document.getElementById('mensaje-login');
const mensajePanel = document.getElementById('mensaje-panel');
const contador = document.getElementById('contador');
const encabezado = document.getElementById('tabla-encabezado');
const cuerpo = document.getElementById('tabla-cuerpo');
const sinResultados = document.getElementById('sin-resultados');
const inputBuscar = document.getElementById('buscar');
const inputDesde = document.getElementById('desde');
const inputHasta = document.getElementById('hasta');
const selectOrden = document.getElementById('orden');
const botonRecargar = document.getElementById('boton-recargar');
const detalle = document.getElementById('detalle');
const detalleContenido = document.getElementById('detalle-contenido');

let respuestas = [];

// ---------- Sesión ----------
// sessionStorage (y no localStorage): el token se borra al cerrar la pestaña,
// así nadie encuentra la sesión abierta si la jefe usa un computador compartido.
// try/catch porque algunos navegadores en modo privado bloquean el almacenamiento;
// en ese caso el token vive solo en la variable mientras la página esté abierta.
const CLAVE_SESION = 'panel_token';
let token = leerSesion();

function leerSesion() {
  try { return sessionStorage.getItem(CLAVE_SESION); } catch { return null; }
}
function guardarSesion(nuevoToken) {
  token = nuevoToken;
  try { sessionStorage.setItem(CLAVE_SESION, nuevoToken); } catch { /* sigue en memoria */ }
}
function borrarSesion() {
  token = null;
  try { sessionStorage.removeItem(CLAVE_SESION); } catch { /* nada que borrar */ }
}

// ---------- Comunicación con Apps Script ----------
async function llamarApi(cuerpoPeticion) {
  if (URL_APPS_SCRIPT.startsWith('PEGA_AQUI')) {
    throw new Error('Falta configurar la URL de Apps Script en config.js.');
  }
  // Sin cabecera Content-Type: así es una "petición simple" y se evita el preflight CORS.
  const respuesta = await fetch(URL_APPS_SCRIPT, {
    method: 'POST',
    body: JSON.stringify(cuerpoPeticion),
  });
  return respuesta.json();
}

// ---------- Vistas ----------
function mostrarVista(nombre) {
  vistaLogin.hidden = nombre !== 'login';
  vistaPanel.hidden = nombre !== 'panel';
}

function mostrarMensaje(elemento, texto, tipo = '') {
  elemento.textContent = texto;
  elemento.className = `mensaje ${tipo}`;
}

// ---------- Login ----------
formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!formLogin.checkValidity()) {
    formLogin.reportValidity();
    return;
  }

  const datos = Object.fromEntries(new FormData(formLogin));
  botonLogin.disabled = true;
  botonLogin.textContent = 'Ingresando...';
  mostrarMensaje(mensajeLogin, '');

  try {
    const resultado = await llamarApi({ accion: 'login', usuario: datos.usuario, clave: datos.clave });
    if (!resultado.ok) throw new Error(resultado.error || 'No se pudo iniciar sesión.');

    guardarSesion(resultado.token);
    formLogin.reset(); // no dejar la contraseña escrita en el campo
    mostrarVista('panel');
    cargarRespuestas();
  } catch (error) {
    mostrarMensaje(mensajeLogin, error.message, 'error');
  } finally {
    botonLogin.disabled = false;
    botonLogin.textContent = 'Ingresar';
  }
});

function cerrarSesion(motivo = '') {
  borrarSesion();
  respuestas = [];
  cuerpo.replaceChildren();
  contador.textContent = '';
  mostrarVista('login');
  mostrarMensaje(mensajeLogin, motivo, motivo ? 'error' : '');
  document.getElementById('usuario').focus();
}

document.getElementById('boton-salir').addEventListener('click', () => cerrarSesion());

// ---------- Datos ----------
async function cargarRespuestas() {
  mostrarMensaje(mensajePanel, 'Cargando respuestas...');
  botonRecargar.disabled = true;

  try {
    const resultado = await llamarApi({ accion: 'datos', token });

    if (!resultado.ok) {
      // El servidor rechazó el token (venció o fue alterado): volver al login.
      if (resultado.codigo === 'TOKEN_INVALIDO') {
        cerrarSesion(resultado.error);
        return;
      }
      throw new Error(resultado.error || 'Error desconocido.');
    }

    // Se precalcula lo que usan los filtros, para no recalcularlo en cada tecla.
    respuestas = resultado.respuestas.map((r) => {
      const fecha = new Date(r.fecha);
      const valida = !Number.isNaN(fecha.getTime());
      return {
        ...r,
        _fecha: valida ? fecha : null,
        _dia: valida ? formatoDia.format(fecha) : '',
        _texto: normalizar(COLUMNAS.map((c) => r[c.clave] ?? '').join(' ')),
      };
    });

    mostrarMensaje(mensajePanel, '');
    renderizar();
  } catch (error) {
    mostrarMensaje(mensajePanel, `No se pudieron cargar las respuestas: ${error.message}`, 'error');
  } finally {
    botonRecargar.disabled = false;
  }
}

botonRecargar.addEventListener('click', cargarRespuestas);

// Minúsculas y sin tildes: así "gestion" encuentra "Gestión".
function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------- Filtros y tabla ----------
function filtrar() {
  const terminos = normalizar(inputBuscar.value).split(/\s+/).filter(Boolean);
  const desde = inputDesde.value; // 'AAAA-MM-DD' o ''
  const hasta = inputHasta.value;

  const resultado = respuestas.filter((r) => {
    // Cada palabra buscada debe aparecer en algún campo de la respuesta.
    if (!terminos.every((t) => r._texto.includes(t))) return false;
    // Las fechas en formato AAAA-MM-DD se pueden comparar como texto.
    if (desde && r._dia < desde) return false;
    if (hasta && r._dia > hasta) return false;
    return true;
  });

  const signo = selectOrden.value === 'asc' ? 1 : -1;
  resultado.sort((a, b) => signo * ((a._fecha?.getTime() ?? 0) - (b._fecha?.getTime() ?? 0)));
  return resultado;
}

function renderizar() {
  const visibles = filtrar();

  const mesActual = formatoDia.format(new Date()).slice(0, 7); // 'AAAA-MM'
  const esteMes = respuestas.filter((r) => r._dia.startsWith(mesActual)).length;
  contador.textContent =
    `Mostrando ${visibles.length} de ${respuestas.length} respuestas · ${esteMes} este mes`;

  // IMPORTANTE: las celdas se llenan con textContent, NUNCA con innerHTML.
  // Las respuestas las escribe cualquier persona en el formulario; si alguien escribe
  // <script>...</script> y se insertara como HTML, ese código se ejecutaría aquí,
  // en la sesión de la jefe (ataque XSS). textContent lo muestra como texto inofensivo.
  const filas = visibles.map((r) => {
    const tr = document.createElement('tr');
    tr.tabIndex = 0; // permite llegar a la fila con Tab y abrirla con Enter
    tr.addEventListener('click', () => abrirDetalle(r));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirDetalle(r);
      }
    });

    for (const columna of COLUMNAS) {
      const td = document.createElement('td');
      td.dataset.label = columna.titulo; // en celular se muestra como etiqueta de la tarjeta
      td.className = `col-${columna.clave}`;
      const contenido = document.createElement('div');
      contenido.className = 'recorte';
      contenido.textContent = valorVisible(r, columna.clave);
      td.append(contenido);
      tr.append(td);
    }
    return tr;
  });

  cuerpo.replaceChildren(...filas);
  sinResultados.hidden = visibles.length > 0 || respuestas.length === 0;
  if (respuestas.length === 0) {
    mostrarMensaje(mensajePanel, 'Todavía no hay respuestas guardadas.');
  }
}

function valorVisible(respuesta, clave) {
  if (clave === 'fecha') {
    return respuesta._fecha ? formatoFecha.format(respuesta._fecha) : respuesta.fecha;
  }
  return respuesta[clave]?.trim() || '—';
}

[inputBuscar, inputDesde, inputHasta, selectOrden].forEach((el) => {
  el.addEventListener('input', renderizar);
});

document.getElementById('limpiar-filtros').addEventListener('click', () => {
  inputBuscar.value = '';
  inputDesde.value = '';
  inputHasta.value = '';
  selectOrden.value = 'desc';
  renderizar();
});

// ---------- Detalle ----------
function abrirDetalle(respuesta) {
  const elementos = COLUMNAS.flatMap((columna) => {
    const dt = document.createElement('dt');
    dt.textContent = columna.titulo;
    const dd = document.createElement('dd');
    dd.textContent = valorVisible(respuesta, columna.clave); // textContent: mismo motivo que en la tabla
    return [dt, dd];
  });
  detalleContenido.replaceChildren(...elementos);
  detalle.showModal();
}

document.getElementById('detalle-cerrar').addEventListener('click', () => detalle.close());
// Clic en el fondo oscuro (fuera del cuadro) también cierra el detalle.
detalle.addEventListener('click', (e) => {
  if (e.target === detalle) detalle.close();
});

// ---------- Inicio ----------
encabezado.replaceChildren(...COLUMNAS.map((c) => {
  const th = document.createElement('th');
  th.scope = 'col';
  th.textContent = c.titulo;
  return th;
}));

// Si ya había una sesión en esta pestaña, se intenta usar. Si el token venció,
// el servidor lo rechaza y cargarRespuestas() devuelve al login.
if (token) {
  mostrarVista('panel');
  cargarRespuestas();
} else {
  mostrarVista('login');
}