import { registerWebModule, NativeModule } from 'expo';

// Notification capture is Android-only. On the web preview it reports "off" and captures nothing.
class CynctCaptureModule extends NativeModule<{}> {
  isEnabled() { return false; }
  openSettings() { return false; }
  rebind() { return false; }
  setAllowlist(_p: string[], _n: string[]) { return false; }
  async drain() { return '[]'; }
}

export default registerWebModule(CynctCaptureModule, 'CynctCaptureModule');
