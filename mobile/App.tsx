import CoreApp from './src/app/CoreApp';
import MockupApp from './src/mockup/MockupApp';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

const webSandboxByPort =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (window.location.port === '8090' || window.location.search.includes('sandbox=1'));

const sandboxEnabled = process.env.EXPO_PUBLIC_UI_SANDBOX === '1' || webSandboxByPort;

export default function App() {
  if (sandboxEnabled) {
    return (
      <SafeAreaProvider>
        <MockupApp />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <CoreApp />
    </SafeAreaProvider>
  );
}
