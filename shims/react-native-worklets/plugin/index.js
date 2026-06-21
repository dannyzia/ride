// Shim: delegate to react-native-reanimated/plugin
// reanimated 3.x bundles worklets natively, so the standalone
// react-native-worklets package is not needed and would cause
// DEX merge conflicts (duplicate AndroidUIScheduler class).
module.exports = require('react-native-reanimated/plugin');
