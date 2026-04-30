/**
 * Google Chat Bot：學生事假申請（卡片表單）
 *
 * 使用方式：
 * - 在聊天室輸入任意文字（或輸入「請假」）即可開啟表單
 * - 填完按「送出」寫入 Google Sheet
 */

// TODO: 改成你的 Google Sheet ID（試算表網址中 /d/<ID>/ 的那段）
const LEAVE_SHEET_ID_ = '1W2lQmEH9395IpywwjHaRMJ2ft625vR28EkbbnlXNmC4';
const LEAVE_SHEET_NAME_ = ''; // 留空代表用第一個工作表；也可填入指定工作表名稱
const LEAVE_SHEET_HEADERS_ = [
  '申請時間',
  '班別',
  '學號',
  '姓名',
  '事假日期',
  '請假時間',
  '離校時間',
  '原因',
  '文件情況',
  '批核者',
];

// 學生名冊（另一個 Spreadsheet）：用於「老師代學生提交」時快速選取學生並自動帶入資料
// TODO: 請填入你的「學生名冊」Google Sheet ID（試算表網址中 /d/<ID>/ 的那段）
const ROSTER_SHEET_ID_ = '10cr-KU2hHBol9Tn430qzph0KG5K2KqJVqLbGeuHF7pM';
const ROSTER_SHEET_NAME_ = 'StudentList'; // 留空代表用第一個工作表；也可填入指定工作表名稱
// 名冊欄位名稱（名冊第一列的標題）
const ROSTER_HEADERS_ = {
  className: 'Class',
  studentId: 'No.',
  name: 'Chinese Name',
};
// 若同一班別學生較多，請把這個數字調小避免卡片過大（超過上限時下拉會停用，需調高或拆分名冊）
const ROSTER_MAX_STUDENTS_PER_CLASS_ = 35;
const ROSTER_CACHE_TTL_SECONDS_ = 15 * 60; // 15 分鐘
// 名冊快取 key 版本：當排序/解析邏輯變更時請遞增，避免舊快取造成「看起來沒更新」
const ROSTER_CACHE_VERSION_ = 3;

// 固定/常用選項（可依學校實際情況修改）
const CLASS_OPTIONS_ = buildClassOptions_(6, ['A', 'B', 'C', 'D']); // 1A ~ 6D（6級、每級4班）
const LEAVE_TYPE_OPTIONS_ = ['全日', '時段'];
const REASON_OPTIONS_ = ['病假', '家事', '覆診/醫療', '比賽/活動', '面試', '其他'];
const DOCUMENT_STATUS_HAS_FILE_ = '有相關文件';
const DOCUMENT_STATUS_NEED_SUBMIT_ = '需補交';
// 上學時段（可依學校鐘聲表調整）
const SCHOOL_TIMESLOT_OPTIONS_ = [
  { text: '第1節（08:10-08:50）', value: '1', startTime: '08:10', endTime: '08:50' },
  { text: '第2節（09:00-09:40）', value: '2', startTime: '09:00', endTime: '09:40' },
  { text: '第3節（09:50-10:30）', value: '3', startTime: '09:50', endTime: '10:30' },
  { text: '第4節（10:40-11:20）', value: '4', startTime: '10:40', endTime: '11:20' },
  { text: '第5節（11:30-12:10）', value: '5', startTime: '11:30', endTime: '12:10' },
  { text: '第6節（13:20-14:00）', value: '6', startTime: '13:20', endTime: '14:00' },
  { text: '第7節（14:10-14:50）', value: '7', startTime: '14:10', endTime: '14:50' },
  { text: '第8節（15:00-15:40）', value: '8', startTime: '15:00', endTime: '15:40' },
];

function buildClassOptions_(gradeCount, classLetters) {
  const grades = Math.max(1, Number(gradeCount) || 1);
  const letters = Array.isArray(classLetters) && classLetters.length ? classLetters : ['A', 'B', 'C', 'D'];
  const out = [];
  for (let g = 1; g <= grades; g++) {
    for (let i = 0; i < letters.length; i++) out.push(`${g}${letters[i]}`.trim());
  }
  return out;
}

