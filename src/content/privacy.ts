import type { Locale } from "@/i18n/config";

/**
 * Public privacy notice (DPDP Act 2023). Bump PRIVACY_VERSION and add a new consent_versions row
 * (kind "processing") whenever the substance changes, so consent records point at the text shown.
 * DRAFT: to be reviewed by the team (and ideally a lawyer) before applications open.
 */
export const PRIVACY_VERSION = 1;
export const PRIVACY_UPDATED = "2026-11-23";

type Section = { heading: string; body: string[] };

const en: Section[] = [
  {
    heading: "Who we are",
    body: [
      "Bharat Yuva is a public policy fellowship run by Beyond the Classroom (\"we\", \"us\"). We are the Data Fiduciary for the personal data described here.",
    ],
  },
  {
    heading: "What we collect",
    body: [
      "Your email address, name, phone number, date of birth, state, college or organisation, and your answers to the application questions.",
      "Optional information such as gender, only if you choose to give it.",
      "If you are under 18: your parent's or guardian's name, email address and relationship to you.",
      "Technical records needed to keep the service secure and to prove consent: the time you gave consent, the version of this notice, a one-way hash of your IP address, and your browser type.",
      "How you found us (for example, a campaign link or a campus ambassador's referral code).",
    ],
  },
  {
    heading: "Why we use it",
    body: [
      "To assess your application, select fellows, run the three-day programme, issue certificates and keep you informed about your application. We rely on your consent, which you give on the application form.",
      "If you opt in separately, to send you application updates on WhatsApp. You can switch this off at any time from your portal.",
      "To produce anonymous, aggregate statistics about the programme (for example, how many applications came from each state).",
      "We do not sell your data and we do not use it for advertising.",
    ],
  },
  {
    heading: "Who can see it",
    body: [
      "Our programme team. Reviewers who score applications see your answers but not your name, email address or phone number.",
      "If you are selected and confirm your seat, our host partners (the university, district administration and embassy for your edition) receive your name and college only, so they can plan the day.",
      "Service providers who process data on our behalf under contract: Supabase (database and file storage), Vercel (hosting), Resend (email delivery), Google (email for staff correspondence), Cloudflare (bot protection), Sentry (error monitoring) and Anthropic (AI tools that help our team summarise applications; no decision is made by AI).",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "If you are not selected, we delete your application 12 months after the edition ends.",
      "If you take part, we keep your name, college, attendance and certificate record so that certificates can be verified and so we can invite you to alumni activities. You can ask us to delete this at any time.",
      "Consent and deletion records are kept as long as needed to show we complied with the law.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Under the Digital Personal Data Protection Act, 2023 you can ask for a summary of the data we hold about you, ask us to correct or complete it, ask us to erase it, withdraw your consent, and nominate someone to exercise these rights for you. Withdrawing consent does not affect processing before the withdrawal, but we will no longer be able to consider your application.",
      "Use the data request page to ask for a copy or deletion. We respond within 30 days.",
    ],
  },
  {
    heading: "Children",
    body: [
      "If you are under 18, we need verifiable consent from your parent or legal guardian before we consider your application. We email them a link to read this notice and give consent. We do not track children's behaviour or show them advertising.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is stored encrypted at rest with access limited by role. Every message we send, status change and data export is logged.",
    ],
  },
  {
    heading: "Grievances and contact",
    body: [
      "Write to our grievance officer at the email address shown at the bottom of this page. If you are not satisfied with our response, you may complain to the Data Protection Board of India.",
    ],
  },
];

