#!/usr/bin/env node
// IND-000 industry-pack validation, adapted from the PB-001 import checks
// (schema.md in this directory documents each rule).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bbDir = join(here, "..", "10-country-packs", "Zimbabwe", "black-book", "data");
const zwDir = join(here, "Zimbabwe");
const errors = [];
const fail = (m) => errors.push(m);

// --- Load Black Book reference universe ---------------------------------
const bb = {};
for (const f of readdirSync(bbDir).filter((f) => f.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(join(bbDir, f), "utf8"))) {
    bb[r.id] = r.category;
  }
}
const refClasses = {
  authorityIds: ["government_organisation", "regulator", "local_authority"],
  licenceTypeIds: ["licence_type"],
  complianceEventIds: ["compliance_event"],
  complianceGuideIds: ["compliance_guide"],
  serviceIds: ["service"],
  tenderPortalIds: ["tender_portal"],
  associationIds: ["business_association"],
  utilityIds: ["utility"],
};

// --- Contract ------------------------------------------------------------
const fileCategory = {
  "profile.json": ["industry_profile"],
  "regulatory-map.json": ["industry_regulatory_link", "industry_gap"],
  "workflows.json": ["industry_workflow"],
  "kpis.json": ["industry_kpi"],
  "glossary.json": ["industry_term"],
};
const commonFields = ["id", "name", "category", "industryId", "assertionType", "verified", "sources", "lastReviewed", "notes"];
const allowedExtra = {
  industry_profile: ["definition", "subSectors", "typicalBusinessSizes", "officialSizeThresholds"],
  industry_regulatory_link: ["obligation", "obligationKind", "appliesWhen", "blackBook"],
  industry_gap: ["description", "proposedBlackBookCategory", "blackBook"],
  industry_workflow: ["description", "stages", "erpCapabilities", "relatedKpiIds"],
  industry_kpi: ["definition", "formula", "unit", "direction", "erpDataSource"],
  industry_term: ["definition", "blackBook"],
};
const obligationKinds = ["FORMATION", "TAX", "EMPLOYER", "LOCAL_AUTHORITY", "SECTOR_LICENCE", "ENVIRONMENT", "PROCUREMENT", "ASSOCIATION", "OVERSIGHT"];
const kpiDirections = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "CONTEXT"];
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const httpsUrl = (u) => typeof u === "string" && u.startsWith("https://");

// --- Walk industries -----------------------------------------------------
const seenIds = new Map();
const kpiIdsByIndustry = new Map();
const allRecordsByIndustry = new Map();
const industries = readdirSync(zwDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
if (industries.length === 0) fail("no industry directories found");

for (const ind of industries) {
  const dir = join(zwDir, ind);
  const records = [];
  for (const [file, cats] of Object.entries(fileCategory)) {
    const path = join(dir, file);
    if (!existsSync(path)) { fail(`${ind}/${file}: missing`); continue; }
    let data;
    try { data = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { fail(`${ind}/${file}: JSON parse error: ${e.message}`); continue; }
    if (!Array.isArray(data)) { fail(`${ind}/${file}: root is not an array`); continue; }
    if (file === "profile.json" && data.length !== 1) fail(`${ind}/${file}: expected exactly one profile record`);
    for (const r of data) {
      records.push(r);
      const where = `${ind}/${file}#${r.id ?? "?"}`;
      for (const fld of commonFields) if (!(fld in r)) fail(`${where}: missing field '${fld}'`);
      if (r.id) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) fail(`${where}: id not kebab-case`);
        if (seenIds.has(r.id)) fail(`${where}: duplicate id (also in ${seenIds.get(r.id)})`);
        seenIds.set(r.id, where);
      }
      if (!cats.includes(r.category)) fail(`${where}: category '${r.category}' not allowed in ${file}`);
      if (!["external_fact", "product_design"].includes(r.assertionType)) fail(`${where}: bad assertionType`);
      if (typeof r.verified !== "boolean") fail(`${where}: verified not boolean`);
      if (r.assertionType === "product_design" && r.verified) fail(`${where}: product_design must be verified:false`);
      if (r.category === "industry_gap" && r.verified) fail(`${where}: industry_gap must be verified:false`);
      if (!Array.isArray(r.sources) || !r.sources.every(httpsUrl)) fail(`${where}: sources must be HTTPS URLs`);
      if (r.verified === true && r.sources.length === 0) fail(`${where}: verified record has no sources`);
      if (!isoDate(r.lastReviewed ?? "")) fail(`${where}: bad lastReviewed`);
      if (!(typeof r.notes === "string" || r.notes === null)) fail(`${where}: notes must be string or null`);
      const extra = Object.keys(r).filter((k) => !commonFields.includes(k) && !(allowedExtra[r.category] ?? []).includes(k));
      if (extra.length) fail(`${where}: unknown fields ${extra.join(",")}`);
      if (r.category !== "industry_profile" && r.industryId !== `zw-${ind}`) fail(`${where}: industryId != zw-${ind}`);
      if (r.category === "industry_profile") {
        if (r.industryId !== r.id) fail(`${where}: profile industryId must equal id`);
        const ev = r.officialSizeThresholds;
        if (!ev || !["verified", "unverified"].includes(ev.status)) fail(`${where}: bad officialSizeThresholds`);
        else if (ev.status === "unverified" && (ev.value !== null || (ev.sources ?? []).length || !ev.note)) fail(`${where}: unverified evidence field must have null value, empty sources and a note`);
        else if (ev.status === "verified" && (!ev.value || !(ev.sources ?? []).every(httpsUrl) || !(ev.sources ?? []).length)) fail(`${where}: verified evidence field needs value + HTTPS sources`);
      }
      if (r.category === "industry_regulatory_link" && !obligationKinds.includes(r.obligationKind)) fail(`${where}: bad obligationKind`);
      if (r.category === "industry_kpi") {
        if (!kpiDirections.includes(r.direction)) fail(`${where}: bad direction`);
        kpiIdsByIndustry.set(ind, (kpiIdsByIndustry.get(ind) ?? new Set()).add(r.id));
      }
      for (const [key, classes] of Object.entries(r.blackBook ?? {})) {
        if (!(key in refClasses)) { fail(`${where}: unknown blackBook key '${key}'`); continue; }
        for (const id of r.blackBook[key]) {
          if (!(id in bb)) fail(`${where}: blackBook ref '${id}' does not resolve`);
          else if (!refClasses[key].includes(bb[id])) fail(`${where}: '${id}' is ${bb[id]}, not valid for ${key}`);
        }
      }
    }
  }
  allRecordsByIndustry.set(ind, records);

  // sources.json register
  const srcPath = join(dir, "sources.json");
  let register = [];
  if (!existsSync(srcPath)) fail(`${ind}/sources.json: missing`);
  else {
    try { register = JSON.parse(readFileSync(srcPath, "utf8")); }
    catch (e) { fail(`${ind}/sources.json: JSON parse error: ${e.message}`); }
    if (!Array.isArray(register)) { fail(`${ind}/sources.json: root is not an array`); register = []; }
    for (const s of register) for (const fld of ["id", "domain", "publisher", "publisherType", "inheritedFromBlackBook", "usedByRecordIds", "note", "lastChecked"])
      if (!(fld in s)) fail(`${ind}/sources.json#${s.id ?? "?"}: missing field '${fld}'`);
  }
  const domains = new Set(register.map((s) => s.domain));
  for (const r of records) for (const u of r.sources ?? []) {
    const d = new URL(u).hostname.replace(/^www\./, "");
    if (!domains.has(d)) fail(`${ind}#${r.id}: source domain '${d}' not in sources.json`);
  }
}

