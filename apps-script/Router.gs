/**
 * Action dispatch table. Each entry is a zero/one-argument function
 * (payload) => data. Domain files (Phase C/D) register more actions here
 * as they're implemented — this file only declares the ones that exist so
 * far (Phase B: system actions only).
 *
 * Router.gs is intentionally the only place that maps an action name to a
 * handler — no action string is ever eval'd or dynamically resolved
 * against the global scope, so an unrecognized action can never
 * accidentally call an internal helper function.
 */

var ACTION_HANDLERS_ = {
  health: actionHealth_,
  getApiVersion: actionGetApiVersion_,
  validateCrmStructure: actionValidateCrmStructure_,
};

/**
 * Registers additional actions from later phases without requiring this
 * file to be edited each time — domain files call
 * registerAction_("actionName", handlerFn) from their own top-level scope.
 */
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
