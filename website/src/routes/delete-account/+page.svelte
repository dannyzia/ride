<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { site, supportEmailConfigured } from '#lib/site';

  const mailto = supportEmailConfigured
    ? `mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride account and data deletion request')}&body=${encodeURIComponent('Hello Ride Support,\n\nI would like to request deletion of my Ride account and associated personal data.\n\nRegistered phone number (include country code):\nAccount role(s): Rider / Driver / Merchant / Delivery partner / Other\nCountry: Bangladesh\n\nPlease confirm receipt and explain any data that must be retained by law or for a documented security reason.\n\nI understand that Ride may need to verify my identity using a secure process. I will not send passwords or OTP codes by email.\n\nThank you.')}`
    : '';
</script>

<LegalDoc letter="L">
  {#snippet action()}
    {#if site.deletionWorkflowApproved && supportEmailConfigured}
      <div class="legal-alert">Your deletion request will be sent to Ride Support. We may contact you through a secure verification step before processing the request.</div>
      <a class="legal-cta" href={mailto}>Email an account-deletion request ↗</a>
    {:else}
      <div class="legal-alert">Deletion requests are handled by email. Send your request from your registered contact details so our team can verify your identity before processing it.</div>
      {#if supportEmailConfigured}<a class="legal-cta" href={mailto}>Prepare deletion request email ↗</a>{:else}<a class="legal-cta" href="/support">View support setup details ↗</a>{/if}
    {/if}
  {/snippet}
  {#snippet actionBn()}
    {#if site.deletionWorkflowApproved && supportEmailConfigured}
      <div class="legal-alert" lang="bn">আপনার মুছে ফেলার অনুরোধ Ride সাপোর্টে পাঠানো হবে। অনুরোধ প্রক্রিয়া করার আগে নিরাপদ যাচাই ধাপের মাধ্যমে আমরা আপনার সঙ্গে যোগাযোগ করতে পারি।</div>
      <a class="legal-cta" href={mailto}>অ্যাকাউন্ট মুছে ফেলার অনুরোধ ইমেইল করুন ↗</a>
    {:else}
      <div class="legal-alert" lang="bn">মুছে ফেলার অনুরোধ ইমেইলে পরিচালনা করা হয়। প্রক্রিয়া করার আগে আমাদের টিম যাতে আপনার পরিচয় যাচাই করতে পারে, সেজন্য নিবন্ধিত যোগাযোগ তথ্য থেকে অনুরোধ পাঠান।</div>
      {#if supportEmailConfigured}<a class="legal-cta" href={mailto}>মুছে ফেলার অনুরোধ ইমেইল প্রস্তুত করুন ↗</a>{:else}<a class="legal-cta" href="/support">সাপোর্ট তথ্য দেখুন ↗</a>{/if}
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
  {#snippet afterBn()}
    <section class="legal-block" lang="bn">
      <h2>সাহায্য প্রয়োজন?</h2>
      <p>
        {#if supportEmailConfigured}<a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>-এ যোগাযোগ করুন।{:else}সাপোর্ট
          ইমেইল এখনো সেট করা হয়নি। চালুর আগে <code>src/lib/site.ts</code>-এ প্রকৃত পর্যবেক্ষিত মেইলবক্স সেট করুন।{/if}
      </p>
      <p>তথ্য পরিচালনা ও সংরক্ষণ বিবরণের জন্য <a href="/privacy">Ride প্রাইভেসি বিজ্ঞপ্তি</a> দেখুন।</p>
    </section>
  {/snippet}
</LegalDoc>
