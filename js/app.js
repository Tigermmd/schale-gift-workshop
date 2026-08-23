import { loadDashboardData } from "./data-loader.js?v=dashboard-20260824-synthesis-accounting-v112";
import { filterStudents, getCraftingMechanismSummary, readBrandStudentId, readPackageTargetStudentId, readSelectedStudentId, writeBrandStudentId, writeSelectedStudentId } from "./dashboard-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { LANGUAGE_OPTIONS, localeTag, localizedName, readStoredLocale, text as t, writeStoredLocale } from "./i18n.js?v=dashboard-20260824-synthesis-accounting-v112&ui=v113&knowledge=v3";
import { addStudentPlan, normalizePlannerState, parseStudentIdInput, readPlannerState, removeStudentPlan, setGiftBoxCount, setInventoryCount, setMainTargetStudent, setResourceAmount, writePlannerState } from "./planner-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { confirmGiftReservations, migrateLegacyAutoPostedPackageContents, postPeriodicResource, releaseGiftReservations, reserveGiftAllocation, setEquivalentGiftPoolCount, setStockResourceCount, syncPurchasedPackagesToInventory, synthesizeGoldGift, undoPeriodicResource } from "./inventory-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { applyInventoryImport, parseInventoryImport, serializeInventoryExport } from "./inventory-transfer.js?v=dashboard-20260824-synthesis-accounting-v112";
import { prepareAllocation, renderPlannerStudentOptions, renderPlannerWorkspace, renderWorkbenchTabs, wirePlannerImageFallbacks } from "./planner-view.js?v=dashboard-20260824-synthesis-accounting-v112&knowledge=v3";
import { refreshInventoryGiftRows, renderInventoryWorkspace, wireInventoryImageFallbacks } from "./inventory-view.js?v=dashboard-20260824-synthesis-accounting-v112";
import { renderResourcesWorkspace } from "./resource-view.js?v=dashboard-20260824-synthesis-accounting-v112";
import { renderPackagesWorkspace } from "./package-view.js?v=dashboard-20260824-synthesis-accounting-v112";
import { renderBrandStudentOptions, renderStudentDetails, renderStudentList, wireImageFallbacks } from "./render.js?v=dashboard-20260824-synthesis-accounting-v112";
import { buildAgentContext, applyPlanningProposal, canReuseConfiguredProxy, mergePlanningProposals, stagePlanningProposal, validatePlanningProposal } from "./agent-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { renderAgentWorkspace } from "./agent-view.js?v=dashboard-20260824-synthesis-accounting-v112&ui=v113";
import { renderKnowledgeWorkspace } from "./knowledge-view.js?v=dashboard-20260824-synthesis-accounting-v112&knowledge=v3";
import { getDefaultCnProgress, normalizeCnProgress } from "./release-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { getWorkbenchChromeState, updateInventoryFilter } from "./workbench-state.js?v=dashboard-20260824-synthesis-accounting-v112&knowledge=v3";

const elements = {
  loading: document.querySelector("#loading-state"),
  loadingTitle: document.querySelector("#loading-title"),
  loadingDescription: document.querySelector("#loading-description"),
  error: document.querySelector("#error-state"),
  errorTitle: document.querySelector("#error-title"),
  errorMessage: document.querySelector("#error-message"),
  dashboard: document.querySelector("#dashboard"),
  pageTitle: document.querySelector("#page-title"),
  topbarKicker: document.querySelector("#topbar-kicker"),
  headerMetaCopy: document.querySelector("#header-meta-copy"),
  languageSwitcher: document.querySelector("#language-switcher"),
  directoryTitle: document.querySelector("#directory-title"),
  directoryKicker: document.querySelector("#directory-kicker"),
  directoryCount: document.querySelector("#directory-count"),
  directoryToggle: document.querySelector("#directory-toggle"),
  directoryPanel: document.querySelector(".directory-panel"),
  studentSearch: document.querySelector("#student-search"),
  studentSearchLabel: document.querySelector("#student-search-label"),
  studentList: document.querySelector("#student-list"),
  detail: document.querySelector("#detail-column"),
  workbenchNav: document.querySelector("#workbench-nav"),
  brandAvatarSlots: document.querySelectorAll("[data-brand-avatar]"),
  brandAvatarDialog: document.querySelector("#brand-avatar-dialog"),
  brandAvatarDialogTitle: document.querySelector("#brand-avatar-dialog-title"),
  brandAvatarDialogKicker: document.querySelector("#brand-avatar-dialog-kicker"),
  brandAvatarSearch: document.querySelector("#brand-avatar-search"),
  brandAvatarSearchLabel: document.querySelector("#brand-avatar-search-label"),
  brandAvatarOptions: document.querySelector("#brand-avatar-options"),
  brandAvatarClose: document.querySelector("[data-brand-avatar-close]"),
};

const WORKBENCHES = new Set(["relationship", "planner", "inventory", "resources", "packages", "knowledge", "agent"]);

function readWorkbench(search) {
  const value = new URLSearchParams(search).get("view");
  return WORKBENCHES.has(value) ? value : "planner";
}

function writeWorkbench(workbench) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", workbench);
  window.history.replaceState({}, "", url);
}

function writePackageTargetStudentId(studentId) {
  const url = new URL(window.location.href);
  url.searchParams.set("packageStudent", String(studentId));
  window.history.replaceState({}, "", url);
}

function normalizePlanningDays(value, fallback) {
  const numeric = Number(value);
  return Math.min(366, Math.max(0, Number.isFinite(numeric) ? Math.floor(numeric) : fallback));
}

function commitPlanningDays(value, fallback) {
  const days = normalizePlanningDays(value, fallback);
  state.planner = writePlannerState(window.localStorage, { ...state.planner, forecastDays: days });
  renderActiveWorkbench();
}

function commitResourcePreviewDays(value, fallback) {
  const days = normalizePlanningDays(value, fallback);
  state.planner = writePlannerState(window.localStorage, { ...state.planner, resourceForecastDays: days, periodDays: days });
  renderActiveWorkbench();
}

