import assert from "node:assert/strict";
import fs from "node:fs";
import { FUTURE_STUDENTS } from "./future-students.js";
import { catalogPackageDraft, renderPackagesWorkspace } from "./package-view.js";

const catalogPackage = {
  id: "cn-monthly-gifts-78",
  name_zh_cn: "每月礼物礼包",
  name_en: "Monthly Gift Package",
  name_ja: "毎月贈り物パック",
  price_cny: 78,
  purchase_limit: 1,
  status: "permanent",
  contents: [
    { name_zh_cn: "礼物盒", name_en: "Gift Box", quantity: 10 },
  ],
  source: "https://example.com/official",
};

const draft = catalogPackageDraft(catalogPackage, "zh_cn");
assert.deepEqual(draft, {
  name: "每月礼物礼包",
  price: 78,
  limit: 1,
  contents: "礼物盒 ×10",
});

const giftBoxes = JSON.parse(fs.readFileSync(new URL("../relationship_data/gift_boxes_cn.json", import.meta.url), "utf8")).boxes;
const gifts = JSON.parse(fs.readFileSync(new URL("../relationship_data/gifts.json", import.meta.url), "utf8")).gifts;
const preferenceSnapshot = JSON.parse(fs.readFileSync(new URL("../relationship_data/student_gift_preferences.json", import.meta.url), "utf8"));
const paidPackageSnapshot = JSON.parse(fs.readFileSync(new URL("../relationship_data/paid_packages_cn.json", import.meta.url), "utf8"));
const anniversaryPackage = paidPackageSnapshot.packages.find((item) => item.id === "cn-third-anniversary-gifts-98");
const specialPackage = paidPackageSnapshot.packages.find((item) => item.id === "cn-third-anniversary-special-i-98");
const koyukiPackage = paidPackageSnapshot.packages.find((item) => item.id === "cn-third-anniversary-special-ii-98");
const templatePackage = paidPackageSnapshot.packages.find((item) => item.id === "cn-limited-fes-student-favorite-98-template");
const swimsuitMika = FUTURE_STUDENTS.find((student) => student.student_id === 10122);
const specialHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "swimsuit-mika", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 }],
    mainTargetStudentId: 10122,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [specialPackage] },
    studentById: new Map([["10122", swimsuitMika]]),
    giftById: new Map(gifts.map((gift) => [String(gift.id), gift])),
    giftBoxes,
    assetManifest: { entries: {} },
  },
});
assert.match(specialHtml, /金礼物好感 600\.00/);
assert.match(specialHtml, /紫礼物好感 1,440\.00/);
assert.match(specialHtml, /花束好感 480\.00/);
assert.match(specialHtml, /本包期望好感[\s\S]*?2,520\.00/);
assert.match(specialHtml, /限定\/FES学生专属礼物礼包/);
assert.doesNotMatch(specialHtml, /三周年/ , "未来上线参考礼包不能假设复刻周年名称");
assert.doesNotMatch(specialHtml, /限定\/FES学生专属礼物礼包（未花（泳装）上线）/, "预测目标不能被拼进礼包名称");
assert.doesNotMatch(specialHtml, /全礼物好感/);
assert.match(specialHtml, /时髦梳子 ×6/, "水着未花的紫色礼包礼物不能沿用原皮芭菲");
assert.match(specialHtml, /夏日泳圈 ×10/, "水着未花的金色礼包礼物不能沿用原皮曲奇");
assert.match(specialHtml, /按未花（泳装）上线时可能复刻的内容估算，属于上线参考/, "学生上线礼包必须明确标注为参考估算");
assert.match(specialHtml, /按目标学生对礼包内实际礼物的反应计算/);
assert.match(specialHtml, /还可买/);
assert.match(specialHtml, /已购买/);
assert.match(specialHtml, /周期上限/);
assert.doesNotMatch(specialHtml, /千层酥咖啡厅的正宗芭菲 ×6/);
assert.doesNotMatch(specialHtml, /高级曲奇礼盒套装 ×10/);

const anniversaryHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "swimsuit-mika", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 }],
    mainTargetStudentId: 10122,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [anniversaryPackage] },
    studentById: new Map([["10122", swimsuitMika]]),
    giftById: new Map(gifts.map((gift) => [String(gift.id), gift])),
    giftBoxes,
    assetManifest: { entries: {} },
  },
});
const anniversaryLaunchHtml = anniversaryHtml.match(/<section[^>]*aria-label="上线复刻参考">[\s\S]*?<\/section>/)?.[0] ?? "";
assert.match(anniversaryLaunchHtml, /限定\/FES学生礼物礼包/);
assert.doesNotMatch(anniversaryLaunchHtml, /三周年纪念礼物礼包/, "三周年只能是当前快照的正式名称，不能带入未来上线预测");

