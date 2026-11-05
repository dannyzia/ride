<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('E');
</script>

<LegalDoc
  eyebrow="Orders policy"
  title="Food, grocery & shop orders"
  intro="Draft policy for food, grocery and general shop orders: acceptance, substitutions, preparation and returns. Working draft — not approved, not binding."
  {html}
  docRoute="/policies/orders"
/>
