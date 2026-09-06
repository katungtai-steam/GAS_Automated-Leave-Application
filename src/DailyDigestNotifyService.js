/**
 * 上學天每日摘要通知（DailyDigestNotifyService.js）
 * 未列印事假 + 待跟進黃紙 → Google Chat
 */

function formatDigestDateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Hong_Kong', 'yyyy-MM-dd');
}

function formatDigestDisplayDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Hong_Kong', 'yyyy/MM/dd（E）');
}

/** 上學天：週一至週五，且非公眾假期／額外非上學日 */
function isSchoolDay_(date) {
  const d = date instanceof Date ? date : new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  if (day === 0 || day === 6) return false;
  const key = formatDigestDateKey_(d);
  const holidays = HK_PUBLIC_HOLIDAYS_ || [];
  for (let i = 0; i < holidays.length; i++) {
    if (key === String(holidays[i]).trim()) return false;
  }
  const extras = SCHOOL_EXTRA_NON_SCHOOL_DAYS_ || [];
  for (let j = 0; j < extras.length; j++) {
    if (key === String(extras[j]).trim()) return false;
  }
  return true;
}

function rememberDailyDigestChatSpace_(spaceName, options) {
  const name = String(spaceName || '').trim();
  if (!name || name.indexOf('spaces/') !== 0) return false;
  const force = !!(options && options.force);
  if (!force) {
    const existing = String(PropertiesService.getScriptProperties().getProperty(DAILY_DIGEST_CHAT_SPACE_PROP_) || '').trim();
    if (existing) return false;
  }
  PropertiesService.getScriptProperties().setProperty(DAILY_DIGEST_CHAT_SPACE_PROP_, name);
  return true;
}

function getDailyDigestChatSpaceName_() {
  const configured = String(DAILY_DIGEST_CHAT_SPACE_NAME_ || '').trim();
  if (configured) return configured;
  return String(PropertiesService.getScriptProperties().getProperty(DAILY_DIGEST_CHAT_SPACE_PROP_) || '').trim();
}

function getDailyDigestWebhookUrl_() {
  const configured = String(DAILY_DIGEST_CHAT_WEBHOOK_URL_ || '').trim();
  if (configured) return configured;
  return String(PropertiesService.getScriptProperties().getProperty(DAILY_DIGEST_CHAT_WEBHOOK_PROP_) || '').trim();
}

/** 從 Chat 事件記住空間（尚未設定時才寫入；force 則覆寫） */
function maybeRememberDigestSpaceFromEvent_(event, options) {
  const ev = event || {};
  const spaceId = (ev.space && ev.space.name) || '';
  return rememberDailyDigestChatSpace_(spaceId, options);
}

/**
 * 在目標 Chat 空間對 Bot 說「設定每日提醒」即可寫入空間 ID。
 * 編輯器亦可執行 showDailyDigestChatSpace() 查看目前設定。
 */
function handleSetDailyDigestSpaceCommand_(event) {
  const ev = event || {};
  const spaceId = (ev.space && ev.space.name) || '';
  const display = (ev.space && (ev.space.displayName || ev.space.name)) || spaceId || '此對話';
  if (!spaceId || spaceId.indexOf('spaces/') !== 0) {
    return {
      text: '無法取得此對話的空間 ID。請在 Google Chat 空間內直接傳訊給 Bot 後再說一次「設定每日提醒」。',
    };
  }
  rememberDailyDigestChatSpace_(spaceId, { force: true });
  return {
    text:
      '已設定上學天每日提醒目標空間：\n' +
      '- 名稱：' +
      display +
      '\n- ID：' +
      spaceId +
      '\n\n請回 Apps Script 執行 testDailySchoolDayDigest() 測試發送。',
  };
}

