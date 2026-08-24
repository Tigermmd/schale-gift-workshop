const NORMAL_GIFT_IDS = Array.from({ length: 35 }, (_, index) => 5000 + index);
const CRAFTABLE_PURPLE_GIFT_IDS = Array.from({ length: 13 }, (_, index) => 5100 + index);
const SPECIAL_GIFT_IDS = [5996, 5997, 5998, 5999];

// SchaleDB `IsLimited` snapshot (2026-08-12): values 1–3 are limited,
// event-limited, or FES recruitment entries; value 4 is permanent. This metadata is kept separate
// from the Mika gift override so every future student can use the same
// package rule without making ordinary future students eligible by default.
export const LIMITED_OR_FES_STUDENT_TYPES = Object.freeze({
  10099: 3, 10117: 1, 10118: 1, 16017: 2, 10123: 1, 10124: 1,
  26015: 2, 20048: 3, 10122: 3, 20051: 1, 10129: 1, 16018: 2,
  10133: 1, 16019: 2, 20054: 1, 10134: 3, 10135: 3, 10139: 1,
  10140: 1, 16020: 2, 10146: 1, 10147: 1, 26016: 2, 10148: 3,
  20060: 3,
});

// Mika (Swimsuit) has a different FavorItemTags/FavorItemUniqueTags table
// from the original Mika.  Keep the CN SchaleDB snapshot explicit so this
// unreleased costume never inherits the original student's gift list.
const GIFT_EXP = Object.freeze({
  5005: 60,
  5006: 40,
  5007: 40,
  5034: 60,
  5102: 180,
  5106: 240,
  5996: 240,
  5997: 240,
  5998: 60,
  5999: 60,
});

function defaultGiftExp(giftId) {
  return giftId >= 5100 ? 120 : 20;
}

function reactionGrade(exp) {
  return { 20: 1, 40: 2, 60: 3, 80: 4, 120: 2, 180: 3, 240: 4 }[exp] ?? 1;
}

function reactionLabel(exp) {
  return { 20: "Small", 40: "Medium", 60: "Large", 80: "Huge", 120: "Medium", 180: "Large", 240: "Huge" }[exp] ?? "Small";
}

const ALL_GIFT_IDS = [...NORMAL_GIFT_IDS, ...CRAFTABLE_PURPLE_GIFT_IDS, ...SPECIAL_GIFT_IDS];

function giftValue(giftId) {
  return GIFT_EXP[giftId] ?? defaultGiftExp(giftId);
}

function giftValueEntry(giftId) {
  const relationshipExp = giftValue(giftId);
  return {
    gift_id: giftId,
    reaction_grade: reactionGrade(relationshipExp),
    reaction_label_en: reactionLabel(relationshipExp),
    reaction_label_zh_cn: { Small: "小", Medium: "中", Large: "大", Huge: "特大" }[reactionLabel(relationshipExp)],
    reaction_label_zh: { Small: "小", Medium: "中", Large: "大", Huge: "特大" }[reactionLabel(relationshipExp)],
    relationship_exp: relationshipExp,
    matched_tags: [],
    is_student_preference: Object.hasOwn(GIFT_EXP, giftId),
    is_universal: giftId >= 5100 && !Object.hasOwn(GIFT_EXP, giftId),
    is_premium: giftId >= 5100,
  };
}

const giftValues = ALL_GIFT_IDS.map(giftValueEntry);
const preferredGifts = giftValues.filter((gift) => gift.is_student_preference);

// Special overrides only. The complete student directory comes from the
// SchaleDB snapshot; this list must not be used as the future-student catalog.
// At present the only override is the distinct gift reaction table for Mika
// (Swimsuit), which is merged onto the full snapshot row by data-loader.js.
export const FUTURE_STUDENTS = Object.freeze([
  {
    student_id: 10122,
    name_en: "Mika (Swimsuit)",
    name_zh_cn: "未花（泳装）",
    name_zh: "未花（泳装）",
    name_ja: "ミカ（水着）",
    path_name: "mika_swimsuit",
    preference_source_student_id: 10059,
    default_order: 231,
    is_released: [true, true, false],
    future_only: true,
    future_note_zh_cn: "国服未实装；本规划只计算礼物，不计入日程与咖啡厅摸头。",
    launch_package_eligibility: "limited_or_fes",
    favor_item_tags: ["Bb", "ar", "CX", "Cx"],
    favor_item_unique_tags: ["HK", "Hk"],
    gift_values: Object.freeze(giftValues),
    preferred_gifts: Object.freeze(preferredGifts),
    most_favorite_gifts: [5106],
    package_favorite_gifts: Object.freeze({ purple: 5106, gold: 5034 }),
    universal_gifts: CRAFTABLE_PURPLE_GIFT_IDS.filter((giftId) => ![5102, 5106].includes(giftId)),
    no_matching_gift_in_source: false,
  },
]);
