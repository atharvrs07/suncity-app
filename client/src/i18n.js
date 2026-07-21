import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// i18n foundation (item 6). English + Hindi today; the resource structure makes
// adding more languages a matter of dropping in another block. The choice is
// persisted in localStorage ('sv_lang') and restored on load.
//
// NOTE: coverage prioritises the high-traffic surfaces (navigation, common
// actions, home, dues, settings, auth, notifications). Strings not yet keyed fall
// back to their English default text, so the app is never broken — deeper page
// bodies can be translated incrementally by adding keys here. A few Hindi strings
// keep English technical terms (UPI, QR, OTP) where that reads more naturally to
// users; these are flagged for review.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

const en = {
  brand: {
    title: 'SunCity Vistaar - Jan Kalyan Samiti',
    app: 'My Suncity Vistaar',
    tagline: 'Society, simplified',
  },
  nav: {
    home: 'Home',
    complaints: 'Complaints',
    dues: 'Dues',
    notices: 'Notices',
    classifieds: 'Classifieds',
    approvals: 'Approvals',
    controlPanel: 'Control Panel',
    lostFound: 'Lost & Found',
    events: 'Society Events',
    gallery: 'Photo Gallery',
    settings: 'Settings',
    logout: 'Logout',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    loading: 'Loading…',
    all: 'All',
    call: 'Call',
    download: 'Download',
    copy: 'Copy',
    copied: 'Copied!',
    upload: 'Upload',
    remove: 'Remove',
    seeMore: 'See more',
    viewAll: 'View all',
    optional: 'optional',
  },
  theme: { light: 'Light', dark: 'Dark', label: 'Appearance' },
  language: { label: 'Language' },
  home: {
    greeting: 'Hello, {{name}}',
    yourDues: 'Your Dues',
    payNow: 'Pay now',
    noDues: 'No dues right now',
    allClear: "You're all caught up.",
    payTitle: 'Pay society dues',
    scanToPay: 'Scan to pay',
    downloadQr: 'Download QR',
    upiId: 'UPI ID',
    quickActions: 'Quick actions',
    upcomingEvents: 'Upcoming events',
    pastEvents: 'Past events',
    recentNotices: 'Recent notices',
    eventsCalendar: 'Events calendar',
  },
  dues: {
    title: 'Dues',
    pay: 'Pay',
    payDue: 'Pay this due',
    uploadScreenshot: 'Upload payment screenshot',
    enterUtr: 'Enter UTR / reference',
    aiChecking: 'Checking your screenshot…',
    provisionalSent: 'Provisional receipt sent',
    awaitingVerification: 'Awaiting verification',
    verified: 'Verified',
    flagged: 'Flagged for review',
    status: {
      pending: 'Pending',
      submitted: 'Verifying',
      paid: 'Paid',
      overdue: 'Overdue',
    },
    unpaidResidents: 'Residents who haven’t paid',
    unpaidCount: '{{count}} resident hasn’t paid',
    unpaidCount_plural: '{{count}} residents haven’t paid',
  },
  notifications: {
    title: 'Notifications',
    empty: 'No notifications yet',
    markAllRead: 'Mark all read',
    unread: 'unread',
  },
  settings: {
    title: 'Settings',
    profile: 'Profile',
    profilePicture: 'Profile picture',
    changePhoto: 'Change photo',
    appearance: 'Appearance',
    language: 'Language',
    sessionActivity: 'Session Activity',
    lastActive: 'Last active',
    lastLogin: 'Last login',
    memberSince: 'Member since',
    thisSession: 'This session',
    recentSessions: 'Recent sessions',
  },
  auth: {
    login: 'Log in',
    signup: 'Sign up',
    rememberMe: 'Stay logged in',
    phone: 'Phone number',
    password: 'Password',
  },
};

