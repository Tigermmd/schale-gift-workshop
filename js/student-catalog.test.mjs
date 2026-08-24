import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildStudentCatalog } from "./data-loader.js";
import { filterStudents } from "./dashboard-state.js";

const snapshot = JSON.parse(
  fs.readFileSync(new URL("../relationship_data/student_gift_preferences.json", import.meta.url), "utf8"),
);

test("student snapshot is a complete catalog, not only the CN released subset", () => {
  assert.equal(snapshot.scope.catalog, "complete_student_catalog");
  assert.equal(snapshot.student_count, snapshot.students.length);
  assert.ok(snapshot.students.length >= 272, "the current SchaleDB catalog has 272 students");
  assert.ok(snapshot.students.some((student) => student.student_id === 10123));
  assert.ok(snapshot.students.some((student) => student.student_id === 10124));
  assert.ok(snapshot.students.some((student) => student.student_id === 10122));
});

test("the catalog keeps CN release state per student", () => {
  const byId = new Map(snapshot.students.map((student) => [student.student_id, student]));
  const cnReleased = byId.get(10063);
  const futureMika = byId.get(10122);

  assert.equal(cnReleased.cn_released, true);
  assert.equal(cnReleased.future_only, false);
  assert.equal(futureMika.cn_released, false);
  assert.equal(futureMika.future_only, true);
  assert.equal(futureMika.release_status, "unreleased");
  assert.ok(snapshot.students.filter((student) => student.future_only).length > 1);
});

test("the loader exposes every snapshot student and only uses Mika as an override", () => {
  const catalog = buildStudentCatalog(snapshot.students);
  const ids = new Set(catalog.map((student) => student.student_id));

  assert.equal(catalog.length, snapshot.students.length);
  assert.equal(ids.size, catalog.length);
  assert.ok(catalog.some((student) => student.student_id === 10123 && student.future_only));
  assert.ok(catalog.some((student) => student.student_id === 10124 && student.future_only));
  assert.equal(catalog.filter((student) => student.future_only).length, 60);
});

test("future limited/FES students inherit package eligibility from the snapshot metadata", () => {
  const snapshotLimited = snapshot.students.find((student) => student.student_id === 10099);
  const snapshotPermanent = snapshot.students.find((student) => student.student_id === 10115);
  assert.equal(snapshotLimited?.launch_package_eligibility, "limited_or_fes");
  assert.equal(snapshotLimited?.is_limited?.[0], 3);
  assert.equal(snapshotPermanent?.launch_package_eligibility, undefined);
  assert.equal(snapshotPermanent?.is_limited, undefined);
  const catalog = buildStudentCatalog(snapshot.students);
  assert.equal(catalog.find((student) => student.student_id === 10099)?.launch_package_eligibility, "limited_or_fes");
  assert.equal(catalog.find((student) => student.student_id === 10099)?.is_limited?.[0], 3);
  assert.equal(catalog.find((student) => student.student_id === 10115)?.launch_package_eligibility, undefined);
});

test("directory search can find a future student by the CN name", () => {
  const matches = filterStudents(snapshot.students, "圣娅");
  assert.deepEqual(matches.map((student) => student.student_id), [10110, 10123]);
  assert.equal(matches.find((student) => student.student_id === 10123)?.future_only, true);
});
