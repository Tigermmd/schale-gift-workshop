import { createInventoryState } from "./inventory-state.js?v=dashboard-20260824-data-refresh-v113";

export const INVENTORY_TRANSFER_FORMAT = "schale-relationship-inventory";
export const INVENTORY_TRANSFER_SCHEMA_VERSION = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneMap(value) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [String(key), item]));
}

function normalizeNumericMap(value, path, { integer = false } = {}) {
  if (value === undefined) return { value: {} };
  if (!isRecord(value)) return { error: `${path}_must_be_object` };
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) {
      return { error: `${path}.${key}_must_be_nonnegative_number` };
    }
    if (integer && !Number.isInteger(item)) return { error: `${path}.${key}_must_be_integer` };
    normalized[String(key)] = item;
  }
  return { value: normalized };
}

function normalizeMappedResources(value, path) {
  if (value === undefined) return { value: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} } };
  if (!isRecord(value)) return { error: `${path}_must_be_object` };
  const result = {};
  for (const key of ["stockResources", "giftBoxes", "equivalentGiftPools", "relationshipExp"]) {
    const mapped = normalizeNumericMap(value[key], `${path}.${key}`);
    if (mapped.error) return mapped;
    result[key] = mapped.value;
  }
  return { value: result };
}

function normalizePostingHistory(value) {
  if (value === undefined) return { value: [] };
  if (!Array.isArray(value)) return { error: "resourcePostingHistory_must_be_array" };
  const history = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || !item.id || !item.resourceId) return { error: `resourcePostingHistory.${index}_must_have_id_and_resourceId` };
    if (typeof item.active !== "boolean") return { error: `resourcePostingHistory.${index}.active_must_be_boolean` };
    if (typeof item.periodDays !== "number" || !Number.isFinite(item.periodDays) || item.periodDays <= 0) return { error: `resourcePostingHistory.${index}.periodDays_must_be_positive_number` };
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount < 0) return { error: `resourcePostingHistory.${index}.amount_must_be_nonnegative_number` };
    const mapped = normalizeMappedResources(item.mapped, `resourcePostingHistory.${index}.mapped`);
    if (mapped.error) return mapped;
    history.push({
      id: String(item.id),
      postingKey: item.postingKey === undefined ? `${String(item.resourceId)}:${item.periodDays}` : String(item.postingKey),
      resourceId: String(item.resourceId),
      amount: item.amount,
      periodDays: item.periodDays,
      mapped: mapped.value,
      postedAt: item.postedAt === undefined ? "" : String(item.postedAt),
      active: item.active,
      ...(item.undoneAt === undefined ? {} : { undoneAt: String(item.undoneAt) }),
    });
  }
  return { value: history };
}

function normalizeResources(value) {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) return { error: "resources_must_be_array" };
  const resources = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || !item.id) return { error: `resources.${index}_must_have_id` };
    if (item.amount !== null && item.amount !== undefined && (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount < 0)) {
      return { error: `resources.${index}.amount_must_be_nonnegative_number_or_null` };
    }
    resources.push({
      id: String(item.id),
      amount: item.amount === undefined ? null : item.amount,
      value_source: item.value_source === "user" ? "user" : item.value_source === "default" ? "default" : null,
      enabled: item.enabled !== false,
    });
  }
  return { value: resources };
}

function unknownIds(values, knownIds, type) {
  if (!(knownIds instanceof Set)) return [];
  return Object.keys(values ?? {})
    .filter((id) => !knownIds.has(String(id)))
    .map((id) => ({ type, id: String(id) }));
}

