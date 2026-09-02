/**
 * 學生名冊讀取與快取（RosterService.js）
 */

function isRosterConfigured_() {
  return !!ROSTER_SPREADSHEET_ID_ && ROSTER_SPREADSHEET_ID_ !== 'YOUR_ROSTER_SPREADSHEET_ID';
}

function getRosterSheet_() {
  const ss = openRosterSpreadsheet_();
  const sheet = ROSTER_SHEET_NAME_ ? ss.getSheetByName(ROSTER_SHEET_NAME_) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到指定的名冊工作表（ROSTER_SHEET_NAME_）。');
  return sheet;
}

function getRosterHeaderIndexMap_(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const k = String(headerRow[i] || '').trim();
    if (!k) continue;
    map[k] = i;
  }
  return map;
}

function getRosterMissingHeaders_(headerIndexMap) {
  const missing = [];
  if (headerIndexMap[ROSTER_HEADERS_.className] == null) missing.push(ROSTER_HEADERS_.className);
  if (headerIndexMap[ROSTER_HEADERS_.studentId] == null) missing.push(ROSTER_HEADERS_.studentId);
  if (headerIndexMap[ROSTER_HEADERS_.name] == null) missing.push(ROSTER_HEADERS_.name);
  return missing;
}

function readRosterValues_() {
  try {
    const sheet = getRosterSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok: true, values: [], headerIndexMap: {} };

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headerIndexMap = getRosterHeaderIndexMap_(values[0] || []);
    const missing = getRosterMissingHeaders_(headerIndexMap);
    if (missing.length) {
      return { ok: false, error: `名冊缺少欄位：${missing.join('、')}（請確認名冊第一列標題）`, values: [], headerIndexMap: {} };
    }
    return { ok: true, values, headerIndexMap };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤'), values: [], headerIndexMap: {} };
  }
}

function normalizeRosterRow_(rowValues, headerIndexMap) {
  const classIdx = headerIndexMap[ROSTER_HEADERS_.className];
  const idIdx = headerIndexMap[ROSTER_HEADERS_.studentId];
  const nameIdx = headerIndexMap[ROSTER_HEADERS_.name];
  const className = classIdx != null ? String(rowValues[classIdx] || '').trim() : '';
  const studentId = idIdx != null ? String(rowValues[idIdx] || '').trim() : '';
  const name = nameIdx != null ? String(rowValues[nameIdx] || '').trim() : '';
  if (!className || !studentId || !name) return null;
  return { className, studentId, name };
}

function compareStudentId_(aId, bId) {
  const a = String(aId || '').trim();
  const b = String(bId || '').trim();
  const aDigits = /^\d+$/.test(a);
  const bDigits = /^\d+$/.test(b);
  if (aDigits && bDigits) {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    // 相同數值或超大數：退回字串排序（保留前導 0 的情況）
  }
  return a.localeCompare(b, 'zh-Hant');
}

function compareRosterStudents_(a, b) {
  const byId = compareStudentId_(a && a.studentId, b && b.studentId);
  if (byId) return byId;
  const an = String((a && a.name) || '').trim();
  const bn = String((b && b.name) || '').trim();
  return an.localeCompare(bn, 'zh-Hant');
}

function getRosterDistinctClasses_() {
  try {
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定試算表 ID（ROSTER_SPREADSHEET_ID_）。', classes: [] };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:classes`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, classes: JSON.parse(cached) };

    const snap = readRosterValues_();
    if (!snap.ok) return { ok: false, error: snap.error, classes: [] };
    const values = snap.values;
    const headerIndexMap = snap.headerIndexMap;
    if (!values.length) return { ok: true, classes: [] };

    const uniq = {};
    for (let r = 1; r < values.length; r++) {
      const rec = normalizeRosterRow_(values[r], headerIndexMap);
      if (!rec) continue;
      uniq[rec.className] = true;
    }

    const classes = Object.keys(uniq);
    classes.sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    cache.put(cacheKey, JSON.stringify(classes), Math.max(60, Number(ROSTER_CACHE_TTL_SECONDS_) || 900));
    return { ok: true, classes };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤'), classes: [] };
  }
}

