import { marked } from 'marked';
import packSource from '../../docs/Ride_Terms_Policies_Draft_Pack/Ride_Terms_Policies_Draft_Pack/Ride_Terms_and_Policies_Draft_Pack.md?raw';

/**
 * Legal document centre data source.
 *
 * Single source of truth is the version-controlled drafting pack
 * (README there names Ride_Terms_and_Policies_Draft_Pack.md the primary
 * source document). Parts A-M map to public routes; Part N (decision
 * register) and section 0 (publication controls) are internal only and
 * are never extracted. Nothing here is approved for publication: every
 * route renders through LegalDoc.svelte with a draft banner + noindex.
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

function extractPart(letter: string): string {
  const lines = packSource.split('\n');
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
  const html = highlightPlaceholders(marked.parse(extractPart(letter)) as string);
  cache.set(letter, html);
  return html;
}
