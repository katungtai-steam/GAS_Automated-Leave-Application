/**
 * Google Chat Slash Command 路由（SlashCommandRouter.js）
 */

function slashCommandIdMatches_(commandId, expectedId) {
  if (commandId == null || commandId === '') return false;
  return Number(commandId) === Number(expectedId);
}

function getSlashCommandFromEvent_(event) {
  const norm = normalizeChatEvent_(event);
  const msg = norm.message;
  if (!msg) return null;
  if (msg.slashCommand) return msg.slashCommand;

  const anns = msg.annotations || msg.annotation || [];
  const list = Array.isArray(anns) ? anns : anns ? [anns] : [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].slashCommand) return list[i].slashCommand;
  }
  return null;
}

function normalizeSlashCommandName_(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\//, '')
    .toLowerCase();
}

function slashNameMatchesList_(name, list) {
  const n = normalizeSlashCommandName_(name);
  if (!n) return false;
  for (let i = 0; i < list.length; i++) {
    if (n === normalizeSlashCommandName_(list[i])) return true;
  }
  return false;
}

function parseSlashCommandFromText_(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return null;
  const first = t.split(/\s+/)[0];
  return normalizeSlashCommandName_(first);
}

function routeSlashCommandByIdOrName_(commandId, commandName) {
  if (
    slashCommandIdMatches_(commandId, SLASH_CMD_LEAVE_ID_) ||
    slashNameMatchesList_(commandName, SLASH_CMD_LEAVE_NAMES_)
  ) {
    return buildLeaveFormCard_();
  }
  if (
    slashCommandIdMatches_(commandId, SLASH_CMD_WORKLOG_ID_) ||
    slashNameMatchesList_(commandName, SLASH_CMD_WORKLOG_NAMES_)
  ) {
    return buildWorkLogFormCard_();
  }
  if (
    slashCommandIdMatches_(commandId, SLASH_CMD_MENU_ID_) ||
    slashNameMatchesList_(commandName, SLASH_CMD_MENU_NAMES_)
  ) {
    return buildMainMenuCard_();
  }
  return {
    text:
      '未知的 slash command（commandId=' +
      String(commandId) +
      '）。\n\n' +
      '可用指令：\n' +
      '- `/事假` — 事假申請\n' +
      '- `/工作記錄` — 工作記錄\n' +
      '- `/選單` — 主選單',
  };
}

/** 處理 slash command（MESSAGE 內 slashCommand）；非 slash 回傳 null */
function handleSlashCommand_(event) {
  const sc = getSlashCommandFromEvent_(event);
  if (sc) {
    return routeSlashCommandByIdOrName_(sc.commandId, sc.commandName);
  }

  const norm = normalizeChatEvent_(event);
  const text = (norm.message && norm.message.text) || '';
  const fromText = parseSlashCommandFromText_(text);
  if (fromText) {
    return routeSlashCommandByIdOrName_(NaN, fromText);
  }
  return null;
}

/** APP_COMMAND 事件（部分部署的 slash / quick command） */
function handleAppCommandEvent_(event) {
  const meta = getAppCommandMetadata_(event);
  if (meta.appCommandId == null && !meta.commandName) return null;
  return routeSlashCommandByIdOrName_(meta.appCommandId, meta.commandName);
}

function getSlashCommandHelpText_() {
  return (
    '可用 slash command：\n' +
    '- `/事假` — 開啟事假申請表單\n' +
    '- `/工作記錄` — 開啟工作記錄表單\n' +
    '- `/選單` — 開啟主選單'
  );
}
