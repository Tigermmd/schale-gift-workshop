import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsRoot = path.join(dashboardRoot, "js");
const BUILD_VERSION = "dashboard-20260824-data-refresh-v113";

function assertVersionedUrl(specifier, sourceFile) {
  const url = new URL(specifier, "https://dashboard.invalid/");
  assert.equal(
    url.searchParams.get("v"),
    BUILD_VERSION,
    `${sourceFile} must cache-bust ${specifier} with v=${BUILD_VERSION}`,
  );
}

const indexHtml = fs.readFileSync(path.join(dashboardRoot, "index.html"), "utf8");
assert.match(indexHtml, new RegExp(`styles\\.css\\?v=${BUILD_VERSION}`));
assert.match(indexHtml, new RegExp(`agent\\.css\\?v=${BUILD_VERSION}`));
assert.match(indexHtml, new RegExp(`js/boot\\.js\\?v=${BUILD_VERSION}`));

for (const fileName of fs.readdirSync(jsRoot).filter((name) => name.endsWith(".js"))) {
  const filePath = path.join(jsRoot, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/(?:from|import\()\s*["'](\.\/[^"']+\.js[^"']*)["']/g)) {
    assertVersionedUrl(match[1], fileName);
  }
}

const loader = fs.readFileSync(path.join(jsRoot, "data-loader.js"), "utf8");
for (const match of loader.matchAll(/`[^`]+\.json\?([^`]+)`/g)) {
  assert.equal(match[1], `v=${BUILD_VERSION}`, `data-loader.js must cache-bust ${match[0]}`);
}
assert.match(loader, new RegExp(`assets/manifest\\.json\\?v=${BUILD_VERSION}`));

const timeline = JSON.parse(fs.readFileSync(path.join(dashboardRoot, "relationship_data", "jp_release_timeline.json"), "utf8"));
assert.equal(timeline.server, "jp");
assert.equal(timeline.asOf, "2026-08-24");
assert.equal(timeline.students.find((student) => student.studentId === 10122)?.jpRank, 232);
assert.equal(timeline.students.length, 272);

const agentView = fs.readFileSync(path.join(jsRoot, "agent-view.js"), "utf8");
assert.doesNotMatch(agentView, /data-agent-cutoff-search|agent-cn-progress|renderCutoffStudentOptions/);
assert.match(agentView, /name="apiKey"\s+type="password"/);
assert.match(agentView, /agent-api-key-input/);
assert.match(agentView, /autocomplete="new-password"/);
const agentCss = fs.readFileSync(path.join(dashboardRoot, "agent.css"), "utf8");
assert.doesNotMatch(agentCss, /agent-cutoff-combobox|agent-cutoff-options/);
assert.match(agentCss, /agent-api-key-input/);

console.log("cache version tests passed");
