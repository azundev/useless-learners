const SUPABASE_URL = 'https://tecarasdwggresobjoas.supabase.co';
const defaults = { keywords: ['ads', 'advertisement', 'spam', 'scam', 'promotion', 'promotional', 'unsubscribe'], aiEnabled: true, aiProvider: 'gemini', aiModel: '', aiKey: '', maxResults: 50, supabaseKey: '', supabaseEmail: '', supabaseSession: null };
let settings = { ...defaults }, messages = [];

const $ = (id) => document.getElementById(id);
document.addEventListener('DOMContentLoaded', async () => {
  try { settings = { ...defaults, ...(await chrome.storage.local.get(defaults)) }; }
  catch (error) { setBusy(false, `Extension storage error: ${error.message}`, true); }
  renderKeywords(); syncForm();
  $('addKeyword').onclick = addKeyword;
  $('newKeyword').onkeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); addKeyword(); } };
  $('scan').onclick = scan;
  $('trash').onclick = trash;
  $('supabaseSignIn').onclick = () => supabaseAuth(false);
  $('supabaseSignUp').onclick = () => supabaseAuth(true);
  $('selectSafe').onclick = () => document.querySelectorAll('.message.safe input').forEach((box) => { box.checked = true; });
  $('supabaseEmail').value = settings.supabaseEmail || '';
  $('supabaseKey').value = settings.supabaseKey || '';
  updateCloudState();
  if (settings.supabaseSession && settings.supabaseKey) await loadCloudSettings();
});

function renderKeywords() {
  $('keywordList').replaceChildren(...settings.keywords.map((keyword, index) => {
    const button = document.createElement('button'); button.className = 'chip'; button.textContent = `${keyword} ×`; button.title = 'Click to remove';
    button.onclick = async () => { settings.keywords.splice(index, 1); await persist(); renderKeywords(); };
    return button;
  }));
}
async function addKeyword() {
  const value = $('newKeyword').value.trim().toLowerCase();
  if (!value) return setBusy(false, 'Type a keyword first.', true);
  if (settings.keywords.includes(value)) return setBusy(false, 'That keyword is already selected.', true);
  try { settings.keywords.push(value); $('newKeyword').value = ''; await persist(); renderKeywords(); setBusy(false, `Added “${value}”.`); }
  catch (error) { setBusy(false, `Could not save keyword: ${error.message}`, true); }
}
function syncForm() { $('aiEnabled').checked = settings.aiEnabled; $('aiProvider').value = settings.aiProvider; $('aiModel').value = settings.aiModel; $('aiKey').value = settings.aiKey; $('maxResults').value = settings.maxResults; }
async function persist() { settings = { ...settings, aiEnabled: $('aiEnabled').checked, aiProvider: $('aiProvider').value, aiModel: $('aiModel').value.trim(), aiKey: $('aiKey').value.trim(), maxResults: Number($('maxResults').value), supabaseEmail: $('supabaseEmail')?.value.trim() || settings.supabaseEmail, supabaseKey: $('supabaseKey')?.value.trim() || settings.supabaseKey }; await chrome.storage.local.set(settings); if (settings.supabaseSession) await saveCloudSettings(); }

async function supabaseAuth(signUp) {
  try {
    const email = $('supabaseEmail').value.trim(); const password = $('supabasePassword').value; const key = $('supabaseKey').value.trim();
    if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
    if (!password || password.length < 6) throw new Error('Supabase passwords must be at least 6 characters.');
    if (!key) throw new Error('Paste the Supabase publishable/anon key from Project Settings → API.');
    if (key.startsWith('sb_secret_')) throw new Error('This is a secret Supabase key. Use the publishable key or legacy anon key instead.');
    setCloudStatus(signUp ? 'Creating account…' : 'Signing in…');
    const endpoint = signUp ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const response = await fetch(`${SUPABASE_URL}${endpoint}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.msg || data.error_description || data.message || data.error || `HTTP ${response.status}`;
      if (/already|exist|registered/i.test(detail)) throw new Error('This email already has a Supabase account. Use “Sign in & sync”.');
      throw new Error(`Supabase: ${detail}`);
    }
    if (signUp && !data.access_token) { setCloudStatus('Account created. Check your email confirmation link, then use “Sign in & sync”.', false, true); return; }
    settings.supabaseSession = data; settings.supabaseKey = key; settings.supabaseEmail = email; await chrome.storage.local.set(settings); updateCloudState(); await loadCloudSettings(); setBusy(false, 'Supabase connected; settings synced.');
    setCloudStatus('Connected and synced.', false, true);
  } catch (error) { setCloudStatus(error.message, true); setBusy(false, error.message, true); }
}

async function loadCloudSettings() {
  try {
    const userId = settings.supabaseSession?.user?.id; if (!userId) return;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?select=*&user_id=eq.${encodeURIComponent(userId)}`, { headers: { apikey: settings.supabaseKey, Authorization: `Bearer ${settings.supabaseSession.access_token}` } });
    const rows = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(supabaseError(rows, response.status));
    if (rows[0]) { settings = { ...settings, keywords: rows[0].keywords || settings.keywords, aiProvider: rows[0].ai_provider || settings.aiProvider, aiModel: rows[0].ai_model || settings.aiModel, maxResults: rows[0].max_results || settings.maxResults }; await chrome.storage.local.set(settings); renderKeywords(); syncForm(); }
    else await saveCloudSettings();
    updateCloudState();
  } catch (error) { throw new Error(`Supabase sync failed: ${error.message}`); }
}

