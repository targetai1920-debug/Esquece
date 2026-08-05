/** Generic, sheet-agnostic CRUD helpers built on Sheets.gs's batch primitives. */

function findRowById_(sheetName, idField, id, rows) {
  var data = rows || sheetToObjects_(sheetName);
  for (var i = 0; i < data.length; i++) {
    if (data[i][idField] === id) return data[i];
  }
  return null;
}

function findRowsWhere_(sheetName, predicate, rows) {
  var data = rows || sheetToObjects_(sheetName);
  return data.filter(predicate);
}

function insertRow_(sheetName, obj) {
  return appendRowFromObject_(sheetName, obj);
}

function updateRowById_(sheetName, idField, id, patch) {
  var sheet = getOrCreateSheet_(sheetName);
  var rows = sheetToObjects_(sheetName);
  var existing = findRowById_(sheetName, idField, id, rows);
  if (!existing) return null;
  var merged = {};
  for (var key in existing) merged[key] = existing[key];
  for (var pkey in patch) merged[pkey] = patch[pkey];
  updateRowFromObject_(sheetName, existing._rowNumber, merged);
  return merged;
}
