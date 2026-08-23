import { formatExp, formatInteger } from "./render.js?v=dashboard-20260824-synthesis-accounting-v112";
import { localizedName, text as t } from "./i18n.js?v=dashboard-20260824-synthesis-accounting-v112&ui=v113";

export const DEFAULT_AGENT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_AGENT_MODEL = "deepseek-v4-flash";
const ARONA_AVATAR_SRC = "./assets/ui/arona-title.webp";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatJson(value) {
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

function renderAgentAvatar(locale) {
  return `<div class="agent-message-avatar"><img src="${ARONA_AVATAR_SRC}" alt="${escapeHtml(t(locale, "agentAronaAlt"))}" loading="lazy"></div>`;
}

function changeLabel(change, data, locale, localization) {
  const studentName = () => {
    const student = data?.cutoffStudentById?.get(String(change.studentId)) ?? data?.studentById?.get(String(change.studentId));
    return localizedName(student, "student", locale, localization);
  };
  if (change.kind === "set_student_target") return t(locale, "agentChangeStudentTarget", studentName(), change.targetLevel);
  if (change.kind === "add_student_goal") return t(locale, "agentChangeAddStudentGoal", studentName(), change.targetLevel);
  if (change.kind === "update_student_goal") return t(locale, "agentChangeUpdateStudentGoal", studentName(), change.targetLevel ?? "—");
  if (change.kind === "remove_student_goal") return t(locale, "agentChangeRemoveStudentGoal", studentName());
  if (change.kind === "set_main_target") return change.studentId === null ? t(locale, "agentChangeClearMainTarget") : t(locale, "agentChangeMainTarget", studentName());
  if (change.kind === "set_forecast_days") return t(locale, "agentChangeForecastDays", change.value);
  if (change.kind === "set_cn_cutoff_student") {
    return t(locale, "agentChangeCnCutoff", studentName());
  }
  if (change.kind === "reorder_student_goals") return t(locale, "agentChangeReorderStudents", (change.studentIds ?? []).join(", "));
  return String(change.kind ?? "");
}

function renderPlanSummary({ context, locale, localization }) {
  const projections = context?.calculatedResults?.giftPlanning?.projections ?? [];
  if (!projections.length) {
    return `<section class="agent-plan-summary agent-plan-summary-empty"><div><span class="agent-plan-kicker">${escapeHtml(t(locale, "agentPlanSummaryTitle"))}</span><strong>${escapeHtml(t(locale, "agentPlanSummaryEmpty"))}</strong></div></section>`;
  }
  const studentById = new Map((context?.students ?? []).map((student) => [String(student.studentId), student]));
  return `<section class="agent-plan-summary" aria-labelledby="agent-plan-summary-title"><div class="agent-plan-summary-heading"><span class="agent-plan-kicker">${escapeHtml(t(locale, "agentPlanSummaryTitle"))}</span><h2 id="agent-plan-summary-title">${escapeHtml(t(locale, "agentPlanSummaryCount", projections.length))}</h2></div><div class="agent-plan-summary-list">${projections.map((item) => {
    const student = studentById.get(String(item.studentId));
    const name = student ? localizedName({ name_zh_cn: student.names?.zh_cn, name_en: student.names?.en, name_ja: student.names?.ja }, "student", locale, localization) : String(item.studentId);
    const projection = item.projection ?? {};
    const days = projection.estimatedDays === null || projection.estimatedDays === undefined ? t(locale, "planningDaysUnknown") : `${formatInteger(projection.estimatedDays, locale)} ${t(locale, "planningDaysUnit")}`;
    return `<article class="agent-plan-summary-row"><strong>${escapeHtml(name)}</strong><span><small>${escapeHtml(t(locale, "agentPlanGap"))}</small><b>${formatExp(projection.gapWithinPeriod ?? item.combined?.gap ?? 0, locale)}</b></span><span><small>${escapeHtml(t(locale, "agentPlanDays"))}</small><b>${escapeHtml(days)}</b></span><span><small>${escapeHtml(t(locale, "agentPlanStock"))}</small><b>${formatExp(projection.currentExp ?? item.combined?.giftExp ?? 0, locale)}</b></span></article>`;
  }).join("")}</div></section>`;
}

function renderAgentThinking({ locale, activityKey }) {
  const allowedActivityKeys = new Set([
    "agentActivityPreparing",
    "agentActivityGifts",
    "agentActivityResources",
    "agentActivityRequest",
    "agentActivityReview",
  ]);
  const currentActivityKey = allowedActivityKeys.has(activityKey) ? activityKey : "agentActivityPreparing";
  return `<article class="agent-message agent-message-assistant agent-thinking-message" role="status" aria-live="polite">${renderAgentAvatar(locale)}<div class="agent-message-body"><span>${escapeHtml(t(locale, "agentAssistant"))}</span><p class="agent-thinking-copy"><span class="agent-thinking-cursor" aria-hidden="true">✦</span><span>${escapeHtml(t(locale, currentActivityKey))}</span><span class="agent-thinking-dots" aria-hidden="true">...</span></p></div></article>`;
}

function renderMessage(message, locale) {
  const isUser = message.role === "user";
  const questions = Array.isArray(message.questions) && message.questions.length
    ? `<div class="agent-questions"><strong>${escapeHtml(t(locale, "agentQuestionsTitle"))}</strong><ol>${message.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol></div>`
    : "";
  return `<article class="agent-message agent-message-${isUser ? "user" : "assistant"}">${isUser ? "" : renderAgentAvatar(locale)}<div class="agent-message-body"><span>${escapeHtml(t(locale, isUser ? "agentYou" : "agentAssistant"))}</span><p>${escapeHtml(message.content)}</p>${questions}</div></article>`;
}

export function renderAgentWorkspace({ locale, state, data, context }) {
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const proposal = state.proposal;
  const contextStudents = context?.students ?? [];
  const contextSummary = t(locale, "agentContextSummary", contextStudents.length, Object.keys(context?.plannerState?.inventory ?? {}).length);
  const notice = state.notice ? `<div class="agent-notice" role="status">${escapeHtml(state.notice)}</div>` : "";
  const conversation = messages.length
    ? messages.map((message) => renderMessage(message, locale)).join("")
    : state.busy ? "" : state.configured
      ? `<div class="agent-empty agent-empty-configured" role="status"><strong>${escapeHtml(t(locale, "agentEmpty"))}</strong></div>`
      : `<div class="agent-empty agent-empty-unconfigured" role="status"><div class="agent-empty-copy"><strong>${escapeHtml(t(locale, "agentSetupTitle"))}</strong><p>${escapeHtml(t(locale, "agentSetupPrompt"))}</p></div><button type="button" class="secondary-button" data-agent-open-settings>${escapeHtml(t(locale, "agentOpenSettings"))}</button></div>`;
  const thinking = state.busy ? renderAgentThinking({ locale, activityKey: state.activityKey }) : "";
  const proposalHtml = proposal
    ? `<section class="agent-proposal" aria-labelledby="agent-proposal-title"><div class="section-heading compact"><div><h2 id="agent-proposal-title">${escapeHtml(proposal.summary || t(locale, "agentProposal"))}</h2></div><span class="section-caption">${escapeHtml(t(locale, "agentProposalHint"))}</span></div><div class="agent-change-list">${(proposal.changes ?? []).map((change, index) => `<article class="agent-change-row"><label><input type="checkbox" data-agent-change-index="${index}" checked><span>${escapeHtml(changeLabel(change, data, locale, data.localization))}</span></label><button type="button" class="secondary-button" data-agent-apply-one="${index}">${escapeHtml(t(locale, "agentApplyOne"))}</button><details class="agent-change-details"><summary>${escapeHtml(t(locale, "agentChangeDetails"))}</summary><code>${escapeHtml(formatJson(change))}</code></details></article>`).join("")}</div>${Array.isArray(proposal.assumptions) && proposal.assumptions.length ? `<p class="agent-assumptions"><strong>${escapeHtml(t(locale, "agentAssumptions"))}</strong> ${escapeHtml(proposal.assumptions.join("；"))}</p>` : ""}${Array.isArray(proposal.warnings) && proposal.warnings.length ? `<p class="agent-warnings"><strong>${escapeHtml(t(locale, "agentWarnings"))}</strong> ${escapeHtml(proposal.warnings.join("；"))}</p>` : ""}<div class="agent-proposal-actions"><button type="button" class="primary-button" data-agent-apply-selected>${escapeHtml(t(locale, "agentApplySelected"))}</button><button type="button" class="secondary-button" data-agent-apply-all>${escapeHtml(t(locale, "agentApplyAll"))}</button><button type="button" class="text-button" data-agent-reject>${escapeHtml(t(locale, "agentReject"))}</button></div></section>`
    : "";
  const apiKeyHint = state.configured ? t(locale, "agentApiKeyConfigured") : t(locale, "agentApiKeySecurity");
  const calculatedProjectionCount = context?.calculatedResults?.giftPlanning?.projections?.length ?? 0;
  const disclosureSummary = `${escapeHtml(t(locale, "agentDisclosureConfirmed"))} · ${escapeHtml(t(locale, "agentDisclosureCalculated", calculatedProjectionCount))}`;
  const planSummary = calculatedProjectionCount
    ? `<details class="agent-plan-details"><summary>${escapeHtml(t(locale, "agentPlanSummaryTitle"))} · ${escapeHtml(t(locale, "agentPlanSummaryCount", calculatedProjectionCount))}</summary>${renderPlanSummary({ context, locale, localization: data.localization })}</details>`
    : "";
  const baseUrl = String(state.draftBaseUrl || state.baseUrl || DEFAULT_AGENT_BASE_URL);
  const model = String(state.draftModel || state.model || DEFAULT_AGENT_MODEL);
  const settingsForm = `<form class="agent-settings-form" id="agent-settings-form"><label><span>${escapeHtml(t(locale, "agentBaseUrl"))}</span><input name="baseUrl" type="url" value="${escapeHtml(baseUrl)}" placeholder="https://api.example.com" autocomplete="url" required></label><label><span>${escapeHtml(t(locale, "agentModel"))}</span><input name="model" value="${escapeHtml(model)}" placeholder="model-name" autocomplete="off" required></label><label><span>${escapeHtml(t(locale, "agentApiKey"))}</span><input class="agent-api-key-input" name="apiKey" type="password" value="" placeholder="${escapeHtml(state.configured ? t(locale, "agentApiKeyReusePlaceholder") : t(locale, "agentApiKeyPlaceholder"))}" autocomplete="new-password" autocapitalize="off" spellcheck="false" inputmode="text" ${state.configured ? "" : "required"}></label><button type="button" class="secondary-button" data-agent-test>${escapeHtml(t(locale, "agentTest"))}</button><small>${escapeHtml(apiKeyHint)}</small></form>`;
  const quickQuestions = !messages.length && state.configured ? `<div class="agent-quick"><span class="agent-quick-label">${escapeHtml(t(locale, "agentQuickTitle"))}</span><div>${[1, 2, 3].map((id) => `<button type="button" class="agent-quick-button" data-agent-question="${escapeHtml(t(locale, `agentQuickQuestion${id}`))}">${escapeHtml(t(locale, `agentQuickQuestion${id}`))}</button>`).join("")}</div></div>` : "";
  const settings = `<details class="agent-settings-details"><summary>${escapeHtml(t(locale, "agentSettingsDetails"))}</summary>${settingsForm}</details>`;
  const chat = `<section class="agent-chat-window" aria-labelledby="agent-chat-title"><header class="agent-chat-header"><div class="agent-chat-identity"><span class="agent-chat-window-avatar">${renderAgentAvatar(locale)}</span><div><span class="workspace-kicker">${escapeHtml(t(locale, "agentAssistant"))}</span><h2 id="agent-chat-title">${escapeHtml(t(locale, "agentChatTitle"))}</h2></div></div></header><div class="agent-chat" aria-live="polite">${conversation}${thinking}</div><form class="agent-composer agent-chat-form" id="agent-chat-form"><label><span>${escapeHtml(t(locale, "agentMessage"))}</span><textarea name="message" rows="1" maxlength="20000" placeholder="${escapeHtml(t(locale, "agentMessagePlaceholder"))}" required></textarea></label><div class="agent-chat-actions"><button type="submit" class="primary-button agent-send-button" aria-label="${escapeHtml(state.busy ? t(locale, "agentThinking") : state.configured ? t(locale, "agentSend") : t(locale, "agentConfigureFirst"))}" title="${escapeHtml(state.busy ? t(locale, "agentThinking") : state.configured ? t(locale, "agentSend") : t(locale, "agentConfigureFirst"))}" ${state.busy || !state.configured ? "disabled" : ""}><span aria-hidden="true">↑</span><span class="sr-only">${escapeHtml(state.busy ? t(locale, "agentThinking") : state.configured ? t(locale, "agentSend") : t(locale, "agentConfigureFirst"))}</span></button></div></form>${quickQuestions}</section>`;
  return `<section class="agent-workspace" aria-labelledby="agent-chat-title">${chat}${notice}${proposalHtml}${planSummary}${settings}<details class="agent-context-details"><summary>${escapeHtml(t(locale, "agentContextTitle"))} · ${escapeHtml(contextSummary)}</summary><p class="agent-disclosure-summary">${disclosureSummary}</p><p class="agent-disclosure-scope">${escapeHtml(t(locale, "agentDisclosureScope"))}</p></details></section>`;
}
