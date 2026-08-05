function normalizePhone_(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function customerRowToObject_(row) {
  return { id: row.customerId, name: row.name, phone: row.phone, email: row.email || "" };
}

/**
 * Deduped by normalized phone. A partial update never erases a
 * previously-known field — merges, preferring non-empty incoming values,
 * never a blind overwrite. See references/crm-data-model.md.
 */
function upsertCustomer_(input) {
  var normalized = normalizePhone_(input.phone);
  var rows = sheetToObjects_(SHEET_NAMES.CUSTOMERS);
  var existing = null;
  for (var i = 0; i < rows.length; i++) {
    if (normalizePhone_(rows[i].phone) === normalized) {
      existing = rows[i];
      break;
    }
  }
  if (existing) {
    var patch = { updatedAt: new Date().toISOString() };
    if (input.name) patch.name = input.name;
    if (input.email) patch.email = input.email;
    var merged = updateRowById_(SHEET_NAMES.CUSTOMERS, "customerId", existing.customerId, patch);
    return customerRowToObject_(merged);
  }
  var created = {
    customerId: generateUuid_(),
    name: input.name || "",
    phone: input.phone || "",
    email: input.email || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  appendRowFromObject_(SHEET_NAMES.CUSTOMERS, created);
  return customerRowToObject_(created);
}
