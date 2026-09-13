import { 
  snoozeThread, 
  getSnoozedThreads, 
  clearSnoozedThread, 
  checkTrashReminder,
  getEmailLists,
  addToList,
  removeFromList,
  evaluateSenderRules
} from './utilities.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Setup periodic alarm for Trash Reminders on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('periodic_trash_check', { periodInMinutes: 1440 });
});

// Alarm Listener for Snooze Reminders & Periodic Trash Checks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic_trash_check') {
    await checkTrashReminder(7);
  } else if (alarm.name.startsWith('snooze_')) {
    const threadId = alarm.name.replace('snooze_', '');
    const snoozedItems = await getSnoozedThreads();
    const target = snoozedItems.find(item => item.threadId === threadId);

    if (target) {
      chrome.notifications.create(`notify_${threadId}`, {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Read-Later Reminder',
        message: `Time to revisit: "${target.subject}"`,
        priority: 2
      });
      await clearSnoozedThread(threadId);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'scan') {
        sendResponse({ ok: true, data: await scan(message.settings) });
      } else if (message.type === 'trash') {
        sendResponse({ ok: true, data: await trash(message.ids) });
      } else if (message.type === 'snooze') {
        await snoozeThread(message.threadId, message.subject, message.days);
        sendResponse({ ok: true });
      } else if (message.type === 'get_snoozed') {
        sendResponse({ ok: true, data: await getSnoozedThreads() });
      } else if (message.type === 'get_lists') {
        sendResponse({ ok: true, data: await getEmailLists() });
      } else if (message.type === 'add_list') {
        await addToList(message.listType, message.entry);
        sendResponse({ ok: true });
      } else if (message.type === 'remove_list') {
        await removeFromList(message.listType, message.entry);
        sendResponse({ ok: true });
      } else {
        throw new Error('Unknown request');
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
});

async function token() {
  const result = await chrome.identity.getAuthToken({ interactive: true });
  if (!result?.token) throw new Error('Google sign-in did not return an access token.');
  return result.token;
}

async function gmail(path, init = {}) {
  const accessToken = await token();
  const response = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function scan(settings) {
  const keywords = settings.keywords.filter(Boolean).map((value) => value.trim().toLowerCase());
  if (!keywords.length) throw new Error('Choose at least one keyword.');
  const q = `({${keywords.map(escapeGmailQuery).join(' OR ')}}) -in:trash -in:spam`;
  const list = await gmail(`/messages?maxResults=${Math.min(settings.maxResults || 50, 100)}&q=${encodeURIComponent(q)}`);
  
  const candidateMessages = [];
  const preProcessedResults = [];

  for (const item of list.messages || []) {
    const message = await gmail(`/messages/${item.id}?format=full`);
    const parsed = parseMessage(message);
    const matched = keywords.filter((word) => `${parsed.subject} ${parsed.sender} ${parsed.body}`.toLowerCase().includes(word));
    
    // Evaluate against Whitelist / Blacklist rules
    const ruleResult = await evaluateSenderRules(parsed.sender);
    
    if (ruleResult === 'WHITELISTED') {
      // Exclude whitelisted emails from trash recommendations entirely
      continue;
    } else if (ruleResult === 'BLACKLISTED') {
      // Mark directly as safe_to_trash, skipping AI call
      preProcessedResults.push({
        id: item.id,
        threadId: message.threadId,
        ...parsed,
        matchedKeywords: matched,
        aiLabel: 'safe_to_trash',
        aiScore: 1.0,
        aiReason: 'Sender matches Blacklist rule.'
      });
    } else {
      candidateMessages.push({ id: item.id, threadId: message.threadId, ...parsed, matchedKeywords: matched });
    }
  }

  // Run remaining candidate messages through AI classification
  const aiResults = candidateMessages.length ? await classify(candidateMessages, settings) : [];
  const processedCandidates = candidateMessages.map((msg, idx) => ({ ...msg, ...aiResults[idx] }));

  return [...preProcessedResults, ...processedCandidates];
}

function escapeGmailQuery(word) {
  return word.includes(' ') ? `"${word.replaceAll('"', '')}"` : word.replaceAll('"', '');
}

function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
  return {
    subject: headers.subject || '(no subject)',
    sender: headers.from || '(unknown sender)',
    date: headers.date || '',
    snippet: message.snippet || '',
    body: extractText(message.payload).slice(0, 6000)
  };
}

function extractText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const text = extractText(child);
    if (text) return text;
  }
  return '';
}

function decodeBase64Url(value) {
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function classify(messages, settings) {
  const fallback = messages.map((message) => ({
    aiLabel: 'review',
    aiScore: 0.5,
    aiReason: `Matched: ${message.matchedKeywords.join(', ')}`
  }));
  if (!settings.aiEnabled || !settings.aiKey || !messages.length) return fallback;
  const prompt = `You triage Gmail cleanup candidates. Treat keyword matches as signals, not proof. A message is "safe_to_trash" only when it is clearly bulk marketing, spam, scam, or an unwanted promotion. Label a message "important_review" when it may be a legitimate business request, invoice, job, account notice, receipt, sponsorship inquiry, or personal communication. Never recommend trash solely because it contains words such as sponsor, promotion, advertisement, or unsubscribe. Return ONLY JSON with an items array containing one object per input in the same order: {"items":[{"label":"safe_to_trash"|"important_review"|"review","score":0..1,"reason":"short explanation"}]}.\n\nCANDIDATES:\n${messages.map((m, i) => `#${i + 1}\nFrom: ${m.sender}\nSubject: ${m.subject}\nMatched: ${m.matchedKeywords.join(', ')}\nBody: ${m.body || m.snippet}`).join('\n\n')}`;
  try {
    const text = settings.aiProvider === 'grok' ? await callGrok(prompt, settings) : await callGemini(prompt, settings);
    const raw = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
    const parsed = Array.isArray(raw) ? raw : raw.items;
    if (!Array.isArray(parsed) || parsed.length !== messages.length) return fallback;
    return parsed.map((item, i) => ({
      aiLabel: ['safe_to_trash', 'important_review', 'review'].includes(item.label) ? item.label : fallback[i].aiLabel,
      aiScore: Number.isFinite(Number(item.score)) ? Math.max(0, Math.min(1, Number(item.score))) : fallback[i].aiScore,
      aiReason: String(item.reason || fallback[i].aiReason).slice(0, 280)
    }));
  } catch (error) {
    return messages.map((message, i) => ({ ...fallback[i], aiReason: `AI unavailable; manual review required. ${error.message}` }));
  }
}

async function callGemini(prompt, settings) {
  const model = settings.aiModel || 'gemini-3.8-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.aiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
}

async function callGrok(prompt, settings) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiKey}` },
    body: JSON.stringify({ model: settings.aiModel || 'grok-4-1-fast-reasoning', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
  });
  if (!response.ok) throw new Error(`Grok ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '[]';
}

async function trash(ids) {
  if (!ids?.length) return { count: 0 };
  for (const id of ids) await gmail(`/messages/${encodeURIComponent(id)}/trash`, { method: 'POST' });
  return { count: ids.length };
}