// Inputs to OpenZeppelin's function(s):
unsafeAllow:
  struct-definition: Omit (i.e. use OZ's default). Deprecated.
  enum-definition: Omit (i.e. use OZ's default). Deprecated.
  constructor: True. We always allow because we have different requirements than OZ. False doesn't work because we allow constructors for immutable assignments. True doesn't work because we need to restrict what occurs in the body of the constructor.
  delegatecall: User.
  selfdestruct: User.
  missing-public-upgradeto: User.
  state-variable-assignment: True. We always allow because we need to do our own checks. False doesn't work because OZ will throw an error on immutable variable assignments. True doesn't work because OZ will allow e.g. `uint x = 2`, which we never want to allow.
  state-variable-immutable: True. We always allow immutable variables.
  external-library-linking: TODO
unsafeAllowRenames: User.
unsafeSkipStorageCheck: User.
