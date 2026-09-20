function noop() {}

const Worklets = {
  getUseOfValueInStyleWarning: noop,
  createSerializable: (value) => value,
  createWorkletRuntime: noop,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  isWorkletFunction: () => false
};

module.exports = Worklets;
module.exports.default = Worklets;
