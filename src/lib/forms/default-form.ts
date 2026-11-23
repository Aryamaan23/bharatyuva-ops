import type { FormDefinition } from "./definition";

/** Starting form for a new edition (also used by the seed script). Admins edit it in the builder. */
export const DEFAULT_FORM: FormDefinition = {
  steps: [
    {
      id: "about_you",
      title: { en: "About you", hi: "आपके बारे में" },
      questions: [
        { id: "full_name", type: "short_text", label: { en: "Full name", hi: "पूरा नाम" }, required: true, pii: true, profileField: "full_name", maxLength: 120 },
        { id: "phone", type: "phone", label: { en: "Mobile number", hi: "मोबाइल नंबर" }, required: true, pii: true, profileField: "phone" },
        { id: "date_of_birth", type: "date", label: { en: "Date of birth", hi: "जन्मतिथि" }, required: true, pii: true, profileField: "date_of_birth" },
        {
          id: "gender",
          type: "single_choice",
          label: { en: "Gender (optional, used only for cohort balance)", hi: "लिंग (वैकल्पिक, केवल समूह में संतुलन के लिए)" },
          required: false,
          pii: true,
          profileField: "gender",
          options: [
            { value: "woman", label: { en: "Woman", hi: "महिला" } },
            { value: "man", label: { en: "Man", hi: "पुरुष" } },
            { value: "non_binary", label: { en: "Non-binary", hi: "नॉन-बाइनरी" } },
            { value: "prefer_not", label: { en: "Prefer not to say", hi: "नहीं बताना चाहते" } },
          ],
        },
        { id: "state", type: "short_text", label: { en: "State or union territory you live in", hi: "आप किस राज्य या केंद्र शासित प्रदेश में रहते हैं" }, required: true, pii: false, profileField: "state", maxLength: 60 },
      ],
    },
    {
      id: "education",
      title: { en: "Education", hi: "शिक्षा" },
      questions: [
        { id: "college", type: "short_text", label: { en: "College, university or organisation", hi: "कॉलेज, विश्वविद्यालय या संस्था" }, required: true, pii: false, profileField: "college", maxLength: 200 },
        { id: "course", type: "short_text", label: { en: "Course and year (e.g. BA Economics, 2nd year)", hi: "कोर्स और वर्ष (जैसे बीए अर्थशास्त्र, दूसरा वर्ष)" }, required: true, pii: false, maxLength: 120 },
        {
          id: "discipline",
          type: "single_choice",
          label: { en: "Main discipline", hi: "मुख्य विषय-क्षेत्र" },
          required: true,
          pii: false,
          options: [
            { value: "social_sciences", label: { en: "Social sciences / humanities", hi: "सामाजिक विज्ञान / मानविकी" } },
            { value: "law", label: { en: "Law", hi: "कानून" } },
            { value: "stem", label: { en: "Science, engineering, technology", hi: "विज्ञान, इंजीनियरिंग, प्रौद्योगिकी" } },
            { value: "commerce", label: { en: "Commerce / management", hi: "वाणिज्य / प्रबंधन" } },
            { value: "medicine", label: { en: "Medicine / public health", hi: "चिकित्सा / जन स्वास्थ्य" } },
            { value: "other", label: { en: "Other", hi: "अन्य" } },
          ],
        },
      ],
    },
    {
      id: "motivation",
      title: { en: "Your ideas", hi: "आपके विचार" },
      questions: [
        {
          id: "why_bharat_yuva",
          type: "long_text",
          label: { en: "Why do you want to join Bharat Yuva?", hi: "आप भारत युवा से क्यों जुड़ना चाहते हैं?" },
          required: true,
          pii: false,
          wordLimit: 200,
        },
        {
          id: "policy_problem",
          type: "long_text",
          label: {
            en: "Describe a public problem in your district or city that you would like to see solved. What would you do first?",
            hi: "अपने ज़िले या शहर की किसी सार्वजनिक समस्या के बारे में बताइए जिसका हल आप देखना चाहते हैं। आप सबसे पहले क्या करेंगे?",
          },
          required: true,
          pii: false,
          wordLimit: 300,
        },
        {
          id: "teamwork",
          type: "long_text",
          label: { en: "Tell us about a time you worked in a team to get something done.", hi: "किसी ऐसे मौके के बारे में बताइए जब आपने टीम के साथ मिलकर कोई काम पूरा किया।" },
          required: false,
          pii: false,
          wordLimit: 150,
        },
      ],
    },
  ],
};
