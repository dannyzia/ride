<script lang="ts">
  import { site, supportEmailConfigured, privacyEmailConfigured } from '#lib/site';
</script>

<svelte:head>
  <title>Ride Support — Contact</title>
  <meta name="description" content="Contact Ride for customer support, partner enquiries and privacy requests." />
</svelte:head>

<div class="legal-shell">
  <header class="legal-top"><a class="brand" href="/"><span class="brand-mark">R</span><span class="brand-name">Ride<span class="brand-period">.</span></span></a><a class="text-link" href="/">Back to website ↗</a></header>
  <main class="legal-main">
    <div class="eyebrow"><span class="eyebrow-dot"></span>RIDE SUPPORT</div>
    <h1>How can we help?</h1>
    <p class="legal-intro">Use the relevant channel for customer support, driver and fleet partnership enquiries, merchant onboarding or privacy matters.</p>
    <div class="legal-alert"><strong>Before launch:</strong> configure and test the public support mailbox. Google Play requires a support email address in the app's store contact details. The website is recommended, but it does not replace a monitored email inbox.</div>
    <section class="legal-block"><h2>App and booking support</h2>{#if supportEmailConfigured}<p>Email: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a></p><a class="legal-cta" href={`mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride app support')}`}>Email Ride Support ↗</a>{:else}<p>Set a working address in <code>src/lib/site.ts</code> (for example, a mailbox on your own Ride domain). Do not use an unmonitored or personal inbox for public support.</p>{/if}</section>
    <section class="legal-block"><h2>Driver, fleet and merchant partnerships</h2><p>For driver, fleet, store, restaurant, workshop or delivery-partner enquiries, use the support mailbox with a clear subject line. A dedicated partner mailbox can be added later if the operating team is ready to monitor it.</p></section>
    <section class="legal-block"><h2>Privacy and data requests</h2>{#if privacyEmailConfigured}<p>Email: <a href={`mailto:${site.privacyEmail}`}>{site.privacyEmail}</a></p>{:else}<p>Set a dedicated privacy contact or designate a monitored support inbox for privacy requests before publication.</p>{/if}<p>To request account deletion, use the <a href="/delete-account">account deletion page</a>.</p></section>
    <section class="legal-block"><h2>Emergency situations</h2><p>Do not use ordinary app support for a life-threatening emergency. Ride is not an emergency-response service. In Bangladesh, contact the national emergency service at 999.</p></section>
  </main>
  <p class="legal-prelaunch">Pre-launch preview — {site.legalEntity} · Powered by {site.poweredBy} · {site.businessAddress}</p>
  <footer class="legal-footer"><span>© {new Date().getFullYear()} Ride</span><span><a href="/privacy">Privacy policy</a> · <a href="/delete-account">Delete account</a></span></footer>
</div>