const state = {
  selectedId: "",
  query: "",
  giftFilter: "preferred",
  locale: readStoredLocale(window.localStorage),
  workbench: readWorkbench(window.location.search),
  planner: readPlannerState(window.localStorage),
  inventoryFilters: { query: "", rarity: "all", exp: "all", onlyOwned: true },
  inventoryNotice: "",
  packageTargetStudentId: null,
  brandStudentId: "10059",
  brandAvatarQuery: "",
  plannerNotice: "",
  agent: { baseUrl: "", model: "", configuredBaseUrl: "", configuredModel: "", draftBaseUrl: "", draftModel: "", configured: false, messages: [], proposal: null, workingChanges: [], workingPlannerState: null, busy: false, notice: "" },
};

let data;

function agentPlannerState() {
  return state.agent.workingPlannerState ? normalizePlannerState(state.agent.workingPlannerState) : state.planner;
}

function discardAgentWorkingCopy() {
  state.agent = { ...state.agent, workingChanges: [], workingPlannerState: null, proposal: null };
}

function renderLanguageSwitcher() {
  elements.languageSwitcher.innerHTML = LANGUAGE_OPTIONS.map((option) => `
    <button type="button" class="language-option ${state.locale === option.id ? "is-active" : ""}" data-locale="${option.id}" aria-pressed="${state.locale === option.id}">${option.label}</button>
  `).join("");
  elements.languageSwitcher.setAttribute("aria-label", t(state.locale, "languageLabel"));
}

function brandStudent() {
  return data?.studentById.get(String(state.brandStudentId));
}

function renderBrandAvatar() {
  const student = brandStudent();
  if (!student) return;
  const name = localizedName(student, "student", state.locale, data.localization);
  const entry = data.assetManifest?.entries?.[`student:${student.student_id}`];
  for (const slot of elements.brandAvatarSlots) {
    slot.replaceChildren();
    const image = document.createElement("img");
    const fallback = document.createElement("span");
    image.alt = name;
    image.loading = "eager";
    image.addEventListener("load", () => { fallback.hidden = true; });
    image.addEventListener("error", () => {
      if (image.dataset.remoteTried !== "true" && (entry?.remote || !image.dataset.fallback)) {
        image.dataset.remoteTried = "true";
        image.src = entry?.remote ?? `https://schaledb.com/images/student/icon/${student.student_id}.webp`;
        return;
      }
      image.hidden = true;
      fallback.hidden = false;
    });
    fallback.className = "brand-avatar-fallback";
    fallback.textContent = name.slice(0, 1);
    fallback.hidden = true;
    image.src = entry?.local ?? `./assets/students/${student.student_id}.webp`;
    slot.append(image, fallback);
    if (slot.matches("button")) {
      slot.setAttribute("aria-label", t(state.locale, "brandAvatarButton", name));
      slot.setAttribute("title", t(state.locale, "brandAvatarButton", name));
    }
  }
}

function renderBrandAvatarOptions() {
  if (!data || !elements.brandAvatarOptions) return;
  const students = filterStudents(data.students, state.brandAvatarQuery, data.localization);
  elements.brandAvatarOptions.innerHTML = renderBrandStudentOptions({
    students,
    selectedId: state.brandStudentId,
    manifest: data.assetManifest,
    locale: state.locale,
    localization: data.localization,
  });
  wireImageFallbacks(elements.brandAvatarOptions);
}

function openBrandAvatarDialog() {
  state.brandAvatarQuery = "";
  if (elements.brandAvatarSearch) elements.brandAvatarSearch.value = "";
  renderBrandAvatarOptions();
  if (typeof elements.brandAvatarDialog?.showModal === "function") {
    elements.brandAvatarDialog.showModal();
    elements.brandAvatarSearch?.focus({ preventScroll: true });
  }
}

function applyLocaleChrome() {
  document.documentElement.lang = localeTag(state.locale);
  document.title = t(state.locale, "documentTitle");
  elements.loadingTitle.textContent = t(state.locale, "loadingTitle");
  elements.loadingDescription.textContent = t(state.locale, "loadingDescription");
  elements.errorTitle.textContent = t(state.locale, "errorTitle");
  elements.topbarKicker.textContent = t(state.locale, "headerKicker");
  elements.pageTitle.textContent = t(state.locale, getWorkbenchChromeState(state.workbench).titleKey);
  elements.headerMetaCopy.textContent = t(state.locale, "headerMeta", data?.students.length ?? "—");
  elements.directoryTitle.textContent = t(state.locale, "studentDirectory");
  elements.directoryKicker.textContent = t(state.locale, "studentIndex");
  elements.studentSearch.placeholder = t(state.locale, "searchPlaceholder");
  elements.studentSearchLabel.textContent = t(state.locale, "studentDirectory");
  elements.studentList.setAttribute("aria-label", t(state.locale, "searchAria"));
  if (elements.brandAvatarDialogTitle) elements.brandAvatarDialogTitle.textContent = t(state.locale, "brandAvatarDialogTitle");
  if (elements.brandAvatarDialogKicker) elements.brandAvatarDialogKicker.textContent = t(state.locale, "brandAvatarLabel");
  if (elements.brandAvatarSearch) elements.brandAvatarSearch.placeholder = t(state.locale, "brandAvatarSearch");
  if (elements.brandAvatarSearchLabel) elements.brandAvatarSearchLabel.textContent = t(state.locale, "brandAvatarSearch");
  if (elements.brandAvatarOptions) elements.brandAvatarOptions.setAttribute("aria-label", t(state.locale, "brandAvatarDialogTitle"));
  if (elements.brandAvatarClose) elements.brandAvatarClose.setAttribute("aria-label", t(state.locale, "brandAvatarClose"));
  renderLanguageSwitcher();
  if (data) {
    renderBrandAvatar();
    if (elements.brandAvatarDialog?.open) renderBrandAvatarOptions();
  }
}

function showError(error) {
  elements.loading.hidden = true;
  elements.dashboard.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent = error?.message || t(state.locale, "errorOpen");
}

function selectedStudent() {
  return data.studentById.get(state.selectedId);
}

function renderDirectory() {
  const filtered = filterStudents(data.students, state.query, data.localization);
  elements.directoryCount.textContent = `${filtered.length}/${data.students.length}`;
  renderStudentList({
    container: elements.studentList,
    students: filtered,
    selectedId: state.selectedId,
    manifest: data.assetManifest,
    locale: state.locale,
    localization: data.localization,
  });
}