const hi: Section[] = [
  {
    heading: "हम कौन हैं",
    body: [
      "भारत युवा एक सार्वजनिक नीति फ़ेलोशिप है, जिसे बियॉन्ड द क्लासरूम (\"हम\") चलाता है। यहाँ बताए गए व्यक्तिगत डेटा के लिए हम डेटा फ़िड्यूशरी हैं।",
    ],
  },
  {
    heading: "हम क्या जानकारी लेते हैं",
    body: [
      "आपका ईमेल पता, नाम, फ़ोन नंबर, जन्मतिथि, राज्य, कॉलेज या संस्था, और आवेदन के सवालों के आपके उत्तर।",
      "वैकल्पिक जानकारी, जैसे लिंग, केवल तभी जब आप देना चाहें।",
      "अगर आपकी आयु 18 से कम है: आपके माता-पिता या अभिभावक का नाम, ईमेल पता और आपसे संबंध।",
      "सेवा को सुरक्षित रखने और सहमति का प्रमाण रखने के लिए ज़रूरी तकनीकी रिकॉर्ड: आपने किस समय सहमति दी, इस सूचना का कौन-सा संस्करण था, आपके IP पते का एक-तरफ़ा हैश, और आपके ब्राउज़र का प्रकार।",
      "आपको हमारे बारे में कैसे पता चला (जैसे कोई अभियान लिंक या कैंपस एंबेसडर का रेफ़रल कोड)।",
    ],
  },
  {
    heading: "हम इसका उपयोग क्यों करते हैं",
    body: [
      "आपके आवेदन का मूल्यांकन करने, फ़ेलो चुनने, तीन दिन का कार्यक्रम चलाने, प्रमाणपत्र देने और आपको आपके आवेदन की जानकारी देने के लिए। इसके लिए हम आपकी सहमति पर निर्भर हैं, जो आप आवेदन फ़ॉर्म पर देते हैं।",
      "अगर आप अलग से चुनते हैं, तो आपको आवेदन के अपडेट WhatsApp पर भेजने के लिए। आप इसे अपने पोर्टल से कभी भी बंद कर सकते हैं।",
      "कार्यक्रम के बारे में गुमनाम, सामूहिक आँकड़े बनाने के लिए (जैसे किस राज्य से कितने आवेदन आए)।",
      "हम आपका डेटा बेचते नहीं हैं और विज्ञापन के लिए इसका उपयोग नहीं करते।",
    ],
  },
  {
    heading: "इसे कौन देख सकता है",
    body: [
      "हमारी कार्यक्रम टीम। आवेदनों पर अंक देने वाले समीक्षक आपके उत्तर देखते हैं, पर आपका नाम, ईमेल पता या फ़ोन नंबर नहीं।",
      "अगर आपका चयन होता है और आप अपनी सीट पक्की करते हैं, तो हमारे मेज़बान साझेदारों (आपके संस्करण का विश्वविद्यालय, ज़िला प्रशासन और दूतावास) को दिन की योजना बनाने के लिए केवल आपका नाम और कॉलेज भेजा जाता है।",
      "सेवा प्रदाता, जो अनुबंध के तहत हमारी ओर से डेटा प्रोसेस करते हैं: Supabase (डेटाबेस और फ़ाइल भंडारण), Vercel (होस्टिंग), Resend (ईमेल भेजना), Google (स्टाफ़ के ईमेल पत्राचार के लिए), Cloudflare (बॉट से सुरक्षा), Sentry (त्रुटि निगरानी) और Anthropic (AI टूल, जो हमारी टीम को आवेदनों का सारांश बनाने में मदद करते हैं; कोई भी निर्णय AI नहीं लेता)।",
    ],
  },
  {
    heading: "हम इसे कितने समय तक रखते हैं",
    body: [
      "अगर आपका चयन नहीं होता, तो संस्करण समाप्त होने के 12 महीने बाद हम आपका आवेदन हटा देते हैं।",
      "अगर आप भाग लेते हैं, तो प्रमाणपत्रों की जाँच हो सके और हम आपको पूर्व-छात्र गतिविधियों में बुला सकें, इसके लिए हम आपका नाम, कॉलेज, उपस्थिति और प्रमाणपत्र का रिकॉर्ड रखते हैं। आप कभी भी इसे हटाने के लिए कह सकते हैं।",
      "सहमति और डेटा हटाने के रिकॉर्ड तब तक रखे जाते हैं जब तक यह दिखाने के लिए ज़रूरी हो कि हमने कानून का पालन किया।",
    ],
  },
  {
    heading: "आपके अधिकार",
    body: [
      "डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के तहत आप हमसे अपने बारे में रखे गए डेटा का सारांश माँग सकते हैं, उसे ठीक या पूरा करने के लिए कह सकते हैं, उसे हटाने के लिए कह सकते हैं, अपनी सहमति वापस ले सकते हैं, और अपनी ओर से इन अधिकारों का उपयोग करने के लिए किसी को नामित कर सकते हैं। सहमति वापस लेने से पहले हुई प्रोसेसिंग पर असर नहीं पड़ता, पर उसके बाद हम आपके आवेदन पर विचार नहीं कर पाएँगे।",
      "डेटा की प्रति या उसे हटाने के लिए डेटा अनुरोध पेज का उपयोग करें। हम 30 दिनों के भीतर जवाब देते हैं।",
    ],
  },
  {
    heading: "बच्चे",
    body: [
      "अगर आपकी आयु 18 से कम है, तो आपके आवेदन पर विचार करने से पहले हमें आपके माता-पिता या कानूनी अभिभावक की सत्यापन-योग्य सहमति चाहिए। हम उन्हें यह सूचना पढ़कर सहमति देने के लिए एक लिंक ईमेल करते हैं। हम बच्चों के व्यवहार को ट्रैक नहीं करते और उन्हें विज्ञापन नहीं दिखाते।",
    ],
  },
  {
    heading: "सुरक्षा",
    body: [
      "डेटा एन्क्रिप्टेड रूप में रखा जाता है और भूमिका के अनुसार ही उसकी पहुँच दी जाती है। हमारे भेजे हर संदेश, हर स्थिति-परिवर्तन और हर डेटा एक्सपोर्ट का लॉग रखा जाता है।",
    ],
  },
  {
    heading: "शिकायत और संपर्क",
    body: [
      "इस पेज के नीचे दिए गए ईमेल पते पर हमारे शिकायत अधिकारी को लिखें। अगर आप हमारे उत्तर से संतुष्ट नहीं हैं, तो आप भारतीय डेटा संरक्षण बोर्ड से शिकायत कर सकते हैं।",
    ],
  },
];