const koyuki = preferenceSnapshot.students.find((student) => student.student_id === 10063);
const koyukiHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "koyuki", studentId: 10063, currentLevel: 1, currentProgress: 0, targetLevel: 100 }],
    mainTargetStudentId: 10063,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [catalogPackage, koyukiPackage] },
    studentById: new Map([["10063", koyuki]]),
    giftById: new Map(gifts.map((gift) => [String(gift.id), gift])),
    giftBoxes,
    assetManifest: { entries: {} },
  },
});
assert.match(koyukiHtml, /每月礼物礼包/, "常驻学生仍应看到通用礼包");
assert.doesNotMatch(koyukiHtml, /三周年特别礼物礼包 II/, "常驻且已实装的小雪不应显示学生专属礼包");
assert.doesNotMatch(koyukiHtml, /桌游《人生》 ×6|装扮用圈圈眼镜 ×10/, "常驻学生不应把学生专属礼包当作可规划礼包");
assert.doesNotMatch(koyukiHtml, /时髦梳子|夏日泳圈/);
assert.doesNotMatch(koyukiHtml, /上线复刻参考|上线时可能复刻/, "已实装小雪的礼包应归入当前快照，不应显示上线复刻参考");

const hoshinoArmed = preferenceSnapshot.students.find((student) => student.student_id === 10099);
const hoshinoArmedHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "hoshino-armed", studentId: 10099, currentLevel: 1, currentProgress: 0, targetLevel: 100 }],
    mainTargetStudentId: 10099,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [catalogPackage, templatePackage] },
    studentById: new Map([["10099", { ...hoshinoArmed, launch_package_eligibility: "limited_or_fes" }]]),
    giftById: new Map(gifts.map((gift) => [String(gift.id), gift])),
    giftBoxes,
    assetManifest: { entries: {} },
  },
});
assert.match(hoshinoArmedHtml, /限定\/FES学生专属礼物礼包/, "未实装的另一名FES学生必须显示对应礼包");
assert.doesNotMatch(hoshinoArmedHtml, /礼包（星野（武装）上线预测）/, "预测目标不能被拼进正式礼包名称");
assert.match(hoshinoArmedHtml, /按星野（武装）上线时可能复刻的内容估算/);

const html = renderPackagesWorkspace({
  state: {
    students: [{ id: "student-1", studentId: 1, currentLevel: 1, currentProgress: 0, targetLevel: 2 }],
    mainTargetStudentId: 1,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: { packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [catalogPackage] }, studentById: new Map([["1", { student_id: 1, name_zh_cn: "甲", name_en: "A", gift_values: [] }]]), giftBoxes: [], assetManifest: { entries: { "ui:arona-title-new": { local: "./assets/ui/arona-title-new.webp" }, "ui:kivo-options": { local: "./assets/ui/kivo-options.webp" } } } },
});
assert.match(html, /礼包性价比/);
assert.match(html, /好感 \/ 元/);
assert.match(html, /¥78/);
assert.doesNotMatch(html, /甲 · #1/);
assert.match(html, /data-package-target-student/);
assert.doesNotMatch(html, /package-visual-anchors/);
assert.doesNotMatch(html, /package-visual-items|arona-title-new\.webp|kivo-options\.webp/);
assert.match(html, /package-details/);

const groupedHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "student-1", studentId: 1, currentLevel: 1, currentProgress: 0, targetLevel: 2 }],
    mainTargetStudentId: 1,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: {
      scope: { as_of: "2026-08-10" },
      packages: [catalogPackage, { ...catalogPackage, id: "cn-launch-gifts-98", name_zh_cn: "每月礼物礼包", availability_phase: "student_launch" }],
    },
    studentById: new Map([["1", { student_id: 1, name_zh_cn: "甲", name_en: "A", future_only: true, launch_package_eligibility: "limited_or_fes", gift_values: [] }]]),
    giftBoxes: [],
    assetManifest: { entries: {} },
  },
});
assert.equal((groupedHtml.match(/package-group/g) ?? []).length, 2, "当前礼包与学生上线礼包必须分组展示");
assert.match(groupedHtml, /当前快照/);
assert.match(groupedHtml, /上线复刻参考/);

