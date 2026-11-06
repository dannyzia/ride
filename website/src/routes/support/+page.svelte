<script lang="ts">
  import { site, supportEmailConfigured, privacyEmailConfigured } from '#lib/site';
</script>

<svelte:head>
  <title>Ride Support — Contact · সাপোর্ট — যোগাযোগ</title>
  <meta name="description" content="Contact Ride for customer support, partner enquiries and privacy requests. গ্রাহক সাপোর্ট, পার্টনার অনুসন্ধান ও প্রাইভেসি অনুরোধের জন্য Ride-এর সঙ্গে যোগাযোগ করুন।" />
</svelte:head>

<div class="legal-shell">
  <header class="legal-top"><a class="brand" href="/"><img class="brand-mark-img" src="/logo.png" alt="" width="38" height="38" /><span class="brand-name">Ride<span class="brand-period">.</span></span></a><a class="text-link" href="/">Back to website · ওয়েবসাইটে ফিরুন ↗</a></header>
  <main class="legal-main legal-main-wide">
    <div class="eyebrow"><span class="eyebrow-dot"></span>RIDE SUPPORT · RIDE সাপোর্ট</div>
    <h1>How can we help?</h1>
    <p class="legal-title-bn">আমরা কীভাবে সহায়তা করতে পারি?</p>
    <p class="legal-intro">Use the relevant channel for customer support, driver and fleet partnership enquiries, merchant onboarding or privacy matters.</p>
    <p class="legal-intro legal-intro-bn">গ্রাহক সাপোর্ট, ড্রাইভার ও ফ্লিট পার্টনারশিপ অনুসন্ধান, মার্চেন্ট অনবোর্ডিং বা প্রাইভেসি বিষয়ের জন্য প্রাসঙ্গিক চ্যানেল ব্যবহার করুন।</p>
    <div class="legal-dual">
      <section class="legal-col" lang="en" aria-label="English">
        <p class="legal-col-tag">English</p>
        <section class="legal-block"><h2>App and booking support</h2>{#if supportEmailConfigured}<p>Email: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p><a class="legal-cta" href={`mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride app support')}`}>Email Ride Support ↗</a>{:else}<p>Set a working address in <code>src/lib/site.ts</code> (for example, a mailbox on your own Ride domain). Do not use an unmonitored or personal inbox for public support.</p>{/if}</section>
        <section class="legal-block"><h2>Driver, fleet and merchant partnerships</h2><p>For driver, fleet, store, restaurant, workshop or delivery-partner enquiries, email the support mailbox with a clear subject line and our team will get back to you.</p></section>
        <section class="legal-block"><h2>Privacy and data requests</h2>{#if privacyEmailConfigured}<p>Email: <a href={`mailto:${site.privacyEmail}`}>{site.privacyEmail}</a></p>{:else}<p>Set a dedicated privacy contact or designate a monitored support inbox for privacy requests before publication.</p>{/if}<p>To request account deletion, use the <a href="/delete-account">account deletion page</a>.</p></section>
        <section class="legal-block"><h2>Legal document drafts</h2><p>The full set of working legal drafts — terms, service policies, privacy notice, account deletion and cookies — is published for review starting at <a href="/terms">Terms of use</a>, in English and Bangla side by side. Every draft is a working draft and is not binding until placeholders are resolved and counsel approves the final version.</p></section>
        <section class="legal-block"><h2>Emergency situations</h2><p>Do not use ordinary app support for a life-threatening emergency. Ride is not an emergency-response service. In Bangladesh, contact the national emergency service at 999.</p></section>
      </section>
      <section class="legal-col" lang="bn" aria-label="Bangla">
        <p class="legal-col-tag">বাংলা</p>
        <section class="legal-block"><h2>অ্যাপ ও বুকিং সাপোর্ট</h2>{#if supportEmailConfigured}<p>ইমেইল: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p><a class="legal-cta" href={`mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride app support')}`}>Ride সাপোর্টে ইমেইল করুন ↗</a>{:else}<p><code>src/lib/site.ts</code>-এ একটি কার্যকর ঠিকানা সেট করুন (যেমন আপনার নিজের Ride ডোমেইনে একটি মেইলবক্স)। প্রকাশ্য সাপোর্টের জন্য অপর্যবেক্ষিত বা ব্যক্তিগত ইনবক্স ব্যবহার করবেন না।</p>{/if}</section>
        <section class="legal-block"><h2>ড্রাইভার, ফ্লিট ও মার্চেন্ট পার্টনারশিপ</h2><p>ড্রাইভার, ফ্লিট, দোকান, রেস্টুরেন্ট, ওয়ার্কশপ বা ডেলিভারি-পার্টনার অনুসন্ধানের জন্য স্পষ্ট সাবজেক্ট লাইনসহ সাপোর্ট মেইলবক্সে ইমেইল করুন — আমাদের টিম আপনার সঙ্গে যোগাযোগ করবে।</p></section>
        <section class="legal-block"><h2>প্রাইভেসি ও তথ্য অনুরোধ</h2>{#if privacyEmailConfigured}<p>ইমেইল: <a href={`mailto:${site.privacyEmail}`}>{site.privacyEmail}</a></p>{:else}<p>প্রকাশের আগে প্রাইভেসি অনুরোধের জন্য একটি নির্দিষ্ট প্রাইভেসি যোগাযোগ বা পর্যবেক্ষিত সাপোর্ট ইনবক্স নির্ধারণ করুন।</p>{/if}<p>অ্যাকাউন্ট মুছে ফেলার অনুরোধ করতে <a href="/delete-account">অ্যাকাউন্ট মুছে ফেলার পেজ</a> ব্যবহার করুন।</p></section>
        <section class="legal-block"><h2>আইনি নথির খসড়া</h2><p>কার্যকরী আইনি খসড়ার সম্পূর্ণ সেট — শর্তাবলি, সেবা নীতি, প্রাইভেসি বিজ্ঞপ্তি, অ্যাকাউন্ট মুছে ফেলা ও কুকি — <a href="/terms">ব্যবহারের শর্তাবলি</a> থেকে পর্যালোচনার জন্য প্রকাশিত, ইংরেজি ও বাংলা পাশাপাশি। প্রতিটি খসড়াই কার্যকরী খসড়া এবং স্থানধারক পূরণ ও আইনজীবীর চূড়ান্ত সংস্করণ অনুমোদন না হওয়া পর্যন্ত বাধ্যতামূলক নয়।</p></section>
        <section class="legal-block"><h2>জরুরি অবস্থা</h2><p>জীবনঝুঁকিপূর্ণ জরুরি অবস্থায় সাধারণ অ্যাপ সাপোর্ট ব্যবহার করবেন না। Ride জরুরি-সাড়া সেবা নয়। বাংলাদেশে জাতীয় জরুরি সেবা ৯৯৯-এ যোগাযোগ করুন।</p></section>
      </section>
    </div>
  </main>
  <p class="legal-prelaunch">Pre-launch preview — {site.legalEntity} · Powered by {site.poweredBy} · {site.businessAddress}<br /><span lang="bn">প্রি-লঞ্চ প্রিভিউ — {site.legalEntity} · {site.businessAddress}</span></p>
  <footer class="legal-footer"><span>© {new Date().getFullYear()} Ride</span><span><a href="/terms">Terms · শর্তাবলি</a> · <a href="/privacy">Privacy policy · প্রাইভেসি নীতি</a> · <a href="/delete-account">Delete account · অ্যাকাউন্ট মুছুন</a></span></footer>
</div>
