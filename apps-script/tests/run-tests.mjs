#!/usr/bin/env node
// Executes apps-script/*.gs inside a Node vm against hand-built mocks of the
// Apps Script runtime (SpreadsheetApp, PropertiesService, Utilities,
// CacheService, LockService, ContentService, Logger), then runs
// runAllInternalTests(). Concatenates every .gs file into one script before
// running it, because Apps Script itself concatenates all files in a
// project into one global scope (with function declarations hoisted
// project-wide, but top-level statements executing in file order) — loading
// files separately would not reproduce that behavior faithfully.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPS_SCRIPT_DIR = process.argv[2] || path.resolve(THIS_DIR, "..");

const files = fs
  .readdirSync(APPS_SCRIPT_DIR)
  .filter((f) => f.endsWith(".gs"))
  .sort(); // Apps Script evaluates top-level statements in (roughly) alphabetical file order.

const source = files.map((f) => fs.readFileSync(path.join(APPS_SCRIPT_DIR, f), "utf8")).join("\n\n");

// --- Mock Spreadsheet model ---------------------------------------------

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
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
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
  constructor() {
    this.sheets = new Map();
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
}

const spreadsheet = new MockSpreadsheet();

const scriptProperties = new Map([
  ["CRM_API_KEY", "test-api-key"],
  ["CRM_SIGNING_SECRET", "test-signing-secret"],
  ["CRM_SPREADSHEET_ID", "mock-spreadsheet-id"],
  ["BUSINESS_TIMEZONE", "America/La_Paz"],
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
    };
  },
};

const Utilities = {
  getUuid() {
    return crypto.randomUUID();
  },
  computeHmacSha256Signature(value, key) {
    const bytes = crypto.createHmac("sha256", key).update(value, "utf8").digest();
    return Array.from(bytes).map((b) => (b > 127 ? b - 256 : b));
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
  // A real (not stubbed) implementation of the handful of Java
  // SimpleDateFormat patterns DateTime.gs actually uses ("u", "Z",
  // "yyyy-MM-dd", "HH:mm") — apps-script/DateTime.gs depends on these
  // being correct for real timezone-conversion logic (offset computation,
  // weekday-of-local-date), so a fixed/fake stand-in would silently hide
  // real timezone bugs instead of catching them.
  formatDate(date, timeZone, pattern) {
    const zonedParts = () => {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, weekday: "short",
      });
      const map = {};
      for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
      if (map.hour === "24") map.hour = "00";
      return map;
    };
    const pad2 = (n) => String(n).padStart(2, "0");

    if (pattern === "yyyy-MM-dd") {
      const p = zonedParts();
      return `${p.year}-${p.month}-${p.day}`;
    }
    if (pattern === "HH:mm") {
      const p = zonedParts();
      return `${p.hour}:${p.minute}`;
    }
    if (pattern === "u") {
      const weekdayIso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      return String(weekdayIso[zonedParts().weekday]);
    }
    if (pattern === "Z") {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" });
      const tzName = dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT+0";
      const m = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
      if (!m) return "+0000";
      return m[1] + pad2(m[2]) + pad2(m[3] || "0");
    }
    throw new Error("Mock Utilities.formatDate: unsupported pattern " + pattern);
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
    return "America/La_Paz";
  },
};

// Minimal in-memory CalendarApp mock — enough to exercise Calendar.gs's
// create/update/cancel-event lifecycle without a real Google Calendar.
const mockCalendarEvents = new Map();
const mockCalendars = new Map();
function makeMockEvent(id, title, startDate, endDate, options) {
  const event = {
    id,
    title,
    startDate,
    endDate,
    description: options && options.description,
    deleted: false,
    getId() { return event.id; },
    setTime(newStart, newEnd) { event.startDate = newStart; event.endDate = newEnd; },
    deleteEvent() { event.deleted = true; },
  };
  return event;
}
const CalendarApp = {
  getCalendarById(id) {
    if (id === "invalid-calendar-id-for-test") return null;
    if (!mockCalendars.has(id)) {
      mockCalendars.set(id, {
        id,
        createEvent(title, startDate, endDate, options) {
          const event = makeMockEvent(`mock-event-${mockCalendarEvents.size + 1}`, title, startDate, endDate, options);
          mockCalendarEvents.set(event.id, event);
          return event;
        },
        getEventById(eventId) {
          const event = mockCalendarEvents.get(eventId);
          return event && !event.deleted ? event : null;
        },
      });
    }
    return mockCalendars.get(id);
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
  CalendarApp,
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

let summary;
try {
  summary = vm.runInContext("runAllInternalTests()", context);
} catch (err) {
  console.error("runAllInternalTests() failed to execute:", err);
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) {
  process.exit(1);
}