const dualTargetHtml = renderPackagesWorkspace({
  state: {
    students: [
      { id: "base-mika", studentId: 10059, currentLevel: 1, currentProgress: 0, targetLevel: 2 },
      { id: "swimsuit-mika", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 2 },
    ],
    mainTargetStudentId: 10059,
    packagePlans: {},
    forecastDays: 60,
  },
  selectedStudentId: 10122,
  locale: "zh_cn",
  data: {
    packageCatalog: {
      scope: { as_of: "2026-08-10" },
      packages: [{ ...catalogPackage, launch_reoffer: true }],
    },
    studentById: new Map([
      ["10059", { student_id: 10059, name_zh_cn: "未花", name_en: "Mika", gift_values: [] }],
      ["10122", { student_id: 10122, name_zh_cn: "未花（泳装）", name_en: "Mika (Swimsuit)", future_only: true, launch_package_eligibility: "limited_or_fes", gift_values: [] }],
    ]),
    giftBoxes: [],
  },
});
assert.match(dualTargetHtml, /<option value="10122" selected>/, "礼包页必须使用显式选择的水着未花目标");
assert.match(dualTargetHtml, /上线复刻参考/);
assert.match(dualTargetHtml, /每月礼物礼包/, "学生上线重售礼包必须保留正式礼包名称");
assert.doesNotMatch(dualTargetHtml, /每月礼物礼包（未花（泳装）上线）/, "目标学生不能被拼进正式礼包名称");
assert.match(dualTargetHtml, /按未花（泳装）上线时可能复刻的内容估算/);

const nonLimitedFutureHtml = renderPackagesWorkspace({
  state: {
    students: [{ id: "future-normal", studentId: 99999, currentLevel: 1, currentProgress: 0, targetLevel: 2 }],
    mainTargetStudentId: 99999,
    packagePlans: {},
    forecastDays: 60,
  },
  locale: "zh_cn",
  data: {
    packageCatalog: {
      scope: { as_of: "2026-08-10" },
      packages: [{ ...catalogPackage, id: "launch-only", availability_phase: "student_launch", launch_student_ids: [99999] }],
    },
    studentById: new Map([["99999", { student_id: 99999, name_zh_cn: "普通未来学生", future_only: true, gift_values: [] }]]),
    giftBoxes: [],
  },
});
assert.doesNotMatch(nonLimitedFutureHtml, /上线复刻参考/);
assert.doesNotMatch(nonLimitedFutureHtml, /上线时可能复刻/);

const noTargetHtml = renderPackagesWorkspace({
  state: { students: [], mainTargetStudentId: null, packagePlans: {}, forecastDays: 60 },
  locale: "zh_cn",
  data: { packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [catalogPackage] }, studentById: new Map([["1", { student_id: 1, name_zh_cn: "甲", name_en: "A", gift_values: [] }]]), giftBoxes: [] },
});
assert.match(noTargetHtml, /先添加目标学生/);
assert.match(noTargetHtml, /data-go-planner/);
assert.doesNotMatch(noTargetHtml, /¥78\.00/);

const japaneseHtml = renderPackagesWorkspace({
  state: { students: [{ id: "student-1", studentId: 1, currentLevel: 1, currentProgress: 0, targetLevel: 2 }], mainTargetStudentId: 1 },
  locale: "ja",
  data: { packageCatalog: {
    scope: { as_of: "2026-08-10" },
    packages: [{
      ...catalogPackage,
      contents: [{
        kind: "student_favorite_gift",
        name_zh_cn: "指定学生的最喜欢金礼物",
        name_en: "Target student's favorite gold gift",
        name_ja: "指定生徒の最も好きな金色の贈り物",
        quantity: 10,
      }],
    }],
  }, studentById: new Map([["1", { student_id: 1, name_ja: "甲", gift_values: [] }]]), giftBoxes: [] },
});
assert.match(japaneseHtml, /指定生徒の最も好きな金色の贈り物/);
assert.match(japaneseHtml, /毎月贈り物パック/);
assert.doesNotMatch(japaneseHtml, /每月礼物礼包/);

const expiredHtml = renderPackagesWorkspace({
  state: { packages: [], packagePlans: {}, forecastDays: 60 },
  locale: "zh_cn",
  data: { packageCatalog: { scope: { as_of: "2026-08-10" }, packages: [{ ...catalogPackage, status: "expired" }] }, studentById: new Map([["1", { student_id: 1, name_zh_cn: "甲", gift_values: [] }]]), giftBoxes: [] },
});
assert.doesNotMatch(expiredHtml, /每月礼物礼包/);

const templateHtml = renderPackagesWorkspace({
  state: { packages: [], packagePlans: {}, forecastDays: 60 },
  locale: "zh_cn",
  data: { packageCatalog: {
    scope: { as_of: "2026-08-10" },
    packages: [{
      ...catalogPackage,
      id: "cn-limited-fes-student-favorite-98-template",
      name_zh_cn: "限定/FES学生专属礼物礼包（模板）",
      status: "template",
      gift_binding: {
        type: "student_specific_favorites",
        repeat_rule: "one_per_limited_or_fes_student",
        note_zh_cn: "每次上线限定/FES学生时各预留一份",
      },
      source: null,
    }],
  }, studentById: new Map([["1", { student_id: 1, name_zh_cn: "甲", gift_values: [] }]]), giftBoxes: [] },
});
assert.doesNotMatch(templateHtml, /规划模板/);
assert.doesNotMatch(templateHtml, /每次上线限定\/FES学生时各预留一份/);
console.log("package view tests passed");