/** 編輯器：查看目前通知目標 */
function showDailyDigestChatSpace() {
  const configured = String(DAILY_DIGEST_CHAT_SPACE_NAME_ || '').trim();
  const saved = String(PropertiesService.getScriptProperties().getProperty(DAILY_DIGEST_CHAT_SPACE_PROP_) || '').trim();
  const webhookCfg = String(DAILY_DIGEST_CHAT_WEBHOOK_URL_ || '').trim();
  const webhookSaved = String(PropertiesService.getScriptProperties().getProperty(DAILY_DIGEST_CHAT_WEBHOOK_PROP_) || '').trim();
  const effectiveSpace = getDailyDigestChatSpaceName_();
  const effectiveWebhook = getDailyDigestWebhookUrl_();
  const msg =
    'Webhook Config = ' +
    (webhookCfg ? '(已填，長度 ' + webhookCfg.length + ')' : '(空)') +
    '\nWebhook Property = ' +
    (webhookSaved ? '(已填，長度 ' + webhookSaved.length + ')' : '(空)') +
    '\n實際 Webhook = ' +
    (effectiveWebhook ? '(已設定)' : '(尚未設定)') +
    '\n\nConfig DAILY_DIGEST_CHAT_SPACE_NAME_ = ' +
    (configured || '(空)') +
    '\nScript Property Space = ' +
    (saved || '(空)') +
    '\n實際 Space = ' +
    (effectiveSpace || '(尚未設定)') +
    '\n\n建議：執行 setDailyDigestChatWebhook()（把函式內 URL 貼上後執行），' +
    '或執行 listMyChatSpacesForDigest() 後再用 setDailyDigestChatSpace()。';
  Logger.log(msg);
  return msg;
}

/**
 * 【建議／最簡單】編輯器設定 Incoming Webhook：
 * 1. Google Chat 空間 → 空間名稱旁箭頭 → Apps 與整合 → Webhooks → 新增
 * 2. 複製 URL，貼到下方 WEBHOOK_URL
 * 3. 執行此函式
 */
function setDailyDigestChatWebhook() {
  // ↓↓↓ 把 Webhook URL 貼在引號內 ↓↓↓
  const WEBHOOK_URL = '';
  // ↑↑↑ 例如 https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...

  const url = String(WEBHOOK_URL || '').trim();
  if (!url || url.indexOf('https://') !== 0) {
    const msg =
      '請先編輯 setDailyDigestChatWebhook()：把 WEBHOOK_URL 改成 Chat 空間的 Incoming Webhook 完整網址，存檔後再執行。';
    Logger.log(msg);
    return msg;
  }
  PropertiesService.getScriptProperties().setProperty(DAILY_DIGEST_CHAT_WEBHOOK_PROP_, url);
  const msg = '已儲存 Webhook。請執行 testDailySchoolDayDigest() 測試。';
  Logger.log(msg);
  return msg;
}

/**
 * 編輯器手動設定空間 ID（備援）：
 * 1. 先執行 listMyChatSpacesForDigest()
 * 2. 複製 spaces/xxxxx
 * 3. 貼到下方 SPACE_ID 後執行此函式
 */
function setDailyDigestChatSpace() {
  // ↓↓↓ 把空間 ID 貼在引號內 ↓↓↓
  const SPACE_ID = '';
  // ↑↑↑ 例如 spaces/AAAA...

  const name = String(SPACE_ID || '').trim();
  if (!name || name.indexOf('spaces/') !== 0) {
    const msg =
      '請先編輯 setDailyDigestChatSpace()：把 SPACE_ID 改成 spaces/...（可先執行 listMyChatSpacesForDigest），存檔後再執行。';
    Logger.log(msg);
    return msg;
  }
  rememberDailyDigestChatSpace_(name, { force: true });
  const msg = '已儲存空間：' + name + '\n請執行 testDailySchoolDayDigest() 測試。';
  Logger.log(msg);
  return msg;
}

/**
 * 編輯器：列出你可存取的 Chat 空間（需授權 chat.spaces.readonly）。
 * 找到目標後，執行 setDailyDigestChatSpace() 貼上 spaces/...；或改用 webhook。
 */
function listMyChatSpacesForDigest() {
  const url = 'https://chat.googleapis.com/v1/spaces?pageSize=100';
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const raw = resp.getContentText() || '';
  if (code < 200 || code >= 300) {
    const err =
      '列出空間失敗 HTTP ' +
      code +
      '：' +
      raw.slice(0, 400) +
      '\n\n可改用更簡單做法：執行 setDailyDigestChatWebhook()（Chat 空間 → Apps 與整合 → Webhooks）。';
    Logger.log(err);
    return err;
  }
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return '無法解析空間清單。';
  }
  const spaces = data.spaces || [];
  const lines = ['共 ' + spaces.length + ' 個空間：'];
  for (let i = 0; i < spaces.length; i++) {
    const s = spaces[i] || {};
    lines.push(
      i +
        1 +
        '. ' +
        (s.displayName || '(無名稱)') +
        '｜' +
        (s.name || '') +
        '｜type=' +
        (s.spaceType || s.type || '')
    );
  }
  lines.push('');
  lines.push('下一步：把 spaces/... 貼進 setDailyDigestChatSpace() 的 SPACE_ID 後執行；或改用 setDailyDigestChatWebhook()。');
  const msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * 以 Webhook 或 Chat API 主動發送訊息
 */
