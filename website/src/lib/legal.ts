import { marked } from 'marked';
import packSource from '../../docs/Ride_Terms_Policies_Draft_Pack/Ride_Terms_Policies_Draft_Pack/Ride_Terms_and_Policies_Draft_Pack.md?raw';
import packSourceBn from '../../docs/Ride_Terms_Policies_Draft_Pack/Ride_Terms_Policies_Draft_Pack/Ride_Terms_and_Policies_Draft_Pack.bn.md?raw';

/**
 * Legal document centre data source — English + Bangla, always side by side.
 *
 * Single sources of truth are the version-controlled drafting packs:
 * Ride_Terms_and_Policies_Draft_Pack.md (English) and
 * Ride_Terms_and_Policies_Draft_Pack.bn.md (Bangla working translation).
 * Parts A-M map to public routes; Part N (decision register) and sections
 * 0/O/P (controls, checklist, references) are internal only and are never
 * extracted. Nothing here is approved for publication: every route renders
 * through LegalDoc.svelte with a draft banner.
 */

export interface LegalDocMeta {
  letter: string;
  route: string;
  eyebrow: string;
  title: string;
  intro: string;
}

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    letter: 'A',
    route: '/terms',
    eyebrow: 'General terms of use',
    title: 'Terms of use',
    intro:
      'The general terms for using the Ride website, app and platform services. Working draft — not approved, not binding.'
  },
  {
    letter: 'B',
    route: '/terms/customers',
    eyebrow: 'Customer terms',
    title: 'Customer & passenger terms',
    intro:
      'Draft terms for customers and passengers booking rides and other services. Working draft — not approved, not binding.'
  },
  {
    letter: 'C',
    route: '/terms/partners',
    eyebrow: 'Partner terms',
    title: 'Driver & service partner terms',
    intro:
      'Draft terms for drivers, couriers and service partners, including call packages, verification and deactivation. Working draft — not approved, not binding.'
  },
  {
    letter: 'D',
    route: '/terms/merchants',
    eyebrow: 'Merchant terms',
    title: 'Merchant terms',
    intro:
      'Draft terms for restaurants, shops and businesses selling through Ride. Working draft — not approved, not binding.'
  },
  {
    letter: 'E',
    route: '/policies/orders',
    eyebrow: 'Orders policy',
    title: 'Food, grocery & shop orders',
    intro:
      'Draft policy for food, grocery and general shop orders: acceptance, substitutions, preparation and returns. Working draft — not approved, not binding.'
  },
  {
    letter: 'F',
    route: '/policies/parcel',
    eyebrow: 'Parcel policy',
    title: 'Parcel, courier & store delivery',
    intro:
      'Draft parcel, courier and store-delivery policy, including prohibited items, COD and delivery disputes. Working draft — not approved, not binding.'
  },
  {
    letter: 'G',
    route: '/policies/rentals',
    eyebrow: 'Rentals policy',
    title: 'Car rental, intercity, truck & shifting',
    intro:
      'Draft policy for car rental, intercity travel, trucks and household shifting. Working draft — not approved, not binding.'
  },
  {
    letter: 'H',
    route: '/policies/ambulance',
    eyebrow: 'Ambulance policy',
    title: 'Ambulance booking & emergency notice',
    intro:
      'Draft ambulance booking policy and emergency notice. Ride is not an emergency-response service — in Bangladesh call 999. Working draft — not approved, not binding.'
  },
  {
    letter: 'I',
    route: '/policies/refunds',
    eyebrow: 'Refunds policy',
    title: 'Cancellation, returns & refunds',
    intro:
      'Draft cancellation, returns and refund principles for each service. Working draft — not approved, not binding.'
  },
  {
    letter: 'J',
    route: '/safety',
    eyebrow: 'Safety standards',
    title: 'Safety & community standards',
    intro:
      'Draft safety and community standards for customers, partners and merchants. Working draft — not approved, not binding.'
  },
  {
    letter: 'K',
    route: '/privacy',
    eyebrow: 'Legal & data transparency',
    title: 'Privacy notice',
    intro:
      'Draft privacy notice describing what Ride may process and why. Working draft — completion requires the production data inventory and counsel review.'
  },
  {
    letter: 'L',
    route: '/delete-account',
    eyebrow: 'Your data, your choice',
    title: 'Request account deletion',
    intro:
      'Request deletion of your Ride account and associated personal data without reinstalling or opening the app. Working draft page with a working email channel.'
  },
  {
    letter: 'M',
    route: '/cookies',
    eyebrow: 'Website transparency',
    title: 'Cookie notice',
    intro:
      'Draft website cookie notice. Working draft — completion requires a production cookie inventory.'
  }
];

