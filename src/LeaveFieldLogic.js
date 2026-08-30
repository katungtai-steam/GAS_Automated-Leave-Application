/**
 * 請假欄位計算與時段換算（LeaveFieldLogic.js）
 */

/** 事假日期字串 yyyy/MM/dd → 當日 0:00 時間戳（比較區間用） */
function parseSheetDateStringMs_(s) {
  const m = String(s || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return NaN;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getTime();
}

function normalizeLeaveCategoryValue_(v) {
  let c = String(v == null ? '' : v).trim() || 'day_slots';
  if (c !== 'day_slots' && c !== 'half_full_day' && c !== 'full_day_range') c = 'day_slots';
  return c;
}

/** 寫入試算表「請假類型」欄的簡短文字（便於篩選、閱讀） */
function leaveTypeDisplayForSheet_(cat, halfKey) {
  const c = normalizeLeaveCategoryValue_(cat);
  if (c === 'day_slots') return '一天時段';
  if (c === 'full_day_range') return '全日區間';
  const hk = String(halfKey || 'am').trim();
  const sub = HALF_FULL_DAY_SUBOPTIONS_.find((o) => o.value === hk);
  return sub ? sub.text : HALF_FULL_DAY_SUBOPTIONS_[0].text;
}

/** 將 formatTimeslotRangeToClock_ 等產生的「HH:mm-HH:mm」拆成兩欄 */
function splitClockRangeForSheet_(clockRangeStr) {
  const raw = String(clockRangeStr || '').trim();
  const m = raw.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (m) return { timeStart: m[1], timeEnd: m[2] };
  if (raw) return { timeStart: raw, timeEnd: '' };
  return { timeStart: '', timeEnd: '' };
}

/**
 * 依請假類型計算寫入試算表之分欄（請假類型、事假日期起訖、請假時間起訖、離校時間）。
 * 另附 leaveTimeForSheet／leaveDateCell 供除錯與聊天摘要。
 */
function buildSheetLeaveFields_(data) {
  const cat = normalizeLeaveCategoryValue_(data && data.leaveCategory);
  const leaveDate = String(data.leaveDate || '').trim();
  const leaveDateEnd = String(data.leaveDateEnd || '').trim();
  const halfKey = String(data.halfFullChoice || 'am').trim();
  const typeLabel = leaveTypeDisplayForSheet_(cat, halfKey);

  if (cat === 'day_slots') {
    const rangeStr = formatTimeslotRangeToClock_(data.leaveStart, data.leaveEnd);
    const pair = splitClockRangeForSheet_(rangeStr);
    return {
      leaveTypeLabel: typeLabel,
      dateStart: leaveDate,
      dateEnd: leaveDate,
      timeStart: pair.timeStart,
      timeEnd: pair.timeEnd,
      exitTimeText: getTimeslotStartTime_(data.leaveStart),
      leaveTimeForSheet: rangeStr,
      leaveDateCell: leaveDate,
    };
  }
  if (cat === 'half_full_day') {
    const h = HALF_FULL_DAY_CLOCK_[halfKey] || HALF_FULL_DAY_CLOCK_.am;
    const tag = (HALF_FULL_DAY_SUBOPTIONS_.find((o) => o.value === halfKey) || HALF_FULL_DAY_SUBOPTIONS_[0]).text;
    const rangeStr = `${h.start}-${h.end}`;
    return {
      leaveTypeLabel: typeLabel,
      dateStart: leaveDate,
      dateEnd: leaveDate,
      timeStart: h.start,
      timeEnd: h.end,
      exitTimeText: h.start,
      leaveTimeForSheet: `${tag} ${rangeStr}`,
      leaveDateCell: leaveDate,
    };
  }
  const dateEndCell = leaveDateEnd || leaveDate;
  const rangeText = !leaveDateEnd || leaveDate === leaveDateEnd ? leaveDate : `${leaveDate}～${leaveDateEnd}`;
  return {
    leaveTypeLabel: typeLabel,
    dateStart: leaveDate,
    dateEnd: dateEndCell,
    timeStart: '全天',
    timeEnd: '',
    exitTimeText: '',
    leaveTimeForSheet: `全天（${rangeText}）`,
    leaveDateCell: !leaveDateEnd || leaveDate === leaveDateEnd ? leaveDate : `${leaveDate}～${leaveDateEnd}`,
  };
}

function getTimeslotEndTime_(slotValue) {
  const v = String(slotValue || '').trim();
  if (!v) return '';
  for (let i = 0; i < SCHOOL_TIMESLOT_OPTIONS_.length; i++) {
    const o = SCHOOL_TIMESLOT_OPTIONS_[i];
    if (String(o.value) !== v) continue;
    if (o.endTime) return String(o.endTime);
    const m = String(o.text || '').match(/[（(](\d{1,2}:\d{2})-(\d{1,2}:\d{2})[）)]/);
    return m ? m[2] : '';
  }
  return '';
}

function getTimeslotStartTime_(slotValue) {
  const v = String(slotValue || '').trim();
  if (!v) return '';
  for (let i = 0; i < SCHOOL_TIMESLOT_OPTIONS_.length; i++) {
    const o = SCHOOL_TIMESLOT_OPTIONS_[i];
    if (String(o.value) !== v) continue;
    if (o.startTime) return String(o.startTime);
    const m = String(o.text || '').match(/[（(](\d{1,2}:\d{2})-(\d{1,2}:\d{2})[）)]/);
    return m ? m[1] : '';
  }
  return '';
}

function formatTimeslotRangeToClock_(startValue, endValue) {
  const s = String(startValue || '').trim();
  const e = String(endValue || '').trim();
  if (!s || !e) return [s, e].filter(Boolean).join(' - ');
  const sn = Number(s);
  const en = Number(e);
  if (!Number.isFinite(sn) || !Number.isFinite(en)) {
    const st = getTimeslotStartTime_(s);
    const et = getTimeslotEndTime_(e);
    return [st, et].filter(Boolean).join('-');
  }
  const a = String(Math.min(sn, en));
  const b = String(Math.max(sn, en));
  const st = getTimeslotStartTime_(a);
  const et = getTimeslotEndTime_(b);
  return [st, et].filter(Boolean).join('-');
}
