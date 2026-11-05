<script lang="ts">
  import { site, supportEmailConfigured, playStoreConfigured } from '#lib/site';

  type Locale = 'en' | 'bn';
  let lang = $state<Locale>('en');
  let menuOpen = $state(false);
  let openFaq = $state<number | null>(0);

  const copy = {
    en: {
      eyebrow: 'MADE FOR EVERYDAY LIFE IN BANGLADESH',
      titleA: 'Move through life.',
      titleB: 'One app at a time.',
      intro: 'From the ride across town to the parcel at your door, Ride brings everyday mobility, local shopping and delivery into one connected experience.',
      explore: 'Explore services',
      partners: 'Become a partner',
      availability: 'Availability depends on your area and participating providers.',
      servicesEyebrow: 'ONE PLATFORM, MANY EVERYDAY NEEDS',
      servicesTitle: 'More ways to get things done.',
      servicesIntro: 'Choose the service that fits the job. What you can book depends on local provider availability.',
      howEyebrow: 'A CLEARER WAY TO GET STARTED',
      howTitle: 'Start with what you need.',
      partnerEyebrow: 'BUILT AROUND LOCAL PARTNERS',
      partnerTitle: 'Good journeys need good partners.',
      partnerText: 'Ride connects customers with drivers, fleets, shops, restaurants, workshops and delivery partners. Partner terms, verification and service eligibility are shown during onboarding.',
      driverTitle: 'For drivers and fleets',
      driverText: 'Ride does not deduct a per-trip commission from ride fares. Drivers use weekly call packages to access eligible ride leads. Package fees and terms apply.',
      merchantTitle: 'For shops and merchants',
      merchantText: 'Arrange delivery support for local orders and parcels where the merchant and delivery workflow is active.',
      partnerCta: 'Contact the partner team',
      safetyEyebrow: 'SAFETY, CLARITY AND CONTROL',
      safetyTitle: 'Trust is part of the journey.',
      safetyText: 'Ride is designed to make service details, trip information and partner expectations clearer. Safety and tracking tools are available only where implemented and enabled for the relevant service.',
      emergencyTitle: 'An app is not an emergency service.',
      emergencyText: 'Do not wait for an app match during a life-threatening emergency. In Bangladesh, contact the national emergency service at 999.',
      faqEyebrow: 'GOOD TO KNOW',
      faqTitle: 'A few things people ask.',
      contactEyebrow: 'WE ARE HERE TO HELP',
      contactTitle: 'Questions about Ride?',
      contactText: 'For app support, partnership enquiries or privacy questions, use the relevant contact channel. We will publish monitored contact details before launch.',
      contactCta: 'Contact support',
      getApp: 'Google Play link coming soon',
      footerLine: 'Mobility, local commerce and delivery — connected for Bangladesh.',
      footerNotice: 'Services and payment methods vary by location and provider.',
      navServices: 'Services', navPartners: 'Partners', navSafety: 'Safety', navFaq: 'FAQ', navContact: 'Contact',
      faqs: [
        { q: 'Where is Ride available?', a: 'Service coverage is being rolled out by area and provider. Check the app or contact support for the latest local availability. We do not claim that every service is available in every district.' },
        { q: 'Does Ride charge drivers a commission?', a: 'Ride does not deduct a per-trip commission from ride fares. Drivers use weekly call packages to access eligible ride leads. Package pricing, validity, allowances and rollover terms must be reviewed before purchase.' },
        { q: 'Can I book an ambulance through Ride?', a: 'You may request participating ambulance transport where the service is operational. Provider capability and availability vary. Ride is not an emergency-response service; for an urgent emergency in Bangladesh, call 999.' },
        { q: 'Which payment methods can I use?', a: 'Payment methods depend on the service and area. The options available to you will be shown in the app before you confirm.' },
        { q: 'How do I request account deletion?', a: 'Use the account-deletion page linked in the website footer. You can request deletion without reinstalling the app. Some records may need to be retained where law or legitimate security requirements apply; the final retention policy will explain this.' }
      ]
    },
    bn: {
      eyebrow: 'বাংলাদেশের দৈনন্দিন জীবনের জন্য',
      titleA: 'প্রতিদিনের চলার পথে,',
      titleB: 'একসাথে Ride.',
      intro: 'শহরের এক প্রান্তে যাতায়াত থেকে দরজায় পার্সেল পৌঁছানো—Ride এক জায়গায় আনছে যাতায়াত, স্থানীয় কেনাকাটা ও ডেলিভারির সুবিধা।',
      explore: 'সেবাগুলো দেখুন',
      partners: 'পার্টনার হোন',
      availability: 'সেবার প্রাপ্যতা আপনার এলাকা ও অংশগ্রহণকারী সেবাদাতার ওপর নির্ভর করে।',
      servicesEyebrow: 'এক প্ল্যাটফর্মে দৈনন্দিন নানা প্রয়োজন',
      servicesTitle: 'কাজ অনুযায়ী সেবা বেছে নিন।',
      servicesIntro: 'আপনার প্রয়োজন অনুযায়ী সেবা বেছে নিন। স্থানীয় সেবাদাতার প্রাপ্যতা অনুযায়ী বুকিং করা যাবে।',
      howEyebrow: 'শুরু করার সহজ উপায়',
      howTitle: 'প্রয়োজন অনুযায়ী শুরু করুন।',
      partnerEyebrow: 'স্থানীয় পার্টনারদের নিয়ে',
      partnerTitle: 'ভালো সেবার জন্য ভালো পার্টনার প্রয়োজন।',
      partnerText: 'Ride গ্রাহকদের সঙ্গে ড্রাইভার, গাড়ির মালিক, দোকান, রেস্টুরেন্ট, ওয়ার্কশপ ও ডেলিভারি পার্টনারদের যুক্ত করে। পার্টনারশিপের শর্ত ও যাচাইয়ের নিয়ম নিবন্ধনের সময় জানানো হবে।',
      driverTitle: 'ড্রাইভার ও ফ্লিটের জন্য',
      driverText: 'Ride রাইড ভাড়া থেকে প্রতি ট্রিপে কমিশন কাটে না। রাইডের লিড পেতে ড্রাইভারদের সাপ্তাহিক কল প্যাকেজ ব্যবহার করতে হয়। প্যাকেজের মূল্য ও শর্ত প্রযোজ্য।',
      merchantTitle: 'দোকান ও মার্চেন্টদের জন্য',
      merchantText: 'সেবা চালু থাকা এলাকায় স্থানীয় অর্ডার ও পার্সেলের জন্য ডেলিভারি সহায়তা নিন।',
      partnerCta: 'পার্টনার টিমের সঙ্গে যোগাযোগ',
      safetyEyebrow: 'নিরাপত্তা, স্বচ্ছতা ও নিয়ন্ত্রণ',
      safetyTitle: 'যাত্রার প্রতিটি ধাপে আস্থা।',
      safetyText: 'সেবার তথ্য, ট্রিপের বিবরণ ও পার্টনারদের শর্ত আরও পরিষ্কারভাবে তুলে ধরাই Ride-এর লক্ষ্য। নিরাপত্তা ও ট্র্যাকিং সুবিধা কেবল যেখানে চালু ও প্রযোজ্য সেখানেই পাওয়া যাবে।',
      emergencyTitle: 'অ্যাপ জরুরি সেবার বিকল্প নয়।',
      emergencyText: 'জীবনঝুঁকিপূর্ণ জরুরি অবস্থায় অ্যাপে ম্যাচের জন্য অপেক্ষা করবেন না। বাংলাদেশে জাতীয় জরুরি সেবা ৯৯৯-এ যোগাযোগ করুন।',
      faqEyebrow: 'জেনে রাখা ভালো',
      faqTitle: 'সাধারণ কিছু প্রশ্ন।',
      contactEyebrow: 'আমরা সহায়তা করতে প্রস্তুত',
      contactTitle: 'Ride সম্পর্কে প্রশ্ন আছে?',
      contactText: 'অ্যাপ সাপোর্ট, পার্টনারশিপ বা প্রাইভেসি বিষয়ে সঠিক যোগাযোগের মাধ্যম ব্যবহার করুন। লঞ্চের আগে সচল যোগাযোগের তথ্য প্রকাশ করা হবে।',
      contactCta: 'সাপোর্টে যোগাযোগ',
      getApp: 'Google Play লিংক শিগগিরই আসছে',
      footerLine: 'যাতায়াত, স্থানীয় কেনাকাটা ও ডেলিভারি—বাংলাদেশের জন্য একসাথে।',
      footerNotice: 'এলাকা ও সেবাদাতা অনুযায়ী সেবা এবং পেমেন্ট পদ্ধতি ভিন্ন হতে পারে।',
      navServices: 'সেবাসমূহ', navPartners: 'পার্টনার', navSafety: 'নিরাপত্তা', navFaq: 'প্রশ্নোত্তর', navContact: 'যোগাযোগ',
      faqs: [
        { q: 'Ride কোথায় পাওয়া যাবে?', a: 'এলাকা ও সেবাদাতা অনুযায়ী ধাপে ধাপে সেবা চালু হচ্ছে। সর্বশেষ তথ্যের জন্য অ্যাপ বা সাপোর্টে যোগাযোগ করুন। প্রতিটি জেলায় সব সেবা চালু আছে—এমন দাবি করা হচ্ছে না।' },
        { q: 'Ride কি ড্রাইভারদের কাছ থেকে কমিশন নেয়?', a: 'Ride রাইড ভাড়া থেকে প্রতি ট্রিপে কমিশন কাটে না। রাইডের লিড পেতে ড্রাইভারদের সাপ্তাহিক কল প্যাকেজ ব্যবহার করতে হয়। কেনার আগে প্যাকেজের মূল্য, মেয়াদ, লিড ও রোলওভার শর্ত দেখে নিন।' },
        { q: 'Ride দিয়ে কি অ্যাম্বুলেন্স বুক করা যাবে?', a: 'সেবা চালু থাকা এলাকায় অংশগ্রহণকারী অ্যাম্বুলেন্সের জন্য অনুরোধ করা যেতে পারে। সেবাদাতার সক্ষমতা ও প্রাপ্যতা ভিন্ন হতে পারে। জরুরি অবস্থায় Ride-এর পরিবর্তে ৯৯৯-এ যোগাযোগ করুন।' },
        { q: 'কোন পেমেন্ট পদ্ধতি ব্যবহার করা যাবে?', a: 'সেবা ও এলাকা অনুযায়ী পেমেন্ট পদ্ধতি ভিন্ন হতে পারে। বুকিং নিশ্চিত করার আগে অ্যাপে উপলভ্য পদ্ধতিগুলো দেখানো হবে।' },
        { q: 'অ্যাকাউন্ট মুছে ফেলার অনুরোধ কীভাবে করব?', a: 'ওয়েবসাইটের নিচে থাকা অ্যাকাউন্ট ডিলিশন পেজ ব্যবহার করুন। অ্যাপ পুনরায় ইনস্টল না করেও অনুরোধ করা যাবে। আইনগত বা নিরাপত্তাজনিত কারণে কিছু তথ্য সংরক্ষণের প্রয়োজন হতে পারে; চূড়ান্ত নীতিমালায় তা ব্যাখ্যা করা হবে।' }
      ]
    }
  } as const;

  const serviceCards = [
    { icon: '↗', className: 'mobility', title: { en: 'Everyday rides', bn: 'দৈনন্দিন যাতায়াত' }, desc: { en: 'Choose from bike, scooter, CNG and car options for the journey ahead.', bn: 'যাত্রার জন্য বাইক, স্কুটার, সিএনজি ও কারের বিকল্প বেছে নিন।' }, tags: { en: 'Bike · Scooter · CNG · Car', bn: 'বাইক · স্কুটার · সিএনজি · কার' } },
    { icon: '⌁', className: 'rental', title: { en: 'Car rental & intercity', bn: 'কার ভাড়া ও আন্তঃজেলা' }, desc: { en: 'Arrange hourly, daily or supported-route travel with participating fleets.', bn: 'অংশগ্রহণকারী ফ্লিটের মাধ্যমে ঘণ্টা, দিন বা নির্দিষ্ট রুটে গাড়ি ভাড়ার অনুরোধ করুন।' }, tags: { en: 'Hourly · Daily · Outstation', bn: 'ঘণ্টা · দিন · আন্তঃজেলা' } },
    { icon: '▰', className: 'cargo', title: { en: 'Truck & shifting', bn: 'ট্রাক ও বাসা বদল' }, desc: { en: 'Find pickup, covered van and truck options for moving goods where available.', bn: 'প্রাপ্যতা অনুযায়ী মালামাল পরিবহনে পিকআপ, কাভার্ড ভ্যান ও ট্রাকের ব্যবস্থা করুন।' }, tags: { en: 'Pickup · Covered van · Cargo', bn: 'পিকআপ · কাভার্ড ভ্যান · পণ্য' } },
    { icon: '✚', className: 'medical', title: { en: 'Ambulance requests', bn: 'অ্যাম্বুলেন্স অনুরোধ' }, desc: { en: 'Request participating ambulance transport in areas where the service is active.', bn: 'সেবা চালু থাকা এলাকায় অংশগ্রহণকারী অ্যাম্বুলেন্সের জন্য অনুরোধ করুন।' }, tags: { en: 'Provider availability applies', bn: 'সেবাদাতার প্রাপ্যতা প্রযোজ্য' } },
    { icon: '✳', className: 'food', title: { en: 'Food & restaurants', bn: 'খাবার ও রেস্টুরেন্ট' }, desc: { en: 'Discover participating restaurants and order local favourites for delivery.', bn: 'অংশগ্রহণকারী রেস্টুরেন্ট থেকে পছন্দের খাবার অর্ডার করুন।' }, tags: { en: 'Restaurants · Cafes · Food', bn: 'রেস্টুরেন্ট · ক্যাফে · খাবার' } },
    { icon: '▦', className: 'shops', title: { en: 'Shops & workshops', bn: 'দোকান ও ওয়ার্কশপ' }, desc: { en: 'Explore groceries, daily essentials, automotive products and participating workshops.', bn: 'মুদি পণ্য, নিত্যপ্রয়োজনীয় জিনিস, অটোমোটিভ পণ্য ও অংশগ্রহণকারী ওয়ার্কশপ খুঁজুন।' }, tags: { en: 'Groceries · Local shops · Auto', bn: 'বাজার · স্থানীয় দোকান · অটো' } },
    { icon: '▣', className: 'parcel', title: { en: 'Parcel & store delivery', bn: 'পার্সেল ও দোকানের ডেলিভারি' }, desc: { en: 'Send eligible parcels and arrange delivery support for participating merchants.', bn: 'যোগ্য পার্সেল পাঠান এবং অংশগ্রহণকারী মার্চেন্টদের ডেলিভারি সহায়তা নিন।' }, tags: { en: 'Courier · Parcel · COD workflows', bn: 'কুরিয়ার · পার্সেল · সিওডি' } }
  ];

  const current = $derived(copy[lang]);
  const supportHref = supportEmailConfigured ? `mailto:${site.supportEmail}` : '/support';
  const ogImage = `${site.siteUrl}/og-ride.svg`;

  $effect(() => {
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  });

  $effect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') menuOpen = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<svelte:head>
  <title>Ride — Rides, Food, Local Shops & Delivery in Bangladesh</title>
  <meta name="description" content="Ride brings everyday mobility, local shopping, food, rentals and delivery into one Bangladesh-focused app. Service availability varies by area and provider." />
  <meta name="robots" content="index,follow" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Ride — Everyday mobility, local commerce and delivery" />
  <meta property="og:description" content="Rides, local shopping and delivery in one Bangladesh-focused app. Check service availability in your area." />
  <meta property="og:image" content={ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="site-shell" class:bn={lang === 'bn'}>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Ride home">
      <span class="brand-mark">R</span>
      <span class="brand-name">Ride<span class="brand-period">.</span></span>
    </a>

    <nav class="desktop-nav" aria-label="Main navigation">
      <a href="#services">{current.navServices}</a>
      <a href="#partners">{current.navPartners}</a>
      <a href="#safety">{current.navSafety}</a>
      <a href="#faq">{current.navFaq}</a>
      <a href="#contact">{current.navContact}</a>
    </nav>

    <div class="header-actions">
      <button class="language-switch" onclick={() => (lang = lang === 'en' ? 'bn' : 'en')} aria-label="Switch language">
        {lang === 'en' ? 'বাংলা' : 'English'}
      </button>
      <a class="header-cta" href="#services">{current.explore}<span aria-hidden="true">↗</span></a>
      <button class="menu-toggle" onclick={() => (menuOpen = !menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen} aria-controls="mobile-nav">
        <span></span><span></span>
      </button>
    </div>
  </header>

  {#if menuOpen}
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation">
      <a onclick={() => (menuOpen = false)} href="#services">{current.navServices}</a>
      <a onclick={() => (menuOpen = false)} href="#partners">{current.navPartners}</a>
      <a onclick={() => (menuOpen = false)} href="#safety">{current.navSafety}</a>
      <a onclick={() => (menuOpen = false)} href="#faq">{current.navFaq}</a>
      <a onclick={() => (menuOpen = false)} href="#contact">{current.navContact}</a>
    </nav>
  {/if}

  <main>
    <section class="hero section-wrap">
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-dot"></span>{current.eyebrow}</div>
        <h1>{current.titleA}<br /><em>{current.titleB}</em></h1>
        <p class="hero-intro">{current.intro}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#services">{current.explore}<span aria-hidden="true">↗</span></a>
          <a class="button button-quiet" href="#partners">{current.partners}<span aria-hidden="true">→</span></a>
        </div>
        <div class="hero-footnote"><span class="pin-dot"></span>{current.availability}</div>
        <div class="hero-proof-row">
          <span><b>01</b> Mobility</span><i></i><span><b>02</b> Local commerce</span><i></i><span><b>03</b> Delivery</span>
        </div>
      </div>

      <div class="hero-visual" aria-label="Illustrative Ride app interface" role="img">
        <div class="visual-orbit orbit-one"></div><div class="visual-orbit orbit-two"></div>
        <div class="floating-note note-one"><span class="note-icon">↗</span><span><b>Everyday rides</b><small>Bike · CNG · Car</small></span></div>
        <div class="floating-note note-two"><span class="note-icon note-orange">▣</span><span><b>Local delivery</b><small>Food · Shops · Parcel</small></span></div>
        <div class="phone-frame">
          <div class="phone-top"><span class="phone-brand"><span class="mini-mark">R</span> Ride</span><span class="phone-avatar">You</span></div>
          <div class="phone-greeting">Where are we going?</div>
          <div class="location-search"><span>⌖</span><div><small>YOUR PICKUP</small><b>Choose a location</b></div><span class="search-arrow">↗</span></div>
          <div class="phone-label">GET AROUND</div>
          <div class="ride-options"><div><span class="ride-symbol">🏍</span><small>Bike</small></div><div><span class="ride-symbol">🛺</span><small>CNG</small></div><div><span class="ride-symbol">🚘</span><small>Car</small></div></div>
          <div class="phone-label label-spaced">MORE FROM RIDE</div>
          <div class="mini-services"><div><span class="mini-service-icon food-icon">✳</span><span>Food</span></div><div><span class="mini-service-icon shop-icon">▦</span><span>Shops</span></div><div><span class="mini-service-icon parcel-icon">▣</span><span>Parcel</span></div><div><span class="mini-service-icon truck-icon">▰</span><span>Rentals</span></div></div>
          <div class="phone-bottom"><span class="bottom-avatar">R</span><span><b>One app for everyday needs</b><small>Check what's available near you</small></span><span class="bottom-arrow">→</span></div>
        </div>
        <div class="visual-caption"><span class="caption-line"></span> A connected local experience</div>
      </div>
    </section>

    <section class="service-section section-wrap" id="services">
      <div class="section-heading">
        <div><div class="eyebrow"><span class="eyebrow-dot"></span>{current.servicesEyebrow}</div><h2>{current.servicesTitle}</h2></div>
        <p>{current.servicesIntro}</p>
      </div>
      <div class="service-grid">
        {#each serviceCards as service, index (service.className)}
          <article class="service-card" class:featured={index === 0}>
            <div class="service-card-top"><span class="service-icon {service.className}">{service.icon}</span><span class="card-index">0{index + 1}</span></div>
            <h3>{service.title[lang]}</h3>
            <p>{service.desc[lang]}</p>
            <div class="service-tags">{service.tags[lang]}</div>
          </article>
        {/each}
      </div>
    </section>

    <section class="how-section">
      <div class="section-wrap how-inner">
        <div class="how-heading"><div class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span>{current.howEyebrow}</div><h2>{current.howTitle}</h2></div>
        <div class="steps-grid">
          <div class="step"><span class="step-no">01</span><div class="step-line"></div><h3>{lang === 'en' ? 'Choose a service' : 'সেবা বেছে নিন'}</h3><p>{lang === 'en' ? 'Start with the task: travel, shop, send or arrange a service.' : 'যাতায়াত, কেনাকাটা, পার্সেল বা প্রয়োজনীয় সেবা বেছে নিন।'}</p></div>
          <div class="step"><span class="step-no">02</span><div class="step-line"></div><h3>{lang === 'en' ? 'Review the details' : 'বিস্তারিত দেখে নিন'}</h3><p>{lang === 'en' ? 'Check the available provider, price or quote, and service terms.' : 'উপলভ্য সেবাদাতা, মূল্য বা কোটেশন এবং শর্ত দেখে নিন।'}</p></div>
          <div class="step"><span class="step-no">03</span><div class="step-line"></div><h3>{lang === 'en' ? 'Confirm when ready' : 'প্রস্তুত হলে নিশ্চিত করুন'}</h3><p>{lang === 'en' ? 'Confirm only when the service, payment method and details suit you.' : 'সেবা, পেমেন্ট পদ্ধতি ও বিবরণ আপনার উপযোগী হলেই নিশ্চিত করুন।'}</p></div>
        </div>
      </div>
    </section>

    <section class="partner-section section-wrap" id="partners">
      <div class="partner-intro"><div class="eyebrow"><span class="eyebrow-dot"></span>{current.partnerEyebrow}</div><h2>{current.partnerTitle}</h2><p>{current.partnerText}</p><a class="text-link" href={supportHref}>{current.partnerCta}<span>↗</span></a></div>
      <div class="partner-cards">
        <article class="partner-card driver-card"><span class="partner-symbol">↗</span><span class="partner-label">PARTNER NETWORK / 01</span><h3>{current.driverTitle}</h3><p>{current.driverText}</p><div class="partner-bottom"><span>Ride partners</span><span>01 / 02</span></div></article>
        <article class="partner-card merchant-card"><span class="partner-symbol">▦</span><span class="partner-label">PARTNER NETWORK / 02</span><h3>{current.merchantTitle}</h3><p>{current.merchantText}</p><div class="partner-bottom"><span>Local businesses</span><span>02 / 02</span></div></article>
      </div>
    </section>

    <section class="safety-section" id="safety">
      <div class="section-wrap safety-inner">
        <div class="safety-copy"><div class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span>{current.safetyEyebrow}</div><h2>{current.safetyTitle}</h2><p>{current.safetyText}</p></div>
        <div class="safety-panel"><div class="safety-mark">!</div><div><span class="safety-kicker">IMPORTANT</span><h3>{current.emergencyTitle}</h3><p>{current.emergencyText}</p></div></div>
      </div>
    </section>

    <section class="faq-section section-wrap" id="faq">
      <div class="faq-heading"><div class="eyebrow"><span class="eyebrow-dot"></span>{current.faqEyebrow}</div><h2>{current.faqTitle}</h2></div>
      <div class="faq-list">
        {#each current.faqs as faq, index (faq.q)}
          <article class="faq-item" class:active={openFaq === index}>
            <button class="faq-question" onclick={() => (openFaq = openFaq === index ? null : index)} aria-expanded={openFaq === index}><span>{faq.q}</span><span class="faq-plus">{openFaq === index ? '−' : '+'}</span></button>
            {#if openFaq === index}<p class="faq-answer">{faq.a}</p>{/if}
          </article>
        {/each}
      </div>
    </section>

    <section class="contact-section section-wrap" id="contact">
      <div class="contact-card"><div class="contact-content"><div class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span>{current.contactEyebrow}</div><h2>{current.contactTitle}</h2><p>{current.contactText}</p><a class="button button-light" href={supportHref}>{current.contactCta}<span>↗</span></a></div><div class="contact-art" aria-hidden="true"><div class="contact-ring ring-a"></div><div class="contact-ring ring-b"></div><div class="contact-r">R</div><span class="art-spark spark-a">✳</span><span class="art-spark spark-b">+</span></div></div>
      <div class="launch-line"><span class="launch-dot"></span><span>{playStoreConfigured ? 'Ride is listed on Google Play.' : current.getApp}</span><a href={playStoreConfigured ? site.playStoreUrl : '#contact'}>{playStoreConfigured ? 'Open Google Play ↗' : 'Stay connected'}</a></div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-main section-wrap"><div class="footer-brand"><a class="brand brand-footer" href="/"><span class="brand-mark">R</span><span class="brand-name">Ride<span class="brand-period">.</span></span></a><p>{current.footerLine}</p></div><div class="footer-links"><div><span class="footer-label">EXPLORE</span><a href="#services">{current.navServices}</a><a href="#partners">{current.navPartners}</a><a href="#safety">{current.navSafety}</a></div><div><span class="footer-label">INFORMATION</span><a href="/privacy">Privacy policy</a><a href="/delete-account">Delete account</a><a href="/support">Support</a></div></div></div>
    <div class="footer-prelaunch section-wrap"><span>Pre-launch preview</span><span>{site.legalEntity} · {site.businessAddress}</span></div>
    <div class="footer-bottom section-wrap"><span>© {new Date().getFullYear()} {site.brand}. All rights reserved.</span><span>{current.footerNotice}</span><span>Bangladesh</span></div>
  </footer>
</div>
