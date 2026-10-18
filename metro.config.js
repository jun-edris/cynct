// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// expo-sqlite on web loads a .wasm file (used only for the web preview; the app targets Android)
config.resolver.assetExts.push('wasm');
module.exports = config;
