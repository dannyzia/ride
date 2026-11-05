<script lang="ts">
  import { site, supportEmailConfigured } from '#lib/site';
  const mailto = supportEmailConfigured
    ? `mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride account and data deletion request')}&body=${encodeURIComponent('Hello Ride Support,\n\nI would like to request deletion of my Ride account and associated personal data.\n\nRegistered phone number (include country code):\nAccount role(s): Rider / Driver / Merchant / Delivery partner / Other\nCountry: Bangladesh\n\nPlease confirm receipt and explain any data that must be retained by law or for a documented security reason.\n\nI understand that Ride may need to verify my identity using a secure process. I will not send passwords or OTP codes by email.\n\nThank you.')}`
    : '';
</script>

<svelte:head>
  <title>Request Account Deletion — Ride</title>
  <meta name="description" content="How to request deletion of your Ride account and associated personal data." />
</svelte:head>

<div class="legal-shell">
  <header class="legal-top"><a class="brand" href="/"><span class="brand-mark">R</span><span class="brand-name">Ride<span class="brand-period">.</span></span></a><a class="text-link" href="/">Back to website ↗</a></header>
  <main class="legal-main">
    <div class="eyebrow"><span class="eyebrow-dot"></span>YOUR DATA, YOUR CHOICE</div>
    <h1>Request account deletion</h1>
    <p class="legal-intro">You can request deletion of your Ride account and associated personal data without reinstalling or opening the app. This page is intended for Ride customers, drivers, merchants and delivery partners.</p>
    {#if site.deletionWorkflowApproved && supportEmailConfigured}
      <div class="legal-alert">Your deletion request will be sent to Ride Support. We may contact you through a secure verification step before processing the request.</div>
      <a class="legal-cta" href={mailto}>Email an account-deletion request ↗</a>
    {:else}
      <div class="legal-alert"><strong>Pre-launch setup required.</strong> The deletion inbox and operational workflow have not yet been confirmed. Configure a monitored support email in <code>src/lib/site.ts</code>, test the process end to end, and set <code>deletionWorkflowApproved: true</code> only after it is working.</div>
      {#if supportEmailConfigured}<a class="legal-cta" href={mailto}>Prepare deletion request email ↗</a>{:else}<a class="legal-cta" href="/support">View support setup details ↗</a>{/if}
    {/if}
    <section class="legal-block"><h2>What to include</h2><ul><li>The phone number registered to your Ride account, including country code.</li><li>Your account role or roles: rider, driver, merchant, delivery partner or other.</li><li>A short statement that you are requesting account and associated data deletion.</li></ul><p>Do not send your password, OTP, full payment-card details or identity documents by ordinary email. Ride should use a secure verification process if additional verification is necessary.</p></section>
    <section class="legal-block"><h2>What happens next</h2><ol><li>Ride acknowledges the request through the contact channel.</li><li>Ride verifies that the requester controls the account using a documented, proportionate process.</li><li>Ride deletes the account and associated personal data, subject only to documented legal, accounting, safety or fraud-prevention retention requirements.</li><li>Ride confirms completion or explains any data retained, the reason and the applicable retention period.</li></ol></section>
    <section class="legal-block"><h2>Data that may need limited retention</h2><p>The final policy must identify exact categories and legal or legitimate reasons for any retained records, such as transaction, payment, safety or fraud-prevention records. Do not use this statement as a blanket reason to keep all account data. The retention period and access restrictions must be documented.</p></section>
    <section class="legal-block"><h2>Need help?</h2><p>{#if supportEmailConfigured}Contact <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.{:else}The support email has not been configured yet. Set the real monitored mailbox in <code>src/lib/site.ts</code> before launch.{/if}</p><p>See the <a href="/privacy">Ride privacy policy</a> for the data-handling and retention details.</p></section>
  </main>
  <p class="legal-prelaunch">Pre-launch preview — {site.legalEntity} · Powered by {site.poweredBy} · {site.businessAddress}</p>
  <footer class="legal-footer"><span>© {new Date().getFullYear()} Ride</span><span><a href="/privacy">Privacy policy</a> · <a href="/support">Support</a></span></footer>
</div>
