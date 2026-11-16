import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  ta: {
    translation: {
      appName: "மக்கள் புகார் செயலி",
      selectRole: "பயனர் தேர்வு",
      citizen: "பொதுமக்கள் (User)",
      officer: "அதிகாரிகள் (Officer)",
      admin: "நிர்வாகி (Admin)",
      emailOtpTitle: "Email OTP உறுதிப்படுத்தல்",
      emailOtpSubtitle: "உங்கள் மின்னஞ்சலுக்கு அனுப்பிய 6 இலக்க OTP-ஐ உள்ளிடவும்",
      verify: "உறுதிப்படுத்து",
      newGrievance: "புதிய புகார் பதிவு",
      myGrievances: "என் புகார்கள்",
      analytics: "புள்ளிவிவரங்கள்",
      logout: "வெளியேறு",
    },
  },
  en: {
    translation: {
      appName: "Makkal Pugar Seyali",
      selectRole: "Select Role",
      citizen: "Public Citizen (User)",
      officer: "Department Officer",
      admin: "System Admin",
      emailOtpTitle: "Email OTP Verification",
      emailOtpSubtitle: "Enter the 6-digit OTP sent to your email address",
      verify: "Verify Email OTP",
      newGrievance: "New Grievance",
      myGrievances: "My Grievances",
      analytics: "Analytics",
      logout: "Logout",
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "ta",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
