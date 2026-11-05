<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('D');
</script>

<LegalDoc
  eyebrow="Merchant terms"
  title="Merchant terms"
  intro="Draft terms for restaurants, shops and businesses selling through Ride. Working draft — not approved, not binding."
  {html}
  docRoute="/terms/merchants"
/>
