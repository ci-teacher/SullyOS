import React from 'react';
import ReactDOM from 'react-dom/client';
import './components/private/private-theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isDesignLab = window.location.pathname === '/design-lab';

async function boot() {
  if (isDesignLab) {
    const { default: PrivateDesignLab } = await import('./components/private/PrivateDesignLab');
    root.render(
      <React.StrictMode>
        <PrivateDesignLab />
      </React.StrictMode>
    );
    return;
  }

  const [
    { default: App },
    { installTranslateCrashGuard },
    { installIOSStandaloneWorkaround },
    { initAnalytics },
    { installSharedPhoneFoundation },
    { Capacitor },
  ] = await Promise.all([
    import('./App'),
    import('./utils/translateCrashGuard'),
    import('./utils/iosStandalone'),
    import('./utils/analytics'),
    import('./utils/shared/installSharedPhone'),
    import('@capacitor/core'),
  ]);

  installSharedPhoneFoundation();

  if (import.meta.env.VITE_AMSG_NATIVE_PUSH === 'true' && Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') {
      void import('./utils/unifiedPushRuntime').then(({ initUnifiedPushRuntime }) => initUnifiedPushRuntime());
    } else {
      void import('./utils/nativeAmsgPush').then(({ initNativeAmsgPush }) => initNativeAmsgPush());
    }
  }

  const sharedPhoneMode = import.meta.env.VITE_SHARED_PHONE_MODE === 'true';

  if (!sharedPhoneMode) {
    const [
      { ActiveMsgRuntime },
      { KeepAlive },
      { ProactiveChat },
      { VRScheduler },
      { installWakeListener },
    ] = await Promise.all([
      import('./utils/activeMsgRuntime'),
      import('./utils/keepAlive'),
      import('./utils/proactiveChat'),
      import('./utils/vrWorld/scheduler'),
      import('./utils/proactivePushConfig'),
    ]);

    void KeepAlive.init().then(() => {
      ProactiveChat.resume();
      VRScheduler.resume();
      void ActiveMsgRuntime.init();
      installWakeListener();
    });
  }

  installIOSStandaloneWorkaround();
  initAnalytics();
  installTranslateCrashGuard();

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void boot();
