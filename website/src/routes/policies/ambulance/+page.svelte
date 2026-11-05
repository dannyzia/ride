<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('H');
</script>

<LegalDoc
  eyebrow="Ambulance policy"
  title="Ambulance booking & emergency notice"
  intro="Draft ambulance booking policy and emergency notice. Ride is not an emergency-response service — in Bangladesh call 999. Working draft — not approved, not binding."
  {html}
  docRoute="/policies/ambulance"
/>