const hi = {
  brand: {
    title: 'सनसिटी विस्तार - जन कल्याण समिति',
    app: 'माय सनसिटी विस्तार',
    tagline: 'सोसाइटी, आसान बनाई गई',
  },
  nav: {
    home: 'होम',
    complaints: 'शिकायतें',
    dues: 'बकाया',
    notices: 'सूचनाएँ',
    classifieds: 'क्लासिफाइड',
    approvals: 'स्वीकृतियाँ',
    controlPanel: 'कंट्रोल पैनल',
    lostFound: 'खोया-पाया',
    events: 'सोसाइटी कार्यक्रम',
    gallery: 'फ़ोटो गैलरी',
    settings: 'सेटिंग्स',
    logout: 'लॉग आउट',
  },
  common: {
    save: 'सहेजें',
    cancel: 'रद्द करें',
    submit: 'जमा करें',
    delete: 'हटाएँ',
    edit: 'संपादित करें',
    close: 'बंद करें',
    loading: 'लोड हो रहा है…',
    all: 'सभी',
    call: 'कॉल करें',
    download: 'डाउनलोड',
    copy: 'कॉपी',
    copied: 'कॉपी हो गया!',
    upload: 'अपलोड',
    remove: 'हटाएँ',
    seeMore: 'और देखें',
    viewAll: 'सभी देखें',
    optional: 'वैकल्पिक',
  },
  theme: { light: 'लाइट', dark: 'डार्क', label: 'रूप-रंग' },
  language: { label: 'भाषा' },
  home: {
    greeting: 'नमस्ते, {{name}}',
    yourDues: 'आपका बकाया',
    payNow: 'अभी भुगतान करें',
    noDues: 'अभी कोई बकाया नहीं',
    allClear: 'आपका सब भुगतान हो चुका है।',
    payTitle: 'सोसाइटी बकाया भुगतान',
    scanToPay: 'भुगतान के लिए स्कैन करें',
    downloadQr: 'QR डाउनलोड करें',
    upiId: 'UPI आईडी',
    quickActions: 'त्वरित क्रियाएँ',
    upcomingEvents: 'आगामी कार्यक्रम',
    pastEvents: 'पिछले कार्यक्रम',
    recentNotices: 'हाल की सूचनाएँ',
    eventsCalendar: 'कार्यक्रम कैलेंडर',
  },
  dues: {
    title: 'बकाया',
    pay: 'भुगतान करें',
    payDue: 'यह बकाया भुगतान करें',
    uploadScreenshot: 'भुगतान का स्क्रीनशॉट अपलोड करें',
    enterUtr: 'UTR / संदर्भ दर्ज करें',
    aiChecking: 'आपका स्क्रीनशॉट जाँचा जा रहा है…',
    provisionalSent: 'अस्थायी रसीद भेजी गई',
    awaitingVerification: 'सत्यापन प्रतीक्षित',
    verified: 'सत्यापित',
    flagged: 'समीक्षा के लिए चिह्नित',
    status: {
      pending: 'लंबित',
      submitted: 'सत्यापन जारी',
      paid: 'भुगतान हो गया',
      overdue: 'अतिदेय',
    },
    unpaidResidents: 'जिन निवासियों ने भुगतान नहीं किया',
    unpaidCount: '{{count}} निवासी ने भुगतान नहीं किया',
    unpaidCount_plural: '{{count}} निवासियों ने भुगतान नहीं किया',
  },
  notifications: {
    title: 'सूचनाएँ',
    empty: 'अभी कोई सूचना नहीं',
    markAllRead: 'सभी को पढ़ा हुआ चिह्नित करें',
    unread: 'अपठित',
  },
  settings: {
    title: 'सेटिंग्स',
    profile: 'प्रोफ़ाइल',
    profilePicture: 'प्रोफ़ाइल चित्र',
    changePhoto: 'चित्र बदलें',
    appearance: 'रूप-रंग',
    language: 'भाषा',
    sessionActivity: 'सत्र गतिविधि',
    lastActive: 'अंतिम सक्रिय',
    lastLogin: 'अंतिम लॉगिन',
    memberSince: 'सदस्य बने',
    thisSession: 'यह सत्र',
    recentSessions: 'हाल के सत्र',
  },
  auth: {
    login: 'लॉग इन',
    signup: 'साइन अप',
    rememberMe: 'लॉग इन रहें',
    phone: 'फ़ोन नंबर',
    password: 'पासवर्ड',
  },
};

export const getStoredLang = () => {
  try {
    return localStorage.getItem('sv_lang') || 'en';
  } catch {
    return 'en';
  }
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: getStoredLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(code) {
  try {
    localStorage.setItem('sv_lang', code);
  } catch {
    /* ignore */
  }
  i18n.changeLanguage(code);
}

export default i18n;