export interface LegalDocMetaBn {
  letter: string;
  eyebrow: string;
  title: string;
  intro: string;
}

export const LEGAL_DOCS_BN: LegalDocMetaBn[] = [
  { letter: 'A', eyebrow: 'সাধারণ ব্যবহারের শর্তাবলি', title: 'ব্যবহারের শর্তাবলি', intro: 'Ride ওয়েবসাইট, অ্যাপ ও প্ল্যাটফর্ম সেবা ব্যবহারের সাধারণ শর্ত। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'B', eyebrow: 'গ্রাহক শর্তাবলি', title: 'গ্রাহক ও যাত্রী শর্তাবলি', intro: 'রাইড ও অন্যান্য সেবা বুকিংকারী গ্রাহক ও যাত্রীদের জন্য খসড়া শর্ত। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'C', eyebrow: 'পার্টনার শর্তাবলি', title: 'ড্রাইভার ও সেবা পার্টনার শর্তাবলি', intro: 'কল প্যাকেজ, যাচাই ও নিষ্ক্রিয়করণসহ ড্রাইভার, কুরিয়ার ও সেবা পার্টনারদের জন্য খসড়া শর্ত। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'D', eyebrow: 'মার্চেন্ট শর্তাবলি', title: 'মার্চেন্ট শর্তাবলি', intro: 'Ride-এর মাধ্যমে বিক্রয়কারী রেস্টুরেন্ট, দোকান ও ব্যবসার জন্য খসড়া শর্ত। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'E', eyebrow: 'অর্ডার নীতি', title: 'খাবার, মুদি ও দোকানের অর্ডার', intro: 'খাবার, মুদি ও সাধারণ দোকানের অর্ডারের খসড়া নীতি: গ্রহণ, বিকল্প, প্রস্তুতি ও ফেরত। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'F', eyebrow: 'পার্সেল নীতি', title: 'পার্সেল, কুরিয়ার ও দোকানের ডেলিভারি', intro: 'পার্সেল, কুরিয়ার ও দোকান-ডেলিভারির খসড়া নীতি — নিষিদ্ধ পণ্য, সিওডি ও ডেলিভারি বিরোধসহ। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'G', eyebrow: 'ভাড়া নীতি', title: 'কার ভাড়া, আন্তঃজেলা, ট্রাক ও বাসা বদল', intro: 'কার ভাড়া, আন্তঃজেলা ভ্রমণ, ট্রাক ও বাসা বদলের খসড়া নীতি। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'H', eyebrow: 'অ্যাম্বুলেন্স নীতি', title: 'অ্যাম্বুলেন্স বুকিং ও জরুরি বিজ্ঞপ্তি', intro: 'অ্যাম্বুলেন্স বুকিংয়ের খসড়া নীতি ও জরুরি বিজ্ঞপ্তি। Ride জরুরি-সাড়া সেবা নয় — বাংলাদেশে ৯৯৯-এ যোগাযোগ করুন। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'I', eyebrow: 'ফেরত নীতি', title: 'বাতিল, ফেরত ও টাকা ফেরত', intro: 'প্রতিটি সেবার জন্য বাতিল, ফেরত ও টাকা ফেরতের খসড়া নীতি। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'J', eyebrow: 'নিরাপত্তা মান', title: 'নিরাপত্তা ও কমিউনিটি মান', intro: 'গ্রাহক, পার্টনার ও মার্চেন্টদের জন্য খসড়া নিরাপত্তা ও কমিউনিটি মান। কার্যকরী খসড়া — অনুমোদিত নয়, বাধ্যতামূলক নয়।' },
  { letter: 'K', eyebrow: 'আইনি ও তথ্য স্বচ্ছতা', title: 'প্রাইভেসি বিজ্ঞপ্তি', intro: 'Ride কী প্রক্রিয়া করতে পারে তা বর্ণনাকারী খসড়া প্রাইভেসি বিজ্ঞপ্তি। সম্পূর্ণ হতে প্রোডাকশন তথ্য তালিকা ও আইনজীবী পর্যালোচনা প্রয়োজন।' },
  { letter: 'L', eyebrow: 'আপনার তথ্য, আপনার সিদ্ধান্ত', title: 'অ্যাকাউন্ট মুছে ফেলার অনুরোধ', intro: 'অ্যাপ পুনরায় ইনস্টল বা খোলা ছাড়াই আপনার Ride অ্যাকাউন্ট ও সংশ্লিষ্ট ব্যক্তিগত তথ্য মুছে ফেলার অনুরোধ করুন। কার্যকরী খসড়া পেজ।' },
  { letter: 'M', eyebrow: 'ওয়েবসাইট স্বচ্ছতা', title: 'কুকি বিজ্ঞপ্তি', intro: 'খসড়া ওয়েবসাইট কুকি বিজ্ঞপ্তি। সম্পূর্ণ হতে প্রোডাকশন কুকি তালিকা প্রয়োজন।' }
];

export function getLegalMeta(letter: string): LegalDocMeta {
  const meta = LEGAL_DOCS.find((d) => d.letter === letter);
  if (!meta) throw new Error(`Unknown legal doc letter: ${letter}`);
  return meta;
}

export function getLegalMetaBn(letter: string): LegalDocMetaBn {
  const meta = LEGAL_DOCS_BN.find((d) => d.letter === letter);
  if (!meta) throw new Error(`Unknown legal doc letter (bn): ${letter}`);
  return meta;
}

function extractPart(letter: string, source: string): string {
  const lines = source.split('\n');
  const open = new RegExp(`^# PART ${letter}\\b`);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1) {
      if (open.test(lines[i])) start = i + 1;
    } else if (/^# PART [A-Z]\b/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start === -1) throw new Error(`Legal draft PART ${letter} not found in pack`);
  return lines.slice(start, end).join('\n').trim();
}

/** Wrap [BRACKETED] placeholders in a visible marker. Only text nodes are touched. */
function highlightPlaceholders(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk;
      return chunk.replace(/\[[^\][\n<>]{1,140}\]/g, (m) =>
        /CONFIRM|INSERT|COMPLETE|TODO|TBD|FIXME|XXX|\bDATE\b|\bSLA\b|EMAIL|CHANNEL|ADDRESS|NAME|NUMBER|DETAILS|PATH|PROVIDER|REGISTERED|MONITORED|EXACT|FULL|APPLICABLE/i.test(
          m
        )
          ? `<span class="draft-ph">${m}</span>`
          : m
      );
    })
    .join('');
}

const cache = new Map<string, string>();

/** Render one draft part (A-M) to highlighted HTML. Throws at build time if missing. */
export function renderLegalDoc(letter: string): string {
  const hit = cache.get(letter);
  if (hit) return hit;
  const html = highlightPlaceholders(marked.parse(extractPart(letter, packSource)) as string);
  cache.set(letter, html);
  return html;
}

const cacheBn = new Map<string, string>();

/** Render one Bangla draft part (A-M). Throws at build time if missing. */
export function renderLegalDocBn(letter: string): string {
  const hit = cacheBn.get(letter);
  if (hit) return hit;
  const html = highlightPlaceholders(marked.parse(extractPart(letter, packSourceBn)) as string);
  cacheBn.set(letter, html);
  return html;
}
