/**
 * 表單解析與 Chat 事件工具（FormUtils）
 */

function getChatBotUserKey_(event) {
  const space = (event && event.space && event.space.name) || 'unknown_space';
  const user = (event && event.user && event.user.name) || 'unknown_user';
  return `${space}::${user}`;
}

function getDateValueMsFromInputs_(formInputs, name) {
  try {
    const item = formInputs && formInputs[name];
    if (!item) return null;
    let unwrapped = item;
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      const k = Object.keys(unwrapped);
      if (k.length === 1 && k[0] === '' && unwrapped[''] != null) {
        unwrapped = unwrapped[''];
      }
    }
    const c = (unwrapped.dateInput || unwrapped.dateTimeInput || unwrapped) || {};
    if (c.msSinceEpoch != null) {
      const ms = Number(c.msSinceEpoch);
      return ms > 0 ? ms : null;
    }
    if (c.year != null && c.month != null && c.day != null) {
      const d = new Date(Number(c.year), Number(c.month) - 1, Number(c.day));
      const ms = d.getTime();
      return isNaN(ms) || ms <= 0 ? null : ms;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/** 腳本時區「今天」0:00 的毫秒時間戳（Chat dateTimePicker 預設） */
function getTodayDateMsEpoch_() {
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return Utilities.parseDate(dateStr, tz, 'yyyy-MM-dd').getTime();
}

/** 從表單讀取日期；未填或無效時預設今天 */
function resolveFormDateMsDefaultToday_(formInputs, name) {
  const ms = getDateValueMsFromInputs_(formInputs, name);
  if (ms != null && ms > 0) return ms;
  return getTodayDateMsEpoch_();
}

function getGmailUsernameFromEvent_(event) {
  try {
    const user = (event && event.user) || {};
    const email = String(user.email || user.emailAddress || '').trim();
    if (email && email.includes('@')) return email.split('@')[0];
    const displayName = String(user.displayName || '').trim();
    return displayName || '未知';
  } catch (e) {
    return '未知';
  }
}

function getFormValue_(formInputs, name) {
  try {
    const item = formInputs && formInputs[name];
    if (!item) return '';
    let unwrapped = item;
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      const k = Object.keys(unwrapped);
      if (k.length === 1 && k[0] === '' && unwrapped[''] != null) {
        unwrapped = unwrapped[''];
      }
    }

    const candidates = [];
    if (unwrapped.stringInputs) candidates.push(unwrapped.stringInputs);
    if (unwrapped.stringInput) candidates.push(unwrapped.stringInput);
    if (unwrapped.dateInput) candidates.push(unwrapped.dateInput);
    if (unwrapped.timeInput) candidates.push(unwrapped.timeInput);
    if (unwrapped.dateTimeInput) candidates.push(unwrapped.dateTimeInput);
    candidates.push(unwrapped);

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      if (c.msSinceEpoch != null) {
        const ms = Number(c.msSinceEpoch);
        if (ms > 0) {
          const d = new Date(ms);
          if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
        }
      }
      if (c.year != null && c.month != null && c.day != null) {
        const d = new Date(Number(c.year), Number(c.month) - 1, Number(c.day));
        if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
      }
      if (c.hours != null || c.minutes != null) {
        const hh = String(Number(c.hours || 0)).padStart(2, '0');
        const mm = String(Number(c.minutes || 0)).padStart(2, '0');
        return `${hh}:${mm}`;
      }

      const v = c.value != null ? c.value : c.values != null ? c.values : null;
      if (v == null) continue;

      if (Array.isArray(v)) {
        if (typeof v[0] === 'string' || typeof v[0] === 'number') return String(v[0]).trim();
        if (v.length) return String(v[0] && (v[0].value || v[0].text || '')).trim();
        continue;
      }

      if (typeof v === 'string' || typeof v === 'number') return String(v).trim();

      if (typeof v === 'object') {
        const vv = v.value || v.text || v.stringValue;
        if (vv != null) return String(vv).trim();
      }
    }

    return '';
  } catch (e) {
    return '';
  }
}

function getFormInputsFromEvent_(event) {
  const fromCommon = (event && event.common && event.common.formInputs) || null;
  if (fromCommon && Object.keys(fromCommon).length) return fromCommon;

  const fromAction = (event && event.action && event.action.formInputs) || null;
  if (fromAction && Object.keys(fromAction).length) return fromAction;

  return fromCommon || fromAction || {};
}

function hasMeaningfulFormInputs_(event) {
  try {
    const inputs = getFormInputsFromEvent_(event);
    const keys = Object.keys(inputs || {});
    if (!keys.length) return false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = getFormValue_(inputs, k);
      if (String(v || '').trim()) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