function sendGoogleChatTextMessage_(spaceName, text) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: '訊息內容空白。' };

  const webhook = getDailyDigestWebhookUrl_();
  if (webhook) {
    const resp = UrlFetchApp.fetch(webhook, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify({ text: body }),
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    const raw = resp.getContentText() || '';
    if (code < 200 || code >= 300) {
      return { ok: false, error: 'Webhook HTTP ' + code + '：' + raw.slice(0, 400) };
    }
    return { ok: true, via: 'webhook', response: raw };
  }

  const space = String(spaceName || getDailyDigestChatSpaceName_() || '').trim();
  if (!space) {
    return {
      ok: false,
      error:
        '未設定通知目標。請擇一：\n' +
        '1) 執行 setDailyDigestChatWebhook()（建議）\n' +
        '2) 執行 listMyChatSpacesForDigest() + setDailyDigestChatSpace()\n' +
        '3) Chat 空間對 Bot 說「設定每日提醒」（需重新部署 Chat App）',
    };
  }

  const url = 'https://chat.googleapis.com/v1/' + space + '/messages';
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ text: body }),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  const raw = resp.getContentText() || '';
  if (code < 200 || code >= 300) {
    return { ok: false, error: 'Chat API HTTP ' + code + '：' + raw.slice(0, 400) };
  }
  return { ok: true, via: 'chat_api', response: raw };
}

function buildUnprintedLeaveDigestSection_(leaveResult) {
  const lines = [];
  lines.push('【事假申請｜未列印】');
  if (!leaveResult || !leaveResult.ok) {
    lines.push('- 讀取失敗：' + ((leaveResult && leaveResult.error) || '未知錯誤'));
    return lines.join('\n');
  }
  const total = Number(leaveResult.totalMatched) || 0;
  if (!total) {
    lines.push('- 目前沒有未列印的事假申請。');
    return lines.join('\n');
  }

  lines.push('- 共 ' + total + ' 筆需列印／處理：');
  const records = leaveResult.records || [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const who = [r.className, r.studentId, r.name].filter(Boolean).join(' ');
    const bits = [];
    bits.push(who || '（學生未填）');
    bits.push('事假日期：' + (r.leaveDateText || '（未填）'));
    if (r.leaveType) bits.push(r.leaveType);
    if (r.reason) bits.push('原因：' + r.reason);
    if (r.documentStatus) bits.push('文件：' + r.documentStatus);
    lines.push((i + 1) + '. ' + bits.join('｜'));
  }
  if (leaveResult.truncated) {
    lines.push('…尚有 ' + (total - records.length) + ' 筆未列出（請開試算表查看）。');
  }
  return lines.join('\n');
}

function buildPendingYellowSlipDigestSection_(yellowResult) {
  const lines = [];
  lines.push('【黃紙紀錄｜待跟進】');
  if (!yellowResult || !yellowResult.ok) {
    lines.push('- 讀取失敗：' + ((yellowResult && yellowResult.error) || '未知錯誤'));
    return lines.join('\n');
  }
  const total = Number(yellowResult.totalMatched) || 0;
  if (!total) {
    lines.push('- 目前沒有待跟進的黃紙紀錄。');
    return lines.join('\n');
  }

  let pendingClassTeacher = 0;
  let pendingGrade = 0;
  let pendingMaster = 0;
  const records = yellowResult.records || [];
  for (let i = 0; i < records.length; i++) {
    const roles = describeYellowSlipPendingRoles_(records[i]);
    if (roles.indexOf('班主任') !== -1) pendingClassTeacher++;
    if (roles.indexOf('級訓導') !== -1) pendingGrade++;
    if (roles.indexOf('訓導主任') !== -1) pendingMaster++;
  }

  lines.push(
    '- 共 ' +
      total +
      ' 筆待跟進（本摘要列 ' +
      records.length +
      ' 筆）｜待班主任 ' +
      pendingClassTeacher +
      '／待級訓導 ' +
      pendingGrade +
      '／待訓導主任 ' +
      pendingMaster
  );

  for (let j = 0; j < records.length; j++) {
    const r = records[j];
    const pendingRoles = describeYellowSlipPendingRoles_(r);
    const who = [r.className, r.classNo, r.name].filter(Boolean).join(' ');
    const bits = [];
    bits.push(who || '（學生未填）');
    if (r.dateTime) bits.push('時間：' + r.dateTime);
    if (r.itemTaken) bits.push('項目：' + r.itemTaken);
    if (r.by) bits.push('登記：' + r.by);
    bits.push('未處理：' + (pendingRoles.length ? pendingRoles.join('、') : '（無）'));
    const statusBits = [];
    statusBits.push('班主任=' + (r.classTeacher || '空白'));
    statusBits.push('級訓導=' + (r.gradeDiscipline || '空白'));
    statusBits.push('訓導主任=' + (r.disciplineMaster || '空白'));
    bits.push('現況：' + statusBits.join('；'));
    lines.push(j + 1 + '. ' + bits.join('｜'));
  }
  if (yellowResult.truncated) {
    lines.push('…尚有 ' + (total - records.length) + ' 筆未列出（請開黃紙試算表查看）。');
  }
  return lines.join('\n');
}

