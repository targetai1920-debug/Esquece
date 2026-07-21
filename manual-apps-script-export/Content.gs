/**
 * FAQS and PROMOTIONS — small, read-mostly content sheets. Claude must
 * never mention a promotion not present and active here (ARCHITECTURE.md
 * §7) — actionListPromotions_ already filters to currently-valid ones so
 * the caller doesn't have to re-derive that logic.
 */

function actionListFaqs_() {
  var rows = findRowsWhere_(
    getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.FAQS),
    isActiveRow_,
  );
  return { faqs: sortByDisplayOrder_(rows) };
}

function actionListPromotions_() {
  var today = formatUtcToLocalDate_(new Date(), getBusinessTimezone_());
  var rows = findRowsWhere_(getOrCreateSheet_(getSpreadsheet_(), SHEET_NAMES.PROMOTIONS), function (row) {
    if (!isActiveRow_(row)) return false;
    var validFrom = row.validFrom ? String(row.validFrom) : null;
    var validUntil = row.validUntil ? String(row.validUntil) : null;
    if (validFrom && today < validFrom) return false;
    if (validUntil && today > validUntil) return false;
    return true;
  });
  return { promotions: rows };
}
