// Throwaway spike popup: shows worker status and edits test settings. Text is set with textContent only.
const DEFAULTS = { insertPixel: true, sendMode: 'presync', dnrMode: 'observe', stripQuoted: true };

function line(text, cls) {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.className = cls;
  return div;
}

async function render() {
  const { settings = DEFAULTS, status = {}, sent = [] } = await chrome.storage.local.get(['settings', 'status', 'sent']);
  const box = document.getElementById('status');
  box.replaceChildren(
    line(
      status.loggerOk ? 'Logger reachable: yes' : `Logger reachable: no ${status.loggerError ? `(${status.loggerError})` : ''}`,
      status.loggerOk ? 'good' : 'bad',
    ),
    line(`Proxy regex supported: ${status.regexSupported ? status.regexSupported.isSupported : 'unknown'}`),
    line(`Self-view rule matches: ${status.dnrMatches ?? 0}`),
    line(`Telemetry requests blocked: ${status.telemetryBlocked ?? 0}`),
    line(`Test emails sent: ${sent.length}`),
  );
  document.getElementById('insertPixel').checked = settings.insertPixel;
  document.getElementById('stripQuoted').checked = settings.stripQuoted;
  for (const name of ['sendMode', 'dnrMode']) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === settings[name];
  }
}

async function save(patch) {
  const { settings = DEFAULTS } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

document.getElementById('insertPixel').addEventListener('change', (e) => save({ insertPixel: e.target.checked }));
document.getElementById('stripQuoted').addEventListener('change', (e) => save({ stripQuoted: e.target.checked }));
for (const name of ['sendMode', 'dnrMode']) {
  for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
    input.addEventListener('change', () => save({ [name]: input.value }));
  }
}
document.getElementById('clearSent').addEventListener('click', async () => {
  await chrome.storage.local.set({ sent: [] });
  render();
});
chrome.storage.onChanged.addListener(render);
render();