function buildDailySchoolDayDigestText_(options) {
  const now = (options && options.now) || new Date();
  const leaveResult = listUnprintedLeaveRecords_({ maxList: DAILY_DIGEST_MAX_LEAVE_ITEMS_ });
  const yellowResult = listYellowSlipRecords_({
    filterMode: YELLOW_SLIP_FILTER_PENDING_ANY_,
    maxList: DAILY_DIGEST_MAX_YELLOW_ITEMS_,
  });

  const parts = [];
  parts.push('上學天每日提醒｜' + formatDigestDisplayDate_(now));
  parts.push('');
  parts.push(buildUnprintedLeaveDigestSection_(leaveResult));
  parts.push('');
  parts.push(buildPendingYellowSlipDigestSection_(yellowResult));

  const leaveCount = leaveResult && leaveResult.ok ? Number(leaveResult.totalMatched) || 0 : -1;
  const yellowCount = yellowResult && yellowResult.ok ? Number(yellowResult.totalMatched) || 0 : -1;
  if (leaveCount === 0 && yellowCount === 0) {
    parts.push('');
    parts.push('今日無需特別處理的待辦（未列印事假／待跟進黃紙皆為 0）。');
  }

  return {
    text: parts.join('\n'),
    leaveCount: leaveCount,
    yellowCount: yellowCount,
    leaveResult: leaveResult,
    yellowResult: yellowResult,
  };
}

/**
 * 時間觸發器入口：僅上學天發送。
 * 請先在編輯器執行 setupDailySchoolDayDigestTrigger() 一次。
 */
function runDailySchoolDayDigest() {
  if (!DAILY_DIGEST_ENABLED_) {
    console.info('Daily digest skipped: disabled');
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  const now = new Date();
  if (!isSchoolDay_(now)) {
    console.info('Daily digest skipped: not a school day', formatDigestDateKey_(now));
    return { ok: true, skipped: true, reason: 'not_school_day' };
  }
  return sendDailySchoolDayDigestNow_({ now: now });
}

/** 立即發送（略過上學天檢查；方便手動測試） */
function testDailySchoolDayDigest() {
  return sendDailySchoolDayDigestNow_({ now: new Date() });
}

function sendDailySchoolDayDigestNow_(options) {
  try {
    const space = getDailyDigestChatSpaceName_();
    const built = buildDailySchoolDayDigestText_(options || {});
    const send = sendGoogleChatTextMessage_(space, built.text);
    if (!send.ok) {
      console.error('Daily digest send failed', send.error);
      return { ok: false, error: send.error, space: space };
    }
    console.info('Daily digest sent', {
      space: space,
      leaveCount: built.leaveCount,
      yellowCount: built.yellowCount,
    });
    return {
      ok: true,
      space: space,
      leaveCount: built.leaveCount,
      yellowCount: built.yellowCount,
    };
  } catch (e) {
    const msg = String((e && e.message) || e || '未知錯誤');
    console.error('Daily digest error', msg);
    return { ok: false, error: msg };
  }
}

/** 建立／重建每天定時觸發（Asia/Hong_Kong） */
function setupDailySchoolDayDigestTrigger() {
  const handler = 'runDailySchoolDayDigest';
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    if (t.getHandlerFunction() === handler || t.getHandlerFunction() === 'runDailySchoolDayDigest_') {
      ScriptApp.deleteTrigger(t);
    }
  }
  const hour = Math.max(0, Math.min(23, Number(DAILY_DIGEST_HOUR_) || 8));
  ScriptApp.newTrigger(handler)
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone() || 'Asia/Hong_Kong')
    .create();
  return {
    ok: true,
    handler: handler,
    hour: hour,
    space: getDailyDigestChatSpaceName_() || '(尚未記住空間：請把 Bot 加進目標 Chat 空間)',
  };
}