function renderDetails() {
  const student = selectedStudent();
  const crafting = data.craftingById.get(state.selectedId);
  const mechanism = getCraftingMechanismSummary(data.snapshots.crafting, crafting);
  elements.detail.innerHTML = renderStudentDetails({
    student,
    crafting,
    craftingSnapshot: data.snapshots.crafting,
    mechanism,
    giftsById: data.giftById,
    manifest: data.assetManifest,
    giftFilter: state.giftFilter,
    locale: state.locale,
    localization: data.localization,
  });
  const avatarSlot = elements.detail.querySelector("[data-student-avatar]");
  if (avatarSlot && student) {
    const localizedStudentName = localizedName(student, "student", state.locale, data.localization);
    const fallbackName = localizedStudentName.slice(0, 1);
    avatarSlot.innerHTML = `<div class="hero-avatar">${fallbackName}</div>`;
    const heroImage = document.createElement("img");
    const collectionEntry = data.assetManifest?.entries?.[`student-collection:${student.student_id}`];
    const studentEntry = data.assetManifest?.entries?.[`student:${student.student_id}`];
    heroImage.src = collectionEntry?.local
      ?? studentEntry?.local
      ?? `./assets/students/${student.student_id}.webp`;
    heroImage.dataset.fallback = collectionEntry?.remote
      ?? studentEntry?.remote
      ?? (student.future_only === true
        ? `https://schaledb.com/images/student/collection/${student.student_id}.webp`
        : `https://schaledb.com/images/student/icon/${student.student_id}.webp`);
    heroImage.alt = localizedStudentName;
    heroImage.loading = "eager";
    avatarSlot.querySelector(".hero-avatar").replaceWith(heroImage);
  }
  wireImageFallbacks(elements.detail);
}

function focusResourceControl(resourceId) {
  if (!resourceId) return;
  const amountControls = [...elements.detail.querySelectorAll("[data-resource-amount]")];
  const floorControls = [...elements.detail.querySelectorAll("[data-resource-floor]")];
  const control = amountControls.find((candidate) => candidate.dataset.resourceAmount === resourceId)
    ?? floorControls.find((candidate) => candidate.dataset.resourceFloor === resourceId);
  control?.focus({ preventScroll: true });
}

function renderActiveWorkbench({ resetScroll = false, focusResourceId = null } = {}) {
  if (!data) return;
  const chrome = getWorkbenchChromeState(state.workbench);
  elements.dashboard.dataset.workbench = state.workbench;
  elements.dashboard.classList.toggle("directory-hidden", !chrome.showStudentDirectory);
  elements.directoryPanel?.setAttribute("aria-hidden", String(!chrome.showStudentDirectory));
  elements.pageTitle.textContent = t(state.locale, chrome.titleKey);
  elements.workbenchNav.innerHTML = renderWorkbenchTabs({ locale: state.locale, active: state.workbench, data });
  scrollActiveWorkbenchIntoView();
  updateWorkbenchNavigationCue();
  if (resetScroll) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    elements.detail.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  }
  if (state.workbench === "relationship") {
    renderDetails();
    return;
  }
  if (state.workbench === "planner") {
    elements.detail.innerHTML = renderPlannerWorkspace({ data, state: state.planner, locale: state.locale, localization: data.localization, notice: state.plannerNotice });
    wirePlannerImageFallbacks(elements.detail);
    return;
  }
  if (state.workbench === "inventory") {
    elements.detail.innerHTML = renderInventoryWorkspace({
      data: { ...data, giftBoxes: data.snapshots.giftBoxes?.boxes ?? [], unlimitedAssaultRewards: data.snapshots.unlimitedAssaultRewards },
      state: state.planner,
      locale: state.locale,
      localization: data.localization,
      filters: state.inventoryFilters,
      notice: state.inventoryNotice,
    });
    wireInventoryImageFallbacks(elements.detail);
    return;
  }
  if (state.workbench === "resources") {
    elements.detail.innerHTML = renderResourcesWorkspace({
      data: { ...data, unlimitedAssaultRewards: data.snapshots.unlimitedAssaultRewards },
      state: state.planner,
      locale: state.locale,
      localization: data.localization,
      evidence: data.snapshots.resourceEvidence,
      openResourceId: focusResourceId,
    });
    if (focusResourceId) requestAnimationFrame(() => focusResourceControl(focusResourceId));
    return;
  }
  if (state.workbench === "agent") {
    const context = buildAgentContext(agentPlannerState(), { workbench: state.workbench }, data, {
      conversation: state.agent.messages,
      locale: state.locale,
    });
    elements.detail.innerHTML = renderAgentWorkspace({ data, state: state.agent, locale: state.locale, context });
    return;
  }
  if (state.workbench === "packages") elements.detail.innerHTML = renderPackagesWorkspace({
    state: state.planner,
    selectedStudentId: state.packageTargetStudentId,
    locale: state.locale,
    localization: data.localization,
    data: { ...data, giftBoxes: data.snapshots.giftBoxes?.boxes ?? [] },
  });
  if (state.workbench === "knowledge") elements.detail.innerHTML = renderKnowledgeWorkspace({
    data,
    locale: state.locale,
    localization: data.localization,
  });
}

function scrollActiveWorkbenchIntoView() {
  const active = elements.workbenchNav.querySelector("[data-workbench].is-active");
  if (!active || window.innerWidth > 900) return;
  const target = active.offsetLeft - (elements.workbenchNav.clientWidth - active.offsetWidth) / 2;
  const maxScroll = Math.max(0, elements.workbenchNav.scrollWidth - elements.workbenchNav.clientWidth);
  elements.workbenchNav.scrollLeft = Math.max(0, Math.min(maxScroll, target));
}

function updateWorkbenchNavigationCue() {
  const nav = elements.workbenchNav;
  const hasOverflow = nav.scrollWidth > nav.clientWidth + 1;
  const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2;
  nav.dataset.overflowCue = String(hasOverflow && !atEnd);
}

function agentSettings(form) {
  const values = new FormData(form);
  return { baseUrl: String(values.get("baseUrl") || "").trim(), model: String(values.get("model") || "").trim(), apiKey: String(values.get("apiKey") || "") };
}

async function postAgent(path, payload) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

