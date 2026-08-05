/**
 * Central action dispatch table — one explicit object literal, referencing
 * handler functions by name. Deliberately NOT built by having each domain
 * file call a "register yourself" function from its own top-level scope —
 * Apps Script concatenates every file into one global context and hoists
 * function *declarations* regardless of file order, but a top-level
 * statement (like a self-registration call) still runs in file-load
 * order, which would be a real hazard here. See
 * references/google-sheets-apps-script.md §"Central action router".
 */
var ACTION_HANDLERS_ = {
  health: actionHealth_,
  getApiVersion: actionGetApiVersion_,
  validateCrmStructure: actionValidateCrmStructure_,

  getBusinessSettings: actionGetBusinessSettings_,
  updateSetting: actionUpdateSetting_,

  listServices: actionListServices_,
  adminListServices: actionAdminListServices_,
  adminSetServiceActive: actionAdminSetServiceActive_,
  adminSetServicePrice: actionAdminSetServicePrice_,

  listStaff: actionListStaff_,
  listStaffForService: actionListStaffForService_,
  adminListStaff: actionAdminListStaff_,
  adminSetStaffActive: actionAdminSetStaffActive_,

  listFaqs: actionListFaqs_,
  listPromotions: actionListPromotions_,

  getAvailability: actionGetAvailability_,
  validateSlot: actionValidateSlot_,

  createAppointment: actionCreateAppointment_,
  getAppointmentByReference: actionGetAppointmentByReference_,
  cancelAppointment: actionCancelAppointment_,
  rescheduleAppointment: actionRescheduleAppointment_,
  confirmAppointment: actionConfirmAppointment_,
  completeAppointment: actionCompleteAppointment_,
  markNoShow: actionMarkNoShow_,
  adminCancelAppointment: actionAdminCancelAppointment_,
  adminRescheduleAppointment: actionAdminRescheduleAppointment_,
  listAppointments: actionListAppointments_,

  listBlockedSlots: actionListBlockedSlots_,
  createBlockedSlot: actionCreateBlockedSlot_,
  deleteBlockedSlot: actionDeleteBlockedSlot_,
  listTimeOff: actionListTimeOff_,
  createTimeOff: actionCreateTimeOff_,
  deleteTimeOff: actionDeleteTimeOff_,

  createAuditEntry: actionCreateAuditEntry_,
  listAuditLog: actionListAuditLog_,

  importSeed: actionImportSeed_,
};

function routeAction_(action, payload) {
  var handler = ACTION_HANDLERS_[action];
  if (!handler) {
    throw new ApiError(ERROR_CODES.UNSUPPORTED_ACTION, "Unsupported action: " + action, false);
  }
  return handler(payload || {});
}

/** Kept for tests/tools that want to register a throwaway action at runtime — not for cross-file wiring (see header comment). */
function registerAction_(name, handler) {
  ACTION_HANDLERS_[name] = handler;
}
