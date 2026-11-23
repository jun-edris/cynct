// Re-export the native module. On web, it will be resolved to CynctCaptureModule.web.ts
// and on native platforms to CynctCaptureModule.ts
export { default } from './src/CynctCaptureModule';
export * from './src/CynctCapture.types';
