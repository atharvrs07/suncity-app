import { useEffect, useState } from 'react';

// Lightweight platform detection (item 6). Used to pick a platform-native style
// for the header language picker: iOS liquid-glass action sheet, Android Material
// bottom sheet, and a plain dropdown/popover elsewhere. Detection is by user
// agent (plus the iPadOS-on-desktop-UA quirk of MacIntel + touch points).
export function getPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export const isIOS = () => getPlatform() === 'ios';
export const isAndroid = () => getPlatform() === 'android';

// Reactive viewport check (mobile vs desktop) for layout that must differ by
// available width rather than OS — e.g. the notification panel opens as a bottom
// sheet on phones and an anchored dropdown on wide screens.
export function useIsMobile(maxWidth = 640) {
  const query = `(max-width: ${maxWidth}px)`;
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMobile(e.matches);
    setMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return mobile;
}
