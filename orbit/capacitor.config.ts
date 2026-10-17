import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.student.orbit',
  appName: 'Orbit',
  webDir: 'out',
  android: {
    backgroundColor: '#0e1012',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0e1012',
    },
  },
};

export default config;
