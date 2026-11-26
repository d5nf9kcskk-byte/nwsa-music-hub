/**
 * AISO Hub ⇄ personnel sheet: the workbook's doorbell (#aiso-personnel step 4).
 *
 * Two ways to add it, signed in as the AISO account (an Owner or Director in
 * the Hub):
 *   • Inside the workbook: Extensions → Apps Script, replace what is there
 *     with this file, Save. Reload the sheet, then AISO Hub → Connect.
 *   • When that page says "unable to open the file" (Google's bug when
 *     several Google accounts are signed in): script.google.com/u/<n>/home
 *     for the AISO account → New project, paste this file, put the
 *     workbook's address in WORKBOOK below, Save, choose "connect" and Run.
 * Google asks to allow it the first time.
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
/** Blank when this script lives inside the workbook; otherwise the workbook's address. */
var WORKBOOK = '';

function book_() { return WORKBOOK ? SpreadsheetApp.openByUrl(WORKBOOK) : SpreadsheetApp.getActive(); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('AISO Hub')
    .addItem('Connect', 'connect')
    .addItem('Sync now', 'ring')
    .addToUi();
}

/** Installs the three triggers (under the account that runs this) and rings once. */
function connect() {
  var ss = book_();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('edited').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('changed').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('ring').timeBased().everyMinutes(5).create();
  var who = Session.getEffectiveUser().getEmail(); // also asks Google for the email permission the Hub checks
  var answer = post_(null, []);
  var message = 'Connected as ' + who + '.\n\n' + answer;
  try { SpreadsheetApp.getUi().alert(message); } catch (err) { Logger.log(message); }
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
  var body = { spreadsheetId: book_().getId(), ids: ids };
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