async function saveCloudSettings() {
  const userId = settings.supabaseSession?.user?.id; if (!userId || !settings.supabaseKey) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, { method: 'POST', headers: { apikey: settings.supabaseKey, Authorization: `Bearer ${settings.supabaseSession.access_token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: userId, keywords: settings.keywords, ai_provider: settings.aiProvider, ai_model: settings.aiModel || null, max_results: settings.maxResults, updated_at: new Date().toISOString() }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(supabaseError(data, response.status)); }
}

function supabaseError(data, status) {
  const message = data.message || data.details || data.hint || data.error || '';
  if (status === 404 || /user_settings|schema cache|PGRST205/i.test(message)) {
    return `Supabase cannot see public.user_settings in ${SUPABASE_URL}. Run supabase/migrations/001_user_settings.sql in that exact project, execute the whole script, then reload the extension.`;
  }
  return message || `Supabase ${status}`;
}

function updateCloudState() { const connected = Boolean(settings.supabaseSession?.access_token && settings.supabaseKey); $('cloudState').textContent = connected ? 'Connected' : 'Not connected'; $('cloudState').className = `cloud-state${connected ? ' connected' : ''}`; }
function setCloudStatus(text, error = false, success = false) { const element = $('cloudStatus'); if (!element) return; element.textContent = text; element.className = `cloud-status${error ? ' error' : success ? ' success' : ''}`; }
async function scan() {
  try {
    const extensionRuntime = globalThis.chrome?.runtime;
    if (!extensionRuntime?.getManifest || !extensionRuntime?.sendMessage) throw new Error('This page is not running as a loaded browser extension. Open chrome://extensions (or brave://extensions), load the extension folder, then open it from the Extensions toolbar menu.');
    if (extensionRuntime.getManifest().oauth2.client_id.startsWith('REPLACE_WITH_')) throw new Error('Add your Google OAuth client ID to manifest.json, then reload the unpacked extension.');
    await persist(); setBusy(true, 'Signing in and scanning Gmail…');
    const response = await chrome.runtime.sendMessage({ type: 'scan', settings });
    if (!response?.ok) return setBusy(false, response?.error || 'The background service worker did not respond.', true);
    messages = response.data; renderMessages(); setBusy(false, `${messages.length} candidate${messages.length === 1 ? '' : 's'} found.`); $('results').hidden = false;
  } catch (error) { setBusy(false, error.message || String(error), true); }
}
function renderMessages() {
  const list = $('messageList'); list.replaceChildren();
  if (!messages.length) { list.innerHTML = '<p class="hint">No messages matched your selected keywords.</p>'; $('trash').disabled = true; return; }
  messages.forEach((message, index) => {
    const safe = message.aiLabel === 'safe_to_trash'; const wrapper = document.createElement('article'); wrapper.className = `message ${safe ? 'safe' : 'warn'}`;
    wrapper.innerHTML = `<div class="message-top"><input type="checkbox" data-index="${index}"><div><div class="subject"></div><div class="sender"></div></div></div><span class="badge ${safe ? 'safe' : ''}">${safe ? 'likely unwanted' : 'review carefully'}</span><p class="reason"></p>`;
    wrapper.querySelector('.subject').textContent = message.subject; wrapper.querySelector('.sender').textContent = `${message.sender} · ${message.date}`; wrapper.querySelector('.reason').textContent = `${message.aiReason} Keywords: ${message.matchedKeywords.join(', ')}`; list.append(wrapper);
  });
  list.onchange = () => { $('trash').disabled = !list.querySelector('input:checked'); };
  $('trash').disabled = true;
}
async function trash() {
  const ids = [...document.querySelectorAll('#messageList input:checked')].map((box) => messages[Number(box.dataset.index)].id);
  if (!ids.length || !confirm(`Move ${ids.length} message${ids.length === 1 ? '' : 's'} to Gmail Trash?`)) return;
  setBusy(true, 'Moving approved messages to Trash…'); const response = await chrome.runtime.sendMessage({ type: 'trash', ids });
  if (!response.ok) return setBusy(false, response.error, true);
  messages = messages.filter((message) => !ids.includes(message.id)); renderMessages(); setBusy(false, `${response.data.count} message${response.data.count === 1 ? '' : 's'} moved to Trash.`); $('results').hidden = false;
}
function setBusy(busy, text, error = false) { $('scan').disabled = busy; $('status').textContent = text; $('status').className = `status${error ? ' error' : ''}`; }
