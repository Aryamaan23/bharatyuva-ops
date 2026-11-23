import type { PartnerType, TemplateStep } from "@/server/db/schema";

/**
 * Starting outreach templates (drafted from the brief; edit them in /admin/outreach/templates).
 * Merge fields: {{salutation}} {{org}} {{personal}} {{edition}} {{dates}} {{poster}} {{signature}}.
 * {{personal}} is the required one-line personal reason written (or approved) by a person.
 * Every first email carries the "reply no" opt-out line.
 */
type Template = { partnerType: PartnerType; step: TemplateStep; subject: string; body: string };

const OPT_OUT = `If this isn't relevant to your office, just reply "no" and we won't write again.`;

export const OUTREACH_TEMPLATES: Template[] = [
  // ---------------------------------------------------------------- University (Day 1: Learn)
  {
    partnerType: "university",
    step: "first",
    subject: "Hosting Day 1 of {{edition}}, a public policy fellowship ({{dates}})",
    body: `{{salutation}}

{{personal}}

I'm writing from Beyond the Classroom about {{edition}}, a three-day public policy fellowship for students from across India. The first edition drew 200+ applications from 12+ states. Fellows spend Day 1 learning from policy practitioners, Day 2 in the field with a district administration, and Day 3 presenting their recommendations at an embassy-hosted event.

We would be honoured if {{org}} would host Day 1 on campus: a day of expert sessions for about 40–60 fellows, with your faculty invited to speak or chair. We handle the programme, outreach and logistics; we'd ask for a hall, basic AV and your institution's name alongside ours.

The poster and one-page brief are here: {{poster}}

Could we have a 15-minute call in the next two weeks? I'm happy to work around your schedule.

${OPT_OUT}

Warm regards,
{{signature}}`,
  },
  {
    partnerType: "university",
    step: "fu1",
    subject: "Re: Hosting Day 1 of {{edition}}, a public policy fellowship ({{dates}})",
    body: `{{salutation}}

Following up on my note about {{org}} hosting Day 1 of {{edition}} ({{dates}}). I know inboxes are full this time of year. {{personal}}

In short: one day of expert sessions on your campus, about 50 fellows from across India, programme and logistics handled by us. Poster: {{poster}}

Would a short call this week or next work? If someone else at {{org}} is better placed to decide, I'd be grateful for an introduction.

Warm regards,
{{signature}}`,
  },
  {
    partnerType: "university",
    step: "fu2",
    subject: "Re: Hosting Day 1 of {{edition}}, a public policy fellowship ({{dates}})",
    body: `{{salutation}}

A last note from me about {{edition}}. We're finalising our Day 1 host in the coming weeks and {{org}} remains our first choice. {{personal}}

If the timing doesn't suit this year, I'd value knowing that too, so we can keep you in mind for the next edition.

Thank you for your time,
{{signature}}`,
  },

  // ---------------------------------------------------------------- District (Day 2: Immerse)
  {
    partnerType: "district",
    step: "first",
    subject: "Request: one-day field immersion for {{edition}} fellows in {{org}} ({{dates}})",
    body: `{{salutation}}

{{personal}}

Beyond the Classroom runs {{edition}}, a three-day public policy fellowship for young people from across India. The first edition, with 200+ applicants from 12+ states, included a field practicum whose ideas were presented to the district administration.

We respectfully request the support of your office for Day 2, a one-day field immersion in {{org}} on {{dates}}. Fellows (about 40–60, accompanied by our team) would hear from district officers, visit two or three sites where schemes are delivered, and later share their observations and recommendations with your office. A nominated nodal officer to coordinate with us would be a great help. We will take care of transport, logistics and all permissions you advise.

A formal letter is attached, and the programme poster is here: {{poster}}

I would be grateful for a few minutes with you or your office to discuss this.

${OPT_OUT}

With respect and regards,
{{signature}}`,
  },
  {
    partnerType: "district",
    step: "fu1",
    subject: "Re: Request: one-day field immersion for {{edition}} fellows in {{org}} ({{dates}})",
    body: `{{salutation}}

I am following up on our request for a one-day field immersion in {{org}} for {{edition}} fellows on {{dates}}. {{personal}} The formal letter is attached again for your convenience.

If it is easier, we would be glad to speak with the CEO, Zila Parishad, or any officer you nominate as the nodal officer.

With respect and regards,
{{signature}}`,
  },
  {
    partnerType: "district",
    step: "fu2",
    subject: "Re: Request: one-day field immersion for {{edition}} fellows in {{org}} ({{dates}})",
    body: `{{salutation}}

A final follow-up on our request for {{edition}} ({{dates}}). {{personal}}

We will also try to reach your office by phone this week. If the dates are not convenient, we would welcome your guidance on a suitable alternative.

With respect and gratitude,
{{signature}}`,
  },

  // ---------------------------------------------------------------- Embassy (Day 3: Present)
  {
    partnerType: "embassy",
    step: "first",
    subject: "Invitation to host the closing day of {{edition}}, a youth public policy fellowship ({{dates}})",
    body: `{{salutation}}

{{personal}}

I'm writing from Beyond the Classroom, an Indian youth organisation, about {{edition}}, a three-day public policy fellowship. Fellows from across India (the first edition drew 200+ applicants from 12+ states) learn from practitioners, spend a day with a district administration, and on Day 3 present their policy recommendations; a winning team is announced.

We would be delighted if {{org}} would consider hosting or co-hosting Day 3 on {{dates}}: a half-day of team presentations to a small jury, with a short address by a member of your mission. It is a chance to meet some of India's most engaged young people and hear what they think should change.

Our poster and brief: {{poster}}

May I send a fuller note to the right colleague, or arrange a short call?

${OPT_OUT}

With best regards,
{{signature}}`,
  },
  {
    partnerType: "embassy",
    step: "fu1",
    subject: "Re: Invitation to host the closing day of {{edition}} ({{dates}})",
    body: `{{salutation}}

Following up on our invitation for {{org}} to host the closing day of {{edition}} on {{dates}}. {{personal}} If public diplomacy or youth engagement is handled by a different section, I'd be grateful if you could point me to them.

Poster and brief: {{poster}}

With best regards,
{{signature}}`,
  },
  {
    partnerType: "embassy",
    step: "fu2",
    subject: "Re: Invitation to host the closing day of {{edition}} ({{dates}})",
    body: `{{salutation}}

A last note about {{edition}}. {{personal}} We're confirming our Day 3 host in the coming weeks and would be very glad to include {{org}}.

If this year doesn't work, thank you for considering it, and we'd welcome the chance to stay in touch.

With best regards,
{{signature}}`,
  },

  // ---------------------------------------------------------------- Thank-you notes (Phase 4)
  ...(["university", "district", "embassy"] as const).map((partnerType) => ({
    partnerType,
    step: "thank_you" as const,
    subject: "Thank you from {{edition}}",
    body: `{{salutation}}

On behalf of all the fellows and our team, thank you for making {{edition}} ({{dates}}) possible. {{personal}}

Photos from the day are here: {{poster}}

We'll share the fellows' compendium of recommendations as soon as it is ready. We hope to work with {{org}} again.

With gratitude,
{{signature}}`,
  })),
];
