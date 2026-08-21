/**
 * Centralized legal content source.
 *
 * All four settings terms/privacy screens (rider terms, rider privacy,
 * driver terms, driver privacy) MUST consume content from this file.
 * Never hard-code legal text in screen components.
 *
 * ⚠️ PRODUCT/LEGAL GATE: This file contains placeholder copy.
 * Product/Legal must provide approved English and Bengali content,
 * revision dates, contact address, and effective-date policy before
 * the legal screens are considered complete.
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
  revision_date: "2026-08-01",
  contact_email: "support@ride.com.bd",
  contact_address: "Dhaka, Bangladesh",
  sections: [
    {
      title: "1. Acceptance of Terms",
      title_bn: "১. শর্তাবলীর স্বীকৃতি",
      body: "By using the Ride platform, you agree to these Terms of Service. If you do not agree, do not use the service.",
      body_bn: "রাইড প্ল্যাটফর্ম ব্যবহার করে আপনি এই সেবার শর্তাবলী মেনে নিচ্ছেন। আপনি সম্মত না হলে, সেবা ব্যবহার করবেন না।",
    },
    {
      title: "2. Service Description",
      title_bn: "২. সেবার বিবরণ",
      body: "Ride is a ride-hailing platform connecting riders with drivers in Bangladesh. Drivers purchase call packages to receive ride offers.",
      body_bn: "রাইড একটি রাইড-হেইলিং প্ল্যাটফর্ম যা বাংলাদেশে রাইডারদের ড্রাইভারদের সাথে সংযুক্ত করে। ড্রাইভাররা রাইড অফার পেতে কল প্যাকেজ কিনে থাকে।",
    },
    {
      title: "3. User Responsibilities",
      title_bn: "৩. ব্যবহারকারীর দায়িত্ব",
      body: "Users must provide accurate information, comply with local laws, and treat other users with respect. Drivers must maintain valid documents and vehicle fitness.",
      body_bn: "ব্যবহারকারীদের সঠিক তথ্য প্রদান করতে হবে, স্থানীয় আইন মেনে চলতে হবে এবং অন্যান্য ব্যবহারকারীদের সাথে সম্মানের আচরণ করতে হবে।",
    },
    {
      title: "4. Payment Terms",
      title_bn: "৪. পেমেন্টের শর্তাবলী",
      body: "All payments are processed through our secure payment partner. Wallet balances are in Bangladeshi Taka (BDT). Refunds are subject to the platform's refund policy.",
      body_bn: "সমস্ত পেমেন্ট আমাদের নিরাপদ পেমেন্ট পার্টনারের মাধ্যমে প্রক্রিয়া করা হয়। ওয়ালেট ব্যালান্স বাংলাদেশি টাকা (BDT) তে রাখা হয়।",
    },
    {
      title: "5. Cancellation Policy",
      title_bn: "৫. বাতিলকরণ নীতি",
      body: "Ride cancellations may incur fees based on timing and circumstances. See the cancellation policy in-app for details.",
      body_bn: "সময় এবং পরিস্থিতির উপর নির্ভর করে রাইড বাতিলকরণে ফি লাগতে পারে। বিস্তারিতের জন্য অ্যাপে বাতিলকরণ নীতি দেখুন।",
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  title_bn: "গোপনীয়তা নীতি",
  effective_date: "2026-08-01",
  revision_date: "2026-08-01",
  contact_email: "privacy@ride.com.bd",
  contact_address: "Dhaka, Bangladesh",
  sections: [
    {
      title: "1. Information We Collect",
      title_bn: "১. আমরা যে তথ্য সংগ্রহ করি",
      body: "We collect your phone number, name, location data, ride history, payment information, and device identifiers to provide and improve our service.",
      body_bn: "আমরা আমাদের সেবা প্রদান এবং উন্নত করার জন্য আপনার ফোন নম্বর, নাম, অবস্থানের তথ্য, রাইডের ইতিহাস, পেমেন্টের তথ্য এবং ডিভাইস আইডি সংগ্রহ করি।",
    },
    {
      title: "2. How We Use Your Information",
      title_bn: "২. আমরা কীভাবে আপনার তথ্য ব্যবহার করি",
      body: "Your information is used to match you with rides, process payments, ensure safety, and communicate service updates.",
      body_bn: "আপনার তথ্য আপনাকে রাইডের সাথে ম্যাচ করতে, পেমেন্ট প্রক্রিয়া করতে, নিরাপত্তা নিশ্চিত করতে এবং সেবা আপডেট যোগাযোগ করতে ব্যবহৃত হয়।",
    },
    {
      title: "3. Data Sharing",
      title_bn: "৩. তথ্য শেয়ারিং",
      body: "We share your information with your ride partner for trip coordination. We do not sell your personal data to third parties.",
      body_bn: "আমরা ট্রিপ সমন্বয়ের জন্য আপনার তথ্য আপনার রাইড পার্টনারের সাথে শেয়ার করি। আমরা আপনার ব্যক্তিগত তথ্য তৃতীয় পক্ষে বিক্রি করি না।",
    },
    {
      title: "4. Data Security",
      title_bn: "৪. তথ্য নিরাপত্তা",
      body: "We implement industry-standard security measures to protect your data. However, no method of transmission is 100% secure.",
      body_bn: "আমরা আপনার তথ্য রক্ষা করতে শিল্প-মানদণ্ডের নিরাপত্তা ব্যবস্থা বাস্তবায়ন করি। তবে, প্রেরণের কোনো পদ্ধতি ১০০% নিরাপদ নয়।",
    },
    {
      title: "5. Your Rights",
      title_bn: "৫. আপনার অধিকার",
      body: "You can access, update, or request deletion of your personal data by contacting our support team.",
      body_bn: "আপনি আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করে আপনার ব্যক্তিগত তথ্য অ্যাক্সেস, আপডেট বা মুছে ফেলার অনুরোধ করতে পারেন।",
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