function getRosterStudentsByClass_(className) {
  try {
    const c = String(className || '').trim();
    if (!c) return { ok: true, students: [] };
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定試算表 ID（ROSTER_SPREADSHEET_ID_）。' };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:class:${c}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, students: JSON.parse(cached) };

    const snap = readRosterValues_();
    if (!snap.ok) return { ok: false, error: snap.error };
    const values = snap.values;
    const headerIndexMap = snap.headerIndexMap;
    if (!values.length) return { ok: true, students: [] };

    const out = [];
    for (let r = 1; r < values.length; r++) {
      const rec = normalizeRosterRow_(values[r], headerIndexMap);
      if (!rec) continue;
      if (rec.className !== c) continue;
      out.push(rec);
      if (out.length >= Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1)) break;
    }

    out.sort((a, b) => compareRosterStudents_(a, b));
    cache.put(cacheKey, JSON.stringify(out), Math.max(60, Number(ROSTER_CACHE_TTL_SECONDS_) || 900));
    return { ok: true, students: out };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

function lookupRosterStudentById_(studentId) {
  try {
    const sid = String(studentId || '').trim();
    if (!sid) return { ok: true, student: null };
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定試算表 ID（ROSTER_SPREADSHEET_ID_）。' };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:studentId:${sid}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, student: JSON.parse(cached) };

    const snap = readRosterValues_();
    if (!snap.ok) return { ok: false, error: snap.error };
    const values = snap.values;
    const headerIndexMap = snap.headerIndexMap;
    if (!values.length) return { ok: true, student: null };

    let found = null;
    for (let r = 1; r < values.length; r++) {
      const rec = normalizeRosterRow_(values[r], headerIndexMap);
      if (!rec) continue;
      if (rec.studentId !== sid) continue;
      found = rec;
      break;
    }

    cache.put(cacheKey, JSON.stringify(found), Math.max(60, Number(ROSTER_CACHE_TTL_SECONDS_) || 900));
    return { ok: true, student: found };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

/** 學生下拉 value：班別 + 學號，避免跨班重複學號時誤匹配到名冊第一筆 */
function rosterDropdownValueFor_(className, studentId) {
  return `${String(className || '').trim()}::${String(studentId || '').trim()}`;
}

function parseRosterStudentDropdownValue_(raw) {
  const s = String(raw || '').trim();
  const i = s.indexOf('::');
  if (i === -1) return { className: '', studentId: s };
  return { className: s.slice(0, i).trim(), studentId: s.slice(i + 2).trim() };
}

function rosterStudentKeyMatchesRow_(rawKey, selectedClassName, studentId) {
  const k = String(rawKey || '').trim();
  const sid = String(studentId || '').trim();
  const cls = String(selectedClassName || '').trim();
  if (!k || !sid) return false;
  if (k === rosterDropdownValueFor_(cls, sid)) return true;
  // 舊版卡片僅存學號：仍接受，但僅在與目前班別清單比對時有效
  return k.indexOf('::') === -1 && k === sid;
}

function lookupRosterStudentByClassAndId_(className, studentId) {
  try {
    const c = String(className || '').trim();
    const sid = String(studentId || '').trim();
    if (!sid) return { ok: true, student: null };
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定試算表 ID（ROSTER_SPREADSHEET_ID_）。' };
    if (!c) return lookupRosterStudentById_(sid);

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:classStudent:${c}:${sid}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, student: JSON.parse(cached) };

    const snap = readRosterValues_();
    if (!snap.ok) return { ok: false, error: snap.error };
    const values = snap.values;
    const headerIndexMap = snap.headerIndexMap;
    if (!values.length) return { ok: true, student: null };

    let found = null;
    for (let r = 1; r < values.length; r++) {
      const rec = normalizeRosterRow_(values[r], headerIndexMap);
      if (!rec) continue;
      if (rec.studentId !== sid) continue;
      if (rec.className !== c) continue;
      found = rec;
      break;
    }

    cache.put(cacheKey, JSON.stringify(found), Math.max(60, Number(ROSTER_CACHE_TTL_SECONDS_) || 900));
    return { ok: true, student: found };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}
