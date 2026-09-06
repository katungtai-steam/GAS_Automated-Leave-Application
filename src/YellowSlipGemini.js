/**
 * 黃紙備註 Gemini 潤飾（YellowSlipGemini.js）
 */

function buildYellowSlipRemarkPolishPrompt_(rawRemark, context) {
  const ctx = context || {};
  return (
    '你是校園訓導行政助理。請將下列「備註草稿」潤飾成簡潔、專業、客觀的中文備註，供黃紙跟進紀錄使用。\n' +
    '要求：\n' +
    '- 保留原意與重要事實，不虛構內容\n' +
    '- 用語正式、精簡（建議 1–3 句）\n' +
    '- 不要加入學生班別、姓名（上下文僅供理解）\n' +
    '- 不要加標題或條列符號以外的裝飾\n' +
    '- 只回傳 JSON：{"polishedRemark":"..."}\n\n' +
    '跟進狀態：' +
    String(ctx.followUpStatus || '') +
    '\n' +
    '黃紙物品（ItemTaken）：' +
    String(ctx.itemTaken || '') +
    '\n\n' +
    '備註草稿：\n' +
    String(rawRemark || '').trim()
  );
}

/**
 * 潤飾級訓導備註；草稿為空時直接回傳空字串。
 * @returns {{ ok: boolean, polishedRemark?: string, error?: string }}
 */
function polishYellowSlipRemarkWithGemini_(rawRemark, context) {
  try {
    const draft = String(rawRemark || '').trim();
    if (!draft) return { ok: true, polishedRemark: '' };

    const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY_);
    if (!apiKey) {
      return {
        ok: false,
        error:
          '未設定 Gemini API Key。請在 Apps Script → 專案設定 → Script properties 新增 ' +
          GEMINI_API_KEY_PROPERTY_,
      };
    }

    const model = String(GEMINI_MODEL_ || 'gemini-3.6-flash').trim();
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const payload = {
      contents: [{ role: 'user', parts: [{ text: buildYellowSlipRemarkPolishPrompt_(draft, context) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
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
    const polished = String(parsed.polishedRemark || parsed.remark || '').trim();
    if (!polished) return { ok: false, error: 'Gemini 未回傳潤飾後備註。' };

    return { ok: true, polishedRemark: polished };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || 'Gemini 潤飾失敗') };
  }
}
