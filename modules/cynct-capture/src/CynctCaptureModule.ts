import { NativeModule, requireNativeModule } from 'expo';

declare class CynctCaptureModule extends NativeModule<{}> {
  isEnabled(): boolean;
  openSettings(): boolean;
  rebind(): boolean;
  setAllowlist(packages: string[], names: string[]): boolean;
  drain(): Promise<string>;
}

export default requireNativeModule<CynctCaptureModule>('CynctCapture');
