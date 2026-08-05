#!/usr/bin/env node
// Executes apps-script/*.gs inside a Node vm against hand-built mocks of the
// Apps Script runtime, then either runs the internal test suite
// (Tests.gs's runAllInternalTests()) or a scripted sequence of action calls
// (--exec, used to prove persistence survives a process restart — see
// tests/factory/persistence.test.ts, which spawns this script multiple
// times against the same --persist-file).
//
// Concatenates every .gs file into one script before running it, because
// Apps Script itself concatenates a project's files into one global scope
// at runtime (function *declarations* hoisted project-wide regardless of
// file order, but top-level *statements* executing in file order) —
// loading files separately would not reproduce that faithfully. See
// .claude/skills/barbershop-crm-builder/references/google-sheets-apps-script.md.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPS_SCRIPT_DIR = path.resolve(THIS_DIR, "..");

const argv = process.argv.slice(2);
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
}
const execScriptPath = argValue("--exec");
const persistFilePath = argValue("--persist-file");
// A raw JS expression evaluated once, inside the vm context, before --exec
// runs — e.g. "seedTestServiceAndStaff_('acme')". Test-only convenience for
// getting fixture data into a fresh sheet without a real spreadsheet import;
// production initialization uses factory/prepare-crm.mjs's generated
// bundle + APPS_SCRIPT_CONNECT_GUIDE.md instead, never this flag.
const seedExpr = argValue("--seed");

const files = fs
  .readdirSync(APPS_SCRIPT_DIR)
  .filter((f) => f.endsWith(".gs"))
  .sort();

const source = files.map((f) => fs.readFileSync(path.join(APPS_SCRIPT_DIR, f), "utf8")).join("\n\n");

// --- Mock Spreadsheet model, optionally file-persisted -------------------

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowIdx = this.row - 1 + r;
      const rowData = this.sheet.data[rowIdx] || [];
      const rowOut = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = rowData[this.col - 1 + c];
        rowOut.push(v === undefined ? "" : v);
      }
      out.push(rowOut);
    }
    return out;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIdx = this.row - 1 + r;
      while (this.sheet.data.length <= rowIdx) this.sheet.data.push([]);
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.data[rowIdx][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }
  setValue(value) {
    return this.setValues([[value]]);
  }
  setNumberFormat() {
    return this;
  }
  getNumberFormats() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowOut = [];
      for (let c = 0; c < this.numCols; c++) rowOut.push("General");
      out.push(rowOut);
    }
    return out;
  }
  setNumberFormats() {
    return this;
  }
}

class MockSheet {
  constructor(name, initialData) {
    this.name = name;
    this.data = initialData || [];
  }
  getRange(row, col, numRows, numCols) {
    return new MockRange(this, row, col, numRows ?? 1, numCols ?? 1);
  }
  getDataRange() {
    const numRows = this.data.length;
    const numCols = this.data.reduce((max, row) => Math.max(max, row.length), 0);
    return new MockRange(this, 1, 1, numRows, Math.max(numCols, 1));
  }
  getLastColumn() {
    return this.data[0] ? this.data[0].length : 0;
  }
  getLastRow() {
    return this.data.length;
  }
  getMaxRows() {
    return Math.max(this.data.length, 1000);
  }
  setFrozenRows() {}
  setFrozenColumns() {}
  autoResizeColumns() {}
  appendRow(row) {
    this.data.push(row.slice());
  }
  deleteRow(rowNumber) {
    this.data.splice(rowNumber - 1, 1);
  }
  clear() {
    this.data = [];
  }
  getName() {
    return this.name;
  }
}

class MockSpreadsheet {
  constructor(initialSheets) {
    this.sheets = new Map();
    if (initialSheets) {
      for (const [name, data] of Object.entries(initialSheets)) {
        this.sheets.set(name, new MockSheet(name, data));
      }
    }
  }
  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  getSheets() {
    return Array.from(this.sheets.values());
  }
  toJSON() {
    const out = {};
    for (const [name, sheet] of this.sheets) out[name] = sheet.data;
    return out;
  }
}

let initialSheets = null;
if (persistFilePath && fs.existsSync(persistFilePath)) {
  initialSheets = JSON.parse(fs.readFileSync(persistFilePath, "utf8"));
}
const spreadsheet = new MockSpreadsheet(initialSheets);

function persistIfConfigured() {
  if (!persistFilePath) return;
  fs.writeFileSync(persistFilePath, JSON.stringify(spreadsheet.toJSON()));
}

const scriptProperties = new Map([
  ["CRM_API_KEY", "test-api-key"],
  ["CRM_SIGNING_SECRET", "test-signing-secret"],
  ["CRM_SPREADSHEET_ID", "mock-spreadsheet-id"],
]);

const scriptCache = new Map();
let heldLock = false;

