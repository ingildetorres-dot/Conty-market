/* ============================================================
   CONTY MARKET POS  ·  app.js
   Punto de venta para tiendas y minimercados
   ============================================================ */
'use strict';

/* ---------- 1. UTILIDADES ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const kg = n => {
  const v = Number(n) || 0;
  let t = v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return t.replace('.', ',') + ' kg';
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dayKey = (t = now()) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const fecha = t => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const hora = t => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

function toast(msg, kind = '', ms = 2300) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function beep(freq = 880, ms = 90) {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    A.ac = A.ac || new C();
    const o = A.ac.createOscillator(), g = A.ac.createGain();
    o.frequency.value = freq; o.type = 'square';
    g.gain.value = .06; o.connect(g); g.connect(A.ac.destination);
    o.start(); o.stop(A.ac.currentTime + ms / 1000);
  } catch (e) { }
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }

const ICON = {
  vender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18l-1.6 9.4a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6L4 6"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 6 2 3"/></svg>',
  inv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  caja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="14" r="1.6"/></svg>',
  rep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="6" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18" r="1.6"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8a2 2 0 0 1 2-2h2l1.4-2h7.2L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
  bal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v3M5 21h14M8 21l1-9M16 21l-1-9"/><path d="M3 9h18l-2.6 4H5.6L3 9z"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'
};

/* ---------- 2. ESTADO GLOBAL ---------- */
const A = {
  fb: null, dbf: null, online: false, listos: false,
  user: null,          // empleado logueado
  tab: 'vender',
  carrito: [],
  cliente: null,       // cliente para fiado
  descuento: 0,
  turno: null,         // turno de caja abierto
  scan: { buf: '', t: 0, timer: null },
  balanza: { tipo: null, port: null, dev: null, peso: 0, vivo: false },
  ac: null,
  filtro: '', filtroCat: 'todas', catVenta: 'todas',
  mem: {}, subs: []
};

const COLS = ['productos', 'empleados', 'clientes', 'ventas', 'turnos', 'gastos', 'compras', 'ajustes', 'fotos'];
COLS.forEach(c => A.mem[c] = {});

const DEF_CFG = {
  id: 'general',
  tienda: 'Conty Market',
  sede: 'Principal',
  nit: '',
  dir: '',
  tel: '',
  whatsapp: '',
  redondeo: 50,             // 0, 50 o 100
  moneda: 'COP',
  balanzaPrefijo: '2',      // prefijo de código de balanza etiquetadora
  balanzaLenCod: 5,         // dígitos del código interno (PLU)
  balanzaLenVal: 5,         // dígitos del valor
  balanzaCampo: 'precio',   // 'precio' o 'peso'
  balanzaDec: 3,            // decimales si el campo es peso
  balanzaBaud: 9600,
  btServicio: '0000ffe0-0000-1000-8000-00805f9b34fb',
  btCarac: '0000ffe1-0000-1000-8000-00805f9b34fb',
  imprimir: true,
  alertaStock: true
};
let CFG = { ...DEF_CFG };

/* ---------- 3. ALMACENAMIENTO LOCAL ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('cmp_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cmp_' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('cmp_' + k); } catch (e) { } }
};

function cargarLocal() {
  COLS.forEach(c => { A.mem[c] = LS.get('col_' + c, {}) || {}; });
  CFG = { ...DEF_CFG, ...(LS.get('cfg', {}) || {}) };
}
function guardarLocal(col) { LS.set('col_' + col, A.mem[col]); }

/* ---------- 4. CAPA DE DATOS (local + Firebase) ---------- */
const DB = {
  all(col) { return Object.values(A.mem[col] || {}).filter(x => x && !x._del); },

  get(col, id) { const d = A.mem[col][id]; return d && !d._del ? d : null; },

  set(col, obj) {
    if (!obj.id) obj.id = uid();
    obj.updatedAt = now();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    A.mem[col][obj.id] = obj;
    guardarLocal(col);
    if (A.dbf) A.dbf.collection(col).doc(obj.id).set(obj, { merge: true }).catch(e => console.warn('nube:', e.message));
    return obj;
  },

  del(col, id) {
    const d = A.mem[col][id];
    if (d) { d._del = true; d.updatedAt = now(); guardarLocal(col); }
    if (A.dbf) A.dbf.collection(col).doc(id).set({ id, _del: true, updatedAt: now() }, { merge: true }).catch(() => { });
  },

  cfg(patch) {
    CFG = { ...CFG, ...patch };
    LS.set('cfg', CFG);
    if (A.dbf) A.dbf.collection('ajustes').doc('general').set(CFG, { merge: true }).catch(() => { });
  }
};

/* ---------- 5. CONEXIÓN A FIREBASE ---------- */
function fbConfig() { return LS.get('fbcfg', null); }

async function conectarFirebase() {
  const cfg = fbConfig();
  if (!cfg || !cfg.projectId || !window.firebase) return false;
  try {
    A.fb = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    A.dbf = firebase.firestore();
    try { await A.dbf.enablePersistence({ synchronizeTabs: true }); } catch (e) { }
    try { await firebase.auth().signInAnonymously(); } catch (e) { console.warn('auth anónima:', e.message); }
    escucharNube();
    A.online = true;
    return true;
  } catch (e) {
    console.error('Firebase', e);
    toast('No se pudo conectar a la nube: ' + e.message, 'err', 4000);
    return false;
  }
}

function escucharNube() {
  A.subs.forEach(u => { try { u(); } catch (e) { } });
  A.subs = [];
  const liviano = ['productos', 'empleados', 'clientes', 'ajustes'];
  liviano.forEach(col => {
    A.subs.push(A.dbf.collection(col).onSnapshot(sn => {
      sn.docChanges().forEach(ch => aplicarDoc(col, ch.doc.data()));
      guardarLocal(col);
      if (col === 'ajustes') { const g = A.mem.ajustes.general; if (g) { CFG = { ...CFG, ...g }; LS.set('cfg', CFG); } }
      pintar();
    }, e => console.warn(col, e.message)));
  });
  // Histórico reciente (30 días) para no descargar todo
  const desde = now() - 31 * 864e5;
  ['ventas', 'turnos', 'gastos', 'compras'].forEach(col => {
    A.subs.push(A.dbf.collection(col).where('createdAt', '>=', desde).onSnapshot(sn => {
      sn.docChanges().forEach(ch => aplicarDoc(col, ch.doc.data()));
      guardarLocal(col);
      if (col === 'turnos') detectarTurno();
      pintar();
    }, e => console.warn(col, e.message)));
  });
  // Las fotos pesan más: se traen aparte y unos segundos después,
  // para que la pantalla de vender abra de una.
  setTimeout(() => {
    if (!A.dbf) return;
    A.subs.push(A.dbf.collection('fotos').onSnapshot(sn => {
      sn.docChanges().forEach(ch => aplicarDoc('fotos', ch.doc.data()));
      guardarLocal('fotos');
      pintar();
    }, e => console.warn('fotos', e.message)));
  }, 2500);

  firebase.firestore().enableNetwork().catch(() => { });
}

function aplicarDoc(col, d) {
  if (!d || !d.id) return;
  const mio = A.mem[col][d.id];
  if (!mio || (d.updatedAt || 0) >= (mio.updatedAt || 0)) A.mem[col][d.id] = d;
}

window.addEventListener('online', () => { A.online = true; pintarTop(); });
window.addEventListener('offline', () => { A.online = false; pintarTop(); });

/* ---------- 6. REGLAS DE NEGOCIO ---------- */
function redondear(n) {
  const r = Number(CFG.redondeo) || 0;
  if (!r) return Math.round(n);
  return Math.round(n / r) * r;
}

function stockDe(p) { return Number(p.stock) || 0; }

function bajoStock(p) {
  const min = Number(p.stockMin) || 0;
  return min > 0 && stockDe(p) <= min;
}

/* Sugerencia de pedido: dejar el doble del mínimo */
function sugerido(p) {
  const min = Number(p.stockMin) || 0;
  const falta = Math.max(0, min * 2 - stockDe(p));
  return p.unidad === 'kg' ? Math.round(falta * 10) / 10 : Math.ceil(falta);
}
function paraPedir() {
  return DB.all('productos').filter(p => p.activo !== false && bajoStock(p))
    .sort((a, b) => (stockDe(a) / (Number(a.stockMin) || 1)) - (stockDe(b) / (Number(b.stockMin) || 1)));
}
function listaPedido() {
  const ps = paraPedir();
  const L = ['PEDIDO · ' + CFG.tienda, dayKey(), '--------------------------------'];
  ps.forEach(p => L.push('- ' + p.nombre + ': ' + sugerido(p) + (p.unidad === 'kg' ? ' kg' : ' und') +
    (stockDe(p) <= 0 ? '  (AGOTADO)' : '')));
  L.push('--------------------------------');
  L.push(ps.length + ' productos');
  return L.join('\n');
}

