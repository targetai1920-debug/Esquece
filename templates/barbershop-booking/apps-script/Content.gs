function actionListFaqs_() {
  var rows = sheetToObjects_(SHEET_NAMES.FAQS).filter(function (r) {
    return String(r.active) === "true";
  });
  return {
    faqs: rows.map(function (r) {
      return { id: r.faqId, question: r.question, answer: r.answer };
    }),
  };
}

function actionListPromotions_() {
  var todayIso = new Date().toISOString().slice(0, 10);
  var rows = sheetToObjects_(SHEET_NAMES.PROMOTIONS).filter(function (r) {
    return String(r.active) === "true" && r.validFrom <= todayIso && todayIso <= r.validUntil;
  });
  return {
    promotions: rows.map(function (r) {
      return { id: r.promotionId, name: r.name, description: r.description, validFrom: r.validFrom, validUntil: r.validUntil };
    }),
  };
}