function onMessage(event) {
  try {
    // 若使用者上傳/拍照圖片附件：自動把最新一筆申請的「文件情況」改為「有相關文件」
    if (hasImageAttachment_(event)) return handleDocumentAttachment_(event);

    const text = String((event && event.message && event.message.text) || '').trim();
    if (!text) return { text: '我目前只處理文字訊息。' };
    return buildLeaveFormCard_();
  } catch (err) {
    return { text: '處理時發生錯誤，請稍後再試。' };
  }
}

/**
 * Google Chat 卡片表單提交事件入口。
 * 使用 buildLeaveFormCard_() 的 invokedFunction 進入。
 */
function onCardClick(event) {
  try {
    // cardsV2 主要用 common.invokedFunction，但部分 onChangeAction 事件仍可能用舊欄位 action.actionMethodName
    const invoked =
      (event && event.common && event.common.invokedFunction) ||
      (event && event.action && (event.action.actionMethodName || event.action.actionMethod)) ||
      '';
    if (invoked === 'submitLeaveForm') return handleSubmitLeaveForm_(event);
    if (invoked === 'openLeaveForm') return buildLeaveFormCard_();

    // onChangeAction / 部分互動事件：用 UPDATE_MESSAGE 更新同一則卡片，避免「重新彈出」新訊息
    // 注意：submit 事件也可能帶 formInputs，但必須回傳文字回覆而不是 UPDATE_MESSAGE
    if (invoked === 'refreshLeaveForm') return buildUpdateMessageResponse_(buildLeaveFormCard_(event));
    if (hasMeaningfulFormInputs_(event)) return buildUpdateMessageResponse_(buildLeaveFormCard_(event));

    return buildLeaveFormCard_();
  } catch (err) {
    return { text: '處理表單時發生錯誤，請稍後再試。' };
  }
}

function buildUpdateMessageResponse_(cardPayload) {
  // 對按鈕/onChangeAction：用 UPDATE_MESSAGE 更新同一則卡片，避免「重新彈出」新訊息
  return Object.assign({}, cardPayload || {}, {
    actionResponse: {
      type: 'UPDATE_MESSAGE',
    },
  });
}

function onAddToSpace(event) {
  try {
    const spaceName = (event && event.space && (event.space.displayName || event.space.name)) || '此對話';
    const who = (event && event.user && event.user.displayName) || '同學';
    return {
      text:
        `已加入：${spaceName}\n` +
        `你好 ${who}！我可以協助收集「事假」申請資料。\n\n` +
        '請輸入任意文字以開啟表單。',
    };
  } catch (err) {
    return { text: '已加入此空間。請輸入任意文字以開啟表單。' };
  }
}

function onRemoveFromSpace(event) {
  // Google Chat 的 removed 事件可能不一定包含 user；此處不強制清理單一使用者狀態
  console.info('Bot removed from', (event && event.space && event.space.name) || 'this chat');
}

function getUserKey_(event) {
  const space = (event && event.space && event.space.name) || 'unknown_space';
  const user = (event && event.user && event.user.name) || 'unknown_user';
  return `${space}::${user}`;
}