async function refreshAgentProxyStatus() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.configured === true) {
      const baseUrl = String(body.baseUrl || "");
      const model = String(body.model || "");
      state.agent = { ...state.agent, configured: true, baseUrl, model, configuredBaseUrl: baseUrl, configuredModel: model, draftBaseUrl: baseUrl, draftModel: model };
    }
  } catch {
    // The dashboard can still run as a static page without the optional Harness.
  }
}

async function testAgentConnection() {
  const form = elements.detail.querySelector("#agent-settings-form");
  if (!form) return;
  const settings = agentSettings(form);
  state.agent = { ...state.agent, draftBaseUrl: settings.baseUrl, draftModel: settings.model };
  const canReuse = canReuseConfiguredProxy({ configured: state.agent.configured, configuredBaseUrl: state.agent.configuredBaseUrl || state.agent.baseUrl, configuredModel: state.agent.configuredModel || state.agent.model, baseUrl: settings.baseUrl, model: settings.model });
  if (!settings.baseUrl || !settings.model || (!settings.apiKey && !canReuse)) { state.agent.notice = t(state.locale, "agentNeedSettings"); renderActiveWorkbench(); return; }
  try {
    if (settings.apiKey) await postAgent("/api/config", settings);
    await postAgent("/api/config/test", {});
    state.agent = { ...state.agent, baseUrl: settings.baseUrl, model: settings.model, configuredBaseUrl: settings.baseUrl, configuredModel: settings.model, draftBaseUrl: settings.baseUrl, draftModel: settings.model, configured: true, notice: "" };
  } catch (error) { state.agent.notice = `${t(state.locale, "agentRequestFailed")}${error.message}`; }
  renderActiveWorkbench();
}

function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function updateAgentActivity(activityKey) {
  state.agent = { ...state.agent, activityKey };
  renderActiveWorkbench();
}

async function sendAgentMessage(form) {
  const settingsForm = elements.detail.querySelector("#agent-settings-form");
  const settings = settingsForm ? agentSettings(settingsForm) : null;
  const values = new FormData(form);
  const message = String(values.get("message") || "").trim();
  state.agent = { ...state.agent, draftBaseUrl: settings?.baseUrl || state.agent.draftBaseUrl, draftModel: settings?.model || state.agent.draftModel };
  const sameConfiguredProxy = canReuseConfiguredProxy({ configured: state.agent.configured, configuredBaseUrl: state.agent.configuredBaseUrl || state.agent.baseUrl, configuredModel: state.agent.configuredModel || state.agent.model, baseUrl: settings?.baseUrl, model: settings?.model });
  if (!settings?.baseUrl || !settings?.model || (!settings?.apiKey && !sameConfiguredProxy) || !message) { state.agent.notice = t(state.locale, "agentNeedSettings"); renderActiveWorkbench(); return; }
  const workingPlannerState = agentPlannerState();
  const nextMessages = [...state.agent.messages, { role: "user", content: message }];
  state.agent = { ...state.agent, draftBaseUrl: settings.baseUrl, draftModel: settings.model, configured: true, messages: nextMessages, busy: true, activityKey: "agentActivityPreparing", notice: "" };
  renderActiveWorkbench();
  let context;
  try {
    await yieldToBrowser();
    updateAgentActivity("agentActivityGifts");
    await yieldToBrowser();
    updateAgentActivity("agentActivityResources");
    context = buildAgentContext(workingPlannerState, { workbench: state.workbench }, data, {
      message,
      conversation: state.agent.messages.slice(0, -1),
      locale: state.locale,
    });
    await yieldToBrowser();
    updateAgentActivity("agentActivityRequest");
    if (settings.apiKey) {
      await postAgent("/api/config", settings);
      state.agent = { ...state.agent, baseUrl: settings.baseUrl, model: settings.model, configuredBaseUrl: settings.baseUrl, configuredModel: settings.model, draftBaseUrl: settings.baseUrl, draftModel: settings.model };
    }
    const result = await postAgent("/api/chat", { message, context, conversation: nextMessages });
    updateAgentActivity("agentActivityReview");
    await yieldToBrowser();
    let proposal = null;
    let nextWorkingPlannerState = workingPlannerState;
    let nextWorkingChanges = Array.isArray(state.agent.workingChanges) ? state.agent.workingChanges : [];
    let nextProposal = state.agent.proposal;
    if (result.proposal) {
      const validation = validatePlanningProposal(result.proposal, { state: workingPlannerState, data });
      if (validation.ok) {
        const staged = stagePlanningProposal(workingPlannerState, result.proposal, { data });
        if (staged.ok) {
          proposal = mergePlanningProposals(state.agent.proposal, result.proposal);
          nextProposal = proposal;
          nextWorkingChanges = proposal.changes;
          nextWorkingPlannerState = staged.state;
        } else {
          state.agent.notice = `${t(state.locale, "agentInvalidProposal")} ${staged.errors.join("; ")}`;
        }
      } else {
        state.agent.notice = `${t(state.locale, "agentInvalidProposal")} ${validation.errors.join("; ")}`;
      }
    }
    state.agent = {
      ...state.agent,
      messages: [...nextMessages, {
        role: "assistant",
        content: String(result.answer || ""),
        questions: Array.isArray(result.questions) ? result.questions : [],
      }],
      proposal: result.needs_user_input === true ? nextProposal : (proposal ?? nextProposal),
      workingChanges: nextWorkingChanges,
      workingPlannerState: nextWorkingPlannerState,
      busy: false,
      activityKey: "",
    };
  } catch (error) { state.agent = { ...state.agent, busy: false, activityKey: "", notice: `${t(state.locale, "agentRequestFailed")}${error.message}` }; }
  renderActiveWorkbench();
}

function applyAgentChanges(indices) {
  const proposal = state.agent.proposal;
  if (!proposal) return;
  const changes = proposal.changes.filter((_, index) => indices.includes(index));
  const result = applyPlanningProposal(state.planner, { ...proposal, changes }, { data });
  if (!result.ok) { state.agent.notice = t(state.locale, "agentInvalidProposal"); renderActiveWorkbench(); return; }
  state.planner = writePlannerState(window.localStorage, result.state);
  state.agent = { ...state.agent, proposal: null, workingChanges: [], workingPlannerState: null, notice: t(state.locale, "agentApplied") };
  renderActiveWorkbench();
}

