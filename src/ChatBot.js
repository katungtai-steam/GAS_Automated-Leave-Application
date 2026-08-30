/**
 * Google Chat Bot 事件入口（ChatBot.js）
 */

function buildUpdateMessageResponse_(cardPayload) {
  return Object.assign({}, cardPayload || {}, {
    actionResponse: { type: 'UPDATE_MESSAGE' },
  });
}

function onMessage(event) {
  try {
    if (hasImageAttachment_(event)) return handleDocumentAttachment_(event);
    const text = String((event && event.message && event.message.text) || '').trim();
    if (!text) return { text: '我目前只處理文字訊息。' };
    if (/^(工作記錄|worklog|違規)$/i.test(text)) return buildWorkLogFormCard_();
    if (/^(請假|leave|事假)$/i.test(text)) return buildLeaveFormCard_();
    return buildMainMenuCard_();
  } catch (err) {
    return { text: '處理時發生錯誤，請稍後再試。' };
  }
}

function onCardClick(event) {
  try {
    const invoked =
      (event && event.common && event.common.invokedFunction) ||
      (event && event.action && (event.action.actionMethodName || event.action.actionMethod)) ||
      '';

    if (invoked === 'openMainMenu') return buildMainMenuCard_();
    if (invoked === 'openWorkLogForm') return buildWorkLogFormCard_();
    if (invoked === 'submitWorkLogForm') return handleSubmitWorkLogForm_(event);
    if (invoked === 'refreshWorkLogForm') return buildUpdateMessageResponse_(buildWorkLogFormCard_(event));

    if (invoked === 'submitLeaveForm') return handleSubmitLeaveForm_(event);
    if (invoked === 'openLeaveForm') return buildLeaveFormCard_();
    if (invoked === 'refreshLeaveForm') return buildUpdateMessageResponse_(buildLeaveFormCard_(event));

    if (isWorkLogFormInputs_(event)) return buildUpdateMessageResponse_(buildWorkLogFormCard_(event));
    if (hasMeaningfulFormInputs_(event)) return buildUpdateMessageResponse_(buildLeaveFormCard_(event));

    return buildMainMenuCard_();
  } catch (err) {
    return { text: '處理表單時發生錯誤，請稍後再試。' };
  }
}

function onAddToSpace(event) {
  try {
    const spaceName = (event && event.space && (event.space.displayName || event.space.name)) || '此對話';
    const who = (event && event.user && event.user.displayName) || '同學';
    return {
      text:
        `已加入：${spaceName}\n` +
        `你好 ${who}！我可以協助「事假申請」與「工作記錄」。\n\n` +
        '請輸入任意文字以開啟主選單。',
    };
  } catch (err) {
    return { text: '已加入此空間。請輸入任意文字以開啟主選單。' };
  }
}

function onRemoveFromSpace(event) {
  console.info('Bot removed from', (event && event.space && event.space.name) || 'this chat');
}
