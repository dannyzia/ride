<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { site, supportEmailConfigured } from '#lib/site';

  // Action results are merged into `form`; a plain POST works without JS.
  let { form } = $props();
  const state = $derived((form ?? {}) as Record<string, any>);

  const apiConfigured = site.rideApiUrl.length > 0;
  const amountText = $derived(
    typeof state.amount_bdt === 'number' ? `৳${(state.amount_bdt / 100).toFixed(2)}` : ''
  );

  const mailto = supportEmailConfigured
    ? `mailto:${site.supportEmail}?subject=${encodeURIComponent('Ride account and data deletion request')}&body=${encodeURIComponent('Hello Ride Support,\n\nI would like to request deletion of my Ride account and associated personal data.\n\nRegistered phone number (include country code):\nAccount role(s): Rider / Driver / Merchant / Delivery partner / Other\nCountry: Bangladesh\n\nPlease confirm receipt and explain any data that must be retained by law or for a documented security reason.\n\nI understand that Ride may need to verify my identity using a secure process. I will not send passwords or OTP codes by email.\n\nThank you.')}`
    : '';
</script>

<LegalDoc letter="L">
  {#snippet action()}
    <section class="legal-block delete-panel">
      <h2>Delete your account from this page</h2>
      <p>
        Enter the mobile number registered to your Ride account. We will text a 6-digit code. You do
        not need to install or open the app.
      </p>

      {#if !apiConfigured}
        <div class="legal-alert">
          The web deletion form is not configured on this deployment. Use the in-app option
          (Profile → Settings → Delete account) or email us below.
        </div>
      {:else if state.step === 'done'}
        <div class="legal-alert delete-ok">
          Your account has been deactivated and your profile details have been removed. You can no
          longer sign in with the number you verified.
        </div>
      {:else if state.step === 'confirm'}
        <form method="POST" action="?/confirm" class="delete-form">
          <input type="hidden" name="sessionId" value={state.sessionId ?? ''} />
          <input type="hidden" name="phone" value={state.phone ?? ''} />
          <label for="otp-en">6-digit code sent to {state.phone}</label>
          <input
            id="otp-en"
            name="otp"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]{6}"
            required
          />
          <button class="legal-cta" type="submit">Verify and delete my account</button>
          <a class="delete-restart" href="/delete-account">Use a different number</a>
        </form>
      {:else}
        <form method="POST" action="?/send" class="delete-form">
          <label for="phone-en">Registered mobile number</label>
          <input
            id="phone-en"
            name="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+8801XXXXXXXXX"
            required
          />
          <button class="legal-cta" type="submit">Send verification code</button>
        </form>
      {/if}

      {#if state.error}
        <div class="legal-alert">
          {state.error}{#if amountText}&nbsp;— outstanding amount <strong>{amountText}</strong>{/if}
          {#if state.step === 'blocked'}
            <p>
              Sign in to the Ride app to settle or dispute the balance, or reply to our support
              email. Your account stays accessible in the meantime.
            </p>
          {/if}
        </div>
      {/if}
    </section>

    {#if supportEmailConfigured}
      <a class="legal-cta" href={mailto}>Email an account-deletion request ↗</a>
    {:else}
      <a class="legal-cta" href="/support">View support setup details ↗</a>
    {/if}
  {/snippet}

  {#snippet actionBn()}
    <section class="legal-block delete-panel" lang="bn">
      <h2>এই পেজ থেকে আপনার অ্যাকাউন্ট মুছে ফেলুন</h2>
      <p>
        আপনার রাইড অ্যাকাউন্টে নিবন্ধিত মোবাইল নম্বরটি লিখুন। আমরা ৬ সংখ্যার একটি কোড এসএমএস-এ
        পাঠাব। অ্যাপ ইনস্টল বা চালু করার প্রয়োজন নেই।
      </p>

      {#if !apiConfigured}
        <div class="legal-alert">
          এই ডিপ্লয়মেন্টে ওয়েব ফর্মটি চালু নেই। অ্যাপের বিকল্পটি (প্রোফাইল → সেটিংস → অ্যাকাউন্ট
          মুছুন) ব্যবহার করুন অথবা নিচের ইমেইলে অনুরোধ পাঠান।
        </div>
      {:else if state.step === 'done'}
        <div class="legal-alert delete-ok">
          আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে এবং প্রোফাইলের তথ্য মুছে ফেলা হয়েছে। যে নম্বরটি
          যাচাই করেছেন, তা দিয়ে আর সাইন ইন করতে পারবেন না।
        </div>
      {:else if state.step === 'confirm'}
        <form method="POST" action="?/confirm" class="delete-form">
          <input type="hidden" name="sessionId" value={state.sessionId ?? ''} />
          <input type="hidden" name="phone" value={state.phone ?? ''} />
          <label for="otp-bn">{state.phone} নম্বরে পাঠানো ৬ সংখ্যার কোড</label>
          <input
            id="otp-bn"
            name="otp"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]{6}"
            required
          />
          <button class="legal-cta" type="submit">যাচাই করে অ্যাকাউন্ট মুছে ফেলুন</button>
          <a class="delete-restart" href="/delete-account">অন্য নম্বর ব্যবহার করুন</a>
        </form>
      {:else}
        <form method="POST" action="?/send" class="delete-form">
          <label for="phone-bn">নিবন্ধিত মোবাইল নম্বর</label>
          <input
            id="phone-bn"
            name="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+8801XXXXXXXXX"
            required
          />
          <button class="legal-cta" type="submit">যাচাইকরণ কোড পাঠান</button>
        </form>
      {/if}

      {#if state.error}
        <div class="legal-alert">
          অনুরোধটি সম্পন্ন করা যায়নি।{#if amountText} বকেয়া পরিমাণ <strong>{amountText}</strong>.{/if}
          {#if state.step === 'blocked'}
            <p>
              বকেয়া পরিশোধ বা আপত্তি জানাতে রাইড অ্যাপে সাইন ইন করুন, অথবা আমাদের সাপোর্ট
              ইমেইলে উত্তর দিন। ততক্ষণ আপনার অ্যাকাউন্ট ব্যবহারযোগ্য থাকবে।
            </p>
          {/if}
        </div>
      {/if}
    </section>

    {#if supportEmailConfigured}
      <a class="legal-cta" href={mailto}>অ্যাকাউন্ট মুছে ফেলার অনুরোধ ইমেইল করুন ↗</a>
    {:else}
      <a class="legal-cta" href="/support">সাপোর্ট তথ্য দেখুন ↗</a>
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

<style>
  .delete-panel {
    border-top: 1px solid var(--line, #e3e8e5);
  }

  .delete-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
    margin: 16px 0 8px;
  }

  .delete-form label {
    font-size: 12px;
    font-weight: 700;
    color: #4b5a53;
  }

  .delete-form input {
    min-height: 48px;
    border: 1px solid var(--line, #e3e8e5);
    border-radius: 8px;
    padding: 0 14px;
    font-size: 15px;
    background: #fff;
    color: #1d2a24;
  }

  .delete-form .legal-cta {
    border: 0;
    cursor: pointer;
    justify-content: center;
  }

  .delete-restart {
    font-size: 12px;
    color: #64756e;
  }

  .delete-ok {
    background: #eaf6ef;
    border-color: #cbe6d6;
    color: #2c6b47;
  }
</style>
