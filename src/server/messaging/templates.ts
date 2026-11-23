import type { Locale } from "@/i18n/config";

/**
 * Transactional emails to applicants, guardians and data-request senders. Partner outreach
 * templates are editable rows in the database (Phase 2); these are code because their wording is
 * tied to product behaviour and consent text.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Block = { p: string } | { button: { label: string; url: string } } | { small: string };

function render(subject: string, blocks: Block[], locale: Locale): RenderedEmail {
  const font =
    locale === "hi" ? "'Noto Sans Devanagari', 'Source Sans 3', Arial, sans-serif" : "'Source Sans 3', Arial, sans-serif";
  const htmlBlocks = blocks
    .map((b) => {
      if ("p" in b) return `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(b.p)}</p>`;
      if ("small" in b) return `<p style="font-size:13px;color:#5a6380;margin:16px 0 0">${esc(b.small)}</p>`;
      return `<p style="margin:22px 0"><a href="${esc(b.button.url)}" style="background:#273661;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${esc(b.button.label)}</a></p>`;
    })
    .join("\n");
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f6f7fb;padding:24px;font-family:${font};color:#1b2440">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px;border-top:6px solid #273661">
<p style="font-size:14px;font-weight:700;color:#273661;letter-spacing:.04em;margin:0 0 18px">BHARAT YUVA · BEYOND THE CLASSROOM</p>
${htmlBlocks}
</div></body></html>`;
  const text = blocks
    .map((b) => ("p" in b ? b.p : "small" in b ? b.small : `${b.button.label}: ${b.button.url}`))
    .join("\n\n");
  return { subject, html, text };
}

const signoff = { en: "Team Bharat Yuva, Beyond the Classroom", hi: "टीम भारत युवा, बियॉन्ड द क्लासरूम" };

export function applicationReceived(
  locale: Locale,
  v: { name: string; editionName: string; portalUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `${v.editionName}: आपका आवेदन मिल गया है`,
      [
        { p: `नमस्ते ${v.name},` },
        { p: `${v.editionName} के लिए आवेदन करने के लिए धन्यवाद। हमें आपका आवेदन मिल गया है।` },
        { p: "आप नीचे दिए गए लिंक से कभी भी अपने आवेदन की स्थिति देख सकते हैं। चयन के बारे में हम आपको ईमेल से सूचित करेंगे।" },
        { button: { label: "आवेदन की स्थिति देखें", url: v.portalUrl } },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `${v.editionName}: we've received your application`,
    [
      { p: `Hi ${v.name},` },
      { p: `Thank you for applying to ${v.editionName}. Your application has reached us.` },
      { p: "You can check its status at any time using the link below. We'll email you as soon as there's a decision." },
      { button: { label: "View your application", url: v.portalUrl } },
      { small: signoff.en },
    ],
    locale,
  );
}

export function guardianRequest(
  locale: Locale,
  v: { guardianName: string; applicantName: string; editionName: string; confirmUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `${v.applicantName} के ${v.editionName} आवेदन के लिए आपकी सहमति`,
      [
        { p: `नमस्ते ${v.guardianName},` },
        {
          p: `${v.applicantName} ने ${v.editionName} के लिए आवेदन किया है और आपको अपने अभिभावक के रूप में बताया है। 18 वर्ष से कम आयु के आवेदकों के लिए हमें अभिभावक की सहमति चाहिए।`,
        },
        { p: "नीचे दिए गए लिंक पर हम बताते हैं कि हम कौन-सी जानकारी लेते हैं और क्यों। कृपया पढ़कर सहमति दें।" },
        { button: { label: "पढ़ें और सहमति दें", url: v.confirmUrl } },
        { small: "अगर आप इस आवेदक को नहीं जानते, तो इस ईमेल को अनदेखा करें।" },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `Your consent for ${v.applicantName}'s ${v.editionName} application`,
    [
      { p: `Dear ${v.guardianName},` },
      {
        p: `${v.applicantName} has applied to ${v.editionName} and named you as their parent or guardian. Because they are under 18, we need your consent before we can consider the application.`,
      },
      { p: "The page below explains what information we collect and why. Please read it and confirm." },
      { button: { label: "Read and give consent", url: v.confirmUrl } },
      { small: "If you don't know this applicant, please ignore this email." },
      { small: signoff.en },
    ],
    locale,
  );
}

export function draftReminder(
  locale: Locale,
  v: { name: string; editionName: string; hoursLeft: 48 | 24; deadline: string; resumeUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `${v.editionName}: आवेदन जमा करने के लिए ${v.hoursLeft} घंटे बचे हैं`,
      [
        { p: `नमस्ते ${v.name || ""},`.replace(" ,", ",") },
        { p: `आपने ${v.editionName} का आवेदन शुरू किया था, पर अभी तक जमा नहीं किया है। अंतिम तिथि ${v.deadline} है।` },
        { p: "आपके उत्तर सुरक्षित हैं। वहीं से जारी रखें जहाँ आपने छोड़ा था।" },
        { button: { label: "आवेदन पूरा करें", url: v.resumeUrl } },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `${v.editionName}: ${v.hoursLeft} hours left to submit your application`,
    [
      { p: `Hi ${v.name || "there"},` },
      { p: `You started an application for ${v.editionName} but haven't submitted it yet. The deadline is ${v.deadline}.` },
      { p: "Your answers are saved. Pick up where you left off." },
      { button: { label: "Finish your application", url: v.resumeUrl } },
      { small: signoff.en },
    ],
    locale,
  );
}

export function seatOffer(
  locale: Locale,
  v: { name: string; editionName: string; expiresAt: string; portalUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `बधाई हो! ${v.editionName} में आपका चयन हुआ है`,
      [
        { p: `नमस्ते ${v.name},` },
        { p: `हमें यह बताते हुए खुशी है कि ${v.editionName} के लिए आपका चयन हुआ है।` },
        { p: `कृपया ${v.expiresAt} तक अपनी सीट स्वीकार या अस्वीकार करें। इसके बाद सीट प्रतीक्षा सूची के अगले आवेदक को दे दी जाएगी।` },
        { button: { label: "सीट स्वीकार करें", url: v.portalUrl } },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `Congratulations! You've been selected for ${v.editionName}`,
    [
      { p: `Hi ${v.name},` },
      { p: `We're delighted to tell you that you've been selected for ${v.editionName}.` },
      {
        p: `Please accept or decline your seat by ${v.expiresAt}. After that, the seat is offered to the next person on the waitlist.`,
      },
      { button: { label: "Respond to your offer", url: v.portalUrl } },
      { small: signoff.en },
    ],
    locale,
  );
}

export function seatConfirmed(
  locale: Locale,
  v: { name: string; editionName: string; dates: string; portalUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `${v.editionName}: आपकी सीट पक्की हो गई है`,
      [
        { p: `नमस्ते ${v.name},` },
        { p: `धन्यवाद! ${v.editionName} (${v.dates}) में आपकी सीट पक्की हो गई है।` },
        { p: "आगे की जानकारी और ज़रूरी दस्तावेज़ों के लिए अपना पोर्टल देखते रहें।" },
        { button: { label: "पोर्टल खोलें", url: v.portalUrl } },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `${v.editionName}: your seat is confirmed`,
    [
      { p: `Hi ${v.name},` },
      { p: `Thank you! Your seat at ${v.editionName} (${v.dates}) is confirmed.` },
      { p: "Keep an eye on your portal for next steps and any documents we need from you." },
      { button: { label: "Open your portal", url: v.portalUrl } },
      { small: signoff.en },
    ],
    locale,
  );
}

export function statusUpdate(
  locale: Locale,
  v: { name: string; editionName: string; statusLabel: string; portalUrl: string },
): RenderedEmail {
  if (locale === "hi") {
    return render(
      `${v.editionName}: आपके आवेदन पर अपडेट`,
      [
        { p: `नमस्ते ${v.name},` },
        { p: `${v.editionName} के लिए आपके आवेदन की स्थिति अब है: ${v.statusLabel}।` },
        { button: { label: "विवरण देखें", url: v.portalUrl } },
        { small: signoff.hi },
      ],
      locale,
    );
  }
  return render(
    `${v.editionName}: an update on your application`,
    [
      { p: `Hi ${v.name},` },
      { p: `The status of your ${v.editionName} application is now: ${v.statusLabel}.` },
      { button: { label: "See details", url: v.portalUrl } },
      { small: signoff.en },
    ],
    locale,
  );
}

export function dataRequestVerify(locale: Locale, v: { confirmUrl: string; kind: "delete" | "access" }): RenderedEmail {
  if (locale === "hi") {
    return render(
      "भारत युवा: अपने डेटा अनुरोध की पुष्टि करें",
      [
        {
          p:
            v.kind === "delete"
              ? "हमें इस ईमेल पते से जुड़ा डेटा हटाने का अनुरोध मिला है।"
              : "हमें इस ईमेल पते से जुड़े डेटा की प्रति के लिए अनुरोध मिला है।",
        },
        { p: "अगर यह अनुरोध आपने किया है, तो पुष्टि के लिए नीचे क्लिक करें। हमारी टीम 30 दिनों के भीतर इस पर कार्रवाई करेगी।" },
        { button: { label: "अनुरोध की पुष्टि करें", url: v.confirmUrl } },
        { small: "अगर आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें। कुछ नहीं बदलेगा।" },
      ],
      locale,
    );
  }
  return render(
    "Bharat Yuva: confirm your data request",
    [
      {
        p:
          v.kind === "delete"
            ? "We received a request to delete the data linked to this email address."
            : "We received a request for a copy of the data linked to this email address.",
      },
      { p: "If this was you, click below to confirm. Our team will act on it within 30 days." },
      { button: { label: "Confirm request", url: v.confirmUrl } },
      { small: "If you didn't make this request, ignore this email and nothing will change." },
    ],
    locale,
  );
}

export function dataRequestCompleted(locale: Locale, v: { kind: "delete" | "access" }): RenderedEmail {
  const en =
    v.kind === "delete"
      ? "Your data has been deleted from Bharat Yuva systems, as you asked. We have kept only a one-way hash of your email address to prove the request was honoured."
      : "Your data request has been processed. A team member will reply to this email with the export.";
  const hi =
    v.kind === "delete"
      ? "आपके अनुरोध के अनुसार भारत युवा के सिस्टम से आपका डेटा हटा दिया गया है। अनुरोध पूरा होने के प्रमाण के लिए हमने केवल आपके ईमेल पते का एक-तरफ़ा हैश रखा है।"
      : "आपके डेटा अनुरोध पर कार्रवाई हो गई है। टीम का कोई सदस्य इसी ईमेल पर डेटा भेजेगा।";
  return locale === "hi"
    ? render("भारत युवा: आपका डेटा अनुरोध पूरा हुआ", [{ p: hi }, { small: signoff.hi }], locale)
    : render("Bharat Yuva: your data request is complete", [{ p: en }, { small: signoff.en }], locale);
}

export type DecisionKind = "shortlisted" | "interview" | "waitlisted" | "rejected";

export function decisionEmail(locale: Locale, kind: DecisionKind, v: { name: string; editionName: string; portalUrl: string }): RenderedEmail {
  const copy = {
    en: {
      shortlisted: {
        subject: `${v.editionName}: you've been shortlisted`,
        body: ["Thank you for your application. We're pleased to tell you that you've been shortlisted.", "We'll be in touch shortly about the next step."],
        cta: "View your application",
      },
      interview: {
        subject: `${v.editionName}: please book your interview`,
        body: ["We enjoyed reading your application and would like to talk with you.", "Please choose an interview slot that suits you from your portal. Interviews are short and friendly, about 15 minutes, online."],
        cta: "Choose an interview slot",
      },
      waitlisted: {
        subject: `${v.editionName}: you're on the waitlist`,
        body: [
          "Thank you for applying. We had many more strong applications than seats, and you're on our waitlist.",
          "If a seat opens up, we'll email you an offer straight away, so please keep an eye on your inbox.",
        ],
        cta: "View your application",
      },
      rejected: {
        subject: `${v.editionName}: an update on your application`,
        body: [
          "Thank you for applying and for the thought you put into your answers. We had far more strong applications than seats, and we're sorry we can't offer you a place this time.",
          "We hope you'll apply again for a future edition, and stay in touch with Beyond the Classroom.",
        ],
        cta: "View your application",
      },
    },
    hi: {
      shortlisted: {
        subject: `${v.editionName}: आप शॉर्टलिस्ट हुए हैं`,
        body: ["आवेदन के लिए धन्यवाद। हमें बताते हुए खुशी है कि आप शॉर्टलिस्ट हुए हैं।", "अगले चरण के बारे में हम जल्द ही संपर्क करेंगे।"],
        cta: "अपना आवेदन देखें",
      },
      interview: {
        subject: `${v.editionName}: कृपया अपना इंटरव्यू समय चुनें`,
        body: ["हमें आपका आवेदन पढ़कर अच्छा लगा और हम आपसे बात करना चाहेंगे।", "कृपया अपने पोर्टल से अपनी सुविधा का इंटरव्यू समय चुनें। इंटरव्यू छोटा और सहज होगा, लगभग 15 मिनट, ऑनलाइन।"],
        cta: "इंटरव्यू समय चुनें",
      },
      waitlisted: {
        subject: `${v.editionName}: आप प्रतीक्षा सूची में हैं`,
        body: ["आवेदन के लिए धन्यवाद। सीटों से कहीं अधिक अच्छे आवेदन आए, और आप हमारी प्रतीक्षा सूची में हैं।", "सीट खाली होते ही हम आपको प्रस्ताव ईमेल करेंगे, इसलिए कृपया अपना ईमेल देखते रहें।"],
        cta: "अपना आवेदन देखें",
      },
      rejected: {
        subject: `${v.editionName}: आपके आवेदन पर अपडेट`,
        body: [
          "आवेदन और अपने उत्तरों में लगाई मेहनत के लिए धन्यवाद। सीटों से कहीं अधिक अच्छे आवेदन आए, और हमें खेद है कि इस बार हम आपको सीट नहीं दे पा रहे हैं।",
          "उम्मीद है आप अगले संस्करण में फिर आवेदन करेंगे और बियॉन्ड द क्लासरूम से जुड़े रहेंगे।",
        ],
        cta: "अपना आवेदन देखें",
      },
    },
  }[locale][kind];
  return render(
    copy.subject,
    [{ p: locale === "hi" ? `नमस्ते ${v.name},` : `Hi ${v.name},` }, ...copy.body.map((p) => ({ p })), { button: { label: copy.cta, url: v.portalUrl } }, { small: signoff[locale] }],
    locale,
  );
}

export function seatReminder(locale: Locale, v: { name: string; editionName: string; expiresAt: string; portalUrl: string }): RenderedEmail {
  return locale === "hi"
    ? render(
        `${v.editionName}: अपनी सीट पक्की करने के लिए 24 घंटे से कम बचे हैं`,
        [{ p: `नमस्ते ${v.name},` }, { p: `आपका प्रस्ताव ${v.expiresAt} को समाप्त हो रहा है। कृपया इससे पहले स्वीकार या अस्वीकार करें।` }, { button: { label: "उत्तर दें", url: v.portalUrl } }, { small: signoff.hi }],
        locale,
      )
    : render(
        `${v.editionName}: less than 24 hours to confirm your seat`,
        [{ p: `Hi ${v.name},` }, { p: `Your offer expires on ${v.expiresAt}. Please accept or decline before then so we can offer any free seat to someone on the waitlist.` }, { button: { label: "Respond now", url: v.portalUrl } }, { small: signoff.en }],
        locale,
      );
}

export function interviewBooked(locale: Locale, v: { name: string; editionName: string; when: string; link: string | null; portalUrl: string }): RenderedEmail {
  return locale === "hi"
    ? render(
        `${v.editionName}: आपका इंटरव्यू तय हो गया है`,
        [{ p: `नमस्ते ${v.name},` }, { p: `आपका इंटरव्यू ${v.when} को है।` }, ...(v.link ? [{ p: `मीटिंग लिंक: ${v.link}` }] : []), { button: { label: "पोर्टल खोलें", url: v.portalUrl } }, { small: signoff.hi }],
        locale,
      )
    : render(
        `${v.editionName}: your interview is booked`,
        [{ p: `Hi ${v.name},` }, { p: `Your interview is on ${v.when}.` }, ...(v.link ? [{ p: `Meeting link: ${v.link}` }] : []), { p: "If you need to change the time, you can pick another slot from your portal." }, { button: { label: "Open your portal", url: v.portalUrl } }, { small: signoff.en }],
        locale,
      );
}

export function ambassadorApproved(v: { name: string; editionName: string; link: string; portalUrl: string }): RenderedEmail {
  return render(
    `You're a ${v.editionName} campus ambassador`,
    [
      { p: `Hi ${v.name},` },
      { p: `Welcome aboard! Your personal referral link is below. Every application that comes through it is credited to you, and the top ambassadors receive certificates.` },
      { p: v.link },
      { button: { label: "Your ambassador page (QR code and stats)", url: v.portalUrl } },
      { small: signoff.en },
    ],
    "en",
  );
}

export function ambassadorWeekly(v: { name: string; editionName: string; started: number; submitted: number; rank: number | null; total: number; deadline: string | null; portalUrl: string }): RenderedEmail {
  return render(
    `${v.editionName}: your ambassador update`,
    [
      { p: `Hi ${v.name},` },
      { p: `So far, ${v.submitted} application${v.submitted === 1 ? "" : "s"} have been submitted through your link${v.started > v.submitted ? `, and ${v.started - v.submitted} more are in progress` : ""}.` },
      ...(v.rank ? [{ p: `You're #${v.rank} of ${v.total} ambassadors.` }] : []),
      ...(v.deadline ? [{ p: `Applications close on ${v.deadline}. A reminder in your college groups this week can make a big difference.` }] : []),
      { button: { label: "See your stats", url: v.portalUrl } },
      { small: signoff.en },
    ],
    "en",
  );
}
