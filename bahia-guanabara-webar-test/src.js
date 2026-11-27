import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { bootstrapCameraKit, createMediaStreamSource } from '@snap/camera-kit';

const lensId = 'bc5169aa-58ab-4cd9-9d36-61bba71ea464';
const cameraKitConfig = { apiToken: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzk1NzgyODkzLCJzdWIiOiJhMTQ5NjkwMy1jYzM2LTQ2MDUtYmY0Mi0yNjc3ZDMxMjcwOWR-U1RBR0lOR34xMjljZjRkMi0xZjgxLTQ5ZWYtOWNmYS1iNWRhMDc3YTAwMzMifQ.WJqo62tRXdLkKIgwpvCOzi6n3kfZQuzIyefmzmfqj88', lensGroupId: '1122eb86-99b0-4a66-acd5-23a528688f70' };
// Nitidez del Lens: se pide video 720p y el Lens se dibuja a la resolución real de la pantalla, con un tope.
const CAMERA_SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };
const MAX_PIXEL_RATIO = 2;          // píxeles por punto de pantalla: 2 = nítido. Si el Lens va lento, probar 1.5
const MAX_RENDER_PIXELS = 1600000;  // tope de 1,6 megapíxeles por cuadro, para tablets y pantallas grandes
const HINT_SECONDS = 6;             // cuánto queda visible la guía sobre la cámara

const canvas = document.querySelector('#camera');
const status = document.querySelector('#status');
const log = document.querySelector('#log');
const startButton = document.querySelector('#start');
const retryButton = document.querySelector('#retry');
const progress = document.querySelector('.progress');
const progressFill = document.querySelector('.progress-fill');
let cameraKit;
let session;
let stream;
let source;
let running = false;
let resizeTimer;
let hintTimer;
let lastSize = '';

// Diagnóstico técnico: oculto, salvo que la dirección termine en ?debug
if (new URLSearchParams(location.search).has('debug')) document.querySelector('#debug').hidden = false;

function show(screen) { document.body.dataset.screen = screen; }
function setProgress(value) {
  progressFill.style.width = `${value}%`;
  progress.setAttribute('aria-valuenow', String(value));
}
function note(message, error) {
  const detail = error ? `\n${error.name || 'Error'}: ${error.message || String(error)}${error.stack ? `\n${error.stack}` : ''}` : '';
  log.textContent += `${new Date().toISOString()} ${message}${detail}\n`;
}
function showHint(message) {
  clearTimeout(hintTimer);
  status.textContent = message;
  hintTimer = setTimeout(() => { status.textContent = ''; }, HINT_SECONDS * 1000);
}
function stopCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  source = null;
  if (session) session.pause();
  clearTimeout(hintTimer);
  status.textContent = '';
}
function fail(message, error) {
  note(message, error);
  stopCamera();
  running = false;
  show('error');
}

function renderSize() {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = (canvas.clientWidth || window.innerWidth) * ratio;
  const height = (canvas.clientHeight || window.innerHeight) * ratio;
  const fit = Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (width * height)));
  return [Math.round(width * fit), Math.round(height * fit)];
}
async function updateRenderSize() {
  if (!source) return;
  const [width, height] = renderSize();
  const size = `${width} x ${height}`;
  if (size === lastSize) return;
  try {
    await source.setRenderSize(width, height);
    lastSize = size;
    note(`Resolução da Lens: ${size}`);
  } catch (error) {
    note('Não foi possível mudar a resolução da Lens', error);
  }
}
// Al girar el teléfono o cambiar el tamaño de la ventana, se vuelve a ajustar la resolución.
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(updateRenderSize, 250);
});

async function start() {
  if (running) return;
  running = true;
  setProgress(5);
  show('loading');
  stopCamera();
  try {
    note('Iniciando Camera Kit…');
    if (!cameraKit) {
      cameraKit = await bootstrapCameraKit({ apiToken: cameraKitConfig.apiToken });
      session = await cameraKit.createSession({ liveRenderTarget: canvas });
      session.events.addEventListener('error', ({ detail }) => fail('Erro durante a execução da Lens.', detail.error));
    }
    setProgress(30);
    note('Solicitando acesso à câmera…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', ...CAMERA_SIZE }, audio: false });
    source = createMediaStreamSource(stream, { cameraType: 'environment' });
    lastSize = '';
    await session.setSource(source);
    setProgress(55);
    note('Carregando a Lens…');
    const lens = await cameraKit.lensRepository.loadLens(lensId, cameraKitConfig.lensGroupId);
    setProgress(80);
    await session.applyLens(lens);
    await session.play();
    setProgress(100);
    show('camera');
    // Con el teléfono vertical, los datos de la cámara se estabilizan un instante después de abrirla.
    await new Promise(resolve => setTimeout(resolve, 150));
    const track = stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    note(`Câmera: ${settings.width} x ${settings.height}`);
    await updateRenderSize();
    showHint('Aponte a câmera para a página da revista');
    note('Lens iniciada.');
  } catch (error) {
    fail('Não foi possível abrir a experiência.', error);
    return;
  }
  running = false;
}

startButton.addEventListener('click', start);
retryButton.addEventListener('click', start);
document.querySelector('#stop').addEventListener('click', () => { stopCamera(); show('start'); });
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(log.textContent); } catch { /* el texto se puede seleccionar a mano */ }
});