function appendLeaveToSheet_(data) {
  try {
    if (!LEAVE_SHEET_ID_ || LEAVE_SHEET_ID_ === 'YOUR_SHEET_ID') {
      return { ok: false, error: '尚未設定 LEAVE_SHEET_ID_（請填入你的 Google Sheet ID）。' };
    }

    const ss = SpreadsheetApp.openById(LEAVE_SHEET_ID_);
    const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到指定的工作表（LEAVE_SHEET_NAME_）。' };

    ensureHeaders_(sheet, LEAVE_SHEET_HEADERS_);
    sheet.appendRow([
      data.submittedAt || new Date(),
      data.className || '',
      data.studentId || '',
      data.name || '',
      data.leaveDate || '',
      data.leaveStartTime || '',
      data.exitTime || '',
      data.reason || '',
      data.documentStatus || '',
      data.approver || '',
    ]);

    const row = sheet.getLastRow();
    return { ok: true, spreadsheetUrl: ss.getUrl(), row };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

function ensureHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every((v) => String(v || '').trim() === '');
  if (isEmpty) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function isRosterConfigured_() {
  return !!ROSTER_SHEET_ID_ && ROSTER_SHEET_ID_ !== 'YOUR_ROSTER_SHEET_ID';
}

function getRosterSheet_() {
  const ss = SpreadsheetApp.openById(ROSTER_SHEET_ID_);
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
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定學生名冊（ROSTER_SHEET_ID_）。', classes: [] };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:classes`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, classes: JSON.parse(cached) };

    const sheet = getRosterSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok: true, classes: [] };

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headerIndexMap = getRosterHeaderIndexMap_(values[0] || []);
    const missingHeaders = [];
    if (headerIndexMap[ROSTER_HEADERS_.className] == null) missingHeaders.push(ROSTER_HEADERS_.className);
    if (headerIndexMap[ROSTER_HEADERS_.studentId] == null) missingHeaders.push(ROSTER_HEADERS_.studentId);
    if (headerIndexMap[ROSTER_HEADERS_.name] == null) missingHeaders.push(ROSTER_HEADERS_.name);
    if (missingHeaders.length) {
      return { ok: false, error: `名冊缺少欄位：${missingHeaders.join('、')}（請確認名冊第一列標題）`, classes: [] };
    }

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
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定學生名冊（ROSTER_SHEET_ID_）。' };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:class:${c}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, students: JSON.parse(cached) };

    const sheet = getRosterSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok: true, students: [] };

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headerIndexMap = getRosterHeaderIndexMap_(values[0] || []);
    const missingHeaders = [];
    if (headerIndexMap[ROSTER_HEADERS_.className] == null) missingHeaders.push(ROSTER_HEADERS_.className);
    if (headerIndexMap[ROSTER_HEADERS_.studentId] == null) missingHeaders.push(ROSTER_HEADERS_.studentId);
    if (headerIndexMap[ROSTER_HEADERS_.name] == null) missingHeaders.push(ROSTER_HEADERS_.name);
    if (missingHeaders.length) {
      return { ok: false, error: `名冊缺少欄位：${missingHeaders.join('、')}（請確認名冊第一列標題）` };
    }

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
    if (!isRosterConfigured_()) return { ok: false, error: '尚未設定學生名冊（ROSTER_SHEET_ID_）。' };

    const cache = CacheService.getScriptCache();
    const cacheKey = `roster:v${ROSTER_CACHE_VERSION_}:studentId:${sid}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, student: JSON.parse(cached) };

    const sheet = getRosterSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { ok: true, student: null };

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headerIndexMap = getRosterHeaderIndexMap_(values[0] || []);
    const missingHeaders = [];
    if (headerIndexMap[ROSTER_HEADERS_.className] == null) missingHeaders.push(ROSTER_HEADERS_.className);
    if (headerIndexMap[ROSTER_HEADERS_.studentId] == null) missingHeaders.push(ROSTER_HEADERS_.studentId);
    if (headerIndexMap[ROSTER_HEADERS_.name] == null) missingHeaders.push(ROSTER_HEADERS_.name);
    if (missingHeaders.length) {
      return { ok: false, error: `名冊缺少欄位：${missingHeaders.join('、')}（請確認名冊第一列標題）` };
    }

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

function buildLeaveFormCard_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const rawSelectedClassName = getFormValue_(inputs, 'className');
  const rosterDistinctClasses = isRosterConfigured_() ? getRosterDistinctClasses_() : { ok: true, classes: [] };
  const classOptions =
    rosterDistinctClasses && rosterDistinctClasses.ok && rosterDistinctClasses.classes && rosterDistinctClasses.classes.length
      ? rosterDistinctClasses.classes
      : CLASS_OPTIONS_;
  // Google Chat dropdown 在「未互動」時 UI 可能會顯示第一項，但 formInputs 仍是空的；
  // 這裡以第一個班別作為預設，讓「學生下拉」能立即載入。
  const selectedClassName = rawSelectedClassName || String(classOptions[0] || '').trim();
  const selectedStudentKey = getFormValue_(inputs, 'studentKey'); // value 預設使用學號

  const rosterClassResult = selectedClassName ? getRosterStudentsByClass_(selectedClassName) : { ok: true, students: [] };
  const rosterClassStudents = rosterClassResult && rosterClassResult.ok ? rosterClassResult.students : [];

  // 若換班別後，原本選的學生不在此班清單內，清空 studentKey（避免送出時帶錯人）
  let effectiveStudentKey = selectedStudentKey;
  try {
    const maxN = Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1);
    const capped = rosterClassResult && rosterClassResult.ok && rosterClassStudents.length >= maxN;
    if (effectiveStudentKey && rosterClassResult && rosterClassResult.ok && rosterClassStudents.length && !capped) {
      let ok = false;
      for (let i = 0; i < rosterClassStudents.length; i++) {
        if (String(rosterClassStudents[i].studentId || '').trim() === String(effectiveStudentKey).trim()) {
          ok = true;
          break;
        }
      }
      if (!ok) effectiveStudentKey = '';
    }
  } catch (e) {}

  const currentLeaveType = getFormValue_(inputs, 'leaveType') || '時段';
  const leaveDateMs = getDateValueMsFromInputs_(inputs, 'leaveDate');
  const cardPayload = {
    cardsV2: [
      {
        cardId: 'leaveForm',
        card: {
          header: {
            title: '學生事假申請',
            subtitle: '請填寫資料後按「送出」',
          },
          sections: [
            {
              header: '基本資料',
              widgets: [
                {
                  selectionInput: {
                    name: 'className',
                    label: '班別',
                    type: 'DROPDOWN',
                    onChangeAction: {
                      action: {
                        function: 'refreshLeaveForm',
                      },
                    },
                    items: (() => {
                      const current = rawSelectedClassName;
                      if (isRosterConfigured_() && rosterDistinctClasses && !rosterDistinctClasses.ok) {
                        return [
                          {
                            text: `班別清單讀取失敗：${rosterDistinctClasses.error}`,
                            value: '',
                            selected: true,
                          },
                        ];
                      }
                      const out = [];
                      for (let i = 0; i < classOptions.length; i++) {
                        const t = String(classOptions[i] || '').trim();
                        if (!t) continue;
                        const selected = current ? current === t : i === 0;
                        out.push({ text: t, value: t, selected });
                      }
                      return out.length ? out : [{ text: '（未設定班別選項）', value: '', selected: true }];
                    })(),
                  }
                },
                {
                  selectionInput: {
                    name: 'studentKey',
                    label: '學生（從名冊選取）',
                    type: 'DROPDOWN',
                    onChangeAction: {
                      action: {
                        function: 'refreshLeaveForm',
                      },
                    },
                    items: (() => {
                      if (!selectedClassName) {
                        return [{ text: '請先選擇班別', value: '', selected: true }];
                      }
                      if (rosterClassResult && !rosterClassResult.ok) {
                        return [{ text: `名冊讀取失敗：${rosterClassResult.error}`, value: '', selected: true }];
                      }
                      if (!isRosterConfigured_()) {
                        return [{ text: '尚未設定學生名冊（ROSTER_SHEET_ID_）', value: '', selected: true }];
                      }
                      if (!rosterClassStudents.length) {
                        return [{ text: '此班別在名冊找不到學生（請檢查名冊 Class 欄位是否與班別一致）', value: '', selected: true }];
                      }
                      if (rosterClassStudents.length >= Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1)) {
                        return [
                          {
                            text: `此班學生超過下拉上限（${ROSTER_MAX_STUDENTS_PER_CLASS_}）。請調高 ROSTER_MAX_STUDENTS_PER_CLASS_ 或縮小範圍（例如分 sheet）。`,
                            value: '',
                            selected: true,
                          },
                        ];
                      }
                      const current = effectiveStudentKey;
                      const items = [{ text: '請選擇學生', value: '', selected: !current }];
                      for (let i = 0; i < rosterClassStudents.length; i++) {
                        const s = rosterClassStudents[i];
                        const value = String(s.studentId || '').trim();
                        const text = `${value} ${String(s.name || '').trim()}`.trim();
                        items.push({ text, value, selected: current === value });
                      }
                      return items;
                    })(),
                  },
                },
              ],
            },
            {
              header: '事假內容',
              widgets: [
                {
                  dateTimePicker: {
                    name: 'leaveDate',
                    label: '事假日期',
                    type: 'DATE_ONLY',
                    ...(leaveDateMs != null ? { valueMsEpoch: leaveDateMs } : {}),
                  },
                },
                {
                  selectionInput: {
                    name: 'leaveType',
                    label: '請假類型',
                    type: 'RADIO_BUTTON',
                    items: LEAVE_TYPE_OPTIONS_.map((v) => ({ text: v, value: v, selected: v === currentLeaveType })),
                  },
                },
                {
                  selectionInput: {
                    name: 'leaveStart',
                    label: '時段開始',
                    type: 'DROPDOWN',
                    items: SCHOOL_TIMESLOT_OPTIONS_.map((o) => ({
                      text: o.text,
                      value: o.value,
                      selected: getFormValue_(inputs, 'leaveStart') === o.value,
                    })),
                  },
                },
                {
                  selectionInput: {
                    name: 'leaveEnd',
                    label: '時段完結',
                    type: 'DROPDOWN',
                    items: SCHOOL_TIMESLOT_OPTIONS_.map((o) => ({
                      text: o.text,
                      value: o.value,
                      selected: getFormValue_(inputs, 'leaveEnd') === o.value,
                    })),
                  },
                },
                {
                  selectionInput: {
                    name: 'reasonChoice',
                    label: '原因',
                    type: 'DROPDOWN',
                    items: REASON_OPTIONS_.map((v) => ({
                      text: v,
                      value: v,
                      selected: getFormValue_(inputs, 'reasonChoice') === v,
                    })),
                  },
                },
                {
                  textInput: {
                    name: 'reasonOther',
                    label: '原因（其他）',
                    value: getFormValue_(inputs, 'reasonOther'),
                  },
                },
                {
                  textParagraph: {
                    text:
                      '文件情況：如有文件，請在送出後直接於此聊天室上傳/拍照圖片；系統會自動於試算表記錄「有相關文件」。未上傳則預設記錄「需補交」。',
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '送出',
                        onClick: {
                          action: {
                            function: 'submitLeaveForm',
                          },
                        },
                      },
                      {
                        text: '重新填寫',
                        onClick: {
                          action: {
                            function: 'openLeaveForm',
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };

  return cardPayload;
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
    if (c.msSinceEpoch != null) return Number(c.msSinceEpoch);
    if (c.year != null && c.month != null && c.day != null) {
      const d = new Date(Number(c.year), Number(c.month) - 1, Number(c.day));
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    return null;
  } catch (e) {
    return null;
  }
}
function handleSubmitLeaveForm_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const submittedAt = new Date();
  const data = {
    submittedAt,
    className: getFormValue_(inputs, 'className'),
    studentKey: getFormValue_(inputs, 'studentKey'),
    studentId: '',
    name: '',
    leaveDate: getFormValue_(inputs, 'leaveDate'),
    leaveType: getFormValue_(inputs, 'leaveType') || '時段',
    leaveStart: getFormValue_(inputs, 'leaveStart'),
    leaveEnd: getFormValue_(inputs, 'leaveEnd'),
    reasonChoice: getFormValue_(inputs, 'reasonChoice'),
    reasonOther: getFormValue_(inputs, 'reasonOther'),
    approver: getGmailUsernameFromEvent_(event),
  };

  // 名冊驗證/帶入：只要找得到名冊資料，就以名冊為準（避免班別/學號/姓名不一致）
  try {
    if (isRosterConfigured_()) {
      const sid = String(data.studentKey || '').trim();
      if (sid) {
        const r = lookupRosterStudentById_(sid);
        if (r && r.ok && r.student) {
          data.className = r.student.className;
          data.studentId = r.student.studentId;
          data.name = r.student.name;
        }
      }
    }
  } catch (e) {}

  // 若已選學生但名冊查不到：通常是名冊資料不一致，或下拉清單與名冊不同步
  if (isRosterConfigured_() && String(data.studentKey || '').trim() && (!data.studentId || !data.name)) {
    return {
      text:
        '找不到你選取的學生資料（名冊查無此學號）。\n' +
        '請確認名冊 `No.` 欄位是否正確，或重新選擇班別/學生後再送出。',
    };
  }

  const leaveTimeText = data.leaveType === '全日' ? '全日' : formatSchoolTimeslotRange_(data.leaveStart, data.leaveEnd);
  // 寫入 Google Sheet 的請假時間：自動換算成實際時間段（HH:mm-HH:mm）
  const leaveTimeForSheet = data.leaveType === '全日' ? '全日' : formatTimeslotRangeToClock_(data.leaveStart, data.leaveEnd);
  const exitTimeText = data.leaveType === '全日' ? '' : getTimeslotEndTime_(data.leaveEnd);
  const reasonText =
    data.reasonChoice === '其他'
      ? String(data.reasonOther || '').trim()
      : String(data.reasonChoice || '').trim();

  const missing = [];
  if (!data.className) missing.push('班別');
  if (!isRosterConfigured_()) missing.push('學生名冊（ROSTER_SHEET_ID_）');
  if (!String(data.studentKey || '').trim()) missing.push('學生（從名冊選取）');
  if (!data.studentId) missing.push('學號（從名冊選取）');
  if (!data.name) missing.push('姓名（從名冊選取）');
  if (!data.leaveDate) missing.push('事假日期');
  if (!data.leaveType) missing.push('請假類型');
  if (data.leaveType !== '全日') {
    if (!data.leaveStart) missing.push('時段開始');
    if (!data.leaveEnd) missing.push('時段完結');
  }
  // 選全日就不可填時段（有填視為錯誤，避免資料混亂）
  if (data.leaveType === '全日') {
    if (String(data.leaveStart || '').trim() || String(data.leaveEnd || '').trim()) {
      missing.push('請把「時段開始／時段完結」清空（全日不需填時段）');
    }
  }
  // 原因：只有選其他才可填原因（其他）
  if (data.reasonChoice !== '其他' && String(data.reasonOther || '').trim()) {
    missing.push('原因（其他）只可在原因選「其他」時填寫');
  }
  if (!reasonText) missing.push('原因');
  if (data.leaveType !== '全日' && !exitTimeText) missing.push('離校時間（由時段完結推算）');

  if (missing.length) {
    const keys = Object.keys(inputs || {});
    const sampleKey = keys[0];
    const sampleRaw = sampleKey ? safeJson_(inputs[sampleKey]) : null;
    const extractedLines =
      keys.length === 0
        ? ''
        : '\n（偵錯）抽取到的值：\n' +
          [
            `- className="${data.className}"`,
            `- studentKey="${data.studentKey}"`,
            `- studentId="${data.studentId}"`,
            `- name="${data.name}"`,
            `- leaveDate="${data.leaveDate}"`,
            `- leaveType="${data.leaveType}"`,
            `- leaveStart="${data.leaveStart}"`,
            `- leaveEnd="${data.leaveEnd}"`,
            `- leaveTimeText="${leaveTimeText}"`,
            `- reasonChoice="${data.reasonChoice}"`,
            `- reasonOther="${data.reasonOther}"`,
            `- reasonText="${reasonText}"`,
            `- exitTime="${exitTimeText}"`,
          ].join('\n');
    const debug =
      keys.length === 0
        ? '（偵錯）本次事件沒有帶回任何 formInputs。通常代表 Chat App 的互動事件未正確傳遞表單值，或使用的事件 payload 路徑不同。'
        : `（偵錯）收到的 formInputs keys：${keys.join(', ')}`;
    const rawDebug = sampleKey
      ? `\n（偵錯）樣本 payload（${sampleKey}）：\n${sampleRaw}`
      : '';
    return {
      text:
        `以下欄位尚未填寫：${missing.join('、')}\n\n` +
        '請再檢查表單後重新按「送出」。\n' +
        debug +
        extractedLines +
        rawDebug,
    };
  }

  const writeResult = appendLeaveToSheet_({
    submittedAt: data.submittedAt,
    className: data.className,
    studentId: data.studentId,
    name: data.name,
    leaveDate: data.leaveDate,
    leaveStartTime: leaveTimeForSheet,
    exitTime: exitTimeText,
    reason: reasonText,
    // 文件情況：沒有上傳文件時一律先記錄「需補交」，若同學後續在聊天室上傳圖片，系統會自動改成「有相關文件」
    documentStatus: DOCUMENT_STATUS_NEED_SUBMIT_,
    approver: data.approver,
  });
  if (!writeResult.ok) {
    return {
      text:
        '寫入 Google Sheet 失敗：\n' +
        writeResult.error +
        '\n\n請確認 Sheet ID 與權限，或稍後再試。',
    };
  }

  // 記錄此使用者最新一筆申請的列號，供之後收到圖片附件時回寫「文件情況」
  try {
    const userKey = getUserKey_(event);
    if (writeResult.row) {
      PropertiesService.getScriptProperties().setProperty(`lastRow:${userKey}`, String(writeResult.row));
    }
  } catch (e) {}

  const tz = Session.getScriptTimeZone();
  const submittedAtText = Utilities.formatDate(data.submittedAt, tz, 'yyyy/MM/dd HH:mm:ss');
  return {
    text:
      '已送出並寫入試算表。\n' +
      `- 申請時間：${submittedAtText}\n` +
      `- 班別：${data.className}\n` +
      `- 學號：${data.studentId}\n` +
      `- 姓名：${data.name}\n` +
      `- 事假日期：${data.leaveDate}\n` +
      `- 請假時間：${leaveTimeForSheet}\n` +
      `- 離校時間：${exitTimeText}\n` +
      `- 原因：${reasonText}\n` +
      `- 文件情況：${DOCUMENT_STATUS_NEED_SUBMIT_}\n` +
      `- 批核者：${data.approver}\n\n` +
      `試算表：${writeResult.spreadsheetUrl}\n\n` +
      '要再填一筆，輸入「請假」。',
  };
}

function hasImageAttachment_(event) {
  try {
    const msg = (event && event.message) || {};
    const attachments = msg.attachments || msg.attachment || [];
    const list = Array.isArray(attachments) ? attachments : [attachments];
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i] || {};
      const ct = String(a.contentType || a.mimeType || (a.attachmentDataRef && a.attachmentDataRef.contentType) || '').toLowerCase();
      if (ct.startsWith('image/')) return true;
      // 有些 payload 不帶 contentType，僅帶有 attachmentDataRef/driveDataRef；仍視作有文件
      if (a.attachmentDataRef || a.driveDataRef) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function handleDocumentAttachment_(event) {
  try {
    const userKey = getUserKey_(event);
    const lastRow = PropertiesService.getScriptProperties().getProperty(`lastRow:${userKey}`);
    if (!lastRow) {
      return { text: '收到文件，但找不到你最新一筆申請紀錄。請先送出申請表單後再上傳文件。' };
    }

    const updateResult = updateDocumentStatusByRow_(Number(lastRow), DOCUMENT_STATUS_HAS_FILE_);
    if (!updateResult.ok) return { text: `收到文件，但更新試算表失敗：${updateResult.error}` };

    return { text: `已收到文件，並更新「文件情況」為「${DOCUMENT_STATUS_HAS_FILE_}」。` };
  } catch (e) {
    return { text: '收到文件，但處理時發生錯誤，請稍後再試。' };
  }
}

function updateDocumentStatusByRow_(row, statusText) {
  try {
    const r = Number(row);
    if (!r || r < 2) return { ok: false, error: '列號無效。' };

    const ss = SpreadsheetApp.openById(LEAVE_SHEET_ID_);
    const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到指定的工作表。' };

    ensureHeaders_(sheet, LEAVE_SHEET_HEADERS_);
    const headerRow = sheet.getRange(1, 1, 1, LEAVE_SHEET_HEADERS_.length).getValues()[0];
    let col = -1;
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim() === '文件情況') {
        col = i + 1;
        break;
      }
    }
    if (col === -1) return { ok: false, error: '找不到「文件情況」欄位。' };

    sheet.getRange(r, col).setValue(statusText);
    return { ok: true, spreadsheetUrl: ss.getUrl(), row: r };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

function formatSchoolTimeslotRange_(startValue, endValue) {
  const s = String(startValue || '').trim();
  const e = String(endValue || '').trim();
  if (!s || !e) return [s, e].filter(Boolean).join(' - ');
  const sn = Number(s);
  const en = Number(e);
  if (!Number.isFinite(sn) || !Number.isFinite(en)) return `${s} - ${e}`;
  const a = Math.min(sn, en);
  const b = Math.max(sn, en);
  return `第${a}節-第${b}節`;
}

function getTimeslotEndTime_(slotValue) {
  const v = String(slotValue || '').trim();
  if (!v) return '';
  for (let i = 0; i < SCHOOL_TIMESLOT_OPTIONS_.length; i++) {
    const o = SCHOOL_TIMESLOT_OPTIONS_[i];
    if (String(o.value) !== v) continue;
    if (o.endTime) return String(o.endTime);
    // fallback：支援半形/全形括號
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
    // Google Chat formInputs 的結構在不同卡片/版本下可能略有差異，這裡做多種相容。
    // 常見結構：
    // - { stringInputs: { value: ["..."] } }
    // - { stringInputs: { value: "..." } }
    // - { stringInputs: { value: [{...}] } }（少見）
    // - { value: ["..."] } / { value: "..." }
    // 有些事件 payload 會多包一層 key（常見是空字串 ""）
    // 例如：formInputs.leaveTime = { "": { stringInputs: { value: ["14:30"] } } }
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
    // dateTimePicker 相關（不同 payload 可能是 dateInput/timeInput/dateTimeInput）
    if (unwrapped.dateInput) candidates.push(unwrapped.dateInput);
    if (unwrapped.timeInput) candidates.push(unwrapped.timeInput);
    if (unwrapped.dateTimeInput) candidates.push(unwrapped.dateTimeInput);
    candidates.push(unwrapped);

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (!c) continue;
      // date/time inputs 可能直接以結構呈現（非 value 欄位）
      if (c.msSinceEpoch != null) {
        const d = new Date(Number(c.msSinceEpoch));
        if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
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
        // array of primitives
        if (typeof v[0] === 'string' || typeof v[0] === 'number') return String(v[0]).trim();
        // array of objects -> best-effort stringify
        if (v.length) return String(v[0] && (v[0].value || v[0].text || '')).trim();
        continue;
      }

      if (typeof v === 'string' || typeof v === 'number') return String(v).trim();

      // object -> try common fields
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
  // 兼容不同事件結構：優先 common.formInputs，其次 action.formInputs
  const fromCommon = (event && event.common && event.common.formInputs) || null;
  if (fromCommon && Object.keys(fromCommon).length) return fromCommon;

  const fromAction = (event && event.action && event.action.formInputs) || null;
  if (fromAction && Object.keys(fromAction).length) return fromAction;

  // 退而求其次：把可能存在的 formInputs 聚合
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

function safeJson_(obj) {
  try {
    const s = JSON.stringify(obj, null, 2);
    // 避免訊息太長被 Chat 截斷
    return s.length > 1200 ? s.slice(0, 1200) + '\n...（已截斷）' : s;
  } catch (e) {
    return String(obj);
  }
}

