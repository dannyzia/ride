<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';
  import { site, supportEmailConfigured } from '#lib/site';

  const html = renderLegalDoc('L');
  const mailto = supportEmailConfigured
    ? `mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride account and data deletion request')}&body=${encodeURIComponent('Hello Ride Support,\n\nI would like to request deletion of my Ride account and associated personal data.\n\nRegistered phone number (include country code):\nAccount role(s): Rider / Driver / Merchant / Delivery partner / Other\nCountry: Bangladesh\n\nPlease confirm receipt and explain any data that must be retained by law or for a documented security reason.\n\nI understand that Ride may need to verify my identity using a secure process. I will not send passwords or OTP codes by email.\n\nThank you.')}`
    : '';
</script>

<LegalDoc
  eyebrow="Your data, your choice"
  title="Request account deletion"
  intro="Request deletion of your Ride account and associated personal data without reinstalling or opening the app. Working draft page with a working email channel."
  {html}
  docRoute="/delete-account"
>
  {#snippet action()}
    {#if site.deletionWorkflowApproved && supportEmailConfigured}
      <div class="legal-alert">Your deletion request will be sent to Ride Support. We may contact you through a secure verification step before processing the request.</div>
      <a class="legal-cta" href={mailto}>Email an account-deletion request ↗</a>
    {:else}
      <div class="legal-alert"><strong>Pre-launch setup required.</strong> The deletion inbox and operational workflow have not yet been confirmed. Configure a monitored support email in <code>src/lib/site.ts</code>, test the process end to end, and set <code>deletionWorkflowApproved: true</code> only after it is working.</div>
      {#if supportEmailConfigured}<a class="legal-cta" href={mailto}>Prepare deletion request email ↗</a>{:else}<a class="legal-cta" href="/support">View support setup details ↗</a>{/if}
    {/if}
  {/snippet}
  {#snippet after()}
    <section class="legal-block">
      <h2>Need help?</h2>
      <p>
        {#if supportEmailConfigured}Contact <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.{:else}The
          support email has not been configured yet. Set the real monitored mailbox in
          <code>src/lib/site.ts</code> before launch.{/if}
      </p>
      <p>See the <a href="/privacy">Ride privacy notice</a> for the data-handling and retention details.</p>
    </section>
  {/snippet}
</LegalDoc>