export function createInventoryExportPayload(state, { exportedAt = new Date().toISOString() } = {}) {
  const normalized = createInventoryState(state);
  return {
    format: INVENTORY_TRANSFER_FORMAT,
    schemaVersion: INVENTORY_TRANSFER_SCHEMA_VERSION,
    server: "cn",
    exportedAt: String(exportedAt),
    // `periodDays` remains for older imports; the explicit field prevents an
    // inventory export from changing the planner horizon when it is loaded.
    periodDays: normalized.resourceForecastDays,
    resourceForecastDays: normalized.resourceForecastDays,
    inventory: cloneMap(normalized.inventory),
    giftBoxes: cloneMap(normalized.giftBoxes),
    stockResources: cloneMap(normalized.stockResources),
    incomingResources: {
      stockResources: cloneMap(normalized.incomingResources.stockResources),
      giftBoxes: cloneMap(normalized.incomingResources.giftBoxes),
      equivalentGiftPools: cloneMap(normalized.incomingResources.equivalentGiftPools),
      relationshipExp: cloneMap(normalized.incomingResources.relationshipExp),
    },
    equivalentGiftPools: cloneMap(normalized.equivalentGiftPools),
    giftReservations: cloneMap(normalized.giftReservations),
    synthesisReservations: normalized.synthesisReservations.map((pair) => [...pair]),
    packageInventoryPostings: cloneMap(normalized.packageInventoryPostings),
    resourcePostingHistory: normalized.resourcePostingHistory.map((item) => ({
      ...item,
      mapped: {
        stockResources: cloneMap(item.mapped?.stockResources),
        giftBoxes: cloneMap(item.mapped?.giftBoxes),
        equivalentGiftPools: cloneMap(item.mapped?.equivalentGiftPools),
        relationshipExp: cloneMap(item.mapped?.relationshipExp),
      },
    })),
    resources: normalized.resources.map((resource) => ({
      id: resource.id,
      amount: resource.amount,
      value_source: resource.value_source,
      enabled: resource.enabled,
    })),
  };
}

export function serializeInventoryExport(state, options = {}) {
  return JSON.stringify(createInventoryExportPayload(state, options), null, 2);
}

function parseAronaInventory(payload, { giftIds, giftBoxIds } = {}) {
  if (typeof payload.version !== "string" || !isRecord(payload.inventory)) return { ok: false, reason: "unsupported_format" };
  const inventory = {};
  const giftBoxes = {};
  const stockResources = {};
  const warnings = [];
  const knownBoxIds = giftBoxIds instanceof Set ? giftBoxIds : new Set(["100000", "100008", "100009"]);
  const knownGiftIds = giftIds instanceof Set ? giftIds : new Set();
  for (const [key, value] of Object.entries(payload.inventory)) {
    const match = key.match(/^item_(\d+)$/);
    if (!match) return { ok: false, reason: "arona_inventory_key_invalid" };
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return { ok: false, reason: `inventory.${key}_must_be_nonnegative_integer` };
    }
    const id = match[1];
    if (knownBoxIds.has(id)) giftBoxes[id] = value;
    else if (id === "3") stockResources.manufacturing_stone = value;
    else if (id === "82") stockResources.synthesis_stone_gold = value;
    else {
      inventory[id] = value;
      if (!knownGiftIds.has(id)) warnings.push({ type: "unknown_gift_id", id });
    }
  }
  return {
    ok: true,
    source: "arona.icu",
    state: createInventoryState({ inventory, giftBoxes, stockResources }),
    warnings,
  };
}

