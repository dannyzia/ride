<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('I');
</script>

<LegalDoc
  eyebrow="Refunds policy"
  title="Cancellation, returns & refunds"
  intro="Draft cancellation, returns and refund principles for each service. Working draft — not approved, not binding."
  {html}
  docRoute="/policies/refunds"
/>
