/**
 * Action dispatch table. Each entry is a zero/one-argument function
 * (payload) => data.
 *
 * All actions are listed directly in this one object literal, in this one
 * file — deliberately NOT built by having each domain file call
 * registerAction_() from its own top-level scope. Apps Script concatenates
 * all .gs files into one global context and hoists function *declarations*
 * across that whole context regardless of file order, but top-level
 * *statements* (like a registerAction_ call sitting outside any function)
 * still execute in file order — alphabetical by default in the editor.
 * A file named e.g. "Barbers.gs" would run its top-level registerAction_
 * call before "Router.gs" even finishes initializing ACTION_HANDLERS_,
 * which would throw. Referencing handler functions by name inside this
 * object literal instead has no such hazard, since by the time this
 * statement runs, every function declaration in the project already
 * exists in scope. registerAction_ is kept below only for tests/tools
 * that want to register a throwaway action at runtime, not for
 * cross-file wiring.
 */

var ACTION_HANDLERS_ = {
  // System (Phase B)
  health: actionHealth_,
  getApiVersion: actionGetApiVersion_,
  validateCrmStructure: actionValidateCrmStructure_,

  // Settings and public data (Phase C)
  getBusinessSettings: actionGetBusinessSettings_,
  listServices: actionListServices_,
  getService: actionGetService_,
  listBarbers: actionListBarbers_,
  getBarber: actionGetBarber_,
  listBarbersForService: actionListBarbersForService_,
  listFaqs: actionListFaqs_,
  listPromotions: actionListPromotions_,

  // Customers (Phase C)
  findCustomerByPhone: actionFindCustomerByPhone_,
  upsertCustomer: actionUpsertCustomer_,
  getCustomer: actionGetCustomer_,
  listCustomers: actionListCustomers_,
  getCustomerHistory: actionGetCustomerHistory_,

  // Availability (Phase D)
  getAvailability: actionGetAvailability_,
  validateSlot: actionValidateSlot_,

  // Appointments (Phase D)
  createAppointment: actionCreateAppointment_,
  getAppointment: actionGetAppointment_,
  getAppointmentByReference: actionGetAppointmentByReference_,
  listAppointments: actionListAppointments_,
  listCustomerAppointments: actionListCustomerAppointments_,
  cancelAppointment: actionCancelAppointment_,
  rescheduleAppointment: actionRescheduleAppointment_,
  updateAppointmentStatus: actionUpdateAppointmentStatus_,

  // Audit (Phase D)
  createAuditEntry: actionCreateAuditEntry_,
  listAuditEntries: actionListAuditEntries_,

  // Notifications (Phase D — row management only; sending is Phase J)
  createNotification: actionCreateNotification_,
  listDueNotifications: actionListDueNotifications_,
  claimNotification: actionClaimNotification_,
  markNotificationSent: actionMarkNotificationSent_,
  markNotificationFailed: actionMarkNotificationFailed_,
  cancelNotification: actionCancelNotification_,
};

function registerAction_(name, handler) {
  ACTION_HANDLERS_[name] = handler;
}

function routeAction_(action, payload) {
  var handler = ACTION_HANDLERS_[action];
  if (!handler) {
    throw new ApiError(ERROR_CODES.UNSUPPORTED_ACTION, "Unsupported action: " + action, false);
  }
  return handler(payload);
}
