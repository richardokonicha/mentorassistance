#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const background = fs.readFileSync('background.ts', 'utf8');
const content = fs.readFileSync('content.ts', 'utf8');

assert(manifest.permissions.includes('notifications'));
assert(manifest.permissions.includes('tabs'));
assert(manifest.host_permissions.includes('https://www.codementor.io/'));
assert.match(background, /clientResponseDetected/);
assert.match(background, /chrome\.notifications\.create/);
assert.match(background, /chrome\.notifications\.onClicked/);
assert.match(background, /chrome\.storage\.local/);
assert.match(content, /MutationObserver/);
assert.match(content, /clientResponseDetected/);
assert.match(content, /startCodeMentorResponseMonitor/);
assert.match(content, /stopCodeMentorResponseMonitor/);
assert.match(content, /codeMentorResponseBaselineReady/);
assert.match(content, /childList: true, subtree: true/);
assert.match(content, /stopCodeMentorResponseMonitor\(\)/);
assert.match(background, /conversationUrl/);
assert.match(background, /messageKey/);
assert.match(background, /preview/);
assert.match(background, /MAX_ALERT_HISTORY/);
assert.match(background, /notificationUrls/);
assert.match(background, /chrome\.tabs\.query/);
assert.match(background, /chrome\.tabs\.create/);
console.log('CodeMentor alert contract passed');
