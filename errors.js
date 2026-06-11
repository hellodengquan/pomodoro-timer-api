class StateTransitionError extends Error {
  constructor(message, currentStatus, attemptedAction, allowedActions) {
    super(message);
    this.name = 'StateTransitionError';
    this.code = 'INVALID_STATE_TRANSITION';
    this.currentStatus = currentStatus;
    this.attemptedAction = attemptedAction;
    this.allowedActions = allowedActions;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      current_status: this.currentStatus,
      attempted_action: this.attemptedAction,
      allowed_actions: this.allowedActions
    };
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code
    };
  }
}

module.exports = {
  StateTransitionError,
  NotFoundError
};