function downloadInventoryJson() {
  const content = serializeInventoryExport(state.planner);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `schale-inventory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  state.inventoryNotice = "inventoryNoticeExported";
  renderActiveWorkbench();
}

async function importInventoryFile(file) {
  try {
    const result = parseInventoryImport(await file.text(), {
      giftIds: new Set(data.gifts.map((gift) => String(gift.id))),
      giftBoxIds: new Set((data.giftBoxes ?? []).map((box) => String(box.id))),
    });
    if (!result.ok) {
      state.inventoryNotice = "inventoryNoticeImportFailed";
      renderActiveWorkbench();
      return;
    }
    const baseForImport = migrateLegacyAutoPostedPackageContents(state.planner, data.snapshots.packages?.packages ?? []);
    const importedState = applyInventoryImport(baseForImport, result.state, { preserveStockResources: result.source === "arona.icu", preservePackageInventoryPostings: true });
    state.planner = writePlannerState(window.localStorage, importedState);
    state.planner = writePlannerState(window.localStorage, syncPurchasedPackagesToInventory(
      migrateLegacyAutoPostedPackageContents(state.planner, data.snapshots.packages?.packages ?? []),
      data.snapshots.packages?.packages ?? [],
    ));
    state.planner = writePlannerState(window.localStorage, { ...state.planner, cnProgress: state.planner.cnProgress
      ? normalizeCnProgress(state.planner.cnProgress, data.releaseTimeline, data.plannerStudents)
      : getDefaultCnProgress(data.releaseTimeline, data.plannerStudents) });
    const aronaImport = result.source === "arona.icu";
    state.inventoryNotice = result.warnings.length
      ? { key: aronaImport ? "inventoryNoticeImportedAronaWarnings" : "inventoryNoticeImportedWarnings", args: [result.warnings.length] }
      : aronaImport ? "inventoryNoticeImportedArona" : "inventoryNoticeImported";
    renderActiveWorkbench();
  } catch {
    state.inventoryNotice = "inventoryNoticeImportFailed";
    renderActiveWorkbench();
  }
}

async function bootstrap() {
  applyLocaleChrome();
  try {
    data = await loadDashboardData();
    if (state.workbench === "agent") await refreshAgentProxyStatus();
    state.planner = writePlannerState(window.localStorage, syncPurchasedPackagesToInventory(
      migrateLegacyAutoPostedPackageContents(state.planner, data.snapshots.packages?.packages ?? []),
      data.snapshots.packages?.packages ?? [],
    ));
    state.planner = writePlannerState(window.localStorage, { ...state.planner, cnProgress: state.planner.cnProgress
      ? normalizeCnProgress(state.planner.cnProgress, data.releaseTimeline, data.plannerStudents)
      : getDefaultCnProgress(data.releaseTimeline, data.plannerStudents) });
    const requestedStudentId = new URLSearchParams(window.location.search).get("student");
    state.packageTargetStudentId = readPackageTargetStudentId(
      window.location.search,
      data.plannerStudents,
      state.planner.mainTargetStudentId,
    );
    state.selectedId = requestedStudentId
      ? readSelectedStudentId(window.location.search, data.students)
      : state.planner.mainTargetStudentId && data.studentById.has(String(state.planner.mainTargetStudentId))
        ? String(state.planner.mainTargetStudentId)
        : readSelectedStudentId(window.location.search, data.students);
    state.brandStudentId = readBrandStudentId(window.localStorage, data.students);
    if (state.workbench === "relationship" && window.matchMedia("(max-width: 1100px)").matches) setDirectoryCollapsed(true);
    applyLocaleChrome();
    renderDirectory();
    renderActiveWorkbench();
    elements.loading.hidden = true;
    elements.dashboard.hidden = false;
    scrollActiveWorkbenchIntoView();
    updateWorkbenchNavigationCue();
    document.body.dataset.dashboardReady = "true";
  } catch (error) {
    showError(error instanceof Error ? error : new Error(String(error)));
  }
}

elements.studentSearch.addEventListener("input", () => {
  state.query = elements.studentSearch.value;
  if (!filterStudents(data.students, state.query, data.localization).length) state.selectedId = "";
  renderDirectory();
  if (state.workbench === "relationship") renderDetails();
});

elements.studentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-student-id]");
  if (!button) return;
  state.selectedId = button.dataset.studentId;
  writeSelectedStudentId(state.selectedId);
  renderDirectory();
  if (state.workbench === "relationship") {
    renderDetails();
    elements.detail.querySelector("#student-title")?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 820px)").matches) {
      setDirectoryCollapsed(true);
      window.setTimeout(() => elements.detail.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
    }
  }
});

elements.brandAvatarSlots.forEach((slot) => {
  if (!slot.matches("button")) return;
  slot.addEventListener("click", openBrandAvatarDialog);
});

elements.brandAvatarClose?.addEventListener("click", () => elements.brandAvatarDialog?.close());

elements.brandAvatarSearch?.addEventListener("input", () => {
  state.brandAvatarQuery = elements.brandAvatarSearch.value;
  renderBrandAvatarOptions();
});

elements.brandAvatarOptions?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-brand-student-id]");
  if (!option) return;
  state.brandStudentId = writeBrandStudentId(window.localStorage, option.dataset.brandStudentId, data.students);
  state.brandAvatarQuery = "";
  renderBrandAvatar();
  elements.brandAvatarDialog?.close();
});

function setDirectoryCollapsed(collapsed) {
  elements.dashboard.classList.toggle("directory-collapsed", collapsed);
  elements.directoryToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (elements.directoryToggle) elements.directoryToggle.textContent = collapsed ? t(state.locale, "showStudentDirectory") : t(state.locale, "hideStudentDirectory");
}

function rerenderInventoryFilter(input) {
  const key = input.dataset.inventoryFilter;
  state.inventoryFilters = updateInventoryFilter(
    state.inventoryFilters,
    key,
    input.type === "checkbox" ? input.checked : input.value,
  );
  if (state.workbench !== "inventory") return;
  refreshInventoryGiftRows({
    container: elements.detail,
    data: { ...data, giftBoxes: data.snapshots.giftBoxes?.boxes ?? [] },
    state: state.planner,
    locale: state.locale,
    localization: data.localization,
    filters: state.inventoryFilters,
  });
}

const INVENTORY_CONTROL_ATTRIBUTES = [
  "data-inventory-gift",
  "data-gift-box-count",
  "data-stock-resource",
  "data-equivalent-pool",
];

function inventoryControlDescriptor(input) {
  const attribute = INVENTORY_CONTROL_ATTRIBUTES.find((name) => input?.hasAttribute(name));
  return attribute ? { attribute, value: input.getAttribute(attribute) } : null;
}

function captureInventoryView(input) {
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    detailScrollLeft: elements.detail.scrollLeft,
    detailScrollTop: elements.detail.scrollTop,
    details: [...elements.detail.querySelectorAll("details")].map((detail) => detail.open),
    control: inventoryControlDescriptor(input),
  };
}

function restoreInventoryView(snapshot) {
  const restore = () => {
    [...elements.detail.querySelectorAll("details")].forEach((detail, index) => {
      if (snapshot.details[index] !== undefined) detail.open = snapshot.details[index];
    });
    window.scrollTo({ top: snapshot.scrollY, left: snapshot.scrollX, behavior: "auto" });
    elements.detail.scrollTo?.({
      top: snapshot.detailScrollTop,
      left: snapshot.detailScrollLeft,
      behavior: "auto",
    });
    if (snapshot.control) {
      const control = [...elements.detail.querySelectorAll("input")].find((candidate) =>
        candidate.hasAttribute(snapshot.control.attribute)
        && candidate.getAttribute(snapshot.control.attribute) === snapshot.control.value
      );
      control?.focus({ preventScroll: true });
    }
  };
  restore();
  window.requestAnimationFrame(restore);
}

function rerenderInventoryAfterEdit(input) {
  const snapshot = captureInventoryView(input);
  renderActiveWorkbench();
  restoreInventoryView(snapshot);
}

elements.directoryToggle?.addEventListener("click", () => {
  setDirectoryCollapsed(!elements.dashboard.classList.contains("directory-collapsed"));
});

elements.workbenchNav.addEventListener("scroll", updateWorkbenchNavigationCue, { passive: true });

elements.detail.addEventListener("click", (event) => {
  const openPlannerForm = event.target.closest("[data-planner-open-form]");
  if (openPlannerForm) {
    const formDetails = elements.detail.querySelector(".planner-edit-details");
    formDetails?.setAttribute("open", "");
    openPlannerForm.setAttribute("aria-expanded", "true");
    window.setTimeout(() => elements.detail.querySelector("[data-planner-student-search]")?.focus(), 0);
    return;
  }
  const goPlanner = event.target.closest("[data-go-planner]");
  if (goPlanner) {
    discardAgentWorkingCopy();
    state.workbench = "planner";
    writeWorkbench(state.workbench);
    renderActiveWorkbench();
    return;
  }
  const openAgentSettings = event.target.closest("[data-agent-open-settings]");
  if (openAgentSettings) {
    const settingsDetails = elements.detail.querySelector(".agent-settings-details");
    settingsDetails?.setAttribute("open", "");
    window.setTimeout(() => elements.detail.querySelector("#agent-settings-form input[name=apiKey]")?.focus(), 0);
    return;
  }
  const quickQuestion = event.target.closest("[data-agent-question]");
  if (quickQuestion) {
    const message = elements.detail.querySelector("#agent-chat-form textarea[name=message]");
    if (message) {
      message.value = quickQuestion.dataset.agentQuestion || "";
      message.focus();
    }
    return;
  }
  if (event.target.closest("[data-agent-test]")) { void testAgentConnection(); return; }
  const applyOne = event.target.closest("[data-agent-apply-one]");
  if (applyOne) { applyAgentChanges([Number(applyOne.dataset.agentApplyOne)]); return; }
  if (event.target.closest("[data-agent-apply-selected]")) {
    const indices = [...elements.detail.querySelectorAll("[data-agent-change-index]:checked")].map((input) => Number(input.dataset.agentChangeIndex));
    applyAgentChanges(indices);
    return;
  }
  if (event.target.closest("[data-agent-apply-all]")) { applyAgentChanges((state.agent.proposal?.changes ?? []).map((_, index) => index)); return; }
  if (event.target.closest("[data-agent-reject]")) { state.agent = { ...state.agent, proposal: null, workingChanges: [], workingPlannerState: null, notice: t(state.locale, "agentRejected") }; renderActiveWorkbench(); return; }
  if (event.target.closest("[data-inventory-show-all]")) {
    state.inventoryFilters = { ...state.inventoryFilters, onlyOwned: false };
    renderActiveWorkbench();
    return;
  }
  const plannerStudentOption = event.target.closest("[data-planner-student-option]");
  if (plannerStudentOption) {
    const form = plannerStudentOption.closest("#planner-student-form");
    const searchInput = form?.querySelector("[data-planner-student-search]");
    const hiddenInput = form?.querySelector("[name=studentId]");
    const options = form?.querySelector("[data-planner-student-options]");
    if (searchInput && hiddenInput && options) {
      searchInput.value = plannerStudentOption.dataset.plannerStudentLabel ?? "";
      hiddenInput.value = plannerStudentOption.dataset.plannerStudentOption ?? "";
      const existingPlan = state.planner.students.find((plan) => String(plan.studentId) === String(hiddenInput.value))
        ?? state.planner.studentDrafts?.[String(hiddenInput.value)];
      for (const [name, fallback] of [["currentLevel", 1], ["currentProgress", 0], ["targetLevel", 50]]) {
        const input = form.querySelector(`[name="${name}"]`);
        if (input) input.value = String(existingPlan?.[name] ?? fallback);
      }
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.setAttribute("aria-activedescendant", "");
      options.hidden = true;
    }
    return;
  }
  if (event.target.closest("[data-export-inventory]")) {
    downloadInventoryJson();
    return;
  }
  if (event.target.closest("[data-import-inventory]")) {
    elements.detail.querySelector("#inventory-import-file")?.click();
    return;
  }
  const filterButton = event.target.closest("[data-gift-filter]");
  if (filterButton) {
    state.giftFilter = filterButton.dataset.giftFilter;
    renderDetails();
    return;
  }
  const removePlan = event.target.closest("[data-remove-plan]");
  if (removePlan) {
    state.planner = writePlannerState(window.localStorage, removeStudentPlan(state.planner, removePlan.dataset.removePlan));
    renderActiveWorkbench();
    return;
  }
  const setMainTarget = event.target.closest("[data-set-main-target]");
  if (setMainTarget) {
    state.planner = writePlannerState(window.localStorage, setMainTargetStudent(state.planner, setMainTarget.dataset.setMainTarget));
    renderActiveWorkbench();
    return;
  }
  // Package efficiency is read-only. Purchase facts remain in packagePlans;
  // this page intentionally has no purchase controls.
  const postResource = event.target.closest("[data-post-resource]");
  if (postResource) {
    state.planner = writePlannerState(window.localStorage, postPeriodicResource(state.planner, postResource.dataset.postResource, {
      periodDays: state.planner.resourceForecastDays,
      rewardSnapshot: data.snapshots.unlimitedAssaultRewards,
    }));
    renderActiveWorkbench();
    return;
  }
  const undoPosting = event.target.closest("[data-undo-posting]");
  if (undoPosting) {
    state.planner = writePlannerState(window.localStorage, undoPeriodicResource(state.planner, undoPosting.dataset.undoPosting));
    renderActiveWorkbench();
    return;
  }
  if (event.target.closest("[data-release-reservations]")) {
    state.planner = writePlannerState(window.localStorage, releaseGiftReservations(state.planner));
    state.inventoryNotice = "inventoryNoticeReleased";
    renderActiveWorkbench();
    return;
  }
  if (event.target.closest("[data-confirm-reservations]")) {
    const confirmed = confirmGiftReservations(state.planner);
    state.planner = writePlannerState(window.localStorage, confirmed);
    state.inventoryNotice = confirmed.synthesisReservations?.length ? "inventoryNoticeConfirmedPartial" : "inventoryNoticeConfirmed";
    renderActiveWorkbench();
    return;
  }
  if (event.target.closest("[data-reserve-allocation]")) {
    const { allocation } = prepareAllocation(data, state.planner, data.snapshots.thresholds);
    state.planner = writePlannerState(window.localStorage, reserveGiftAllocation(state.planner, allocation.reservationAssignments ?? allocation.assignments, { synthesisGiftIds: allocation.synthesisGiftIds ?? [] }));
    state.plannerNotice = "plannerReservationPosted";
    renderActiveWorkbench();
    return;
  }
});

elements.detail.addEventListener("keydown", (event) => {
  const searchInput = event.target.closest("[data-planner-student-search]");
  if (!searchInput) return;
  const options = searchInput.closest(".planner-student-combobox")?.querySelector("[data-planner-student-options]");
  const optionButtons = options ? [...options.querySelectorAll("[data-planner-student-option]")] : [];
  if (!options || !optionButtons.length) {
    if (event.key === "Escape") searchInput.setAttribute("aria-expanded", "false");
    return;
  }
  const activeId = searchInput.getAttribute("aria-activedescendant");
  let activeIndex = optionButtons.findIndex((button) => button.id === activeId);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    options.hidden = false;
    activeIndex = event.key === "ArrowDown"
      ? Math.min(optionButtons.length - 1, activeIndex + 1)
      : Math.max(0, activeIndex <= 0 ? 0 : activeIndex - 1);
    const active = optionButtons[activeIndex];
    optionButtons.forEach((button, index) => button.setAttribute("aria-selected", String(index === activeIndex)));
    searchInput.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
    return;
  }
  if (event.key === "Enter" && !options.hidden) {
    event.preventDefault();
    (optionButtons[activeIndex >= 0 ? activeIndex : 0]).click();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    options.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.setAttribute("aria-activedescendant", "");
  }
});

elements.detail.addEventListener("input", (event) => {
  const plannerStudentSearch = event.target.closest("[data-planner-student-search]");
  if (plannerStudentSearch) {
    const form = plannerStudentSearch.closest("#planner-student-form");
    const hiddenInput = form?.querySelector("[name=studentId]");
    const options = form?.querySelector("[data-planner-student-options]");
    if (hiddenInput && options) {
      hiddenInput.value = "";
      options.innerHTML = renderPlannerStudentOptions({
        students: data.plannerStudents ?? data.students,
        query: plannerStudentSearch.value,
        locale: state.locale,
        localization: data.localization,
      });
      options.hidden = false;
      plannerStudentSearch.setAttribute("aria-expanded", "true");
      plannerStudentSearch.setAttribute("aria-activedescendant", "");
    }
    return;
  }
  const resourceInput = event.target.closest("[data-resource-amount]");
  if (resourceInput) {
    state.planner = writePlannerState(window.localStorage, setResourceAmount(state.planner, resourceInput.dataset.resourceAmount, resourceInput.value));
    return;
  }
  const plannerInventory = event.target.closest("[data-planner-inventory]");
  if (plannerInventory) {
    state.planner = writePlannerState(window.localStorage, setInventoryCount(state.planner, plannerInventory.dataset.plannerInventory, plannerInventory.value));
    return;
  }
  const inventoryFilter = event.target.closest("[data-inventory-filter]");
  if (inventoryFilter) {
    rerenderInventoryFilter(inventoryFilter);
    return;
  }
  const inventoryGift = event.target.closest("[data-inventory-gift]");
  if (inventoryGift) {
    state.planner = writePlannerState(window.localStorage, setInventoryCount(state.planner, inventoryGift.dataset.inventoryGift, inventoryGift.value));
    return;
  }
  const inventoryGiftBox = event.target.closest("[data-gift-box-count]");
  if (inventoryGiftBox) {
    state.planner = writePlannerState(window.localStorage, setGiftBoxCount(state.planner, inventoryGiftBox.dataset.giftBoxCount, inventoryGiftBox.value));
    return;
  }
  const stockInput = event.target.closest("[data-stock-resource]");
  if (stockInput) {
    state.planner = writePlannerState(window.localStorage, setStockResourceCount(state.planner, stockInput.dataset.stockResource, stockInput.value));
    return;
  }
  const poolInput = event.target.closest("[data-equivalent-pool]");
  if (poolInput) {
    state.planner = writePlannerState(window.localStorage, setEquivalentGiftPoolCount(state.planner, poolInput.dataset.equivalentPool, poolInput.value));
  }
});

elements.workbenchNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-workbench]");
  if (!button || !WORKBENCHES.has(button.dataset.workbench)) return;
  if (state.workbench === "agent" && button.dataset.workbench !== "agent") discardAgentWorkingCopy();
  state.workbench = button.dataset.workbench;
  writeWorkbench(state.workbench);
  if (state.workbench === "relationship" && window.matchMedia("(max-width: 820px)").matches) setDirectoryCollapsed(true);
  renderActiveWorkbench({ resetScroll: true });
});

elements.workbenchNav.addEventListener("change", (event) => {
  const select = event.target.closest("[data-workbench-select]");
  if (!select || !WORKBENCHES.has(select.value)) return;
  if (state.workbench === "agent" && select.value !== "agent") discardAgentWorkingCopy();
  state.workbench = select.value;
  writeWorkbench(state.workbench);
  if (state.workbench === "relationship" && window.matchMedia("(max-width: 820px)").matches) setDirectoryCollapsed(true);
  renderActiveWorkbench({ resetScroll: true });
});

elements.detail.addEventListener("input", (event) => {
  const agentInput = event.target.closest("#agent-settings-form input[name=baseUrl], #agent-settings-form input[name=model]");
  if (!agentInput) return;
  state.agent = {
    ...state.agent,
    draftBaseUrl: agentInput.name === "baseUrl" ? agentInput.value : state.agent.draftBaseUrl,
    draftModel: agentInput.name === "model" ? agentInput.value : state.agent.draftModel,
  };
});

elements.detail.addEventListener("change", (event) => {
  const packageTarget = event.target.closest("[data-package-target-student]");
  if (packageTarget) {
    state.packageTargetStudentId = packageTarget.value;
    writePackageTargetStudentId(state.packageTargetStudentId);
    renderActiveWorkbench();
    return;
  }
  const inventoryImport = event.target.closest("#inventory-import-file");
  if (inventoryImport) {
    const file = inventoryImport.files?.[0];
    if (file) void importInventoryFile(file);
    return;
  }
  const inventoryInput = event.target.closest("[data-planner-inventory]");
  if (inventoryInput) {
    state.planner = writePlannerState(window.localStorage, setInventoryCount(state.planner, inventoryInput.dataset.plannerInventory, inventoryInput.value));
    renderActiveWorkbench();
    return;
  }
  const inventoryGiftInput = event.target.closest("[data-inventory-gift]");
  if (inventoryGiftInput) {
    state.planner = writePlannerState(window.localStorage, setInventoryCount(state.planner, inventoryGiftInput.dataset.inventoryGift, inventoryGiftInput.value));
    rerenderInventoryAfterEdit(inventoryGiftInput);
    return;
  }
  const stockInput = event.target.closest("[data-stock-resource]");
  if (stockInput) {
    state.planner = writePlannerState(window.localStorage, setStockResourceCount(state.planner, stockInput.dataset.stockResource, stockInput.value));
    rerenderInventoryAfterEdit(stockInput);
    return;
  }
  const poolInput = event.target.closest("[data-equivalent-pool]");
  if (poolInput) {
    state.planner = writePlannerState(window.localStorage, setEquivalentGiftPoolCount(state.planner, poolInput.dataset.equivalentPool, poolInput.value));
    rerenderInventoryAfterEdit(poolInput);
    return;
  }
  const resourceInput = event.target.closest("[data-resource-amount]");
  if (resourceInput) {
    state.planner = writePlannerState(window.localStorage, setResourceAmount(state.planner, resourceInput.dataset.resourceAmount, resourceInput.value));
    renderActiveWorkbench({ focusResourceId: resourceInput.dataset.resourceAmount });
    return;
  }
  const resourceFloor = event.target.closest("[data-resource-floor]");
  if (resourceFloor) {
    const isCustom = resourceFloor.value === "custom";
    const amount = isCustom ? "custom" : resourceFloor.value;
    state.planner = writePlannerState(window.localStorage, setResourceAmount(
      state.planner,
      resourceFloor.dataset.resourceFloor,
      amount,
      { floorMode: isCustom ? "custom" : null },
    ));
    renderActiveWorkbench({ focusResourceId: resourceFloor.dataset.resourceFloor });
    return;
  }
  const giftBoxInput = event.target.closest("[data-gift-box-count]");
  if (giftBoxInput) {
    state.planner = writePlannerState(window.localStorage, setGiftBoxCount(state.planner, giftBoxInput.dataset.giftBoxCount, giftBoxInput.value));
    rerenderInventoryAfterEdit(giftBoxInput);
    return;
  }
  const periodInput = event.target.closest("[data-resource-period-days]");
  if (periodInput) {
    commitResourcePreviewDays(periodInput.value, state.planner.resourceForecastDays);
    return;
  }
  const forecastDaysInput = event.target.closest("[data-planner-forecast-days]");
  if (forecastDaysInput) {
    commitPlanningDays(forecastDaysInput.value, state.planner.forecastDays);
  }
  const inventoryFilter = event.target.closest("[data-inventory-filter]");
  if (inventoryFilter) {
    rerenderInventoryFilter(inventoryFilter);
  }
});

elements.detail.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "agent-chat-form") { void sendAgentMessage(event.target); return; }
  if (event.target.id === "planner-student-form") {
    const form = new FormData(event.target);
    const studentId = parseStudentIdInput(form.get("studentId") || form.get("studentSearch"));
    if (!studentId) return;
    state.planner = writePlannerState(window.localStorage, addStudentPlan(state.planner, {
      studentId,
      currentLevel: form.get("currentLevel"),
      currentProgress: form.get("currentProgress"),
      targetLevel: form.get("targetLevel"),
    }));
    renderActiveWorkbench();
    return;
  }
  if (event.target.id === "inventory-synthesis-form") {
    const form = new FormData(event.target);
    const result = synthesizeGoldGift(state.planner, form.get("firstGiftId"), form.get("secondGiftId"), data.giftById);
    state.planner = writePlannerState(window.localStorage, result.state);
    state.inventoryNotice = result.ok ? "inventoryNoticeSynthesized" : result.reason === "gold_gifts_only" ? "inventoryNoticeGoldOnly" : "inventoryNoticeInsufficient";
    renderActiveWorkbench();
  }
});

elements.languageSwitcher.addEventListener("click", (event) => {
  const languageButton = event.target.closest("[data-locale]");
  if (!languageButton) return;
  state.locale = writeStoredLocale(window.localStorage, languageButton.dataset.locale);
  applyLocaleChrome();
  if (data) {
    renderDirectory();
    renderActiveWorkbench();
  }
});

bootstrap();
