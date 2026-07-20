import { useEffect } from 'react';
import { motion } from 'framer-motion';

// Full-viewport loading screen shown for 3 seconds when the app first loads,
// then fades into the app. Uses the 9:16 image on mobile and the 16:9 image on
// desktop (768px breakpoint via <picture>). An animated progress bar fills over
// the 3 seconds so the wait reads as a genuine load.
const SPLASH_MS = 3000;

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <picture>
        <source media="(min-width: 768px)" srcSet="/imgs/loading_screen_desktop.png" />
        <img className="splash-img" src="/imgs/loading_screen_mobile.png" alt="My Suncity Vistaar" />
      </picture>
      <div className="splash-loader">
        <div className="splash-bar">
          <motion.div
            className="splash-bar-fill"
            initial={{ width: '0%' }}
            // A slightly uneven pace (fast start, brief settle, finish) reads more
            // like real progress than a perfectly linear fill.
            animate={{ width: ['0%', '32%', '58%', '82%', '100%'] }}
            transition={{ duration: SPLASH_MS / 1000, ease: 'easeInOut', times: [0, 0.2, 0.45, 0.75, 1] }}
          />
        </div>
        <div className="splash-loading-text">Loading…</div>
      </div>
    </motion.div>
  );
}