// workflow relatedKpiIds resolve within the same industry
for (const [ind, records] of allRecordsByIndustry) {
  const kpis = kpiIdsByIndustry.get(ind) ?? new Set();
  for (const r of records.filter((r) => r.category === "industry_workflow"))
    for (const k of r.relatedKpiIds ?? [])
      if (!kpis.has(k)) fail(`${ind}#${r.id}: relatedKpiId '${k}' does not resolve`);
}

// --- Content-review register ---------------------------------------------
{
  const regPath = join(here, "content-review-register.json");
  if (!existsSync(regPath)) fail("content-review-register.json: missing");
  else {
    let reg;
    try { reg = JSON.parse(readFileSync(regPath, "utf8")); }
    catch (e) { fail(`content-review-register.json: JSON parse error: ${e.message}`); reg = null; }
    if (reg) {
      const statuses = ["READY", "PARTIAL", "DESIGN_ONLY"];
      const tracks = ["REGULATORY_LINK", "RESEARCH_GAP", "TERMINOLOGY", "PRODUCT_DESIGN"];
      const human = ["PENDING", "APPROVED", "NEEDS_CHANGES", "REJECTED"];
      const datasetIds = new Set();
      for (const records of allRecordsByIndustry.values()) for (const r of records) datasetIds.add(r.id);
      const regIds = new Set();
      for (const e of reg.records ?? []) {
        const where = `register#${e.recordId ?? "?"}`;
        if (regIds.has(e.recordId)) fail(`${where}: duplicate register entry`);
        regIds.add(e.recordId);
        if (!datasetIds.has(e.recordId)) fail(`${where}: no matching dataset record`);
        if (!statuses.includes(e.evidenceStatus)) fail(`${where}: bad evidenceStatus`);
        if (!tracks.includes(e.reviewTrack)) fail(`${where}: bad reviewTrack`);
        if (!human.includes(e.humanReviewStatus)) fail(`${where}: bad humanReviewStatus`);
        if (e.humanReviewStatus === "PENDING" && (e.reviewer !== null || e.reviewedAt !== null))
          fail(`${where}: PENDING entry must not carry reviewer/reviewedAt`);
        if (e.humanReviewStatus !== "PENDING" && (!e.reviewer || !e.reviewedAt))
          fail(`${where}: decided entry requires reviewer and reviewedAt`);
      }
      for (const id of datasetIds) if (!regIds.has(id)) fail(`register: dataset record '${id}' has no register entry`);
      if (reg.gateStatus === "PENDING_HUMAN_REVIEW" && reg.approval?.status !== "PENDING")
        fail("register: gate pending but approval block not PENDING");
      console.log(`register: ${regIds.size} entries, gate ${reg.gateStatus}`);
    }
  }
}

// --- Report --------------------------------------------------------------
let total = 0, verified = 0, design = 0, gaps = 0, factUnverified = 0;
for (const records of allRecordsByIndustry.values()) for (const r of records) {
  total++;
  if (r.verified) verified++;
  else if (r.category === "industry_gap") gaps++;
  else if (r.assertionType === "product_design") design++;
  else factUnverified++;
}
console.log(`industries: ${industries.join(", ")}`);
console.log(`records: ${total} | verified external facts: ${verified} | product-design (declared): ${design} | declared gaps: ${gaps} | unverified external facts: ${factUnverified}`);
console.log(`black-book reference universe: ${Object.keys(bb).length} records`);
if (errors.length) { console.error(`\nFAIL: ${errors.length} error(s)`); for (const e of errors) console.error(" - " + e); process.exit(1); }
console.log("PASS: all checks green");
