<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('F');
</script>

<LegalDoc
  eyebrow="Parcel policy"
  title="Parcel, courier & store delivery"
  intro="Draft parcel, courier and store-delivery policy, including prohibited items, COD and delivery disputes. Working draft — not approved, not binding."
  {html}
  docRoute="/policies/parcel"
/>
