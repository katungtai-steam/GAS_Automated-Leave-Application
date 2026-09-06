/**
 * Google Chat Slash Command 路由（SlashCommandRouter.js）
 * 指令定義見 ChatBotConfig.js → SLASH_COMMANDS_
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

function getSlashCommandNameKeys_(cmd) {
  const keys = [cmd.name].concat(Array.isArray(cmd.aliases) ? cmd.aliases : []);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const n = normalizeSlashCommandName_(keys[i]);
    if (n) out.push(n);
  }
  return out;
}

function findSlashCommandDef_(commandId, commandName) {
  const defs = Array.isArray(SLASH_COMMANDS_) ? SLASH_COMMANDS_ : [];
  const nameKey = normalizeSlashCommandName_(commandName);

  for (let i = 0; i < defs.length; i++) {
    const cmd = defs[i];
    if (slashCommandIdMatches_(commandId, cmd.id)) return cmd;
  }
  if (!nameKey) return null;
  for (let i = 0; i < defs.length; i++) {
    const keys = getSlashCommandNameKeys_(defs[i]);
    for (let j = 0; j < keys.length; j++) {
      if (keys[j] === nameKey) return defs[i];
    }
  }
  return null;
}

function buildSlashCommandCard_(action) {
  if (action === 'leave') return buildLeaveFormCard_();
  if (action === 'worklog') return buildWorkLogFormCard_();
  if (action === 'yellow') return buildYellowSlipFormCard_();
  if (action === 'menu') return buildMainMenuCard_();
  return null;
}

function parseSlashCommandFromText_(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return null;
  const first = t.split(/\s+/)[0];
  return normalizeSlashCommandName_(first);
}

function routeSlashCommandByIdOrName_(commandId, commandName) {
  const def = findSlashCommandDef_(commandId, commandName);
  if (def) {
    const card = buildSlashCommandCard_(def.action);
    if (card) return card;
  }
  return {
    text:
      '未知的 slash command（commandId=' +
      String(commandId) +
      '）。\n\n' +
      getSlashCommandHelpText_(),
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
  const defs = Array.isArray(SLASH_COMMANDS_) ? SLASH_COMMANDS_ : [];
  const lines = ['可用指令：'];
  for (let i = 0; i < defs.length; i++) {
    const cmd = defs[i];
    lines.push('- `/' + cmd.name + '` — ' + (cmd.description || cmd.name));
  }
  return lines.join('\n');
}
