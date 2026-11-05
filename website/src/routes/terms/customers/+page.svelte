<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('B');
</script>

<LegalDoc
  eyebrow="Customer terms"
  title="Customer & passenger terms"
  intro="Draft terms for customers and passengers booking rides and other services. Working draft — not approved, not binding."
  {html}
  docRoute="/terms/customers"
/>