export function parseInventoryImport(input, { giftIds, giftBoxIds } = {}) {
  let payload;
  try {
    payload = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!isRecord(payload)) return { ok: false, reason: "invalid_format" };
  if (payload.format !== INVENTORY_TRANSFER_FORMAT) {
    if (payload.format === undefined && payload.inventory !== undefined) return parseAronaInventory(payload, { giftIds, giftBoxIds });
    return { ok: false, reason: "unsupported_format" };
  }
  if (payload.schemaVersion !== INVENTORY_TRANSFER_SCHEMA_VERSION) return { ok: false, reason: "unsupported_version" };

  const inventory = normalizeNumericMap(payload.inventory, "inventory", { integer: true });
  const giftBoxes = normalizeNumericMap(payload.giftBoxes, "giftBoxes", { integer: true });
  const stockResources = normalizeNumericMap(payload.stockResources, "stockResources");
  const equivalentGiftPools = normalizeNumericMap(payload.equivalentGiftPools, "equivalentGiftPools");
  const giftReservations = normalizeNumericMap(payload.giftReservations, "giftReservations", { integer: true });
  const packageInventoryPostings = normalizeNumericMap(payload.packageInventoryPostings, "packageInventoryPostings", { integer: true });
  if (inventory.error || giftBoxes.error || stockResources.error || equivalentGiftPools.error || giftReservations.error || packageInventoryPostings.error) {
    return { ok: false, reason: inventory.error || giftBoxes.error || stockResources.error || equivalentGiftPools.error || giftReservations.error || packageInventoryPostings.error };
  }
  if (payload.incomingResources !== undefined && !isRecord(payload.incomingResources)) return { ok: false, reason: "incomingResources_must_be_object" };
  const incomingSource = payload.incomingResources ?? {};
  const incomingStock = normalizeNumericMap(incomingSource.stockResources, "incomingResources.stockResources");
  const incomingBoxes = normalizeNumericMap(incomingSource.giftBoxes, "incomingResources.giftBoxes");
  const incomingPools = normalizeNumericMap(incomingSource.equivalentGiftPools, "incomingResources.equivalentGiftPools");
  const incomingExp = normalizeNumericMap(incomingSource.relationshipExp, "incomingResources.relationshipExp");
  if (incomingStock.error || incomingBoxes.error || incomingPools.error || incomingExp.error) {
    return { ok: false, reason: incomingStock.error || incomingBoxes.error || incomingPools.error || incomingExp.error };
  }
  if (payload.periodDays !== undefined && (!Number.isInteger(payload.periodDays) || payload.periodDays < 0 || payload.periodDays > 366)) return { ok: false, reason: "periodDays_must_be_between_0_and_366" };
  if (payload.resourceForecastDays !== undefined && (!Number.isInteger(payload.resourceForecastDays) || payload.resourceForecastDays < 0 || payload.resourceForecastDays > 366)) return { ok: false, reason: "resourceForecastDays_must_be_between_0_and_366" };
  const resources = normalizeResources(payload.resources);
  if (resources.error) return { ok: false, reason: resources.error };
  const resourcePostingHistory = normalizePostingHistory(payload.resourcePostingHistory);
  if (resourcePostingHistory.error) return { ok: false, reason: resourcePostingHistory.error };

  const state = createInventoryState({
    periodDays: payload.periodDays,
    resourceForecastDays: payload.resourceForecastDays ?? payload.periodDays,
    inventory: inventory.value,
    giftBoxes: giftBoxes.value,
    stockResources: stockResources.value,
    incomingResources: {
      stockResources: incomingStock.value,
      giftBoxes: incomingBoxes.value,
      equivalentGiftPools: incomingPools.value,
      relationshipExp: incomingExp.value,
    },
    equivalentGiftPools: equivalentGiftPools.value,
    giftReservations: giftReservations.value,
    packageInventoryPostings: packageInventoryPostings.value,
    resourcePostingHistory: resourcePostingHistory.value,
    ...(resources.value === undefined ? {} : { resources: resources.value }),
  });
  const warnings = [
    ...unknownIds(state.inventory, giftIds, "unknown_gift_id"),
    ...unknownIds(state.giftBoxes, giftBoxIds, "unknown_gift_box_id"),
    ...unknownIds(state.giftReservations, giftIds, "unknown_gift_id"),
  ];
  return { ok: true, state, warnings };
}

export function applyInventoryImport(currentState, importedState, { preserveStockResources = false, preservePackageInventoryPostings = false } = {}) {
  const current = createInventoryState(currentState);
  const imported = createInventoryState(importedState);
  return {
    ...current,
    periodDays: imported.resourceForecastDays,
    resourceForecastDays: imported.resourceForecastDays,
    inventory: imported.inventory,
    giftBoxes: imported.giftBoxes,
    stockResources: preserveStockResources ? current.stockResources : imported.stockResources,
    incomingResources: imported.incomingResources,
    equivalentGiftPools: imported.equivalentGiftPools,
    giftReservations: imported.giftReservations,
    synthesisReservations: imported.synthesisReservations,
    packageInventoryPostings: preservePackageInventoryPostings ? current.packageInventoryPostings : imported.packageInventoryPostings,
    resourcePostingHistory: imported.resourcePostingHistory,
    resources: imported.resources,
  };
}
