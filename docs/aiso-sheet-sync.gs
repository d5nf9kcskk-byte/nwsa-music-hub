/**
 * AISO Hub ⇄ personnel sheet: the workbook's doorbell (#aiso-personnel step 4).
 *
 * Paste this whole file into the workbook: Extensions → Apps Script, replace
 * what is there, Save. Back in the sheet, reload, then AISO Hub → Connect
 * (once, signed in as the AISO account, which must be an Owner or Director in
 * the Hub). Google asks to allow it the first time.
 *
 * It sends NO cell values. On every edit, paste, row insert or delete it tells
 * the Hub "this workbook changed" (and which Hub ids were on the edited
 * rows); the Hub then reads the sheet itself and syncs both ways. Every five
 * minutes it rings once more, so nothing is missed. Tabs the Hub has not
 * linked (Sheet1) are ignored by the Hub.
 *
 * Source of truth: docs/aiso-sheet-sync.gs in the Hub's repository.
 */
var HUB = 'https://us-central1-aisymphony-hub.cloudfunctions.net/sheetEdited';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('AISO Hub')
    .addItem('Connect', 'connect')
    .addItem('Sync now', 'ring')
    .addToUi();
}

/** Installs the three triggers (under the account that runs this) and rings once. */
function connect() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('edited').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('changed').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('ring').timeBased().everyMinutes(5).create();
  var who = Session.getEffectiveUser().getEmail(); // also asks Google for the email permission the Hub checks
  var answer = post_(null, []);
  SpreadsheetApp.getUi().alert('Connected as ' + who + '.\n\n' + answer);
}

/** An edit or a paste: which tab, and the Hub ids on the edited rows. */
function edited(e) {
  var sheet = e.range.getSheet();
  post_(sheet.getSheetId(), idsIn_(sheet, e.range));
}

/** Rows or columns added or removed, a sort, a new tab: ring for the whole workbook. */
function changed(e) {
  if (e && (e.changeType === 'FORMAT' || e.changeType === 'EDIT')) return; // edits ring through edited()
  post_(null, []);
}

function ring() { return post_(null, []); }

function idsIn_(sheet, range) {
  var top = sheet.getRange(1, 1, Math.min(10, sheet.getMaxRows()), sheet.getLastColumn() || 1).getValues();
  for (var r = 0; r < top.length; r++) {
    for (var c = 0; c < top[r].length; c++) {
      if (String(top[r][c]).trim().toLowerCase() === 'hub id') {
        var rows = Math.min(range.getNumRows(), 500);
        return sheet.getRange(range.getRow(), c + 1, rows, 1).getValues()
          .map(function (x) { return String(x[0]).trim(); })
          .filter(function (x) { return /^[A-Za-z0-9]{10,40}$/.test(x); });
      }
    }
  }
  return [];
}

function post_(sheetId, ids) {
  var body = { spreadsheetId: SpreadsheetApp.getActive().getId(), ids: ids };
  if (sheetId !== null) body.sheetId = sheetId;
  var res = UrlFetchApp.fetch(HUB, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
  });
  var out = {};
  try { out = JSON.parse(res.getContentText()); } catch (err) { out = {}; }
  if (res.getResponseCode() !== 200) return 'The Hub said: ' + (out.message || res.getResponseCode());
  return (out.notes || []).join('\n') || 'No tab of this workbook is linked in the Hub yet.';
}
