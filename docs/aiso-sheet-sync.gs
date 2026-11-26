/**
 * AISO Hub ⇄ personnel sheet: the workbook's doorbell (#aiso-personnel step 4).
 *
 * Two ways to add it, signed in as the AISO account (an Owner or Director in
 * the Hub):
 *   • Inside the workbook (needed for the menu): Extensions → Apps Script,
 *     replace what is there with this file, Save. Reload the sheet, then
 *     AISO Hub → Turn on sync. If that page says "unable to open the file"
 *     (Google's bug when several Google accounts are signed in), open the
 *     workbook in a browser window signed in to the AISO account only.
 *   • As a standalone project (syncs, but has NO menu: Google lets only a
 *     script inside the workbook add one): script.google.com/u/<n>/home for
 *     the AISO account → New project, paste this file, put the workbook's
 *     address in WORKBOOK below, Save, choose "connect" and Run.
 * Google asks to allow it the first time.
 *
 * AISO Hub → Connect this tab… asks what the open tab is and which concert,
 * and the Hub registers it (the same record as Personnel's "Link the
 * personnel sheet"). Anyone who can open the menu can use it, but the Hub
 * acts only for an Owner or Director. The Hub keeps a locked "Hub" tab in the
 * workbook: each connected tab, its last sync, and the rows to look at.
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
    .addItem('Connect this tab…', 'connectThisTab')
    .addItem('Sync now', 'ring')
    .addSeparator()
    .addItem('Turn on sync (once per workbook)', 'connect')
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

/** The menu: what this tab is and which concert, in a small dialog. */
function connectThisTab() {
  var ui = SpreadsheetApp.getUi();
  var sheetId = SpreadsheetApp.getActiveSheet().getSheetId();
  var got = call_({ action: 'choices', sheetId: sheetId });
  if (!got.ok) { ui.alert(got.message); return; }
  if (!got.concerts.length) { ui.alert('There is no concert on the Hub\'s calendar to connect this tab to.'); return; }
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var options = function (list, pick) {
    return list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === pick ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('');
  };
  var cur = got.current || {};
  // Connect posts to the Hub from the pop-up itself, with this person's own
  // short-lived Google token: google.script.run fails (PERMISSION_DENIED) in
  // any browser with several Google accounts signed in.
  var send = JSON.stringify({ url: HUB, token: ScriptApp.getOAuthToken(), body: { spreadsheetId: book_().getId(), action: 'connect', sheetId: sheetId } }).replace(/</g, '\\u003c');
  var html ='<style>body{font:14px Arial,sans-serif}label{display:block;margin:12px 0 4px}select{width:100%;padding:4px}button{margin:16px 8px 0 0}</style>'
    + '<label for="k">What is this tab?</label><select id="k">' + options(got.kinds, cur.kind) + '</select>'
    + '<label for="c">Which concert?</label><select id="c">' + options(got.concerts, cur.concertId) + '</select>'
    + '<p id="m" role="status"></p><button id="go">Connect</button><button onclick="google.script.host.close()">Close</button>'
    + '<script>var S=' + send + ',m=document.getElementById("m"),b=document.getElementById("go");b.onclick=function(){b.disabled=true;m.textContent="Connecting…";'
    + 'S.body.kind=document.getElementById("k").value;S.body.concertId=document.getElementById("c").value;'
    + 'fetch(S.url,{method:"POST",headers:{Authorization:"Bearer "+S.token,"Content-Type":"application/json"},body:JSON.stringify(S.body)})'
    + '.then(function(r){return r.json();}).then(function(o){if(!o.ok)throw new Error(o.message||"The Hub said no.");m.textContent=o.message;b.style.display="none";})'
    + '.catch(function(e){m.textContent=e instanceof TypeError?"Could not reach the Hub. Try again.":e.message;b.disabled=false;});};</script>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(280), 'Connect “' + got.tab + '” to the Hub');
}

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

/** The doorbell. */
function post_(sheetId, ids) {
  var extra = { ids: ids };
  if (sheetId !== null) extra.sheetId = sheetId;
  var out = call_(extra);
  if (!out.ok) return 'The Hub said: ' + out.message;
  return (out.notes || []).join('\n') || 'No tab of this workbook is linked in the Hub yet.';
}

/** One call to the Hub, as the person running this (their own Google token). */
function call_(extra) {
  var body = { spreadsheetId: book_().getId() };
  for (var k in extra) body[k] = extra[k];
  var res = UrlFetchApp.fetch(HUB, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
  });
  var out = {};
  try { out = JSON.parse(res.getContentText()); } catch (err) { out = {}; }
  if (res.getResponseCode() !== 200) return { ok: false, message: out.message || ('the Hub answered ' + res.getResponseCode()) };
  return out;
}
