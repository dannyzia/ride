/**
 * Centralized legal content source.
 *
 * All four settings terms/privacy screens (rider terms, rider privacy,
 * driver terms, driver privacy) MUST consume content from this file.
 * Never hard-code legal text in screen components.
 *
 * // @TODO: Replace with approved legal copy
 *
 * ⚠️ PRODUCT/LEGAL GATE: the content below is a GENERIC PROFESSIONAL
 * TEMPLATE authored by Engineering, not approved legal text. Product/Legal
 * must supply approved English and Bengali content, revision dates, contact
 * address, and effective-date policy before production release.
 * `lib/__tests__/legalContent.test.ts` enforces that no placeholder markers
 * (e.g. `@PLACEHOLDER`, "Pending owner review") ever ship in this file.
 */

export interface LegalSection {
  title: string;
  title_bn: string;
  body: string;
  body_bn: string;
}

export interface LegalDocument {
  title: string;
  title_bn: string;
  effective_date: string;
  revision_date: string;
  sections: LegalSection[];
  contact_email: string;
  contact_address: string;
}

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  title_bn: "সেবার শর্তাবলী",
  effective_date: "2026-08-01",
  revision_date: "2026-08-22",
  contact_email: "support@ride.com.bd",
  contact_address: "Dhaka, Bangladesh",
  sections: [
    {
      title: "1. Acceptance of Terms",
      title_bn: "১. শর্তাবলীর স্বীকৃতি",
      body: "By creating an account or using the Ride platform, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you must not use the service.",
      body_bn: "রাইড প্ল্যাটফর্মে অ্যাকাউন্ট তৈরি করে বা সেবা ব্যবহার করে আপনি এই সেবার শর্তাবলী এবং আমাদের গোপনীয়তা নীতিতে আবদ্ধ হতে সম্মত হচ্ছেন। আপনি সম্মত না হলে, সেবা ব্যবহার করবেন না।",
    },
    {
      title: "2. Eligibility and Accounts",
      title_bn: "২. যোগ্যতা ও অ্যাকাউন্ট",
      body: "You must be at least 18 years old and legally capable of entering into contracts. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate, current information and keep it updated.",
      body_bn: "আপনার বয়স কমপক্ষে ১৮ বছর হতে হবে এবং চুক্তিতে আইনত আবদ্ধ হওয়ার সক্ষমতা থাকতে হবে। আপনার অ্যাকাউন্টের প্রবেশাধিকার গোপন রাখা এবং অ্যাকাউন্টের সকল কার্যকলাপের জন্য আপনি দায়ী। সঠিক ও হালনাগাদ তথ্য প্রদান করতে হবে।",
    },
    {
      title: "3. Service Description",
      title_bn: "৩. সেবার বিবরণ",
      body: "Ride is a ride-hailing platform that connects riders with independent driver-partners in Bangladesh. Ride facilitates the matching, communication, and payment processes. Driver-partners are not employees of Ride; they are independent operators. Rides are subject to availability and applicable local regulations.",
      body_bn: "রাইড একটি রাইড-হেইলিং প্ল্যাটফর্ম যা বাংলাদেশে রাইডারদের স্বাধীন ড্রাইভার-পার্টনারদের সাথে সংযুক্ত করে। রাইড ম্যাচিং, যোগাযোগ ও পেমেন্ট প্রক্রিয়ায় সহায়তা করে। ড্রাইভার-পার্টনাররা রাইডের কর্মচারী নন; তারা স্বাধীন পরিচালক।",
    },
    {
      title: "4. Driver-Partner Obligations",
      title_bn: "৪. ড্রাইভার-পার্টনারের দায়িত্ব",
      body: "Driver-partners must hold a valid driving licence, maintain valid vehicle registration, fitness certification, and tax tokens, and keep documents current in the app. Drivers purchase call packages to receive ride offers; package details, validity, and call deductions are shown in the app. Drivers may register one vehicle per account; changes require contacting support.",
      body_bn: "ড্রাইভার-পার্টনারদের বৈধ ড্রাইভিং লাইসেন্স, বৈধ গাড়ি নিবন্ধন, ফিটনেস সার্টিফিকেট ও ট্যাক্স টোকেন থাকতে হবে এবং অ্যাপে সব ডকুমেন্ট হালনাগাদ রাখতে হবে। রাইড অফার পেতে ড্রাইভাররা কল প্যাকেজ কেনেন; প্যাকেজের বিবরণ, মেয়াদ ও কল কর্তন অ্যাপে দেখানো হয়। প্রতি অ্যাকাউন্টে একটি গাড়ি নিবন্ধন করা যায়; পরিবর্তনে সাপোর্টে যোগাযোগ করতে হবে।",
    },
    {
      title: "5. Payments, Wallet, and Packages",
      title_bn: "৫. পেমেন্ট, ওয়ালেট ও প্যাকেজ",
      body: "Fares are calculated based on distance, time, and applicable pricing rules, and are quoted in Bangladeshi Taka (BDT). Payments and wallet top-ups are processed through our licensed third-party payment partner. Wallet balances and package purchases are non-transferable. Refunds, where applicable, are subject to the platform's refund policy. Driver earnings may be subject to platform commission and applicable taxes.",
      body_bn: "ভাড়া দূরত্ব, সময় ও প্রযোজ্য মূল্য নির্ধারণ নিয়ম অনুযায়ী হিসাব হয় এবং বাংলাদেশি টাকায় (BDT) প্রদর্শিত হয়। পেমেন্ট ও ওয়ালেট টপ-আপ আমাদের লাইসেন্সপ্রাপ্ত তৃতীয় পক্ষের পেমেন্ট পার্টনারের মাধ্যমে প্রক্রিয়াকৃত। ওয়ালেট ব্যালান্স ও প্যাকেজ ক্রয় স্থানান্তরযোগ্য নয়। প্রযোজ্য ক্ষেত্রে রিফান্ড প্ল্যাটফর্মের রিফান্ড নীতি অনুসরণ করে।",
    },
    {
      title: "6. Cancellations and No-Shows",
      title_bn: "৬. বাতিলকরণ ও অনুপস্থিতি",
      body: "Rides may be cancelled by riders or drivers before commencement. Cancellations may incur fees depending on timing, circumstances, and applicable policy, as shown at the time of cancellation. Repeated no-shows or cancellations may result in account restrictions.",
      body_bn: "যাত্রা শুরুর আগে রাইডার বা ড্রাইভার রাইড বাতিল করতে পারেন। সময়, পরিস্থিতি ও প্রযোজ্য নীতি অনুযায়ী বাতিলকরণে ফি লাগতে পারে, যা বাতিলকরণের সময় দেখানো হয়। বারবার অনুপস্থিতি বা বাতিলকরণে অ্যাকাউন্টে বিধিনিষেধ আসতে পারে।",
    },
    {
      title: "7. Prohibited Conduct",
      title_bn: "৭. নিষিদ্ধ আচরণ",
      body: "You may not use the service for unlawful activities, harassment or discrimination of other users, fraud (including fake rides or payment manipulation), damage to property, or interference with the platform's operation. Accounts that violate these rules may be suspended or terminated.",
      body_bn: "আপনি অবৈধ কার্যকলাপ, অন্য ব্যবহারকারীদের হয়রানি বা বৈষম্য, প্রতারণা (ভুয়া রাইড বা পেমেন্ট কারসাজি সহ), সম্পত্তি ক্ষতি, বা প্ল্যাটফর্মের কার্যক্রমে বিঘ্ন ঘটাতে পারবেন না। এই নিয়ম ভঙ্গকারী অ্যাকাউন্ট স্থগিত বা বাতিল করা হতে পারে।",
    },
    {
      title: "8. Limitation of Liability",
      title_bn: "৮. দায়সীমা",
      body: "To the maximum extent permitted by law, Ride is not liable for indirect, incidental, special, or consequential damages arising from use of the service. Our aggregate liability for any claim is limited to the amounts you paid to Ride for the relevant transaction in the preceding three months.",
      body_bn: "আইনের সর্বোচ্চ অনুমোদিত সীমায়, সেবা ব্যবহারে উদ্ভূত পরোক্ষ, আকস্মিক, বিশেষ বা পরিণামস্বরূপ ক্ষতির জন্য রাইড দায়ী নয়। যেকোনো দাবির ক্ষেত্রে আমাদের সর্বমোট দায় পূর্ববর্তী তিন মাসে সংশ্লিষ্ট লেনদেনের জন্য আপনার পরিশোধিত অর্থের মধ্যে সীমাবদ্ধ।",
    },
    {
      title: "9. Changes to These Terms",
      title_bn: "৯. শর্তাবলীর পরিবর্তন",
      body: "We may modify these terms from time to time. The revised terms take effect on the effective date shown above. Continued use of the service after changes constitutes acceptance of the revised terms.",
      body_bn: "আমরা সময়ে সময়ে এই শর্তাবলী পরিবর্তন করতে পারি। সংশোধিত শর্তাবলী উপরে দেখানো কার্যকর তারিখ থেকে কার্যকর হয়। পরিবর্তনের পর সেবা ব্যবহার চালিয়ে গেলে সংশোধিত শর্তাবলী গৃহীত বলে বিবেচিত হয়।",
    },
    {
      title: "10. Governing Law and Contact",
      title_bn: "১০. প্রযোজ্য আইন ও যোগাযোগ",
      body: "These terms are governed by the laws of Bangladesh, and disputes are subject to the exclusive jurisdiction of the courts of Dhaka. Questions about these terms may be sent to support@ride.com.bd or raised through the app's Contact Support feature.",
      body_bn: "এই শর্তাবলী বাংলাদেশের আইন দ্বারা নিয়ন্ত্রিত এবং বিরোধ ঢাকার আদালতের একচ্ছত্র এখ্তিয়ারভুক্ত। শর্তাবলী সম্পর্কে প্রশ্ন support@ride.com.bd-তে পাঠানো যাবে বা অ্যাপের যোগাযোগ সাপোর্ট ফিচারের মাধ্যমে জানানো যাবে।",
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  title_bn: "গোপনীয়তা নীতি",
  effective_date: "2026-08-01",
  revision_date: "2026-08-22",
  contact_email: "privacy@ride.com.bd",
  contact_address: "Dhaka, Bangladesh",
  sections: [
    {
      title: "1. Information We Collect",
      title_bn: "১. আমরা যে তথ্য সংগ্রহ করি",
      body: "We collect information you provide directly (name, phone number, and for drivers: licence and vehicle documents), location data while using the app, ride and trip history, payment and wallet information, device identifiers, and diagnostic data needed to provide and improve the service.",
      body_bn: "আমরা আপনার দেওয়া তথ্য (নাম, ফোন নম্বর এবং ড্রাইভারদের ক্ষেত্রে লাইসেন্স ও গাড়ির ডকুমেন্ট), অ্যাপ ব্যবহারকালে অবস্থানের তথ্য, রাইড ও ট্রিপের ইতিহাস, পেমেন্ট ও ওয়ালেট তথ্য, ডিভাইস আইডি এবং সেবা প্রদান ও উন্নয়নে প্রয়োজনীয় ডায়াগনস্টিক তথ্য সংগ্রহ করি।",
    },
    {
      title: "2. How We Use Your Information",
      title_bn: "২. আমরা কীভাবে আপনার তথ্য ব্যবহার করি",
      body: "We use your information to match rides, verify identities and documents, process payments and package purchases, calculate fares and commissions, ensure safety, provide customer support, send service notifications, and improve the platform.",
      body_bn: "আমরা রাইড ম্যাচ করতে, পরিচয় ও ডকুমেন্ট যাচাই করতে, পেমেন্ট ও প্যাকেজ ক্রয় প্রক্রিয়া করতে, ভাড়া ও কমিশন হিসাব করতে, নিরাপত্তা নিশ্চিত করতে, গ্রাহক সহায়তা দিতে, সেবা বিজ্ঞপ্তি পাঠাতে এবং প্ল্যাটফর্ম উন্নত করতে আপনার তথ্য ব্যবহার করি।",
    },
    {
      title: "3. Information Sharing",
      title_bn: "৩. তথ্য শেয়ারিং",
      body: "During a trip we share the minimum information needed for coordination: riders see the driver's name, vehicle, and live location; drivers see the rider's name, pickup point, and destination. We share payment data with our licensed payment processor and disclose information to authorities where required by law. We do not sell your personal data to third parties.",
      body_bn: "ট্রিপ চলাকালীন সমন্বয়ের জন্য প্রয়োজনীয় ন্যূনতম তথ্য শেয়ার করি: রাইডাররা ড্রাইভারের নাম, গাড়ি ও লাইভ অবস্থান দেখেন; ড্রাইভাররা রাইডারের নাম, পিকআপ পয়েন্ট ও গন্তব্য দেখেন। পেমেন্ট তথ্য আমাদের লাইসেন্সপ্রাপ্ত পেমেন্ট প্রসেসরের সাথে শেয়ার হয় এবং আইন দ্বারা প্রয়োজন হলে কর্তৃপক্ষকে প্রকাশ করা হয়। আমরা আপনার ব্যক্তিগত তথ্য বিক্রি করি না।",
    },
    {
      title: "4. Data Security and Retention",
      title_bn: "৪. তথ্য নিরাপত্তা ও সংরক্ষণ",
      body: "We apply industry-standard technical and organizational measures, including encryption in transit, access controls, and audit logging. We retain your data while your account is active and for a limited period thereafter for legal, accounting, and dispute-resolution purposes. No method of transmission is completely secure.",
      body_bn: "আমরা শিল্প-মানদণ্ডের প্রযুক্তিগত ও সাংগঠনিক ব্যবস্থা প্রয়োগ করি, যার মধ্যে রয়েছে পরিবহনে এনক্রিপশন, অ্যাক্সেস নিয়ন্ত্রণ ও অডিট লগিং। অ্যাকাউন্ট সক্রিয় থাকা পর্যন্ত এবং পরে আইনি, হিসাব ও বিরোধ নিষ্পত্তির উদ্দেশ্যে সীমিত সময়ের জন্য আপনার তথ্য সংরক্ষণ করি। কোনো প্রেরণ পদ্ধতি সম্পূর্ণ নিরাপদ নয়।",
    },
    {
      title: "5. Your Rights and Choices",
      title_bn: "৫. আপনার অধিকার ও নির্বাচন",
      body: "You may access, correct, or request deletion of your personal data by contacting our support team, and you can request a copy of your data through Settings → Data & Analytics. You control location-permission and notification settings on your device.",
      body_bn: "আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করে আপনি আপনার ব্যক্তিগত তথ্য অ্যাক্সেস, সংশোধন বা মুছে ফেলার অনুরোধ করতে পারেন এবং Settings → Data & Analytics-এর মাধ্যমে আপনার তথ্যের অনুলিপি চাইতে পারেন। আপনার ডিভাইসে লোকেশন ও নোটিফিকেশন অনুমতি আপনি নিয়ন্ত্রণ করেন।",
    },
    {
      title: "6. Contact Us",
      title_bn: "৬. যোগাযোগ",
      body: "For privacy inquiries, contact privacy@ride.com.bd or use the app's Contact Support feature.",
      body_bn: "গোপনীয়তা সংক্রান্ত জিজ্ঞাসায় privacy@ride.com.bd-তে যোগাযোগ করুন বা অ্যাপের যোগাযোগ সাপোর্ট ফিচার ব্যবহার করুন।",
    },
  ],
};

/**
 * Get the appropriate legal document for the given role and type.
 * Rider and driver share the same content; role-specific differences
 * (if any) should be added here rather than in screen components.
 */
export function getLegalContent(
  type: "terms" | "privacy",
  _role: "rider" | "driver" = "rider",
): LegalDocument {
  return type === "terms" ? TERMS_OF_SERVICE : PRIVACY_POLICY;
}
