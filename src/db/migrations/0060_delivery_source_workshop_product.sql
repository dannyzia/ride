-- Plan 27 §1 — delivery_source gains 'workshop_product' (workshop product
-- deliveries are physical legs). D5 rule: ALTER TYPE ... ADD VALUE ships as
-- its OWN migration file; the value is used only by 0061+.
-- Also documents the divergence: 'workshop_booking' (pre-R4 mission text) is
-- superseded by 'workshop_product' and is never emitted; 'parcel' stays per §6
-- (the universal feed carries parcels).
ALTER TYPE "delivery_source" ADD VALUE IF NOT EXISTS 'workshop_product';
