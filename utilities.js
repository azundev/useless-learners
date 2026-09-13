// utilities.js

export const SNOOZE_PRESETS = {
  DAY_1: 1,
  DAYS_3: 3,
  DAYS_7: 7,
  DAYS_30: 30
};

/**
 * EMAIL WHITELIST & BLACKLIST UTILITY
 */

/**
 * Gets the current whitelist and blacklist arrays.
 */
export async function getEmailLists() {
  const { whitelist = [], blacklist = [] } = await chrome.storage.local.get(['whitelist', 'blacklist']);
  return { whitelist, blacklist };
}

/**
 * Adds an email address or domain (e.g., 'example.com') to a list.
 * @param {'whitelist' | 'blacklist'} listType 
 * @param {string} entry 
 */
export async function addToList(listType, entry) {
  const cleanEntry = entry.trim().toLowerCase();
  if (!cleanEntry) return;

  const lists = await getEmailLists();
  const currentList = lists[listType] || [];

  if (!currentList.includes(cleanEntry)) {
    const updatedList = [...currentList, cleanEntry];
    await chrome.storage.local.set({ [listType]: updatedList });
  }
}

/**
 * Removes an entry from a list.
 * @param {'whitelist' | 'blacklist'} listType 
 * @param {string} entry 
 */
export async function removeFromList(listType, entry) {
  const lists = await getEmailLists();
  const updatedList = (lists[listType] || []).filter(item => item !== entry.toLowerCase());
  await chrome.storage.local.set({ [listType]: updatedList });
}

/**
 * Checks if a sender email matches any whitelist or blacklist rules.
 * Supports exact email matches and domain matches (e.g. "@spam.com").
 * @param {string} senderHeader - Raw sender string (e.g., "Spam Sender <info@spam.com>")
 */
export async function evaluateSenderRules(senderHeader) {
  const { whitelist, blacklist } = await getEmailLists();
  const senderLower = senderHeader.toLowerCase();

  // Check Whitelist first
  const isWhitelisted = whitelist.some(rule => senderLower.includes(rule.toLowerCase()));
  if (isWhitelisted) return 'WHITELISTED';

  // Check Blacklist
  const isBlacklisted = blacklist.some(rule => senderLower.includes(rule.toLowerCase()));
  if (isBlacklisted) return 'BLACKLISTED';

  return 'NEUTRAL';
}

/**
 * READ-LATER / SNOOZE UTILITY
 */

export async function snoozeThread(threadId, subject, days) {
  const allowedDays = [1, 3, 7, 30];
  const selectedDays = allowedDays.includes(days) ? days : 1;
  
  const now = Date.now();
  const remindAt = now + (selectedDays * 24 * 60 * 60 * 1000);

  const data = await chrome.storage.local.get({ readLater: [] });
  const updated = [
    ...data.readLater.filter(item => item.threadId !== threadId),
    { threadId, subject, snoozedAt: now, remindAt, durationDays: selectedDays }
  ];
  
  await chrome.storage.local.set({ readLater: updated });
  chrome.alarms.create(`snooze_${threadId}`, { when: remindAt });
}

export async function getSnoozedThreads() {
  const { readLater = [] } = await chrome.storage.local.get('readLater');
  return readLater;
}

export async function clearSnoozedThread(threadId) {
  const { readLater = [] } = await chrome.storage.local.get('readLater');
  const filtered = readLater.filter(item => item.threadId !== threadId);
  await chrome.storage.local.set({ readLater: filtered });
  chrome.alarms.clear(`snooze_${threadId}`);
}

/**
 * TRASH REMINDER UTILITY
 */

export async function checkTrashReminder(intervalDays = 7) {
  const allowedIntervals = [1, 3, 7, 30];
  const days = allowedIntervals.includes(intervalDays) ? intervalDays : 7;
  
  const { lastTrashReminder = 0 } = await chrome.storage.local.get('lastTrashReminder');
  const now = Date.now();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  if (now - lastTrashReminder > thresholdMs) {
    chrome.notifications.create('trash_reminder', {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Gmail Trash Reminder',
      message: `It has been ${days} day(s)! Remember to review and empty your Gmail Trash.`,
      priority: 1
    });
    await chrome.storage.local.set({ lastTrashReminder: now });
  }
}