export function privacySections(locale: Locale): Section[] {
  return locale === "hi" ? hi : en;
}

/** Short processing-consent text shown on the form and stored in consent_versions (kind "processing"). */
export const PROCESSING_CONSENT = {
  en: "We will use your name, contact details, education details and answers only to assess your application, select fellows, run the programme and issue certificates. Reviewers will not see your contact details. If you are selected, host partners receive your name and college only. Unsuccessful applications are deleted 12 months after the edition ends. You can withdraw consent or ask us to delete your data at any time.",
  hi: "हम आपके नाम, संपर्क विवरण, शिक्षा संबंधी जानकारी और उत्तरों का उपयोग केवल आपके आवेदन के मूल्यांकन, फ़ेलो के चयन, कार्यक्रम चलाने और प्रमाणपत्र देने के लिए करेंगे। समीक्षकों को आपकी संपर्क जानकारी नहीं दिखेगी। चयन होने पर मेज़बान साझेदारों को केवल आपका नाम और कॉलेज भेजा जाएगा। जिनका चयन नहीं होता, उनके आवेदन संस्करण समाप्त होने के 12 महीने बाद हटा दिए जाते हैं। आप कभी भी सहमति वापस ले सकते हैं या अपना डेटा हटाने के लिए कह सकते हैं।",
};

export const WHATSAPP_CONSENT = {
  en: "We'll send only updates about your application (for example, confirmation, status changes and reminders) from our official WhatsApp Business number. Reply STOP or switch it off in your portal at any time.",
  hi: "हम अपने आधिकारिक WhatsApp Business नंबर से केवल आपके आवेदन से जुड़े अपडेट भेजेंगे (जैसे पुष्टि, स्थिति में बदलाव और रिमाइंडर)। कभी भी STOP लिखकर भेजें या अपने पोर्टल से इसे बंद करें।",
};

export const GUARDIAN_CONSENT = {
  en: "I am the applicant's parent or legal guardian and consent to Beyond the Classroom processing their personal data as described in the Bharat Yuva privacy notice.",
  hi: "मैं आवेदक का/की माता-पिता या कानूनी अभिभावक हूँ और भारत युवा की गोपनीयता सूचना में बताए अनुसार बियॉन्ड द क्लासरूम द्वारा उनके व्यक्तिगत डेटा के उपयोग पर सहमति देता/देती हूँ।",
};