const SpreadsheetApp = {
  openById(id) {
    if (id !== scriptProperties.get("CRM_SPREADSHEET_ID")) {
      throw new Error("Unexpected spreadsheet id in mock: " + id);
    }
    return spreadsheet;
  },
};

const PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(key) {
        return scriptProperties.has(key) ? scriptProperties.get(key) : null;
      },
      setProperty(key, value) {
        scriptProperties.set(key, value);
      },
      deleteProperty(key) {
        scriptProperties.delete(key);
      },
    };
  },
};

const Utilities = {
  getUuid() {
    return crypto.randomUUID();
  },
  // Models the real, documented Apps Script behavior: the 2-arg overload
  // (no explicit Charset) does not reliably encode non-ASCII input as
  // UTF-8, while the 3-arg overload with Utilities.Charset.UTF_8 does. See
  // .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md
  // — Security.gs here always uses the 3-arg form, so this mock's 2-arg
  // path exists only to make a regression back to the implicit overload
  // fail loudly in tests, exactly as it did in the pilot project.
  computeHmacSha256Signature(value, key, charset) {
    const bytes =
      charset === "UTF_8"
        ? Buffer.from(value, "utf8")
        : Buffer.from(Array.from(value, (ch) => ch.charCodeAt(0) & 0xff));
    const digest = crypto.createHmac("sha256", key).update(bytes).digest();
    return Array.from(digest).map((b) => (b > 127 ? b - 256 : b));
  },
  DigestAlgorithm: { SHA_256: "SHA_256" },
  Charset: { UTF_8: "UTF_8" },
  base64Encode(bytes) {
    return Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString("base64");
  },
  base64EncodeWebSafe(bytes) {
    return Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b)))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  },
  computeDigest(_algorithm, value) {
    const bytes = crypto.createHash("sha256").update(value, "utf8").digest();
    return Array.from(bytes).map((b) => (b > 127 ? b - 256 : b));
  },
  sleep() {},
};

const CacheService = {
  getScriptCache() {
    return {
      get(key) {
        const entry = scriptCache.get(key);
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
          scriptCache.delete(key);
          return null;
        }
        return entry.value;
      },
      put(key, value, ttlSeconds) {
        scriptCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      },
    };
  },
};

const LockService = {
  getScriptLock() {
    return {
      tryLock() {
        if (heldLock) return false;
        heldLock = true;
        return true;
      },
      releaseLock() {
        heldLock = false;
      },
    };
  },
};

const ContentService = {
  MimeType: { JSON: "JSON" },
  createTextOutput(text) {
    return {
      _text: text,
      setMimeType() {
        return this;
      },
    };
  },
};

const Logger = {
  log(...args) {
    if (process.env.GAS_HARNESS_VERBOSE) console.log("[Logger]", ...args);
  },
};

const Session = {
  getScriptTimeZone() {
    return "Etc/UTC";
  },
};

const context = {
  SpreadsheetApp,
  PropertiesService,
  Utilities,
  CacheService,
  LockService,
  ContentService,
  Logger,
  Session,
  console,
  Date,
  JSON,
  Object,
  Array,
  Math,
  String,
  Number,
  Boolean,
  Error,
  RegExp,
};
context.global = context;
vm.createContext(context);

try {
  vm.runInContext(source, context, { filename: "apps-script-bundle.js" });
} catch (err) {
  console.error("Failed to load Apps Script bundle:", err);
  process.exit(1);
}

try {
  vm.runInContext("setupCRM()", context);
} catch (err) {
  console.error("setupCRM() failed:", err);
  process.exit(1);
}

if (seedExpr) {
  // Only runs when a sheet has no rows for the relevant tables yet —
  // idempotent in the same spirit as setupCRM(), so re-running against an
  // already-persisted file (e.g. a second --exec call in the same test)
  // doesn't duplicate fixture rows.
  const alreadySeeded = vm.runInContext("sheetToObjects_(SHEET_NAMES.SERVICES).length > 0", context);
  if (!alreadySeeded) {
    try {
      vm.runInContext(seedExpr, context);
    } catch (err) {
      console.error("--seed expression failed:", err);
      process.exit(1);
    }
  }
}

if (execScriptPath) {
  const script = JSON.parse(fs.readFileSync(execScriptPath, "utf8"));
  const results = [];
  for (const step of script) {
    try {
      context.__stepAction = step.action;
      context.__stepPayload = step.payload || {};
      const result = vm.runInContext("routeAction_(__stepAction, __stepPayload)", context);
      results.push({ ok: true, action: step.action, data: result });
    } catch (err) {
      results.push({ ok: false, action: step.action, error: { code: err && err.code, message: err && err.message } });
    }
  }
  persistIfConfigured();
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

let summary;
try {
  summary = vm.runInContext("runAllInternalTests()", context);
} catch (err) {
  console.error("runAllInternalTests() failed to execute:", err);
  process.exit(1);
}

persistIfConfigured();
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) {
  process.exit(1);
}
