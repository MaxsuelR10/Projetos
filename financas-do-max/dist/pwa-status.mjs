const connection = document.querySelector('#connection-status');
const update = document.querySelector('#release-status');
const feedback = document.querySelector('#release-feedback');
let currentRelease;
let checking = false;

function showConnection() {
  connection.hidden = navigator.onLine;
}

async function checkRelease() {
  if (checking || !navigator.onLine || document.hidden) return;
  checking = true;
  try {
    const response = await fetch('/api/release', {cache: 'no-store'});
    if (!response.ok) return;
    const {release} = await response.json();
    if (!release) return;
    currentRelease ??= release;
    update.hidden = currentRelease === release;
  } catch {
    // A failed check leaves the current page open.
  } finally {
    checking = false;
  }
}

update.querySelector('button').addEventListener('click', () => {
  if (!navigator.onLine) {
    feedback.textContent = 'Reconecte para atualizar.';
    return;
  }
  if (!window.dispatchEvent(new Event('financas-before-update', {cancelable: true}))) {
    feedback.textContent = 'Feche o formulário e conclua a sincronização. Se houve falha, exporte um backup antes de atualizar.';
    return;
  }
  location.reload();
});
window.addEventListener('online', () => { showConnection(); checkRelease(); });
window.addEventListener('offline', showConnection);
window.addEventListener('pageshow', checkRelease);
document.addEventListener('visibilitychange', checkRelease);
setInterval(checkRelease, 60000);
showConnection();
checkRelease();

const viewport = window.visualViewport;
if (viewport) {
  const resize = () => {
    if (viewport.scale !== 1) return;
    document.documentElement.style.setProperty('--visible-height', `${viewport.height}px`);
    document.documentElement.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
  };
  viewport.addEventListener('resize', resize);
  viewport.addEventListener('scroll', resize);
  resize();
}
