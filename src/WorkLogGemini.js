/**
 * Gemini 語意解析：僅處理「事件描述」→ 違規類別、處理等級（WorkLogGemini.js）
 * 姓名/班別由 GAS 名冊讀取，不傳入 Gemini。
 */

function buildWorkLogGeminiPrompt_(eventDescription) {
  const cats = WORK_LOG_VIOLATION_CATEGORIES_.join('、');
  const levels = WORK_LOG_HANDLING_LEVELS_.join('、');
  return (
    '你是校園事務助理。請依下列「事件描述」判斷違規類別與建議處理等級。\n' +
    '違規類別只能擇一：' +
    cats +
    '\n' +
    '處理等級只能擇一：' +
    levels +
    '\n' +
    '只回傳 JSON，格式：{"violationCategory":"...","handlingLevel":"..."}\n\n' +
    '事件描述：\n' +
    String(eventDescription || '').trim()
  );
}

function parseWorkLogEventWithGemini_(eventDescription) {
  try {
    const desc = String(eventDescription || '').trim();
    if (!desc) return { ok: false, error: '事件描述為空。' };

    const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY_);
    if (!apiKey) {
      return {
        ok: false,
        error:
          '未設定 Gemini API Key。請在 Apps Script → 專案設定 → Script properties 新增 ' +
          GEMINI_API_KEY_PROPERTY_,
      };
    }

    const model = String(GEMINI_MODEL_ || 'gemini-2.0-flash').trim();
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const payload = {
      contents: [{ role: 'user', parts: [{ text: buildWorkLogGeminiPrompt_(desc) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    const bodyText = resp.getContentText();
    if (code < 200 || code >= 300) {
      return { ok: false, error: 'Gemini API 錯誤（HTTP ' + code + '）：' + bodyText.slice(0, 300) };
    }

    const body = JSON.parse(bodyText);
    const text =
      body &&
      body.candidates &&
      body.candidates[0] &&
      body.candidates[0].content &&
      body.candidates[0].content.parts &&
      body.candidates[0].content.parts[0] &&
      body.candidates[0].content.parts[0].text;
    if (!text) return { ok: false, error: 'Gemini 回傳內容為空。' };

    const parsed = JSON.parse(String(text).trim());
    const violationCategory = normalizeWorkLogCategory_(parsed.violationCategory, WORK_LOG_VIOLATION_CATEGORIES_);
    const handlingLevel = normalizeWorkLogCategory_(parsed.handlingLevel, WORK_LOG_HANDLING_LEVELS_);

    return { ok: true, violationCategory, handlingLevel };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || 'Gemini 解析失敗') };
  }
}

/** 將 Gemini 回傳值對齊設定清單；無法對齊時回「其他」 */
function normalizeWorkLogCategory_(value, allowedList) {
  const v = String(value || '').trim();
  const list = Array.isArray(allowedList) ? allowedList : [];
  if (!v) return list.indexOf('其他') >= 0 ? '其他' : list[0] || '';
  if (list.indexOf(v) >= 0) return v;
  for (let i = 0; i < list.length; i++) {
    if (v.indexOf(list[i]) >= 0 || list[i].indexOf(v) >= 0) return list[i];
  }
  return list.indexOf('其他') >= 0 ? '其他' : v;
}