function catalogo() {
  return DB.all('productos').filter(p => p.activo !== false)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

/* --- Fotos de producto --- */
function fotoDe(pid) {
  const f = pid && A.mem.fotos ? A.mem.fotos[pid] : null;
  return f && !f._del && f.d ? f.d : null;
}
function thumb(p, cls = 'th') {
  const f = fotoDe(p.pid || p.id);
  if (f) return `<img class="${cls}" src="${f}" alt="" loading="lazy">`;
  const l = String(p.nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="${cls} ph">${esc(l)}</div>`;
}
/* Comprime antes de guardar: 420px y calidad media dejan la foto en unos 20 KB,
   así no se llena la base de datos ni se gasta el plan de datos del celular. */
function comprimirFoto(file, max = 420, q = 0.62) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('Eso no es una imagen'));
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        let w = im.width, h = im.height;
        const e = Math.max(w, h);
        if (e > max) { w = Math.round(w * max / e); h = Math.round(h * max / e); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(im, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = () => rej(new Error('No pude leer la imagen'));
      im.src = fr.result;
    };
    fr.onerror = () => rej(new Error('No pude abrir el archivo'));
    fr.readAsDataURL(file);
  });
}

function categorias() {
  const s = new Set(catalogo().map(p => p.categoria).filter(Boolean));
  return [...s].sort();
}

function buscarPorCodigo(code) {
  code = String(code).trim();
  if (!code) return null;
  const ps = DB.all('productos');
  let p = ps.find(x => String(x.barcode || '').trim() === code);
  if (p) return { p };
  // código interno / PLU exacto
  p = ps.find(x => x.plu && String(x.plu).trim() === code);
  if (p) return { p };
  // código de balanza etiquetadora
  const bal = leerCodigoBalanza(code);
  if (bal) {
    p = ps.find(x => String(x.plu || '').trim() === bal.cod) ||
      ps.find(x => String(x.barcode || '').trim() === bal.cod);
    if (p) return { p, bal };
  }
  return null;
}

/* Códigos tipo 2 CCCCC VVVVV D  (balanza que imprime etiquetas) */
function leerCodigoBalanza(code) {
  const pre = String(CFG.balanzaPrefijo || '');
  if (!pre || !code.startsWith(pre)) return null;
  const lc = Number(CFG.balanzaLenCod) || 5, lv = Number(CFG.balanzaLenVal) || 5;
  if (code.length < pre.length + lc + lv) return null;
  const cod = code.substr(pre.length, lc).replace(/^0+/, '') || '0';
  const raw = code.substr(pre.length + lc, lv);
  if (!/^\d+$/.test(raw)) return null;
  const val = Number(raw);
  if (CFG.balanzaCampo === 'peso') {
    return { cod, peso: val / Math.pow(10, Number(CFG.balanzaDec) || 3), precio: null };
  }
  return { cod, peso: null, precio: val };
}

/* ---------- 7. CARRITO ---------- */
function totalLinea(l) {
  if (l.fijo) return redondear(l.fijo);
  if (l.unidad === 'kg') return redondear((Number(l.precio) || 0) * (Number(l.peso) || 0));
  return redondear((Number(l.precio) || 0) * (Number(l.cant) || 0));
}
function subtotal() { return A.carrito.reduce((s, l) => s + totalLinea(l), 0); }
function total() { return Math.max(0, redondear(subtotal() - (Number(A.descuento) || 0))); }
function unidadesCarrito() { return A.carrito.reduce((s, l) => s + (l.unidad === 'kg' ? 1 : (Number(l.cant) || 0)), 0); }

function agregar(p, opts = {}) {
  if (p.unidad === 'kg') {
    const peso = opts.peso;
    if (!peso) { modalPeso(p); return; }
    A.carrito.push({
      lid: uid(), pid: p.id, nombre: p.nombre, unidad: 'kg',
      precio: Number(p.precio) || 0, peso: Number(peso), cant: 1,
      costo: Number(p.costo) || 0, forzado: opts.forzado || null
    });
  } else {
    const ex = A.carrito.find(l => l.pid === p.id && l.unidad !== 'kg');
    if (ex) ex.cant = (Number(ex.cant) || 0) + (opts.cant || 1);
    else A.carrito.push({
      lid: uid(), pid: p.id, nombre: p.nombre, unidad: p.unidad || 'und',
      precio: Number(p.precio) || 0, cant: opts.cant || 1, costo: Number(p.costo) || 0
    });
  }
  beep(); vibrate(25);
  pintar();
}

function quitarLinea(lid) { A.carrito = A.carrito.filter(l => l.lid !== lid); pintar(); }
function cambiarCant(lid, d) {
  const l = A.carrito.find(x => x.lid === lid); if (!l) return;
  if (l.unidad === 'kg') { modalPeso(DB.get('productos', l.pid) || l, l); return; }
  l.cant = Math.max(0, (Number(l.cant) || 0) + d);
  if (l.cant === 0) quitarLinea(lid); else pintar();
}
function limpiarCarrito() { A.carrito = []; A.descuento = 0; A.cliente = null; pintar(); }

/* ---------- 8. ESCÁNER DE CÓDIGO DE BARRAS ----------
   Un lector USB o Bluetooth se comporta como teclado: escribe rápido
   y manda Enter. Detectamos la ráfaga y la separamos de un humano. */
function iniciarEscaner() {
  document.addEventListener('keydown', e => {
    if (!A.user) return;
    const activo = document.activeElement;
    const enCampo = activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA');
    const enCaptura = activo && activo.id === 'scaninput';

    if (e.key === 'Enter') {
      if (enCaptura) return;                    // el campo maneja su propio Enter
      const c = A.scan.buf; A.scan.buf = '';
      if (c.length >= 4) { e.preventDefault(); procesarCodigo(c); }
      return;
    }
    if (e.key.length !== 1) return;
    if (enCampo && !enCaptura) return;          // no robar teclas de otros campos
    const t = now();
    if (t - A.scan.t > 120) A.scan.buf = '';    // pausa larga = humano
    A.scan.t = t;
    A.scan.buf += e.key;
    clearTimeout(A.scan.timer);
    A.scan.timer = setTimeout(() => { A.scan.buf = ''; }, 200);
  });
}

function procesarCodigo(code) {
  code = String(code).trim();
  if (!code) return;
  const sb = $('#scanbar'); if (sb) { sb.classList.remove('beep'); void sb.offsetWidth; sb.classList.add('beep'); }
  const inp = $('#scaninput'); if (inp) inp.value = '';

  const r = buscarPorCodigo(code);
  if (!r) {
    beep(280, 200); vibrate([40, 60, 40]);
    modalNoEncontrado(code);
    return;
  }
  const { p, bal } = r;
  if (p.unidad === 'kg') {
    if (bal && bal.peso) return agregar(p, { peso: bal.peso });
    if (bal && bal.precio) {
      const peso = (Number(p.precio) > 0) ? bal.precio / Number(p.precio) : 0;
      A.carrito.push({
        lid: uid(), pid: p.id, nombre: p.nombre, unidad: 'kg',
        precio: Number(p.precio) || 0, peso: Number(peso.toFixed(3)), cant: 1,
        costo: Number(p.costo) || 0, fijo: bal.precio
      });
      beep(); vibrate(25); pintar(); return;
    }
    return modalPeso(p);
  }
  agregar(p, { cant: 1 });
}

/* Cámara como lector de respaldo */
let camStream = null, camLoop = null, zxing = null;
async function abrirCamara() {
  const w = document.createElement('div');
  w.id = 'camwrap';
  w.innerHTML = `
    <video id="camvid" playsinline muted></video>
    <div class="reticle"></div>
    <div class="camui">
      <div class="between" style="margin-bottom:10px">
        <div><div class="eyebrow" style="color:#9E9A90">Lector de cámara</div>
        <div id="camtxt" style="font-size:13px">Centra el código de barras…</div></div>
        <button class="btn sm ghost" style="border-color:#4A453C;color:#fff" id="camclose">Cerrar</button>
      </div>
      <input id="cammanual" type="tel" inputmode="numeric" placeholder="…o escribe el código y pulsa Enter">
    </div>`;
  document.body.appendChild(w);
  $('#camclose').onclick = cerrarCamara;
  $('#cammanual').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value.trim(); cerrarCamara(); procesarCodigo(v); } };

  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } });
    const v = $('#camvid'); v.srcObject = camStream; await v.play();
  } catch (e) {
    $('#camtxt').textContent = 'No se pudo abrir la cámara. Escribe el código abajo.';
    return;
  }

  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'] }); } catch (e) { }
  }
  if (!detector) {
    try {
      if (!zxing) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
        zxing = new ZXing.BrowserMultiFormatReader();
      }
      zxing.decodeFromVideoDevice(null, 'camvid', (res) => {
        if (res) { const t = res.getText(); cerrarCamara(); procesarCodigo(t); }
      });
      $('#camtxt').textContent = 'Buscando código…';
      return;
    } catch (e) {
      $('#camtxt').textContent = 'Este navegador no lee códigos con la cámara. Escribe el código abajo.';
      return;
    }
  }

  const v = $('#camvid');
  camLoop = setInterval(async () => {
    if (!camStream) return;
    try {
      const codes = await detector.detect(v);
      if (codes && codes.length) { const t = codes[0].rawValue; cerrarCamara(); procesarCodigo(t); }
    } catch (e) { }
  }, 350);
}
function cerrarCamara() {
  clearInterval(camLoop); camLoop = null;
  try { zxing && zxing.reset(); } catch (e) { }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  const w = $('#camwrap'); if (w) w.remove();
}

/* ---------- 9. BALANZA DIGITAL ----------
   3 caminos:
   a) USB / serial  -> navigator.serial   (Chrome en computador)
   b) Bluetooth     -> navigator.bluetooth (Chrome en Android)
   c) Manual        -> siempre disponible
   d) Etiqueta con código de barras -> se lee con el escáner (ver leerCodigoBalanza) */
const BAL = {
  soporteSerial: () => 'serial' in navigator,
  soporteBT: () => 'bluetooth' in navigator,

  async conectarSerial() {
    if (!BAL.soporteSerial()) return toast('Este navegador no soporta balanza por cable. Usa Chrome en computador.', 'warn', 4000);
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(CFG.balanzaBaud) || 9600 });
      A.balanza = { tipo: 'serial', port, peso: 0, vivo: true };
      toast('Balanza conectada por cable', 'ok');
      BAL.leerSerial(port);
      pintarTop();
    } catch (e) { toast('No se conectó: ' + e.message, 'err', 3500); }
  },

  async leerSerial(port) {
    const dec = new TextDecoderStream();
    port.readable.pipeTo(dec.writable).catch(() => { });
    const reader = dec.readable.getReader();
    let acc = '';
    try {
      while (A.balanza.vivo) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += value;
        if (acc.length > 200) acc = acc.slice(-100);
        const m = acc.match(/(-?\d+[.,]\d+)/g);
        if (m) { BAL.setPeso(parseFloat(m[m.length - 1].replace(',', '.'))); acc = ''; }
      }
    } catch (e) { }
    A.balanza.vivo = false; pintarTop();
  },

  async conectarBT() {
    if (!BAL.soporteBT()) return toast('Este navegador no soporta Bluetooth. Usa Chrome en Android.', 'warn', 4000);
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, optionalServices: [CFG.btServicio]
      });
      const srv = await (await dev.gatt.connect()).getPrimaryService(CFG.btServicio);
      const ch = await srv.getCharacteristic(CFG.btCarac);
      await ch.startNotifications();
      let acc = '';
      ch.addEventListener('characteristicvaluechanged', ev => {
        acc += new TextDecoder().decode(ev.target.value);
        if (acc.length > 200) acc = acc.slice(-100);
        const m = acc.match(/(-?\d+[.,]\d+)/g);
        if (m) { BAL.setPeso(parseFloat(m[m.length - 1].replace(',', '.'))); acc = ''; }
      });
      A.balanza = { tipo: 'bt', dev, peso: 0, vivo: true };
      dev.addEventListener('gattserverdisconnected', () => { A.balanza.vivo = false; pintarTop(); });
      toast('Balanza Bluetooth conectada', 'ok');
      pintarTop();
    } catch (e) { toast('No se conectó: ' + e.message, 'err', 4000); }
  },

  setPeso(p) {
    if (!isFinite(p)) return;
    A.balanza.peso = Math.abs(p);
    const el = $('#pesovivo');
    if (el) el.textContent = kg(A.balanza.peso);
  },

  desconectar() {
    A.balanza.vivo = false;
    try { A.balanza.port && A.balanza.port.close(); } catch (e) { }
    try { A.balanza.dev && A.balanza.dev.gatt.disconnect(); } catch (e) { }
    A.balanza = { tipo: null, port: null, dev: null, peso: 0, vivo: false };
    pintarTop();
  }
};

/* ---------- 10. MODALES ---------- */
function sheet(titulo, html, onMount) {
  cerrarSheet();
  const w = document.createElement('div');
  w.className = 'sheetwrap';
  w.innerHTML = `<div class="sheet"><div class="head"><h2>${esc(titulo)}</h2><button class="x" data-cerrar>&times;</button></div><div id="sheetbody">${html}</div></div>`;
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target === w || e.target.hasAttribute('data-cerrar')) cerrarSheet(); });
  if (onMount) onMount(w);
  return w;
}
function cerrarSheet() { $$('.sheetwrap').forEach(x => x.remove()); }

function confirmar(msg, onSi, textoSi = 'Sí, continuar') {
  sheet('Confirmar', `<p style="font-size:15px;margin:0 0 16px">${esc(msg)}</p>
    <div class="grid2"><button class="btn ghost" data-cerrar>Cancelar</button>
    <button class="btn dan" id="ok">${esc(textoSi)}</button></div>`,
    () => { $('#ok').onclick = () => { cerrarSheet(); onSi(); }; });
}

/* Pesar producto por kg */
function modalPeso(p, linea) {
  const precioKg = Number(p.precio) || 0;
  sheet('Pesar ' + (p.nombre || ''), `
    <div class="card">
      <div class="row">
        ${thumb(p, 'thb')}
        <div style="flex:1">
          <div class="eyebrow">Precio por kilo</div>
          <div class="disp" style="font-size:28px">${money(precioKg)}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="between" style="margin-bottom:8px">
        <span class="eyebrow">Balanza</span>
        <span class="chip ${A.balanza.vivo ? 'on' : 'off'}"><i class="dot"></i>${A.balanza.vivo ? 'Conectada' : 'Sin conectar'}</span>
      </div>
      <div class="disp" id="pesovivo" style="font-size:24px;text-align:center;margin:6px 0">${kg(A.balanza.peso)}</div>
      <div class="grid2">
        <button class="btn sm ghost" id="usarpeso" ${A.balanza.vivo ? '' : 'disabled'}>Usar este peso</button>
        <button class="btn sm ghost" id="conbal">Conectar balanza</button>
      </div>
    </div>
    <label class="f"><span>Peso en kilos (escríbelo si no tienes balanza conectada)</span>
      <input id="pkg" type="number" step="0.001" inputmode="decimal" value="${linea ? linea.peso : ''}" placeholder="Ej: 1.250"></label>
    <label class="f"><span>O escribe cuánto quiere de plata y calculamos el peso</span>
      <input id="pval" type="number" inputmode="numeric" placeholder="Ej: 5000"></label>
    <div class="card" style="background:var(--azul-l);border-color:var(--azul)">
      <div class="between"><span class="eyebrow">Total de esta línea</span>
      <span class="disp" id="ptot" style="font-size:24px">$0</span></div>
    </div>
    <button class="btn pri xl" id="pok">${linea ? 'Actualizar' : 'Agregar al carrito'}</button>
  `, () => {
    const inKg = $('#pkg'), inVal = $('#pval'), out = $('#ptot');
    const calc = () => { const k = parseFloat(inKg.value) || 0; out.textContent = money(redondear(k * precioKg)); };
    inKg.oninput = calc;
    inVal.oninput = () => { const v = parseFloat(inVal.value) || 0; if (precioKg > 0 && v > 0) { inKg.value = (v / precioKg).toFixed(3); calc(); } };
    $('#usarpeso').onclick = () => { inKg.value = A.balanza.peso.toFixed(3); calc(); };
    $('#conbal').onclick = () => { cerrarSheet(); vistaBalanza(); };
    $('#pok').onclick = () => {
      const k = parseFloat(inKg.value) || 0;
      if (k <= 0) return toast('Escribe el peso', 'warn');
      if (linea) { linea.peso = k; cerrarSheet(); pintar(); }
      else { cerrarSheet(); agregar(p, { peso: k }); }
    };
    calc(); setTimeout(() => inKg.focus(), 150);
  });
}

/* Código que no está en el inventario */
function modalNoEncontrado(code) {
  sheet('Código no registrado', `
    <div class="card" style="border-color:var(--rosa);background:var(--rosa-l)">
      <div class="eyebrow">Código leído</div>
      <div class="disp num" style="font-size:22px">${esc(code)}</div>
    </div>
    <p class="muted">Este código no está en el inventario. ¿Qué quieres hacer?</p>
    <div class="stack">
      <button class="btn pri full" id="crear">Crear producto con este código</button>
      <button class="btn full" id="suelto">Cobrarlo suelto (precio a mano)</button>
      <button class="btn ghost full" data-cerrar>Cancelar</button>
    </div>`, () => {
    $('#crear').onclick = () => { cerrarSheet(); formProducto({ barcode: code }); };
    $('#suelto').onclick = () => { cerrarSheet(); modalSuelto(code); };
  });
}

function modalSuelto(code = '') {
  sheet('Venta rápida', `
    <label class="f"><span>¿Qué es?</span><input id="sn" type="text" placeholder="Ej: Bolsa, Recarga, Varios"></label>
    <label class="f"><span>Precio</span><input id="sp" type="number" inputmode="numeric" placeholder="0"></label>
    <label class="f"><span>Cantidad</span><input id="sc" type="number" inputmode="numeric" value="1"></label>
    <button class="btn pri xl" id="sok">Agregar al carrito</button>`, () => {
    $('#sok').onclick = () => {
      const n = $('#sn').value.trim() || 'Varios';
      const pr = parseFloat($('#sp').value) || 0;
      const c = parseFloat($('#sc').value) || 1;
      if (pr <= 0) return toast('Escribe el precio', 'warn');
      A.carrito.push({ lid: uid(), pid: null, nombre: n, unidad: 'und', precio: pr, cant: c, costo: 0, suelto: true, barcode: code });
      cerrarSheet(); beep(); pintar();
    };
    setTimeout(() => $('#sn').focus(), 150);
  });
}

/* ---------- 11. COBRO ---------- */
const METODOS = [
  { k: 'efectivo', n: 'Efectivo' }, { k: 'tarjeta', n: 'Tarjeta' },
  { k: 'nequi', n: 'Nequi' }, { k: 'daviplata', n: 'Daviplata' },
  { k: 'transferencia', n: 'Transferencia' }, { k: 'fiado', n: 'Fiado (crédito)' }
];
const BILLETES = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

function modalCobro() {
  if (!A.carrito.length) return toast('El carrito está vacío', 'warn');
  if (!A.turno) return toast('Primero abre la caja', 'warn');
  const t = total();
  sheet('Cobrar ' + money(t), `
    <div class="card" style="background:var(--ink);color:#fff;border-color:var(--ink)">
      <div class="between">
        <div><div class="eyebrow" style="color:#9E9A90">Total a pagar</div>
        <div class="disp num" style="font-size:34px">${money(t)}</div></div>
        <div style="text-align:right" class="tiny">${A.carrito.length} líneas<br>${unidadesCarrito()} unidades</div>
      </div>
    </div>
    <div class="eyebrow" style="margin:4px 0 6px">Método de pago</div>
    <div class="grid2" id="mets">
      ${METODOS.map(m => `<button class="btn sm ghost" data-met="${m.k}">${m.n}</button>`).join('')}
    </div>
    <div id="detmet" style="margin-top:12px"></div>
  `, () => {
    $('#mets').onclick = e => {
      const b = e.target.closest('[data-met]'); if (!b) return;
      $$('#mets .btn').forEach(x => { x.className = 'btn sm ghost'; });
      b.className = 'btn sm dark';
      detalleMetodo(b.dataset.met, t);
    };
    detalleMetodo('efectivo', t);
    $$('#mets .btn')[0].className = 'btn sm dark';
  });
}

function detalleMetodo(met, t) {
  const box = $('#detmet');
  if (met === 'efectivo') {
    box.innerHTML = `
      <label class="f"><span>¿Con cuánto paga?</span>
        <input id="recibe" type="number" inputmode="numeric" placeholder="${t}" style="font-size:22px;font-weight:700"></label>
      <div class="grid3" style="margin-bottom:10px">
        <button class="btn sm ghost" data-bill="exacto">Exacto</button>
        ${BILLETES.map(b => `<button class="btn sm ghost num" data-bill="${b}">${money(b)}</button>`).join('')}
      </div>
      <div class="card" style="background:var(--amarillo);border-color:var(--amarillo)">
        <div class="between"><span class="eyebrow" style="color:#5A4600">Cambio</span>
        <span class="disp num" id="cambio" style="font-size:30px">$0</span></div>
      </div>
      <button class="btn pri xl" id="cok">Cerrar venta</button>`;
    const inp = $('#recibe'), out = $('#cambio');
    const calc = () => {
      const r = parseFloat(inp.value) || 0;
      const c = r - t;
      out.textContent = money(Math.max(0, c));
      out.parentElement.parentElement.style.background = c < 0 ? 'var(--rojo-l)' : 'var(--amarillo)';
    };
    inp.oninput = calc;
    box.querySelectorAll('[data-bill]').forEach(b => b.onclick = () => {
      inp.value = b.dataset.bill === 'exacto' ? t : (parseFloat(inp.value) || 0) + Number(b.dataset.bill);
      calc();
    });
    $('#cok').onclick = () => {
      const r = parseFloat(inp.value) || t;
      if (r < t) return toast('El dinero recibido es menor al total', 'err');
      cerrarVenta([{ metodo: 'efectivo', monto: t }], { recibido: r, cambio: r - t });
    };
    setTimeout(() => inp.focus(), 150);
  } else if (met === 'fiado') {
    const cs = DB.all('clientes').sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    box.innerHTML = `
      <label class="f"><span>¿A quién se le fía?</span>
        <select id="fcli"><option value="">— Elegir cliente —</option>
        ${cs.map(c => `<option value="${c.id}">${esc(c.nombre)} · debe ${money(c.saldo || 0)}</option>`).join('')}
        </select></label>
      <button class="btn ghost sm full" id="fnuevo" style="margin-bottom:12px">+ Cliente nuevo</button>
      <label class="f"><span>Abono de hoy (opcional)</span>
        <input id="fab" type="number" inputmode="numeric" placeholder="0"></label>
      <button class="btn pri xl" id="cok">Registrar fiado</button>`;
    $('#fnuevo').onclick = () => { cerrarSheet(); formCliente(null, () => modalCobro()); };
    $('#cok').onclick = () => {
      const cid = $('#fcli').value;
      if (!cid) return toast('Elige el cliente', 'warn');
      const ab = Math.min(parseFloat($('#fab').value) || 0, t);
      const pagos = [];
      if (ab > 0) pagos.push({ metodo: 'efectivo', monto: ab });
      pagos.push({ metodo: 'fiado', monto: t - ab });
      cerrarVenta(pagos, { clienteId: cid });
    };
  } else {
    const nom = (METODOS.find(m => m.k === met) || {}).n || met;
    box.innerHTML = `
      <div class="card"><div class="between"><span class="eyebrow">${esc(nom)}</span>
      <span class="disp num" style="font-size:26px">${money(t)}</span></div></div>
      <label class="f"><span>Referencia o últimos 4 dígitos (opcional)</span>
        <input id="ref" type="text" placeholder="Ej: 4821"></label>
      <button class="btn pri xl" id="cok">Cerrar venta</button>`;
    $('#cok').onclick = () => cerrarVenta([{ metodo: met, monto: t }], { ref: $('#ref').value.trim() });
  }
}

function cerrarVenta(pagos, extra = {}) {
  const items = A.carrito.map(l => ({
    pid: l.pid, nombre: l.nombre, unidad: l.unidad, precio: l.precio,
    cant: l.unidad === 'kg' ? 1 : l.cant, peso: l.peso || null,
    costo: l.costo || 0, total: totalLinea(l)
  }));
  const sub = subtotal(), t = total();
  const costoTotal = items.reduce((s, i) => s + (i.costo * (i.unidad === 'kg' ? (i.peso || 0) : i.cant)), 0);
  const venta = {
    id: uid(),
    numero: siguienteNumero(),
    createdAt: now(), dia: dayKey(),
    items, subtotal: sub, descuento: Number(A.descuento) || 0, total: t,
    costo: Math.round(costoTotal), utilidad: Math.round(t - costoTotal),
    pagos, metodo: pagos.map(p => p.metodo).join('+'),
    recibido: extra.recibido || null, cambio: extra.cambio || null,
    ref: extra.ref || null, clienteId: extra.clienteId || null,
    empleadoId: A.user.id, empleado: A.user.nombre,
    turnoId: A.turno ? A.turno.id : null,
    sede: CFG.sede, estado: 'ok'
  };
  DB.set('ventas', venta);

  // Descontar inventario
  items.forEach(i => {
    if (!i.pid) return;
    const p = DB.get('productos', i.pid); if (!p) return;
    const baja = i.unidad === 'kg' ? (i.peso || 0) : i.cant;
    p.stock = Math.round(((Number(p.stock) || 0) - baja) * 1000) / 1000;
    p.vendidos = (Number(p.vendidos) || 0) + baja;
    DB.set('productos', p);
  });

  // Fiado -> saldo del cliente
  const fi = pagos.find(p => p.metodo === 'fiado');
  if (fi && extra.clienteId) {
    const c = DB.get('clientes', extra.clienteId);
    if (c) {
      c.saldo = (Number(c.saldo) || 0) + fi.monto;
      c.movs = (c.movs || []).concat([{ t: now(), tipo: 'cargo', monto: fi.monto, ventaId: venta.id }]).slice(-80);
      DB.set('clientes', c);
    }
  }

  limpiarCarrito();
  beep(1200, 120); vibrate([30, 40, 30]);
  cerrarSheet();
  modalRecibo(venta);
  avisarStockBajo(items);
}

function siguienteNumero() {
  const n = (LS.get('consec', 0) || 0) + 1;
  LS.set('consec', n);
  return n;
}

function avisarStockBajo(items) {
  if (!CFG.alertaStock) return;
  const bajos = items.map(i => i.pid && DB.get('productos', i.pid)).filter(p => p && bajoStock(p));
  if (!bajos.length) return;
  const agot = bajos.filter(p => stockDe(p) <= 0);
  if (agot.length) toast('Se agotó: ' + agot.map(p => p.nombre).join(', '), 'err', 5000);
  const pocos = bajos.filter(p => stockDe(p) > 0);
  if (pocos.length) toast('Hay que pedir: ' + pocos.map(p => p.nombre).join(', '), 'warn', 4500);
}

/* ---------- 12. RECIBO / TIRILLA ---------- */
function textoRecibo(v) {
  const L = [];
  L.push(CFG.tienda.toUpperCase());
  if (CFG.nit) L.push('NIT ' + CFG.nit);
  if (CFG.dir) L.push(CFG.dir);
  if (CFG.tel) L.push('Tel ' + CFG.tel);
  L.push('--------------------------------');
  L.push('Venta #' + v.numero + '  ' + fecha(v.createdAt));
  L.push('Atendió: ' + v.empleado);
  L.push('--------------------------------');
  v.items.forEach(i => {
    L.push(i.nombre);
    const q = i.unidad === 'kg' ? kg(i.peso) + ' x ' + money(i.precio) + '/kg' : i.cant + ' x ' + money(i.precio);
    L.push('  ' + q + '   ' + money(i.total));
  });
  L.push('--------------------------------');
  if (v.descuento) { L.push('Subtotal: ' + money(v.subtotal)); L.push('Descuento: -' + money(v.descuento)); }
  L.push('TOTAL: ' + money(v.total));
  v.pagos.forEach(p => L.push((METODOS.find(m => m.k === p.metodo) || { n: p.metodo }).n + ': ' + money(p.monto)));
  if (v.recibido) { L.push('Recibido: ' + money(v.recibido)); L.push('Cambio: ' + money(v.cambio)); }
  L.push('--------------------------------');
  L.push('¡Gracias por su compra!');
  return L.join('\n');
}

function modalRecibo(v) {
  sheet('Venta #' + v.numero, `
    <div class="card" style="background:var(--azul);border-color:var(--azul);color:#fff;text-align:center">
      <div class="eyebrow" style="color:#BFE6D2">Venta registrada</div>
      <div class="disp num" style="font-size:36px">${money(v.total)}</div>
      ${v.cambio ? `<div style="margin-top:6px;font-size:14px">Cambio: <b class="num">${money(v.cambio)}</b></div>` : ''}
    </div>
    <div class="card tight">${v.items.map(i => `
      <div class="item"><div class="g"><div class="t">${esc(i.nombre)}</div>
      <div class="s">${i.unidad === 'kg' ? kg(i.peso) + ' × ' + money(i.precio) + '/kg' : i.cant + ' × ' + money(i.precio)}</div></div>
      <div class="v num">${money(i.total)}</div></div>`).join('')}</div>
    <div class="grid2">
      <button class="btn ghost" id="rimp">Imprimir</button>
      <button class="btn ghost" id="rwa">Enviar por WhatsApp</button>
    </div>
    <button class="btn pri xl" style="margin-top:8px" data-cerrar>Siguiente cliente</button>
  `, () => {
    $('#rimp').onclick = () => imprimirRecibo(v);
    $('#rwa').onclick = () => {
      const txt = encodeURIComponent(textoRecibo(v));
      window.open('https://wa.me/?text=' + txt, '_blank');
    };
  });
}

function imprimirRecibo(v) {
  $('#printarea').innerHTML = `
    <div class="c big">${esc(CFG.tienda)}</div>
    ${CFG.nit ? `<div class="c">NIT ${esc(CFG.nit)}</div>` : ''}
    ${CFG.dir ? `<div class="c">${esc(CFG.dir)}</div>` : ''}
    ${CFG.tel ? `<div class="c">Tel ${esc(CFG.tel)}</div>` : ''}
    <div class="d"></div>
    <div>Venta #${v.numero}</div><div>${fecha(v.createdAt)}</div><div>Atendio: ${esc(v.empleado)}</div>
    <div class="d"></div>
    <table>${v.items.map(i => `<tr><td>${esc(i.nombre)}<br>${i.unidad === 'kg' ? kg(i.peso) + ' x ' + money(i.precio) : i.cant + ' x ' + money(i.precio)}</td>
      <td style="text-align:right">${money(i.total)}</td></tr>`).join('')}</table>
    <div class="d"></div>
    ${v.descuento ? `<div>Subtotal ${money(v.subtotal)}</div><div>Descuento -${money(v.descuento)}</div>` : ''}
    <div class="big">TOTAL ${money(v.total)}</div>
    ${v.pagos.map(p => `<div>${esc((METODOS.find(m => m.k === p.metodo) || { n: p.metodo }).n)} ${money(p.monto)}</div>`).join('')}
    ${v.recibido ? `<div>Recibido ${money(v.recibido)}</div><div>Cambio ${money(v.cambio)}</div>` : ''}
    <div class="d"></div>
    <div class="c">Gracias por su compra</div>`;
  window.print();
}

/* ---------- 13. VISTA: VENDER ---------- */
function vistaVender() {
  const cat = catalogo();
  const q = A.filtro.toLowerCase();
  const catsV = categorias();
  if (A.catVenta !== 'todas' && !catsV.includes(A.catVenta)) A.catVenta = 'todas';
  const base = A.catVenta === 'todas' ? cat : cat.filter(p => p.categoria === A.catVenta);
  const lista = base.filter(p => !q || (p.nombre || '').toLowerCase().includes(q) ||
    String(p.barcode || '').includes(q) || String(p.plu || '').includes(q)).slice(0, 60);

  const favs = cat.filter(p => p.favorito).slice(0, 12);

  return `
  <div id="scanbar" class="scanbar">
    <input id="scaninput" type="tel" inputmode="numeric" autocomplete="off"
      placeholder="Escanea o escribe el código">
    <button class="b" id="btncam" aria-label="Leer con cámara">${ICON.cam}</button>
  </div>

  ${!A.turno ? `<div class="card" style="border-color:var(--rosa);background:var(--rosa-l)">
    <div class="between"><div><b>La caja está cerrada</b><div class="tiny">Ábrela para poder vender.</div></div>
    <button class="btn sm acc" data-act="abrircaja">Abrir caja</button></div></div>` : ''}

  ${favs.length ? `<div class="eyebrow" style="margin:2px 0 6px">Los de siempre</div>
  <div class="grid3" style="margin-bottom:10px">
    ${favs.map(p => `<button class="btn sm ghost" style="flex-direction:column;gap:1px;min-height:92px;padding:6px" data-add="${p.id}">
      ${thumb(p, 'thf')}
      <span style="font-size:11.5px;font-weight:700;line-height:1.15">${esc(p.nombre)}</span>
      <span class="tiny num">${p.unidad === 'kg' ? money(p.precio) + '/kg' : money(p.precio)}</span></button>`).join('')}
  </div>` : ''}

  ${A.carrito.length ? `
  <div class="eyebrow" style="margin:2px 0 6px">Carrito</div>
  <div class="card tight" style="margin-bottom:10px">
    ${A.carrito.map(l => `
      <div class="item">
        <div class="g">
          <div class="t">${esc(l.nombre)} ${l.unidad === 'kg' ? '<span class="bad kg">kg</span>' : ''}</div>
          <div class="s num">${l.unidad === 'kg' ? kg(l.peso) + ' × ' + money(l.precio) + '/kg' : l.cant + ' × ' + money(l.precio)}</div>
        </div>
        <button class="btn sm ghost" data-menos="${l.lid}" style="min-width:38px">−</button>
        <button class="btn sm ghost" data-plus="${l.lid}" style="min-width:38px">+</button>
        <div class="v num" style="min-width:66px">${money(totalLinea(l))}</div>
        <button class="btn sm ghost" data-quitar="${l.lid}" style="min-width:34px;border-color:var(--rojo-l);color:var(--rojo)">✕</button>
      </div>`).join('')}
  </div>
  <div class="grid3" style="margin-bottom:10px">
    <button class="btn sm ghost" data-act="descuento">Descuento</button>
    <button class="btn sm ghost" data-act="suelto">Venta rápida</button>
    <button class="btn sm dan" data-act="vaciar">Vaciar</button>
  </div>` : `
  <div class="card empty">
    <div class="disp">Listo para vender</div>
    <p>Escanea un producto o búscalo abajo. Si es fruta o verdura, te pedimos el peso.</p>
    <button class="btn sm ghost" id="btncam2">Leer con la cámara</button>
  </div>`}

  <div class="eyebrow" style="margin:12px 0 6px">Buscar producto</div>
  <input id="busca" type="text" placeholder="Nombre, código o PLU" value="${esc(A.filtro)}" style="margin-bottom:8px">

  ${catsV.length ? `<div class="cats">
    <button class="btn sm ${A.catVenta === 'todas' ? 'dark' : 'ghost'}" data-vcat="todas">Todas <span class="tiny" style="opacity:.7">${cat.length}</span></button>
    ${catsV.map(c => {
      const n = cat.filter(p => p.categoria === c).length;
      return `<button class="btn sm ${A.catVenta === c ? 'dark' : 'ghost'}" data-vcat="${esc(c)}">${esc(c)} <span class="tiny" style="opacity:.7">${n}</span></button>`;
    }).join('')}
  </div>` : ''}

  <div class="card tight">
    ${lista.length ? lista.map(p => `
      <div class="item" data-add="${p.id}" role="button" tabindex="0">
        ${thumb(p)}
        <div class="g"><div class="t">${esc(p.nombre)} ${p.unidad === 'kg' ? '<span class="bad kg">kg</span>' : ''}
          ${bajoStock(p) ? '<span class="bad r">poco</span>' : ''}</div>
          <div class="s num">${p.barcode ? esc(p.barcode) + ' · ' : ''}${p.unidad === 'kg' ? kg(p.stock) : stockDe(p) + ' und'}</div></div>
        <div class="v num">${money(p.precio)}${p.unidad === 'kg' ? '<span class="tiny">/kg</span>' : ''}</div>
      </div>`).join('')
      : `<div class="empty">
           <p>${!cat.length ? 'Todavía no hay productos.'
             : A.catVenta !== 'todas' ? 'Nada en <b>' + esc(A.catVenta) + '</b>' + (q ? ' con ese nombre.' : '.') : 'Nada con ese nombre.'}</p>
           ${A.catVenta !== 'todas' ? '<button class="btn sm ghost" data-vcat="todas">Ver todas las categorías</button>'
             : '<button class="btn sm pri" data-act="nuevoprod">Crear producto</button>'}
         </div>`}
  </div>`;
}

function tirilla() {
  if (!A.carrito.length) return '';
  const t = total();
  return `<div class="tirilla">
    <div class="between">
      <div>
        <div class="lbl">Total</div>
        <div class="tot"><small>$</small>${Math.round(t).toLocaleString('es-CO')}</div>
        <div class="meta">${unidadesCarrito()} unid · ${A.carrito.length} líneas${A.descuento ? ' · desc ' + money(A.descuento) : ''}${A.cliente ? ' · ' + esc(A.cliente.nombre) : ''}</div>
      </div>
      <button class="btn acc" style="min-height:54px;padding:0 22px;font-size:17px" data-act="cobrar">COBRAR</button>
    </div>
  </div>`;
}

/* ---------- 14. VISTA: INVENTARIO ---------- */
function vistaInventario() {
  let ps = DB.all('productos');
  const q = A.filtro.toLowerCase();
  if (q) ps = ps.filter(p => (p.nombre || '').toLowerCase().includes(q) || String(p.barcode || '').includes(q) || String(p.plu || '').includes(q));
  if (A.filtroCat !== 'todas') ps = A.filtroCat === '__bajos' ? ps.filter(bajoStock) : ps.filter(p => p.categoria === A.filtroCat);
  ps.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const todos = DB.all('productos');
  const valor = todos.reduce((s, p) => s + (Number(p.costo) || 0) * stockDe(p), 0);
  const bajos = todos.filter(bajoStock).length;

  return `
  <div class="grid3" style="margin-bottom:10px">
    <div class="kpi"><div class="k num">${todos.length}</div><div class="l">Productos</div></div>
    <div class="kpi g"><div class="k num" style="font-size:18px">${money(valor)}</div><div class="l">Valor en costo</div></div>
    <div class="kpi ${bajos ? 'r' : ''}"><div class="k num">${bajos}</div><div class="l">Por pedir</div></div>
  </div>

  ${panelPedir()}

  <div class="grid2" style="margin-bottom:10px">
    <button class="btn pri" data-act="nuevoprod">+ Producto</button>
    <button class="btn" data-act="entrada">Entrada de mercancía</button>
  </div>

  <input id="busca" type="text" placeholder="Buscar por nombre o código" value="${esc(A.filtro)}" style="margin-bottom:8px">
  <div class="row" style="overflow-x:auto;gap:6px;padding-bottom:8px">
    <button class="btn sm ${A.filtroCat === 'todas' ? 'dark' : 'ghost'}" data-cat="todas">Todas</button>
    <button class="btn sm ${A.filtroCat === '__bajos' ? 'dark' : 'ghost'}" data-cat="__bajos">Por pedir${bajos ? ' (' + bajos + ')' : ''}</button>
    ${categorias().map(c => `<button class="btn sm ${A.filtroCat === c ? 'dark' : 'ghost'}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
  </div>

  <div class="card tight">
    ${ps.length ? ps.map(p => `
      <div class="item" data-edit="${p.id}" role="button" tabindex="0">
        ${thumb(p)}
        <div class="g">
          <div class="t">${esc(p.nombre)} ${p.unidad === 'kg' ? '<span class="bad kg">kg</span>' : ''}
            ${p.activo === false ? '<span class="bad g">inactivo</span>' : ''}
            ${bajoStock(p) ? '<span class="bad r">pedir</span>' : ''}</div>
          <div class="s num">${p.categoria ? esc(p.categoria) + ' · ' : ''}costo ${money(p.costo)} · ${p.unidad === 'kg' ? kg(p.stock) : stockDe(p) + ' und'}</div>
        </div>
        <div style="text-align:right">
          <div class="v num">${money(p.precio)}</div>
          <div class="tiny num">${margen(p)}% margen</div>
        </div>
      </div>`).join('')
      : `<div class="empty"><div class="disp">Inventario vacío</div>
         <p>Crea tus productos uno por uno, o pega una lista completa de una vez.</p>
         <div class="grid2"><button class="btn sm pri" data-act="nuevoprod">Crear uno</button>
         <button class="btn sm ghost" data-act="importar">Pegar lista</button></div></div>`}
  </div>
  ${ps.length ? `<button class="btn ghost full" style="margin-top:10px" data-act="importar">Pegar lista de productos</button>` : ''}`;
}

function panelPedir() {
  const ps = paraPedir();
  if (!ps.length) return `
    <div class="card" style="border-color:#0B9A4E;background:#E8F7EE;padding:10px 12px">
      <div class="row">
        <div style="width:30px;height:30px;border-radius:99px;background:#0B9A4E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none">✓</div>
        <div><b style="font-size:14px">No hay nada por pedir</b>
        <div class="tiny">Todos los productos están por encima del mínimo.</div></div>
      </div>
    </div>`;

  const agotados = ps.filter(p => stockDe(p) <= 0).length;
  const ver = ps.slice(0, 8);
  return `
  <div class="card" style="border-color:var(--rosa);border-width:2px;padding:0;overflow:hidden">
    <div class="between" style="padding:10px 12px;background:var(--rosa-l)">
      <div>
        <div class="eyebrow" style="color:var(--rosa-d)">Hay que pedir</div>
        <b style="font-size:15px">${ps.length} producto${ps.length > 1 ? 's' : ''}${agotados ? ' · ' + agotados + ' agotado' + (agotados > 1 ? 's' : '') : ''}</b>
      </div>
      <button class="btn sm acc" data-act="pedidowa">Enviar lista</button>
    </div>
    ${ver.map(p => {
      const agot = stockDe(p) <= 0;
      const u = p.unidad === 'kg' ? 'kg' : 'und';
      return `<div class="item" data-edit="${p.id}" role="button" tabindex="0">
        ${thumb(p)}
        <div class="g">
          <div class="t">${esc(p.nombre)} ${agot ? '<span class="bad r">agotado</span>' : ''}</div>
          <div class="s num">quedan ${p.unidad === 'kg' ? kg(p.stock) : stockDe(p) + ' und'} · mínimo ${p.unidad === 'kg' ? kg(p.stockMin) : (Number(p.stockMin) || 0) + ' und'}</div>
        </div>
        <div style="text-align:right;flex:none">
          <div class="v num" style="color:var(--rosa-d)">${sugerido(p)}</div>
          <div class="tiny">pedir ${u}</div>
        </div>
      </div>`;
    }).join('')}
    ${ps.length > 8 ? `<div class="item"><div class="g tiny">y ${ps.length - 8} más — toca el filtro <b>Por pedir</b> para verlos todos</div></div>` : ''}
    <div style="padding:8px 12px;background:var(--line2)">
      <button class="btn sm ghost full" data-act="entrada">Ya llegó el pedido, registrar entrada</button>
    </div>
  </div>`;
}

function margen(p) {
  const pr = Number(p.precio) || 0, c = Number(p.costo) || 0;
  if (!pr) return 0;
  return Math.round(((pr - c) / pr) * 100);
}

function formProducto(pre = {}) {
  const p = pre.id ? DB.get('productos', pre.id) : { unidad: 'und', activo: true, ...pre };
  const cats = categorias();
  let fotoNueva;   // undefined = no se tocó · null = quitar · texto = foto nueva
  sheet(p.id ? 'Editar producto' : 'Producto nuevo', `
    <div class="card">
      <div class="row" style="align-items:flex-start">
        <div id="f_prev">${thumb(p, 'thb')}</div>
        <div style="flex:1">
          <div class="eyebrow">Foto del producto</div>
          <p class="tiny" style="margin:4px 0 8px">Opcional, pero ayuda mucho con frutas, verduras y carnes.</p>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <label class="btn sm ghost fotolbl" for="f_cam">Tomar foto</label>
            <label class="btn sm ghost fotolbl" for="f_gal">Galería</label>
            <button class="btn sm ghost" id="f_qfoto" style="color:var(--rojo);border-color:var(--rojo-l)">Quitar</button>
          </div>
        </div>
      </div>
      <input id="f_cam" class="hidden" type="file" accept="image/*" capture="environment">
      <input id="f_gal" class="hidden" type="file" accept="image/*">
    </div>
    <label class="f"><span>Nombre *</span><input id="f_nombre" type="text" value="${esc(p.nombre || '')}" placeholder="Ej: Arroz Diana 500g"></label>
    <label class="f"><span>Código de barras (escanéalo aquí)</span>
      <input id="f_barcode" type="tel" inputmode="numeric" value="${esc(p.barcode || '')}" placeholder="Escanea o escribe"></label>
    <label class="f"><span>Código interno / PLU (para frutas y verduras con balanza)</span>
      <input id="f_plu" type="tel" inputmode="numeric" value="${esc(p.plu || '')}" placeholder="Ej: 101"></label>
    <label class="f"><span>¿Cómo se vende?</span>
      <select id="f_unidad">
        <option value="und" ${p.unidad !== 'kg' ? 'selected' : ''}>Por unidad</option>
        <option value="kg" ${p.unidad === 'kg' ? 'selected' : ''}>Por peso (kilos)</option>
      </select></label>
    <div class="grid2">
      <label class="f"><span>Costo</span><input id="f_costo" type="number" inputmode="numeric" value="${p.costo || ''}" placeholder="0"></label>
      <label class="f"><span id="lbl_precio">Precio de venta *</span><input id="f_precio" type="number" inputmode="numeric" value="${p.precio || ''}" placeholder="0"></label>
    </div>
    <div class="card" style="background:var(--azul-l);border-color:var(--azul);padding:8px 10px">
      <div class="between"><span class="tiny" style="color:var(--azul-d);font-weight:700">GANANCIA POR VENTA</span>
      <span class="disp num" id="f_gan" style="font-size:18px">$0</span></div>
    </div>
    <div class="grid2" style="margin-top:8px">
      <label class="f"><span id="lbl_stock">Cantidad actual</span><input id="f_stock" type="number" step="0.001" inputmode="decimal" value="${p.stock ?? ''}" placeholder="0"></label>
      <label class="f"><span>Avisar cuando queden</span><input id="f_min" type="number" step="0.001" inputmode="decimal" value="${p.stockMin ?? ''}" placeholder="0"></label>
    </div>
    <label class="f"><span>Categoría</span>
      <input id="f_cat" type="text" list="lcats" value="${esc(p.categoria || '')}" placeholder="Ej: Granos, Aseo, Frutas">
      <datalist id="lcats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <div class="inline-check"><input type="checkbox" id="f_fav" ${p.favorito ? 'checked' : ''}><label for="f_fav">Mostrarlo como botón rápido al vender</label></div>
    <div class="inline-check"><input type="checkbox" id="f_act" ${p.activo !== false ? 'checked' : ''}><label for="f_act">Activo (aparece al vender)</label></div>
    <button class="btn pri xl" style="margin-top:10px" id="f_ok">Guardar producto</button>
    ${p.id ? `<button class="btn dan full" style="margin-top:8px" id="f_del">Eliminar producto</button>` : ''}
  `, () => {
    const sync = () => {
      const kgm = $('#f_unidad').value === 'kg';
      $('#lbl_precio').textContent = kgm ? 'Precio por kilo *' : 'Precio de venta *';
      $('#lbl_stock').textContent = kgm ? 'Kilos en existencia' : 'Cantidad actual';
      const g = (parseFloat($('#f_precio').value) || 0) - (parseFloat($('#f_costo').value) || 0);
      $('#f_gan').textContent = money(g) + (kgm ? ' /kg' : '');
    };
    $('#f_unidad').onchange = sync; $('#f_precio').oninput = sync; $('#f_costo').oninput = sync; sync();

    const cargarFoto = async (inp) => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        toast('Procesando la foto…');
        fotoNueva = await comprimirFoto(f);
        $('#f_prev').innerHTML = `<img class="thb" src="${fotoNueva}" alt="">`;
        toast('Foto lista (' + Math.round(fotoNueva.length / 1400) + ' KB)', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      inp.value = '';
    };
    $('#f_cam').onchange = () => cargarFoto($('#f_cam'));
    $('#f_gal').onchange = () => cargarFoto($('#f_gal'));
    $('#f_qfoto').onclick = () => {
      fotoNueva = null;
      $('#f_prev').innerHTML = thumb({ nombre: $('#f_nombre').value }, 'thb');
      toast('Foto quitada');
    };
    $('#f_ok').onclick = () => {
      const nombre = $('#f_nombre').value.trim();
      const precio = parseFloat($('#f_precio').value) || 0;
      if (!nombre) return toast('Ponle nombre al producto', 'warn');
      if (precio <= 0) return toast('Escribe el precio de venta', 'warn');
      const bc = $('#f_barcode').value.trim();
      if (bc) {
        const dup = DB.all('productos').find(x => x.id !== p.id && String(x.barcode || '') === bc);
        if (dup) return toast('Ese código ya lo tiene: ' + dup.nombre, 'err', 3500);
      }
      const guardado = DB.set('productos', {
        ...p, nombre, barcode: bc, plu: $('#f_plu').value.trim(),
        unidad: $('#f_unidad').value,
        costo: parseFloat($('#f_costo').value) || 0, precio,
        stock: parseFloat($('#f_stock').value) || 0,
        stockMin: parseFloat($('#f_min').value) || 0,
        categoria: $('#f_cat').value.trim(),
        favorito: $('#f_fav').checked, activo: $('#f_act').checked,
        conFoto: fotoNueva !== undefined ? !!fotoNueva : !!fotoDe(p.id)
      });
      if (fotoNueva) DB.set('fotos', { id: guardado.id, d: fotoNueva });
      else if (fotoNueva === null) DB.del('fotos', guardado.id);
      cerrarSheet(); toast('Producto guardado', 'ok'); pintar();
    };
    if (p.id) $('#f_del').onclick = () => confirmar('¿Eliminar "' + p.nombre + '" del inventario?', () => {
      DB.del('productos', p.id); DB.del('fotos', p.id);
      cerrarSheet(); toast('Producto eliminado'); pintar();
    }, 'Sí, eliminar');
    if (!p.id) setTimeout(() => $('#f_nombre').focus(), 150);
  });
}

/* Entrada de mercancía: sube stock y deja historial de compra */
function formEntrada() {
  const ps = catalogo();
  sheet('Entrada de mercancía', `
    <p class="muted">Cuando llega el pedido del proveedor, regístralo aquí y el inventario sube solo.</p>
    <label class="f"><span>Proveedor</span><input id="e_prov" type="text" placeholder="Ej: Distribuidora El Sol"></label>
    <label class="f"><span>Producto</span>
      <select id="e_prod"><option value="">— Elegir —</option>
      ${ps.map(p => `<option value="${p.id}">${esc(p.nombre)} (${p.unidad === 'kg' ? kg(p.stock) : stockDe(p) + ' und'})</option>`).join('')}
      </select></label>
    <div class="grid2">
      <label class="f"><span>Cantidad que llegó</span><input id="e_cant" type="number" step="0.001" inputmode="decimal" placeholder="0"></label>
      <label class="f"><span>Costo unitario nuevo</span><input id="e_costo" type="number" inputmode="numeric" placeholder="opcional"></label>
    </div>
    <button class="btn full" id="e_add">Agregar a la lista</button>
    <hr class="sep">
    <div class="eyebrow">Lista de entrada</div>
    <div class="card tight" id="e_lista" style="margin-top:6px"><div class="empty"><p>Aún no has agregado nada.</p></div></div>
    <button class="btn pri xl" style="margin-top:10px" id="e_ok">Guardar entrada</button>
  `, () => {
    const items = [];
    const pinta = () => {
      $('#e_lista').innerHTML = items.length ? items.map((it, ix) => `
        <div class="item"><div class="g"><div class="t">${esc(it.nombre)}</div>
        <div class="s num">+${it.cant} ${it.unidad === 'kg' ? 'kg' : 'und'}${it.costo ? ' · costo ' + money(it.costo) : ''}</div></div>
        <button class="btn sm ghost" data-rm="${ix}" style="color:var(--rojo);border-color:var(--rojo-l)">✕</button></div>`).join('')
        : `<div class="empty"><p>Aún no has agregado nada.</p></div>`;
      $$('#e_lista [data-rm]').forEach(b => b.onclick = () => { items.splice(Number(b.dataset.rm), 1); pinta(); });
    };
    $('#e_add').onclick = () => {
      const pid = $('#e_prod').value, c = parseFloat($('#e_cant').value) || 0;
      if (!pid) return toast('Elige el producto', 'warn');
      if (c <= 0) return toast('Escribe la cantidad', 'warn');
      const p = DB.get('productos', pid);
      items.push({ pid, nombre: p.nombre, unidad: p.unidad, cant: c, costo: parseFloat($('#e_costo').value) || 0 });
      $('#e_cant').value = ''; $('#e_costo').value = ''; $('#e_prod').value = '';
      pinta();
    };
    $('#e_ok').onclick = () => {
      if (!items.length) return toast('Agrega al menos un producto', 'warn');
      let costoTotal = 0;
      items.forEach(it => {
        const p = DB.get('productos', it.pid); if (!p) return;
        p.stock = Math.round(((Number(p.stock) || 0) + it.cant) * 1000) / 1000;
        if (it.costo > 0) p.costo = it.costo;
        DB.set('productos', p);
        costoTotal += (it.costo || Number(p.costo) || 0) * it.cant;
      });
      DB.set('compras', {
        id: uid(), createdAt: now(), dia: dayKey(), proveedor: $('#e_prov').value.trim(),
        items, costoTotal: Math.round(costoTotal), empleado: A.user.nombre, sede: CFG.sede
      });
      cerrarSheet(); toast('Inventario actualizado', 'ok'); pintar();
    };
    pinta();
  });
}

/* Importar lista pegada */
function formImportar() {
  sheet('Pegar lista de productos', `
    <p class="muted">Una línea por producto, separando con punto y coma:</p>
    <div class="card" style="font-family:ui-monospace,monospace;font-size:12px;background:var(--line2)">
      nombre;codigo;precio;costo;stock;categoria;unidad<br>
      Arroz Diana 500g;7702001234567;3200;2600;24;Granos;und<br>
      Tomate chonto;101;4500;3200;12.5;Frutas y verduras;kg
    </div>
    <p class="tiny">Solo el <b>nombre</b> y el <b>precio</b> son obligatorios. Si el código ya existe, se actualiza ese producto.</p>
    <textarea id="i_txt" style="min-height:150px;font-family:ui-monospace,monospace;font-size:13px" placeholder="Pega aquí tu lista…"></textarea>
    <button class="btn pri xl" style="margin-top:10px" id="i_ok">Importar</button>
  `, () => {
    $('#i_ok').onclick = () => {
      const lineas = $('#i_txt').value.split('\n').map(l => l.trim()).filter(Boolean);
      let nuevos = 0, act = 0, malos = 0;
      lineas.forEach((l, ix) => {
        if (ix === 0 && /nombre\s*;/i.test(l)) return;
        const c = l.split(';').map(x => x.trim());
        const nombre = c[0], precio = parseFloat((c[2] || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        if (!nombre || precio <= 0) { malos++; return; }
        const barcode = c[1] || '';
        const ex = barcode ? DB.all('productos').find(p => String(p.barcode || '') === barcode) : null;
        const base = ex || { id: uid(), activo: true };
        DB.set('productos', {
          ...base, nombre, barcode,
          precio,
          costo: parseFloat((c[3] || '').replace(',', '.')) || base.costo || 0,
          stock: c[4] !== undefined && c[4] !== '' ? parseFloat(c[4].replace(',', '.')) || 0 : (base.stock || 0),
          categoria: c[5] || base.categoria || '',
          unidad: (c[6] || base.unidad || 'und').toLowerCase() === 'kg' ? 'kg' : 'und',
          plu: base.plu || ''
        });
        ex ? act++ : nuevos++;
      });
      cerrarSheet();
      toast(`${nuevos} nuevos, ${act} actualizados${malos ? ', ' + malos + ' líneas con error' : ''}`, 'ok', 4000);
      pintar();
    };
  });
}

/* ---------- 15. VISTA: CAJA (turnos) ---------- */
function detectarTurno() {
  const abierto = DB.all('turnos').filter(t => t.estado === 'abierto')
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  A.turno = abierto || null;
}

function ventasDeTurno(tid) { return DB.all('ventas').filter(v => v.turnoId === tid && v.estado === 'ok'); }
function gastosDeTurno(tid) { return DB.all('gastos').filter(g => g.turnoId === tid); }

function resumenTurno(t) {
  const vs = ventasDeTurno(t.id), gs = gastosDeTurno(t.id);
  const porMetodo = {};
  vs.forEach(v => (v.pagos || []).forEach(p => porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.monto));
  const efectivo = porMetodo.efectivo || 0;
  const gastado = gs.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const totalVentas = vs.reduce((s, v) => s + v.total, 0);
  const utilidad = vs.reduce((s, v) => s + (v.utilidad || 0), 0);
  return {
    vs, gs, porMetodo, efectivo, gastado, totalVentas, utilidad,
    esperado: (Number(t.base) || 0) + efectivo - gastado
  };
}

function vistaCaja() {
  if (!A.turno) {
    const ult = DB.all('turnos').sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    return `
    <div class="card empty" style="border-color:var(--rosa)">
      <div class="disp">Caja cerrada</div>
      <p>Abre la caja con la base del día para empezar a vender.</p>
      <button class="btn pri" data-act="abrircaja">Abrir caja</button>
    </div>
    <div class="eyebrow" style="margin:14px 0 6px">Cierres anteriores</div>
    <div class="card tight">
      ${ult.length ? ult.map(t => {
      const r = resumenTurno(t);
      const dif = (Number(t.conteo) || 0) - r.esperado;
      return `<div class="item" data-turno="${t.id}" role="button" tabindex="0">
          <div class="g"><div class="t">${fecha(t.createdAt)}</div>
          <div class="s">${esc(t.empleado || '')} · ${r.vs.length} ventas</div></div>
          <div style="text-align:right"><div class="v num">${money(r.totalVentas)}</div>
          <div class="tiny num" style="color:${Math.abs(dif) < 1 ? 'var(--azul)' : 'var(--rojo)'}">${dif === 0 ? 'cuadró' : (dif > 0 ? '+' : '') + money(dif)}</div></div>
        </div>`;
    }).join('') : `<div class="empty"><p>Todavía no hay cierres.</p></div>`}
    </div>`;
  }

  const t = A.turno, r = resumenTurno(t);
  return `
  <div class="card" style="background:var(--ink);color:#fff;border-color:var(--ink)">
    <div class="between">
      <div><div class="eyebrow" style="color:#9E9A90">Caja abierta desde</div>
      <div class="disp" style="font-size:20px">${hora(t.createdAt)}</div>
      <div class="tiny" style="color:#B8B4AA">${esc(t.empleado)} · base ${money(t.base)}</div></div>
      <span class="chip on"><i class="dot"></i>Abierta</span>
    </div>
  </div>

  <div class="grid2" style="margin-bottom:10px">
    <div class="kpi g"><div class="k num">${money(r.totalVentas)}</div><div class="l">Vendido</div></div>
    <div class="kpi"><div class="k num">${r.vs.length}</div><div class="l">Ventas</div></div>
    <div class="kpi o"><div class="k num">${money(r.efectivo)}</div><div class="l">En efectivo</div></div>
    <div class="kpi r"><div class="k num">${money(r.gastado)}</div><div class="l">Gastos</div></div>
  </div>

  <div class="card">
    <div class="between"><h3>Debe haber en caja</h3>
    <span class="disp num" style="font-size:26px;color:var(--azul)">${money(r.esperado)}</span></div>
    <div class="tiny">base ${money(t.base)} + efectivo ${money(r.efectivo)} − gastos ${money(r.gastado)}</div>
  </div>

  <div class="card">
    <h3>Recaudo por método</h3>
    ${Object.keys(r.porMetodo).length ? METODOS.filter(m => r.porMetodo[m.k]).map(m => `
      <div class="between" style="padding:5px 0;border-bottom:1px solid var(--line2)">
        <span>${m.n}</span><b class="num">${money(r.porMetodo[m.k])}</b></div>`).join('')
      : '<p class="muted" style="margin:0">Sin ventas todavía.</p>'}
  </div>

  <div class="grid2" style="margin-bottom:10px">
    <button class="btn" data-act="gasto">Registrar gasto</button>
    <button class="btn ghost" data-act="verventas">Ver ventas del turno</button>
  </div>
  <button class="btn dark xl" data-act="cerrarcaja">Cerrar caja y cuadrar</button>`;
}

function modalAbrirCaja() {
  sheet('Abrir caja', `
    <p class="muted">La base es la plata con la que arrancas para dar cambio.</p>
    <label class="f"><span>Base inicial</span>
      <input id="c_base" type="number" inputmode="numeric" value="50000" style="font-size:22px;font-weight:700"></label>
    <div class="grid3" style="margin-bottom:12px">
      ${[20000, 50000, 100000, 150000, 200000, 300000].map(b => `<button class="btn sm ghost num" data-b="${b}">${money(b)}</button>`).join('')}
    </div>
    <label class="f"><span>Nota (opcional)</span><input id="c_nota" type="text" placeholder="Ej: turno de la mañana"></label>
    <button class="btn pri xl" id="c_ok">Abrir caja</button>`, () => {
    $$('[data-b]').forEach(b => b.onclick = () => $('#c_base').value = b.dataset.b);
    $('#c_ok').onclick = () => {
      const base = parseFloat($('#c_base').value) || 0;
      const t = DB.set('turnos', {
        id: uid(), createdAt: now(), dia: dayKey(), estado: 'abierto',
        base, nota: $('#c_nota').value.trim(),
        empleadoId: A.user.id, empleado: A.user.nombre, sede: CFG.sede
      });
      A.turno = t; cerrarSheet(); toast('Caja abierta', 'ok'); A.tab = 'vender'; pintar();
    };
  });
}

function modalGasto() {
  sheet('Registrar gasto', `
    <p class="muted">Plata que sale de la caja: domicilios, bolsas, arreglos, etc.</p>
    <label class="f"><span>¿En qué se gastó?</span><input id="g_con" type="text" placeholder="Ej: Bolsas plásticas"></label>
    <label class="f"><span>Monto</span><input id="g_mon" type="number" inputmode="numeric" placeholder="0" style="font-size:20px;font-weight:700"></label>
    <label class="f"><span>Categoría</span>
      <select id="g_cat">
        <option>Mercancía</option><option>Servicios</option><option>Transporte</option>
        <option>Aseo</option><option>Nómina</option><option>Otro</option>
      </select></label>
    <button class="btn pri xl" id="g_ok">Guardar gasto</button>`, () => {
    $('#g_ok').onclick = () => {
      const monto = parseFloat($('#g_mon').value) || 0;
      const con = $('#g_con').value.trim();
      if (!con) return toast('Escribe en qué se gastó', 'warn');
      if (monto <= 0) return toast('Escribe el monto', 'warn');
      DB.set('gastos', {
        id: uid(), createdAt: now(), dia: dayKey(), concepto: con, monto,
        categoria: $('#g_cat').value, turnoId: A.turno ? A.turno.id : null,
        empleado: A.user.nombre, sede: CFG.sede
      });
      cerrarSheet(); toast('Gasto registrado', 'ok'); pintar();
    };
    setTimeout(() => $('#g_con').focus(), 150);
  });
}

function modalCerrarCaja() {
  const t = A.turno, r = resumenTurno(t);
  sheet('Cerrar caja', `
    <div class="card">
      <div class="between"><span class="eyebrow">Debe haber en caja</span>
      <span class="disp num" style="font-size:24px">${money(r.esperado)}</span></div>
    </div>
    <label class="f"><span>Cuenta la plata y escribe cuánto hay de verdad</span>
      <input id="z_con" type="number" inputmode="numeric" placeholder="0" style="font-size:24px;font-weight:700"></label>
    <div class="card" id="z_box" style="background:var(--line2)">
      <div class="between"><span class="eyebrow">Diferencia</span>
      <span class="disp num" id="z_dif" style="font-size:26px">$0</span></div>
      <div class="tiny" id="z_msg">Escribe el conteo para comparar.</div>
    </div>
    <label class="f"><span>Observaciones (opcional)</span><textarea id="z_obs" placeholder="Ej: faltaron 2.000 del vuelto de la tarde"></textarea></label>
    <button class="btn dark xl" id="z_ok">Cerrar caja</button>
    <button class="btn ghost full" style="margin-top:8px" data-cerrar>Todavía no</button>`, () => {
    const inp = $('#z_con'), out = $('#z_dif'), box = $('#z_box'), msg = $('#z_msg');
    inp.oninput = () => {
      const c = parseFloat(inp.value) || 0, d = c - r.esperado;
      out.textContent = (d > 0 ? '+' : '') + money(d);
      if (Math.abs(d) < 1) { box.style.background = 'var(--azul-l)'; msg.textContent = 'Cuadró perfecto.'; }
      else if (d < 0) { box.style.background = 'var(--rojo-l)'; msg.textContent = 'Falta plata en la caja.'; }
      else { box.style.background = 'var(--rosa-l)'; msg.textContent = 'Hay más plata de la esperada.'; }
    };
    $('#z_ok').onclick = () => {
      const c = parseFloat(inp.value);
      if (isNaN(c)) return toast('Escribe cuánto contaste', 'warn');
      const cerrado = {
        ...t, estado: 'cerrado', cerradoAt: now(), conteo: c,
        diferencia: c - r.esperado, esperado: r.esperado,
        totalVentas: r.totalVentas, numVentas: r.vs.length,
        efectivo: r.efectivo, gastos: r.gastado, utilidad: r.utilidad,
        porMetodo: r.porMetodo, obs: $('#z_obs').value.trim(),
        cerradoPor: A.user.nombre
      };
      DB.set('turnos', cerrado);
      A.turno = null; cerrarSheet();
      modalResumenTurno(cerrado);
      pintar();
    };
    setTimeout(() => inp.focus(), 150);
  });
}

function modalResumenTurno(t) {
  const dif = Number(t.diferencia) || 0;
  const txt = [
    'CIERRE DE CAJA · ' + CFG.tienda,
    fecha(t.createdAt) + ' → ' + fecha(t.cerradoAt || now()),
    'Cajero: ' + (t.empleado || ''),
    '--------------------------------',
    'Ventas: ' + (t.numVentas || 0) + '  (' + money(t.totalVentas) + ')',
    'Utilidad: ' + money(t.utilidad || 0),
    'Base: ' + money(t.base),
    'Efectivo: ' + money(t.efectivo),
    'Gastos: -' + money(t.gastos),
    'Debía haber: ' + money(t.esperado),
    'Contado: ' + money(t.conteo),
    'Diferencia: ' + (dif > 0 ? '+' : '') + money(dif),
    t.obs ? 'Obs: ' + t.obs : ''
  ].filter(Boolean).join('\n');

  sheet('Cierre de caja', `
    <div class="card" style="background:${Math.abs(dif) < 1 ? 'var(--azul)' : 'var(--rojo)'};color:#fff;border:none;text-align:center">
      <div class="eyebrow" style="color:rgba(255,255,255,.75)">Diferencia</div>
      <div class="disp num" style="font-size:34px">${(dif > 0 ? '+' : '') + money(dif)}</div>
      <div class="tiny" style="color:rgba(255,255,255,.85)">${Math.abs(dif) < 1 ? 'La caja cuadró' : (dif < 0 ? 'Faltó plata' : 'Sobró plata')}</div>
    </div>
    <div class="card tight">
      ${[['Ventas', (t.numVentas || 0) + ' · ' + money(t.totalVentas)], ['Utilidad', money(t.utilidad || 0)],
      ['Base', money(t.base)], ['Efectivo recibido', money(t.efectivo)], ['Gastos', '-' + money(t.gastos)],
      ['Debía haber', money(t.esperado)], ['Contado', money(t.conteo)]]
      .map(([a, b]) => `<div class="item"><div class="g"><div class="t">${a}</div></div><div class="v num">${b}</div></div>`).join('')}
    </div>
    <button class="btn ghost full" id="t_wa">Enviar cierre por WhatsApp</button>
    <button class="btn pri xl" style="margin-top:8px" data-cerrar>Listo</button>`, () => {
    $('#t_wa').onclick = () => {
      const dest = String(CFG.whatsapp || '').replace(/\D/g, '');
      window.open('https://wa.me/' + dest + '?text=' + encodeURIComponent(txt), '_blank');
    };
  });
}

function modalVentasTurno() {
  const vs = ventasDeTurno(A.turno.id).sort((a, b) => b.createdAt - a.createdAt);
  sheet('Ventas del turno', `<div class="card tight">
    ${vs.length ? vs.map(v => `<div class="item" data-venta="${v.id}" role="button" tabindex="0">
      <div class="g"><div class="t">#${v.numero} · ${hora(v.createdAt)}</div>
      <div class="s">${v.items.length} productos · ${esc(v.metodo)}</div></div>
      <div class="v num">${money(v.total)}</div></div>`).join('')
      : '<div class="empty"><p>Sin ventas en este turno.</p></div>'}</div>`,
    (w) => {
      w.querySelectorAll('[data-venta]').forEach(el => el.onclick = () => {
        const v = DB.get('ventas', el.dataset.venta); if (v) modalDetalleVenta(v);
      });
    });
}

function modalDetalleVenta(v) {
  sheet('Venta #' + v.numero, `
    <div class="card"><div class="between">
      <div><div class="eyebrow">${fecha(v.createdAt)}</div><div class="tiny">${esc(v.empleado)}</div></div>
      <div class="disp num" style="font-size:26px">${money(v.total)}</div></div></div>
    <div class="card tight">${v.items.map(i => `<div class="item"><div class="g">
      <div class="t">${esc(i.nombre)}</div><div class="s num">${i.unidad === 'kg' ? kg(i.peso) : i.cant + ' und'} × ${money(i.precio)}</div></div>
      <div class="v num">${money(i.total)}</div></div>`).join('')}</div>
    <div class="grid2">
      <button class="btn ghost" id="d_imp">Imprimir</button>
      <button class="btn dan" id="d_anu" ${v.estado === 'anulada' ? 'disabled' : ''}>Anular venta</button>
    </div>`, () => {
    $('#d_imp').onclick = () => imprimirRecibo(v);
    $('#d_anu').onclick = () => confirmar('¿Anular la venta #' + v.numero + '? El inventario se devuelve.', () => {
      v.items.forEach(i => {
        if (!i.pid) return;
        const p = DB.get('productos', i.pid); if (!p) return;
        p.stock = Math.round(((Number(p.stock) || 0) + (i.unidad === 'kg' ? (i.peso || 0) : i.cant)) * 1000) / 1000;
        DB.set('productos', p);
      });
      v.estado = 'anulada'; v.anuladaPor = A.user.nombre; v.anuladaAt = now();
      DB.set('ventas', v);
      cerrarSheet(); toast('Venta anulada', 'warn'); pintar();
    }, 'Sí, anular');
  });
}

/* ---------- 16. VISTA: REPORTES ---------- */
function rangoVentas(desde, hasta) {
  return DB.all('ventas').filter(v => v.estado === 'ok' && v.createdAt >= desde && v.createdAt <= hasta);
}
function inicioDia(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

let repRango = 'hoy';
function limitesRango() {
  const h = now();
  if (repRango === 'hoy') return [inicioDia(), h];
  if (repRango === 'ayer') return [inicioDia() - 864e5, inicioDia() - 1];
  if (repRango === 'semana') return [inicioDia() - 6 * 864e5, h];
  return [inicioDia() - 29 * 864e5, h];
}

function vistaReportes() {
  const [d, hs] = limitesRango();
  const vs = rangoVentas(d, hs);
  const gs = DB.all('gastos').filter(g => g.createdAt >= d && g.createdAt <= hs);
  const totalV = vs.reduce((s, v) => s + v.total, 0);
  const util = vs.reduce((s, v) => s + (v.utilidad || 0), 0);
  const gasto = gs.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const ticket = vs.length ? totalV / vs.length : 0;

  // top productos
  const top = {};
  vs.forEach(v => v.items.forEach(i => {
    const k = i.nombre;
    top[k] = top[k] || { n: k, q: 0, v: 0 };
    top[k].q += i.unidad === 'kg' ? (i.peso || 0) : i.cant;
    top[k].v += i.total;
  }));
  const tops = Object.values(top).sort((a, b) => b.v - a.v).slice(0, 10);
  const maxV = tops.length ? tops[0].v : 1;

  // por método
  const met = {};
  vs.forEach(v => (v.pagos || []).forEach(p => met[p.metodo] = (met[p.metodo] || 0) + p.monto));

  // por empleado
  const emp = {};
  vs.forEach(v => { emp[v.empleado] = (emp[v.empleado] || 0) + v.total; });

  // por día (para ver tendencia)
  const dias = {};
  vs.forEach(v => { const k = v.dia || dayKey(v.createdAt); dias[k] = (dias[k] || 0) + v.total; });
  const dl = Object.entries(dias).sort((a, b) => a[0].localeCompare(b[0]));
  const maxD = Math.max(1, ...dl.map(x => x[1]));

  return `
  <div class="row" style="gap:6px;margin-bottom:10px;overflow-x:auto;padding-bottom:4px">
    ${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', '7 días'], ['mes', '30 días']]
      .map(([k, n]) => `<button class="btn sm ${repRango === k ? 'dark' : 'ghost'}" data-rango="${k}">${n}</button>`).join('')}
  </div>

  <div class="grid2" style="margin-bottom:10px">
    <div class="kpi g"><div class="k num">${money(totalV)}</div><div class="l">Ventas</div></div>
    <div class="kpi"><div class="k num">${vs.length}</div><div class="l">Tickets</div></div>
    <div class="kpi o"><div class="k num">${money(util)}</div><div class="l">Utilidad bruta</div></div>
    <div class="kpi r"><div class="k num">${money(gasto)}</div><div class="l">Gastos</div></div>
  </div>

  <div class="card">
    <div class="between"><h3>Ganancia después de gastos</h3>
    <span class="disp num" style="font-size:24px;color:${util - gasto >= 0 ? 'var(--azul)' : 'var(--rojo)'}">${money(util - gasto)}</span></div>
    <div class="tiny">Ticket promedio ${money(ticket)} · margen ${totalV ? Math.round(util / totalV * 100) : 0}%</div>
  </div>

  ${dl.length > 1 ? `<div class="card"><h3>Venta por día</h3>
    ${dl.map(([k, v]) => `<div style="margin-bottom:7px"><div class="between tiny"><span>${k.slice(5)}</span><b class="num">${money(v)}</b></div>
    <div class="bar"><i style="width:${Math.round(v / maxD * 100)}%"></i></div></div>`).join('')}</div>` : ''}

  <div class="card"><h3>Lo que más se vende</h3>
    ${tops.length ? tops.map(t => `<div style="margin-bottom:8px">
      <div class="between"><span style="font-size:13.5px;font-weight:600">${esc(t.n)}</span>
      <span class="num" style="font-size:13px"><b>${money(t.v)}</b> <span class="tiny">${Math.round(t.q * 100) / 100}</span></span></div>
      <div class="bar"><i style="width:${Math.round(t.v / maxV * 100)}%"></i></div></div>`).join('')
      : '<p class="muted" style="margin:0">Sin ventas en este rango.</p>'}
  </div>

  <div class="card"><h3>Cómo pagaron</h3>
    ${Object.keys(met).length ? METODOS.filter(m => met[m.k]).map(m => `
      <div class="between" style="padding:5px 0;border-bottom:1px solid var(--line2)">
      <span>${m.n}</span><b class="num">${money(met[m.k])}</b></div>`).join('')
      : '<p class="muted" style="margin:0">—</p>'}
  </div>

  <div class="card"><h3>Ventas por empleado</h3>
    ${Object.keys(emp).length ? Object.entries(emp).sort((a, b) => b[1] - a[1]).map(([n, v]) => `
      <div class="between" style="padding:5px 0;border-bottom:1px solid var(--line2)">
      <span>${esc(n)}</span><b class="num">${money(v)}</b></div>`).join('')
      : '<p class="muted" style="margin:0">—</p>'}
  </div>

  ${gs.length ? `<div class="card tight"><div style="padding:12px 12px 4px"><h3>Gastos del rango</h3></div>
    ${gs.sort((a, b) => b.createdAt - a.createdAt).map(g => `<div class="item">
      <div class="g"><div class="t">${esc(g.concepto)}</div><div class="s">${esc(g.categoria || '')} · ${fecha(g.createdAt)}</div></div>
      <div class="v num" style="color:var(--rojo)">-${money(g.monto)}</div></div>`).join('')}</div>` : ''}

  <div class="grid2">
    <button class="btn ghost" data-act="exportar">Descargar Excel/CSV</button>
    <button class="btn ghost" data-act="repwa">Enviar resumen</button>
  </div>`;
}

function resumenTexto() {
  const [d, hs] = limitesRango();
  const vs = rangoVentas(d, hs);
  const gs = DB.all('gastos').filter(g => g.createdAt >= d && g.createdAt <= hs);
  const totalV = vs.reduce((s, v) => s + v.total, 0);
  const util = vs.reduce((s, v) => s + (v.utilidad || 0), 0);
  const gasto = gs.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  return [
    CFG.tienda + ' · ' + CFG.sede,
    'Reporte: ' + ({ hoy: 'hoy', ayer: 'ayer', semana: 'últimos 7 días', mes: 'últimos 30 días' }[repRango]),
    '--------------------------------',
    'Ventas: ' + money(totalV) + ' (' + vs.length + ' tickets)',
    'Utilidad bruta: ' + money(util),
    'Gastos: ' + money(gasto),
    'Ganancia neta: ' + money(util - gasto)
  ].join('\n');
}

function exportarCSV() {
  const [d, hs] = limitesRango();
  const vs = rangoVentas(d, hs).sort((a, b) => a.createdAt - b.createdAt);
  const filas = [['Fecha', 'Venta', 'Producto', 'Unidad', 'Cantidad', 'Precio', 'Total linea', 'Metodo', 'Empleado', 'Total venta']];
  vs.forEach(v => v.items.forEach(i => filas.push([
    new Date(v.createdAt).toLocaleString('es-CO'), v.numero, i.nombre, i.unidad,
    i.unidad === 'kg' ? (i.peso || 0) : i.cant, i.precio, i.total, v.metodo, v.empleado, v.total
  ])));
  const csv = '\uFEFF' + filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'ventas-' + repRango + '-' + dayKey() + '.csv';
  a.click();
  toast('Archivo descargado', 'ok');
}

/* ---------- 17. VISTA: MÁS ---------- */
function vistaMas() {
  const cl = DB.all('clientes'), deuda = cl.reduce((s, c) => s + (Number(c.saldo) || 0), 0);
  return `
  <div class="card tight">
    ${[
      ['clientes', 'Clientes y fiados', deuda > 0 ? money(deuda) + ' por cobrar' : cl.length + ' clientes'],
      ['empleados', 'Empleados y claves', DB.all('empleados').length + ' registrados'],
      ['balanza', 'Balanza y escáner', A.balanza.vivo ? 'Balanza conectada' : 'Configurar equipos'],
      ['ajustes', 'Datos de la tienda', esc(CFG.tienda) + ' · ' + esc(CFG.sede)],
      ['nube', 'Conexión a la nube', A.dbf ? 'Conectada' : 'Sin configurar'],
      ['copia', 'Copia de seguridad', 'Descargar o restaurar'],
      ['portada', 'La portada de Conty Market', 'Ver la imagen de la marca']
    ].map(([k, t, s]) => `<div class="item" data-mas="${k}" role="button" tabindex="0">
      <div class="g"><div class="t">${t}</div><div class="s">${s}</div></div>
      <div style="color:var(--ink3);font-size:20px">›</div></div>`).join('')}
  </div>
  <div class="card">
    <div class="between"><div><b>${esc(A.user.nombre)}</b><div class="tiny">${esc(A.user.rol)}</div></div>
    <button class="btn sm ghost" data-act="salir">Cambiar usuario</button></div>
  </div>
  <p class="tiny" style="text-align:center;margin-top:14px">Conty Market POS · v1.0</p>`;
}

/* --- Clientes / fiados --- */
function vistaClientes() {
  const cs = DB.all('clientes').sort((a, b) => (Number(b.saldo) || 0) - (Number(a.saldo) || 0));
  const deuda = cs.reduce((s, c) => s + (Number(c.saldo) || 0), 0);
  sheet('Clientes y fiados', `
    <div class="card" style="background:var(--rosa-l);border-color:var(--rosa)">
      <div class="between"><span class="eyebrow" style="color:#B34400">Total por cobrar</span>
      <span class="disp num" style="font-size:26px">${money(deuda)}</span></div>
    </div>
    <button class="btn pri full" id="cl_nuevo">+ Cliente nuevo</button>
    <div class="card tight" style="margin-top:10px">
      ${cs.length ? cs.map(c => `<div class="item" data-cli="${c.id}" role="button" tabindex="0">
        <div class="g"><div class="t">${esc(c.nombre)}</div><div class="s">${esc(c.tel || 'sin teléfono')}</div></div>
        <div class="v num" style="color:${(c.saldo || 0) > 0 ? 'var(--rojo)' : 'var(--azul)'}">${money(c.saldo || 0)}</div></div>`).join('')
      : '<div class="empty"><p>Aún no hay clientes con fiado.</p></div>'}
    </div>`, (w) => {
    $('#cl_nuevo').onclick = () => formCliente();
    w.querySelectorAll('[data-cli]').forEach(el => el.onclick = () => detalleCliente(el.dataset.cli));
  });
}

function formCliente(id, luego) {
  const c = id ? DB.get('clientes', id) : { saldo: 0, movs: [] };
  sheet(id ? 'Editar cliente' : 'Cliente nuevo', `
    <label class="f"><span>Nombre *</span><input id="k_n" type="text" value="${esc(c.nombre || '')}"></label>
    <label class="f"><span>Teléfono / WhatsApp</span><input id="k_t" type="tel" value="${esc(c.tel || '')}" placeholder="3001234567"></label>
    <label class="f"><span>Nota</span><input id="k_o" type="text" value="${esc(c.nota || '')}" placeholder="Ej: vecino del 3er piso"></label>
    <button class="btn pri xl" id="k_ok">Guardar</button>`, () => {
    $('#k_ok').onclick = () => {
      const n = $('#k_n').value.trim();
      if (!n) return toast('Escribe el nombre', 'warn');
      DB.set('clientes', { ...c, id: c.id || uid(), nombre: n, tel: $('#k_t').value.trim(), nota: $('#k_o').value.trim() });
      cerrarSheet(); toast('Cliente guardado', 'ok');
      luego ? luego() : vistaClientes();
    };
    setTimeout(() => $('#k_n').focus(), 150);
  });
}

function detalleCliente(id) {
  const c = DB.get('clientes', id); if (!c) return;
  const movs = (c.movs || []).slice().reverse();
  sheet(c.nombre, `
    <div class="card" style="text-align:center">
      <div class="eyebrow">Debe</div>
      <div class="disp num" style="font-size:32px;color:${(c.saldo || 0) > 0 ? 'var(--rojo)' : 'var(--azul)'}">${money(c.saldo || 0)}</div>
      ${c.tel ? `<div class="tiny">${esc(c.tel)}</div>` : ''}
    </div>
    <div class="grid2">
      <button class="btn pri" id="cl_ab">Registrar abono</button>
      <button class="btn ghost" id="cl_ed">Editar datos</button>
    </div>
    ${c.tel ? `<button class="btn ghost full" style="margin-top:8px" id="cl_wa">Recordar por WhatsApp</button>` : ''}
    <div class="eyebrow" style="margin:14px 0 6px">Movimientos</div>
    <div class="card tight">
      ${movs.length ? movs.map(m => `<div class="item"><div class="g">
        <div class="t">${m.tipo === 'abono' ? 'Abono' : 'Fiado'}</div><div class="s">${fecha(m.t)}</div></div>
        <div class="v num" style="color:${m.tipo === 'abono' ? 'var(--azul)' : 'var(--rojo)'}">${m.tipo === 'abono' ? '-' : '+'}${money(m.monto)}</div></div>`).join('')
      : '<div class="empty"><p>Sin movimientos.</p></div>'}
    </div>`, () => {
    $('#cl_ed').onclick = () => formCliente(c.id);
    if ($('#cl_wa')) $('#cl_wa').onclick = () => {
      const t = `Hola ${c.nombre}, le escribo de ${CFG.tienda}. Su saldo pendiente es de ${money(c.saldo || 0)}. ¡Gracias!`;
      window.open('https://wa.me/57' + String(c.tel).replace(/\D/g, '') + '?text=' + encodeURIComponent(t), '_blank');
    };
    $('#cl_ab').onclick = () => sheet('Abono de ' + c.nombre, `
      <div class="card"><div class="between"><span class="eyebrow">Debe</span>
      <span class="disp num" style="font-size:22px">${money(c.saldo || 0)}</span></div></div>
      <label class="f"><span>¿Cuánto abona?</span><input id="ab_m" type="number" inputmode="numeric" style="font-size:22px;font-weight:700"></label>
      <button class="btn sm ghost full" id="ab_todo" style="margin-bottom:10px">Paga todo (${money(c.saldo || 0)})</button>
      <button class="btn pri xl" id="ab_ok">Registrar abono</button>`, () => {
      $('#ab_todo').onclick = () => $('#ab_m').value = c.saldo || 0;
      $('#ab_ok').onclick = () => {
        const m = parseFloat($('#ab_m').value) || 0;
        if (m <= 0) return toast('Escribe el monto', 'warn');
        c.saldo = Math.max(0, (Number(c.saldo) || 0) - m);
        c.movs = (c.movs || []).concat([{ t: now(), tipo: 'abono', monto: m }]).slice(-80);
        DB.set('clientes', c);
        DB.set('ventas', {
          id: uid(), numero: siguienteNumero(), createdAt: now(), dia: dayKey(),
          items: [{ pid: null, nombre: 'Abono de ' + c.nombre, unidad: 'und', precio: m, cant: 1, costo: 0, total: m }],
          subtotal: m, descuento: 0, total: m, costo: 0, utilidad: 0,
          pagos: [{ metodo: 'efectivo', monto: m }], metodo: 'abono',
          empleadoId: A.user.id, empleado: A.user.nombre,
          turnoId: A.turno ? A.turno.id : null, sede: CFG.sede, estado: 'ok', esAbono: true
        });
        cerrarSheet(); toast('Abono registrado', 'ok'); pintar();
      };
      setTimeout(() => $('#ab_m').focus(), 150);
    });
  });
}

/* --- Empleados --- */
const ROLES = [
  { k: 'admin', n: 'Administrador', d: 'Todo: ventas, inventario, reportes y ajustes' },
  { k: 'cajero', n: 'Cajero', d: 'Vende y maneja la caja de su turno' },
  { k: 'bodega', n: 'Bodega', d: 'Solo inventario y entradas de mercancía' }
];
function vistaEmpleados() {
  const es = DB.all('empleados');
  sheet('Empleados', `
    <button class="btn pri full" id="em_new">+ Empleado</button>
    <div class="card tight" style="margin-top:10px">
      ${es.map(e => `<div class="item" data-emp="${e.id}" role="button" tabindex="0">
        <div class="g"><div class="t">${esc(e.nombre)} ${e.activo === false ? '<span class="bad g">inactivo</span>' : ''}</div>
        <div class="s">${esc((ROLES.find(r => r.k === e.rol) || {}).n || e.rol)}</div></div>
        <div style="color:var(--ink3);font-size:20px">›</div></div>`).join('')}
    </div>
    <p class="tiny" style="margin-top:10px">Cada empleado entra con su clave de 4 números. Las ventas quedan a su nombre.</p>`,
    (w) => {
      $('#em_new').onclick = () => formEmpleado();
      w.querySelectorAll('[data-emp]').forEach(el => el.onclick = () => formEmpleado(el.dataset.emp));
    });
}
function formEmpleado(id) {
  const e = id ? DB.get('empleados', id) : { rol: 'cajero', activo: true };
  const soloYo = DB.all('empleados').filter(x => x.rol === 'admin' && x.activo !== false).length <= 1 && e.rol === 'admin';
  sheet(id ? 'Editar empleado' : 'Empleado nuevo', `
    <label class="f"><span>Nombre *</span><input id="e_n" type="text" value="${esc(e.nombre || '')}"></label>
    <label class="f"><span>Clave de 4 números *</span>
      <input id="e_p" type="tel" inputmode="numeric" maxlength="4" value="${esc(e.pin || '')}" placeholder="Ej: 1234" style="font-size:22px;letter-spacing:.3em"></label>
    <label class="f"><span>Permisos</span>
      <select id="e_r">${ROLES.map(r => `<option value="${r.k}" ${e.rol === r.k ? 'selected' : ''}>${r.n}</option>`).join('')}</select></label>
    <p class="tiny" id="e_d"></p>
    <div class="inline-check"><input type="checkbox" id="e_a" ${e.activo !== false ? 'checked' : ''}><label for="e_a">Activo (puede entrar)</label></div>
    <button class="btn pri xl" style="margin-top:10px" id="e_ok">Guardar</button>
    ${id && !soloYo ? `<button class="btn dan full" style="margin-top:8px" id="e_del">Eliminar</button>` : ''}`, () => {
    const sync = () => { $('#e_d').textContent = (ROLES.find(r => r.k === $('#e_r').value) || {}).d || ''; };
    $('#e_r').onchange = sync; sync();
    $('#e_ok').onclick = () => {
      const n = $('#e_n').value.trim(), p = $('#e_p').value.trim();
      if (!n) return toast('Escribe el nombre', 'warn');
      if (!/^\d{4}$/.test(p)) return toast('La clave debe ser de 4 números', 'warn');
      const dup = DB.all('empleados').find(x => x.id !== e.id && x.pin === p);
      if (dup) return toast('Esa clave ya la usa ' + dup.nombre, 'err');
      DB.set('empleados', { ...e, id: e.id || uid(), nombre: n, pin: p, rol: $('#e_r').value, activo: $('#e_a').checked });
      cerrarSheet(); toast('Empleado guardado', 'ok'); vistaEmpleados();
    };
    if ($('#e_del')) $('#e_del').onclick = () => confirmar('¿Eliminar a ' + e.nombre + '?', () => {
      DB.del('empleados', e.id); cerrarSheet(); vistaEmpleados();
    }, 'Sí, eliminar');
    if (!id) setTimeout(() => $('#e_n').focus(), 150);
  });
}

/* --- Balanza y escáner --- */
function vistaBalanza() {
  sheet('Balanza y escáner', `
    <div class="card">
      <div class="between"><h3>Escáner de códigos</h3>
      <span class="chip on"><i class="dot"></i>Siempre activo</span></div>
      <p class="muted" style="margin:6px 0 0">Conecta el lector por USB o Bluetooth y escanea: la app lo detecta sola, no hay que configurar nada. Pruébalo aquí abajo.</p>
      <input id="b_test" type="tel" placeholder="Escanea un código para probar" style="margin-top:8px">
      <div class="tiny" id="b_res" style="margin-top:6px">Esperando…</div>
    </div>

    <div class="card">
      <div class="between"><h3>Balanza digital</h3>
      <span class="chip ${A.balanza.vivo ? 'on' : 'off'}"><i class="dot"></i>${A.balanza.vivo ? 'Conectada' : 'Sin conectar'}</span></div>
      <div class="disp" id="pesovivo" style="font-size:26px;text-align:center;margin:10px 0">${kg(A.balanza.peso)}</div>
      <div class="grid2">
        <button class="btn sm" id="b_bt">Conectar Bluetooth</button>
        <button class="btn sm" id="b_ser">Conectar por cable</button>
      </div>
      ${A.balanza.vivo ? `<button class="btn sm dan full" style="margin-top:8px" id="b_off">Desconectar</button>` : ''}
      <p class="tiny" style="margin-top:10px">
        <b>Bluetooth</b> funciona en Chrome de Android.<br>
        <b>Cable (USB/serial)</b> funciona en Chrome de computador.<br>
        Si tu balanza no es de estas, usa el modo etiqueta de abajo o escribe el peso a mano: siempre se puede.
      </p>
    </div>

    <div class="card">
      <h3>Balanza que imprime etiquetas</h3>
      <p class="muted" style="margin:0 0 10px">La mayoría de balanzas de supermercado imprimen una etiqueta con código de barras que ya trae el peso o el precio. Ese código lo lee el escáner normal. Aquí le dices a la app cómo está armado.</p>
      <div class="grid2">
        <label class="f"><span>Prefijo</span><input id="bp" type="tel" value="${esc(CFG.balanzaPrefijo)}"></label>
        <label class="f"><span>¿Qué trae el código?</span>
          <select id="bc"><option value="precio" ${CFG.balanzaCampo === 'precio' ? 'selected' : ''}>El precio</option>
          <option value="peso" ${CFG.balanzaCampo === 'peso' ? 'selected' : ''}>El peso</option></select></label>
      </div>
      <div class="grid3">
        <label class="f"><span>Dígitos del código</span><input id="blc" type="number" value="${CFG.balanzaLenCod}"></label>
        <label class="f"><span>Dígitos del valor</span><input id="blv" type="number" value="${CFG.balanzaLenVal}"></label>
        <label class="f"><span>Decimales del peso</span><input id="bd" type="number" value="${CFG.balanzaDec}"></label>
      </div>
      <label class="f"><span>Probar con un código de etiqueta</span><input id="bt2" type="tel" placeholder="Ej: 2001010450008"></label>
      <div class="card" style="background:var(--line2);margin:0"><div class="tiny" id="bres2">Escribe o escanea una etiqueta para ver cómo la interpreta.</div></div>
      <button class="btn pri full" style="margin-top:10px" id="b_ok">Guardar configuración</button>
    </div>

    <div class="card">
      <h3>Cómo lo uso en la práctica</h3>
      <p class="tiny" style="margin:0">1. Crea el producto por peso (fruta, verdura, carne) con su <b>precio por kilo</b> y un <b>PLU</b> corto (101, 102…).<br>
      2. Si tienes balanza etiquetadora, programa el mismo PLU en la balanza.<br>
      3. Al cobrar: escaneas la etiqueta y la app calcula solo. Sin etiqueta, la app te pide el peso y lo lee de la balanza conectada o lo escribes.</p>
    </div>`, () => {
    const test = $('#b_test');
    test.onkeydown = e => {
      if (e.key === 'Enter') {
        const v = test.value.trim(); test.value = '';
        const r = buscarPorCodigo(v);
        $('#b_res').innerHTML = r ? `Leído <b>${esc(v)}</b> → <b style="color:var(--azul)">${esc(r.p.nombre)}</b>${r.bal ? ' (etiqueta de balanza)' : ''}`
          : `Leído <b>${esc(v)}</b> → no está en el inventario`;
      }
    };
    setTimeout(() => test.focus(), 200);
    $('#b_bt').onclick = () => BAL.conectarBT();
    $('#b_ser').onclick = () => BAL.conectarSerial();
    if ($('#b_off')) $('#b_off').onclick = () => { BAL.desconectar(); cerrarSheet(); };
    const prueba = () => {
      const guardar = { balanzaPrefijo: $('#bp').value.trim(), balanzaCampo: $('#bc').value, balanzaLenCod: Number($('#blc').value) || 5, balanzaLenVal: Number($('#blv').value) || 5, balanzaDec: Number($('#bd').value) || 3 };
      const viejo = { ...CFG }; Object.assign(CFG, guardar);
      const v = $('#bt2').value.trim();
      const r = v ? leerCodigoBalanza(v) : null;
      $('#bres2').innerHTML = !v ? 'Escribe o escanea una etiqueta para ver cómo la interpreta.'
        : (r ? `Código interno / PLU: <b>${esc(r.cod)}</b><br>${r.peso != null ? 'Peso: <b>' + kg(r.peso) + '</b>' : 'Precio: <b>' + money(r.precio) + '</b>'}`
          : 'No coincide con el formato configurado.');
      Object.assign(CFG, viejo);
      return guardar;
    };
    ['bp', 'bc', 'blc', 'blv', 'bd', 'bt2'].forEach(id => { const el = $('#' + id); el.oninput = prueba; el.onchange = prueba; });
    $('#b_ok').onclick = () => { DB.cfg(prueba()); toast('Configuración guardada', 'ok'); cerrarSheet(); };
  });
}

/* --- Datos de la tienda --- */
function vistaAjustes() {
  sheet('Datos de la tienda', `
    <label class="f"><span>Nombre de la tienda</span><input id="a_t" type="text" value="${esc(CFG.tienda)}"></label>
    <div class="grid2">
      <label class="f"><span>Sede / punto</span><input id="a_s" type="text" value="${esc(CFG.sede)}"></label>
      <label class="f"><span>NIT o cédula</span><input id="a_n" type="text" value="${esc(CFG.nit)}"></label>
    </div>
    <label class="f"><span>Dirección</span><input id="a_d" type="text" value="${esc(CFG.dir)}"></label>
    <div class="grid2">
      <label class="f"><span>Teléfono</span><input id="a_tel" type="tel" value="${esc(CFG.tel)}"></label>
      <label class="f"><span>WhatsApp para reportes</span><input id="a_wa" type="tel" value="${esc(CFG.whatsapp)}" placeholder="573001234567"></label>
    </div>
    <label class="f"><span>Redondear los totales a</span>
      <select id="a_r">
        <option value="0" ${CFG.redondeo == 0 ? 'selected' : ''}>Sin redondear (al peso)</option>
        <option value="50" ${CFG.redondeo == 50 ? 'selected' : ''}>Múltiplos de $50</option>
        <option value="100" ${CFG.redondeo == 100 ? 'selected' : ''}>Múltiplos de $100</option>
      </select></label>
    <div class="inline-check"><input type="checkbox" id="a_al" ${CFG.alertaStock ? 'checked' : ''}><label for="a_al">Avisarme cuando un producto quede en poco stock</label></div>
    <button class="btn pri xl" style="margin-top:10px" id="a_ok">Guardar</button>`, () => {
    $('#a_ok').onclick = () => {
      DB.cfg({
        tienda: $('#a_t').value.trim() || 'Conty Market', sede: $('#a_s').value.trim() || 'Principal',
        nit: $('#a_n').value.trim(), dir: $('#a_d').value.trim(), tel: $('#a_tel').value.trim(),
        whatsapp: $('#a_wa').value.trim(), redondeo: Number($('#a_r').value) || 0,
        alertaStock: $('#a_al').checked
      });
      cerrarSheet(); toast('Datos guardados', 'ok'); pintar();
    };
  });
}

/* --- Nube (Firebase) --- */
function vistaNube(gate) {
  const cfg = fbConfig();
  const html = `
    <p class="muted">Con la nube conectada, la tienda se sincroniza entre celulares y computadores, y no pierdes nada si se daña el equipo. Sin nube la app también funciona, pero los datos se quedan solo en este dispositivo.</p>
    <div class="card" style="background:${cfg ? 'var(--azul-l)' : 'var(--rosa-l)'};border-color:${cfg ? 'var(--azul)' : 'var(--rosa)'}">
      <b>${cfg ? 'Conectada al proyecto: ' + esc(cfg.projectId) : 'Todavía sin conectar'}</b>
      <div class="tiny">${cfg ? (A.dbf ? 'Sincronizando bien.' : 'Configurada, pero sin conexión ahora.') : 'Pega abajo la configuración que te da Firebase.'}</div>
    </div>
    <label class="f"><span>Pega aquí el bloque de Firebase (el que empieza en <b>const firebaseConfig</b>)</span>
      <textarea id="n_txt" style="min-height:150px;font-family:ui-monospace,monospace;font-size:12px" placeholder='const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "mi-tienda.firebaseapp.com",
  projectId: "mi-tienda",
  storageBucket: "mi-tienda.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};'></textarea></label>
    <button class="btn pri xl" id="n_ok">Guardar y conectar</button>
    ${cfg ? `<button class="btn dan full" style="margin-top:8px" id="n_del">Desconectar la nube</button>` : ''}
    <p class="tiny" style="margin-top:12px">En el archivo <b>INSTRUCCIONES.md</b> están los pasos con los nombres exactos de cada botón de Firebase.</p>`;

  const mount = () => {
    $('#n_ok').onclick = async () => {
      const raw = $('#n_txt').value;
      const cfg2 = parsearConfig(raw);
      if (!cfg2) return toast('No pude leer esa configuración. Copia todo el bloque completo.', 'err', 4000);
      LS.set('fbcfg', cfg2);
      toast('Guardado. Conectando…', 'ok');
      setTimeout(() => location.reload(), 700);
    };
    if ($('#n_del')) $('#n_del').onclick = () => confirmar('¿Desconectar la nube? Los datos de este equipo se quedan aquí.', () => {
      LS.del('fbcfg'); location.reload();
    }, 'Sí, desconectar');
  };

  if (gate) return { html, mount };
  sheet('Conexión a la nube', html, mount);
}

function parsearConfig(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = Function('"use strict";return (' + m[0].replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"').replace(/,\s*}/g, '}') + ')')();
    if (obj && obj.projectId && obj.apiKey) return obj;
    return null;
  } catch (e) { return null; }
}

/* --- Copia de seguridad --- */
function vistaCopia() {
  sheet('Copia de seguridad', `
    <p class="muted">Descarga un archivo con todo: productos, fotos, ventas, caja, clientes y empleados. Guárdalo en Drive o WhatsApp una vez por semana.</p>
    <p class="tiny">Si tienes muchas fotos el archivo pesa más. Es normal.</p>
    <button class="btn pri full" id="cp_dl">Descargar copia</button>
    <hr class="sep">
    <label class="f"><span>Restaurar desde un archivo de copia</span>
      <input type="file" id="cp_up" accept="application/json,.json"></label>
    <p class="tiny">Restaurar mezcla la copia con lo que ya tienes: si un dato es más nuevo en la copia, se reemplaza.</p>
    <hr class="sep">
    <button class="btn dan full" id="cp_borrar">Borrar todo de este equipo</button>`, () => {
    $('#cp_dl').onclick = () => {
      const data = { app: 'conty-market-pos', v: 1, fecha: now(), cfg: CFG, cols: A.mem };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = 'copia-conty-market-' + dayKey() + '.json';
      a.click(); toast('Copia descargada', 'ok');
    };
    $('#cp_up').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d.cols) throw new Error('archivo raro');
          COLS.forEach(c => Object.values(d.cols[c] || {}).forEach(doc => aplicarDoc(c, doc)));
          COLS.forEach(guardarLocal);
          if (d.cfg) DB.cfg(d.cfg);
          detectarTurno(); cerrarSheet(); toast('Copia restaurada', 'ok'); pintar();
        } catch (err) { toast('Ese archivo no sirve: ' + err.message, 'err', 4000); }
      };
      r.readAsText(f);
    };
    $('#cp_borrar').onclick = () => confirmar('Esto borra TODO de este equipo. Si tienes nube, los datos siguen allá. ¿Seguro?', () => {
      COLS.forEach(c => { A.mem[c] = {}; guardarLocal(c); });
      LS.del('consec'); location.reload();
    }, 'Sí, borrar todo');
  });
}

/* --- Portada de la marca --- */
function vistaPortada() {
  sheet('Conty Market', `
    <p class="muted">La imagen de marca de tu punto de venta. Tócala para verla en grande.</p>
    <a href="portada.jpg" target="_blank" style="display:block">
      <img class="cover" src="portada.jpg" alt="Portada de Conty Market"
        onerror="this.outerHTML='<div class=\\'empty\\'><p>La portada no está en esta carpeta. Sube portada.jpg junto a los demás archivos.</p></div>'">
    </a>
    <p class="tiny" style="margin-top:10px">Los colores de la app salen de aquí: azul <b style="color:var(--azul)">#0174D1</b>,
    rosa <b style="color:var(--rosa)">#E93276</b> y amarillo <b style="color:var(--amarillo-t)">#FFC405</b>.</p>`);
}

/* ---------- 18. ENTRADA: PRIMER USO Y CLAVE ---------- */
let pinBuf = '', pinSel = null;

function pantallaInicio() {
  const es = DB.all('empleados').filter(e => e.activo !== false);

  if (!es.length) {
    // Primer arranque: crear el dueño
    $('#app').innerHTML = `<div class="gate">
      <img class="mas" src="mascota.png" alt="" onerror="this.style.display='none'">
      <div class="logo" style="text-align:center">Conty <b>Market</b></div>
      <div class="sub" style="text-align:center">Vende más, controla todo y haz crecer tu supermercado</div>
      <div class="card">
        <h3>Empecemos por lo tuyo</h3>
        <label class="f"><span>Nombre de la tienda</span><input id="s_t" type="text" placeholder="Ej: Minimercado La Esquina"></label>
        <label class="f"><span>Tu nombre</span><input id="s_n" type="text" placeholder="Ej: Ilde"></label>
        <label class="f"><span>Clave de 4 números para entrar</span>
          <input id="s_p" type="tel" inputmode="numeric" maxlength="4" placeholder="1234" style="font-size:22px;letter-spacing:.3em"></label>
        <button class="btn pri xl" id="s_ok">Crear mi tienda</button>
      </div>
      <div class="card">
        <div class="between"><div><b>¿Ya tienes la nube lista?</b><div class="tiny">Opcional, se puede hacer después.</div></div>
        <button class="btn sm ghost" id="s_nube">Conectar</button></div>
      </div>
    </div>`;
    $('#s_ok').onclick = () => {
      const t = $('#s_t').value.trim(), n = $('#s_n').value.trim(), p = $('#s_p').value.trim();
      if (!n) return toast('Escribe tu nombre', 'warn');
      if (!/^\d{4}$/.test(p)) return toast('La clave debe ser de 4 números', 'warn');
      DB.cfg({ tienda: t || 'Mi tienda' });
      const e = DB.set('empleados', { id: uid(), nombre: n, pin: p, rol: 'admin', activo: true });
      A.user = e;
      productosDemo();
      toast('¡Listo! Bienvenido', 'ok');
      pintar();
    };
    $('#s_nube').onclick = () => vistaNube();
    return;
  }

  $('#app').innerHTML = `<div class="gate">
    <img class="mas" src="mascota.png" alt="" onerror="this.style.display='none'">
    <div class="logo" style="text-align:center">Conty <b>Market</b></div>
    <div class="sub" style="text-align:center">${esc(CFG.tienda)} · ${esc(CFG.sede)}</div>
    <div class="eyebrow" style="margin-bottom:8px">¿Quién va a atender?</div>
    <div class="who" id="who">
      ${es.map(e => `<button data-emp="${e.id}"><span>${esc(e.nombre)}</span>
        <span class="tiny">${esc((ROLES.find(r => r.k === e.rol) || {}).n || e.rol)}</span></button>`).join('')}
    </div>
    <div id="pinzone" class="hidden">
      <div class="eyebrow" style="text-align:center">Clave de 4 números</div>
      <div class="pinbox" id="pinbox">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
      <div class="keys" id="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
        <button class="act" data-k="borrar">Borrar</button>
        <button data-k="0">0</button>
        <button class="act" data-k="atras">Cambiar</button>
      </div>
    </div>
  </div>`;

  $('#who').onclick = e => {
    const b = e.target.closest('[data-emp]'); if (!b) return;
    pinSel = b.dataset.emp; pinBuf = '';
    $$('#who button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    $('#pinzone').classList.remove('hidden');
    pintarPin();
  };
  $('#keys').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'borrar') pinBuf = pinBuf.slice(0, -1);
    else if (k === 'atras') { pinSel = null; pinBuf = ''; $('#pinzone').classList.add('hidden'); $$('#who button').forEach(x => x.classList.remove('sel')); return; }
    else if (pinBuf.length < 4) pinBuf += k;
    pintarPin();
    if (pinBuf.length === 4) setTimeout(entrar, 120);
  };
}
function pintarPin() {
  $$('#pinbox i').forEach((el, i) => el.classList.toggle('on', i < pinBuf.length));
}
function entrar() {
  const e = DB.get('empleados', pinSel);
  if (!e || e.pin !== pinBuf) {
    pinBuf = ''; pintarPin(); vibrate([60, 50, 60]); beep(240, 220);
    return toast('Clave incorrecta', 'err');
  }
  A.user = e; pinBuf = ''; pinSel = null;
  LS.set('ultimo', e.id);
  detectarTurno();
  beep(1000, 90);
  pintar();
}

function productosDemo() {
  if (DB.all('productos').length) return;
  const demo = [
    ['Bolsa grande', '', 200, 100, 100, 'Empaque', 'und', 1],
    ['Arroz Diana 500g', '7702011000123', 3200, 2600, 20, 'Granos', 'und', 1],
    ['Aceite Premier 1L', '7702011000456', 12500, 10400, 8, 'Granos', 'und', 0],
    ['Gaseosa 400ml', '7702011000789', 2800, 2100, 24, 'Bebidas', 'und', 1],
    ['Tomate chonto', '', 4800, 3200, 15, 'Frutas y verduras', 'kg', 1],
    ['Banano', '', 3200, 2100, 20, 'Frutas y verduras', 'kg', 1],
    ['Papa pastusa', '', 3500, 2400, 40, 'Frutas y verduras', 'kg', 1]
  ];
  demo.forEach((d, i) => DB.set('productos', {
    id: uid(), nombre: d[0], barcode: d[1], precio: d[2], costo: d[3], stock: d[4],
    categoria: d[5], unidad: d[6], favorito: !!d[7], activo: true,
    plu: d[6] === 'kg' ? String(101 + i) : '', stockMin: d[6] === 'kg' ? 3 : 5
  }));
}

/* ---------- 19. RENDER ---------- */
const TABS = [
  { k: 'vender', n: 'Vender', i: 'vender', roles: ['admin', 'cajero'] },
  { k: 'inventario', n: 'Inventario', i: 'inv', roles: ['admin', 'bodega'] },
  { k: 'caja', n: 'Caja', i: 'caja', roles: ['admin', 'cajero'] },
  { k: 'reportes', n: 'Reportes', i: 'rep', roles: ['admin'] },
  { k: 'mas', n: 'Más', i: 'mas', roles: ['admin', 'cajero', 'bodega'] }
];

function puede(tab) {
  const t = TABS.find(x => x.k === tab);
  return t && t.roles.includes(A.user.rol);
}

function pintarTop() {
  const el = $('#topbar'); if (!el) return;
  el.innerHTML = `
    <div>
      <div class="mark">CONTY <b>MARKET</b> <i>POS</i></div>
      <div class="sede">${esc(CFG.tienda)} · ${esc(A.user.nombre)}</div>
    </div>
    <div class="sp"></div>
    ${A.balanza.vivo ? '<span class="chip on"><i class="dot"></i>Balanza</span>' : ''}
    <span class="chip ${A.turno ? 'on' : 'warn'}"><i class="dot"></i>${A.turno ? 'Caja abierta' : 'Caja cerrada'}</span>
    <span class="chip ${A.dbf && navigator.onLine ? 'on' : 'off'}"><i class="dot"></i>${A.dbf ? (navigator.onLine ? 'Nube' : 'Sin señal') : 'Local'}</span>`;
}

function pintar() {
  if (!A.user) return pantallaInicio();
  if (!puede(A.tab)) A.tab = TABS.find(t => t.roles.includes(A.user.rol)).k;

  const cuerpo = {
    vender: vistaVender, inventario: vistaInventario,
    caja: vistaCaja, reportes: vistaReportes, mas: vistaMas
  }[A.tab]();

  $('#app').innerHTML = `
    <header class="top" id="topbar"></header>
    <main><div class="view">${cuerpo}</div></main>
    ${A.tab === 'vender' ? tirilla() : ''}
    <nav class="nav" id="nav">
      ${TABS.filter(t => t.roles.includes(A.user.rol)).map(t => `
        <button data-tab="${t.k}" aria-current="${A.tab === t.k}">${ICON[t.i]}<span>${t.n}</span></button>`).join('')}
    </nav>`;
  pintarTop();
  montar();
}

function montar() {
  const nav = $('#nav');
  if (nav) nav.onclick = e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    A.tab = b.dataset.tab; A.filtro = ''; pintar();
    window.scrollTo(0, 0);
  };

  const si = $('#scaninput');
  if (si) {
    si.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = si.value.trim(); si.value = ''; if (v) procesarCodigo(v); }
    };
    if (!('ontouchstart' in window)) setTimeout(() => si.focus(), 60);
  }
  if ($('#btncam')) $('#btncam').onclick = abrirCamara;
  if ($('#btncam2')) $('#btncam2').onclick = abrirCamara;

  const bu = $('#busca');
  if (bu) {
    bu.oninput = () => {
      A.filtro = bu.value;
      const pos = bu.selectionStart;
      pintar();
      const nb = $('#busca'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); }
    };
  }

  // Delegación general de clics
  $('#app').onclick = e => {
    const el = e.target.closest('[data-act],[data-add],[data-quitar],[data-plus],[data-mas],[data-menos],[data-edit],[data-cat],[data-vcat],[data-rango],[data-turno]');
    if (!el) return;
    const d = el.dataset;

    if (d.add) { const p = DB.get('productos', d.add); if (p) agregar(p); return; }
    if (d.quitar) return quitarLinea(d.quitar);
    if (d.menos) return cambiarCant(d.menos, -1);
    if (d.plus) return cambiarCant(d.plus, 1);
    if (d.edit) return formProducto({ id: d.edit });
    if (d.vcat !== undefined) { A.catVenta = d.vcat; A.filtro = ''; pintar(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
    if (d.cat !== undefined) { A.filtroCat = d.cat; pintar(); return; }
    if (d.rango) { repRango = d.rango; pintar(); return; }
    if (d.turno) { const t = DB.get('turnos', d.turno); if (t) modalResumenTurno(t); return; }

    if (d.mas) {   // menú "Más"
      const m = d.mas;
      if (m === 'clientes') return vistaClientes();
      if (m === 'empleados') return vistaEmpleados();
      if (m === 'balanza') return vistaBalanza();
      if (m === 'ajustes') return vistaAjustes();
      if (m === 'nube') return vistaNube();
      if (m === 'copia') return vistaCopia();
      if (m === 'portada') return vistaPortada();
    }

    switch (d.act) {
      case 'cobrar': return modalCobro();
      case 'vaciar': return confirmar('¿Vaciar el carrito?', limpiarCarrito, 'Sí, vaciar');
      case 'suelto': return modalSuelto();
      case 'descuento': return modalDescuento();
      case 'nuevoprod': return formProducto();
      case 'entrada': return formEntrada();
      case 'importar': return formImportar();
      case 'abrircaja': return modalAbrirCaja();
      case 'gasto': return modalGasto();
      case 'cerrarcaja': return modalCerrarCaja();
      case 'verventas': return modalVentasTurno();
      case 'exportar': return exportarCSV();
      case 'pedidowa': {
        if (!paraPedir().length) return toast('No hay nada por pedir', 'ok');
        return window.open('https://wa.me/?text=' + encodeURIComponent(listaPedido()), '_blank');
      }
      case 'repwa': {
        const dest = String(CFG.whatsapp || '').replace(/\D/g, '');
        return window.open('https://wa.me/' + dest + '?text=' + encodeURIComponent(resumenTexto()), '_blank');
      }
      case 'salir': return confirmar('¿Cerrar sesión?', () => { A.user = null; pintar(); }, 'Sí, salir');
    }
  };
}

function modalDescuento() {
  const s = subtotal();
  sheet('Descuento', `
    <div class="card"><div class="between"><span class="eyebrow">Subtotal</span>
    <span class="disp num" style="font-size:22px">${money(s)}</span></div></div>
    <label class="f"><span>Descuento en pesos</span><input id="d_m" type="number" inputmode="numeric" value="${A.descuento || ''}" placeholder="0"></label>
    <div class="grid3" style="margin-bottom:10px">
      ${[5, 10, 15].map(p => `<button class="btn sm ghost" data-p="${p}">${p}%</button>`).join('')}
    </div>
    <div class="card" style="background:var(--azul-l);border-color:var(--azul)">
      <div class="between"><span class="eyebrow">Nuevo total</span>
      <span class="disp num" id="d_t" style="font-size:24px">${money(s)}</span></div></div>
    <button class="btn pri xl" style="margin-top:10px" id="d_ok">Aplicar</button>`, () => {
    const inp = $('#d_m'), out = $('#d_t');
    const calc = () => out.textContent = money(Math.max(0, redondear(s - (parseFloat(inp.value) || 0))));
    inp.oninput = calc;
    $$('[data-p]').forEach(b => b.onclick = () => { inp.value = Math.round(s * Number(b.dataset.p) / 100); calc(); });
    $('#d_ok').onclick = () => { A.descuento = Math.min(parseFloat(inp.value) || 0, s); cerrarSheet(); pintar(); };
    calc();
  });
}

/* ---------- 20. ARRANQUE ---------- */
async function arrancar() {
  cargarLocal();
  detectarTurno();
  iniciarEscaner();

  if (fbConfig()) await conectarFirebase();

  pintar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}

document.addEventListener('DOMContentLoaded', arrancar);
window.addEventListener('beforeunload', e => {
  if (A.carrito.length) { e.preventDefault(); e.returnValue = ''; }
});
