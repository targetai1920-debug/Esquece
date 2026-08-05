/**
 * STAFF + STAFF_SERVICES + WORKING_HOURS + BREAKS assembled into the same
 * nested shape the Next.js side's Staff type expects (see
 * src/lib/crm/types.ts's Staff interface and factory.ts's mapping) — kept
 * as one assembly function so every caller (public listing, admin) gets
 * the identical shape.
 */

function buildStaffObject_(staffRow, staffServiceRows, workingHoursRows, breakRows) {
  var serviceIds = staffServiceRows
    .filter(function (r) {
      return r.staffId === staffRow.staffId && String(r.active) === "true";
    })
    .map(function (r) {
      return r.serviceId;
    });

  var workingHours = {};
  workingHoursRows
    .filter(function (r) {
      return r.staffId === staffRow.staffId && String(r.active) === "true";
    })
    .forEach(function (r) {
      workingHours[r.dayOfWeek] = { closed: false, start: r.openingTime, end: r.closingTime };
    });

  var breaks = breakRows
    .filter(function (r) {
      return r.staffId === staffRow.staffId && String(r.active) === "true";
    })
    .map(function (r) {
      return { days: [r.dayOfWeek], start: r.startTime, end: r.endTime };
    });

  return {
    id: staffRow.staffId,
    name: staffRow.name,
    biography: staffRow.biography || "",
    photo: staffRow.photoUrl || "",
    active: String(staffRow.active) === "true",
    publicBooking: String(staffRow.publicBooking) !== "false",
    serviceIds: serviceIds,
    workingHours: workingHours,
    breaks: breaks,
  };
}

function loadAllStaffContext_() {
  return {
    staff: sheetToObjects_(SHEET_NAMES.STAFF),
    staffServices: sheetToObjects_(SHEET_NAMES.STAFF_SERVICES),
    workingHours: sheetToObjects_(SHEET_NAMES.WORKING_HOURS),
    breaks: sheetToObjects_(SHEET_NAMES.BREAKS),
  };
}

function actionListStaff_() {
  var ctx = loadAllStaffContext_();
  var active = ctx.staff.filter(function (r) {
    return String(r.active) === "true" && String(r.publicBooking) !== "false";
  });
  return {
    staff: active.map(function (row) {
      return buildStaffObject_(row, ctx.staffServices, ctx.workingHours, ctx.breaks);
    }),
  };
}

function actionListStaffForService_(payload) {
  var serviceId = requireString_(payload, "serviceId");
  var ctx = loadAllStaffContext_();
  var eligibleIds = {};
  ctx.staffServices
    .filter(function (r) {
      return r.serviceId === serviceId && String(r.active) === "true";
    })
    .forEach(function (r) {
      eligibleIds[r.staffId] = true;
    });
  var eligible = ctx.staff.filter(function (r) {
    return String(r.active) === "true" && String(r.publicBooking) !== "false" && eligibleIds[r.staffId];
  });
  return {
    staff: eligible.map(function (row) {
      return buildStaffObject_(row, ctx.staffServices, ctx.workingHours, ctx.breaks);
    }),
  };
}

function actionAdminListStaff_() {
  var ctx = loadAllStaffContext_();
  return {
    staff: ctx.staff.map(function (row) {
      return buildStaffObject_(row, ctx.staffServices, ctx.workingHours, ctx.breaks);
    }),
  };
}

function requireActiveStaff_(staffId, ctx) {
  var context = ctx || loadAllStaffContext_();
  var row = findRowById_(SHEET_NAMES.STAFF, "staffId", staffId, context.staff);
  if (!row || String(row.active) !== "true") {
    throw new ApiError(ERROR_CODES.STAFF_NOT_FOUND, "Staff member not found or inactive.", false);
  }
  return buildStaffObject_(row, context.staffServices, context.workingHours, context.breaks);
}

function actionAdminSetStaffActive_(payload) {
  var staffId = requireString_(payload, "staffId");
  var active = requireBoolean_(payload, "active");
  var updated = updateRowById_(SHEET_NAMES.STAFF, "staffId", staffId, { active: active, updatedAt: new Date().toISOString() });
  if (!updated) throw new ApiError(ERROR_CODES.STAFF_NOT_FOUND, "Staff member not found.", false);
  writeAuditEntry_("setStaffActive", "Staff", staffId, "admin", { active: active });
  var ctx = loadAllStaffContext_();
  return { staff: buildStaffObject_(updated, ctx.staffServices, ctx.workingHours, ctx.breaks) };
}
