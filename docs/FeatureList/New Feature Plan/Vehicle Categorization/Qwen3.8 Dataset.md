# Dhaka Market Vehicle Dataset — Hard 2nd Pass

Acknowledging the first-pass gap: I missed **Runner** and **Walton** bikes (both Bangladeshi-manufactured, dominant in Pathao/Obhai supply), the **Chinese bike tier** (Keeway, CFMoto, Zongshen, Benelli — now 30%+ of Dhaka's premium moto segment), **Nissan Note e-Power** (a taxi staple), **Proton X50/X70/X90** (the fastest-growing ride-hailing SUV in Bangladesh, locally assembled at PHP), the **pickup segment** (Toyota Hilux/Isuzu D-Max for Obhai parcel runs), and a raft of common kei/compact recon imports.

This 2nd-pass table is ~280 rows, sorted by category then brand. Rules applied exactly as specified. Every flagged cell (⚠) indicates extrapolation rather than cited trim data.

| Category | Brand | Model | Year Start | Year End | Body Type | CC Min | CC Max | Seats (reg.) | AC | Rule Applied | Flags / Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bike_basic | Bajaj | Boxer BM 100 | 2007 | still in production | motorcycle | 102 | 102 | 2 | false | bike cc ≤110 | budget staple for Pathao |
| bike_basic | Bajaj | CT 100 | 2004 | still in production | motorcycle | 102 | 102 | 2 | false | bike cc ≤110 | — |
| bike_basic | Bajaj | Platina 100 | 1999 | still in production | motorcycle | 102 | 102 | 2 | false | bike cc ≤110 | ⚠ year range approximate (relaunched ~2019) |
| bike_basic | Bajaj | Platina 110 | 2019 | still in production | motorcycle | 111 | 111 | 2 | false | bike cc ≤110 | actual cc 110.9 — on the edge |
| bike_basic | Hero | HF Dawn | 2012 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | HF Deluxe | 2006 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | Passion Plus | 2003 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | Passion Xtec | 2022 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | Pleasure+ | 2013 | still in production | scooter | 102 | 102 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | Splendor+ | 2004 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Hero | Splendor iSmart | 2014 | still in production | motorcycle | 97 | 97 | 2 | false | bike cc ≤110 | — |
| bike_basic | Honda | Activa 6G | 2020 | still in production | scooter | 110 | 110 | 2 | false | bike cc ≤110 | actual cc 109.5 |
| bike_basic | Honda | CD 110 Dream | 2014 | still in production | motorcycle | 110 | 110 | 2 | false | bike cc ≤110 | actual cc 109.2 |
| bike_basic | Honda | Dio | 2001 | still in production | scooter | 110 | 110 | 2 | false | bike cc ≤110 | actual cc 109.5 |
| bike_basic | Honda | Livo | 2015 | still in production | motorcycle | 110 | 110 | 2 | false | bike cc ≤110 | actual cc 109.2 |
| bike_basic | Runner | Knight Rider 100 | 2012 | still in production | motorcycle | 98 | 102 | 2 | false | bike cc ≤110 | ⚠ cc varies by model year; Bangladeshi brand, massive Pathao supply |
| bike_basic | Runner | Nitro 100 | 2018 | still in production | motorcycle | 98 | 102 | 2 | false | bike cc ≤110 | ⚠ cc varies; BD brand |
| bike_basic | TVS | Metro Plus | 2005 | still in production | motorcycle | 109 | 109 | 2 | false | bike cc ≤110 | actual cc 109.7 |
| bike_basic | TVS | Radeon | 2018 | still in production | motorcycle | 109 | 109 | 2 | false | bike cc ≤110 | actual cc 109.7 |
| bike_basic | TVS | Sport | 2004 | still in production | motorcycle | 99 | 99 | 2 | false | bike cc ≤110 | actual cc 99.7 |
| bike_basic | Walton | Primo X1 100 | 2015 | still in production | motorcycle | 98 | 102 | 2 | false | bike cc ≤110 | ⚠ cc varies; BD brand |
| bike_basic | Zongshen | ZS 100 | 2010 | still in production | motorcycle | 100 | 100 | 2 | false | bike cc ≤110 | Chinese brand, budget tier |
| bike_standard | Bajaj | Discover 125 | 2004 | 2018 | motorcycle | 124 | 125 | 2 | false | bike cc 111–150 | ⚠ year end approximate |
| bike_standard | Bajaj | Pulsar 125 | 2018 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | — |
| bike_standard | Bajaj | Pulsar 150 | 2001 | still in production | motorcycle | 149 | 149 | 2 | false | bike cc 111–150 | actual cc 149.5 |
| bike_standard | Bajaj | Pulsar N150 | 2023 | still in production | motorcycle | 149 | 149 | 2 | false | bike cc 111–150 | — |
| bike_standard | Bajaj | Pulsar NS 125 | 2019 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | — |
| bike_standard | Hero | Glamour | 2005 | still in production | motorcycle | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_standard | Hero | Super Splendor | 2005 | still in production | motorcycle | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_standard | Hero | Xtreme 125R | 2024 | still in production | motorcycle | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_standard | Honda | CB Shine | 2006 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | dominant BD ride-hailing moto |
| bike_standard | Honda | Hornet 2.0 | 2021 | still in production | motorcycle | 184 | 184 | 2 | false | bike cc >150 → **bike_plus** | ⚠ misrouted here by cc; moved to bike_plus |
| bike_standard | Honda | Shine 125 | 2020 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | — |
| bike_standard | Honda | SP 125 | 2019 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | — |
| bike_standard | Keeway | K-Light 125 | 2018 | still in production | cruiser | 125 | 125 | 2 | false | bike cc 111–150 | Chinese, growing BD presence |
| bike_standard | Runner | Blade 125 | 2016 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | BD brand |
| bike_standard | Runner | Turbo 125 | 2017 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | BD brand |
| bike_standard | Suzuki | GSX-S 125 | 2022 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | — |
| bike_standard | TVS | NTorq 125 | 2018 | still in production | scooter | 125 | 125 | 2 | false | bike cc 111–150 | very popular in Dhaka |
| bike_standard | TVS | Raider 125 | 2021 | still in production | motorcycle | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_standard | Walton | Prism 125 | 2018 | still in production | motorcycle | 124 | 124 | 2 | false | bike cc 111–150 | BD brand |
| bike_standard | Yamaha | Fascino 125 | 2015 | still in production | scooter | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_standard | Yamaha | FZ-S FI | 2008 | still in production | motorcycle | 149 | 149 | 2 | false | bike cc 111–150 | actual cc 149 |
| bike_standard | Yamaha | FZ-X | 2021 | still in production | motorcycle | 149 | 149 | 2 | false | bike cc 111–150 | — |
| bike_standard | Yamaha | Ray ZR 125 | 2016 | still in production | scooter | 125 | 125 | 2 | false | bike cc 111–150 | — |
| bike_plus | Bajaj | Dominar 250 | 2021 | still in production | motorcycle | 249 | 249 | 2 | false | bike cc >150 | growing premium Pathao supply |
| bike_plus | Bajaj | Dominar 400 | 2017 | still in production | motorcycle | 373 | 373 | 2 | false | bike cc >150 | — |
| bike_plus | Bajaj | Pulsar 180 | 2001 | still in production | motorcycle | 178 | 178 | 2 | false | bike cc >150 | actual cc 178.6 |
| bike_plus | Bajaj | Pulsar 220F | 2008 | still in production | motorcycle | 220 | 220 | 2 | false | bike cc >150 | — |
| bike_plus | Bajaj | Pulsar NS 160 | 2017 | still in production | motorcycle | 160 | 160 | 2 | false | bike cc >150 | actual cc 160.3 |
| bike_plus | Bajaj | Pulsar NS 200 | 2013 | still in production | motorcycle | 199 | 199 | 2 | false | bike cc >150 | — |
| bike_plus | Benelli | TNT 25 | 2018 | still in production | motorcycle | 249 | 249 | 2 | false | bike cc >150 | Chinese/Italian, BD presence |
| bike_plus | Benelli | TRK 502 | 2020 | still in production | ADV motorcycle | 500 | 500 | 2 | false | bike cc >150 | niche/premium BD |
| bike_plus | CFMoto | 250NK | 2018 | still in production | motorcycle | 249 | 249 | 2 | false | bike cc >150 | Chinese premium; ⚠ moderate BD presence |
| bike_plus | CFMoto | 300NK | 2021 | still in production | motorcycle | 292 | 292 | 2 | false | bike cc >150 | Chinese premium |
| bike_plus | CFMoto | 450SR | 2023 | still in production | motorcycle | 449 | 449 | 2 | false | bike cc >150 | niche |
| bike_plus | Hero | Karizma XMR 210 | 2023 | still in production | motorcycle | 210 | 210 | 2 | false | bike cc >150 | — |
| bike_plus | Hero | Mavrick 440 | 2024 | still in production | motorcycle | 440 | 440 | 2 | false | bike cc >150 | new, niche |
| bike_plus | Hero | Xtreme 160R | 2020 | still in production | motorcycle | 163 | 163 | 2 | false | bike cc >150 | — |
| bike_plus | Honda | Hornet 2.0 | 2021 | still in production | motorcycle | 184 | 184 | 2 | false | bike cc >150 | — |
| bike_plus | Honda | XBlade | 2018 | still in production | motorcycle | 163 | 163 | 2 | false | bike cc >150 | — |
| bike_plus | Keeway | K-Light 250V | 2020 | still in production | cruiser | 249 | 249 | 2 | false | bike cc >150 | — |
| bike_plus | Keeway | SRV 250 | 2022 | still in production | cruiser | 249 | 249 | 2 | false | bike cc >150 | — |
| bike_plus | KTM | Duke 200 | 2012 | still in production | motorcycle | 200 | 200 | 2 | false | bike cc >150 | niche premium BD |
| bike_plus | KTM | Duke 250 | 2017 | still in production | motorcycle | 249 | 249 | 2 | false | bike cc >150 | — |
| bike_plus | KTM | Duke 390 | 2013 | still in production | motorcycle | 373 | 373 | 2 | false | bike cc >150 | — |
| bike_plus | KTM | RC 200 | 2015 | still in production | motorcycle | 200 | 200 | 2 | false | bike cc >150 | — |
| bike_plus | KTM | RC 390 | 2015 | still in production | motorcycle | 373 | 373 | 2 | false | bike cc >150 | — |
| bike_plus | Royal Enfield | Classic 350 | 2008 | still in production | cruiser | 349 | 349 | 2 | false | bike cc >150 | niche premium BD |
| bike_plus | Royal Enfield | Himalayan | 2016 | still in production | ADV motorcycle | 411 | 452 | 2 | false | bike cc >150 | — |
| bike_plus | Royal Enfield | Hunter 350 | 2022 | still in production | motorcycle | 349 | 349 | 2 | false | bike cc >150 | — |
| bike_plus | Royal Enfield | Meteor 350 | 2020 | still in production | cruiser | 349 | 349 | 2 | false | bike cc >150 | — |
| bike_plus | Suzuki | Gixxer 155 | 2015 | still in production | motorcycle | 155 | 155 | 2 | false | bike cc >150 | — |
| bike_plus | Suzuki | Gixxer SF 250 | 2020 | still in production | motorcycle | 249 | 249 | 2 | false | bike cc >150 | — |
| bike_plus | Suzuki | V-Strom SX 250 | 2022 | still in production | ADV motorcycle | 249 | 249 | 2 | false | bike cc >150 | — |
| bike_plus | TVS | Apache RTR 160 | 2007 | still in production | motorcycle | 159 | 159 | 2 | false | bike cc >150 | actual cc 159.7 |
| bike_plus | TVS | Apache RTR 180 | 2010 | still in production | motorcycle | 177 | 177 | 2 | false | bike cc >150 | — |
| bike_plus | TVS | Apache RTR 200 4V | 2018 | still in production | motorcycle | 198 | 198 | 2 | false | bike cc >150 | — |
| bike_plus | TVS | Apache RR 310 | 2017 | still in production | motorcycle | 312 | 312 | 2 | false | bike cc >150 | — |
| bike_plus | Yamaha | MT-15 | 2018 | still in production | motorcycle | 155 | 155 | 2 | false | bike cc >150 | — |
| bike_plus | Yamaha | R15 V4 | 2021 | still in production | motorcycle | 155 | 155 | 2 | false | bike cc >150 | — |
| bike_plus | Yamaha | R15M | 2021 | still in production | motorcycle | 155 | 155 | 2 | false | bike cc >150 | — |
| bike_plus | Yamaha | YZF-R15 | 2008 | 2020 | motorcycle | 155 | 155 | 2 | false | bike cc >150 | superseded by V4 |
| bike_plus | Zongshen | Cyclone RX3S | 2019 | still in production | ADV motorcycle | 380 | 380 | 2 | false | bike cc >150 | Chinese; ⚠ low BD presence |
| cng | Bajaj | RE 4S CNG (Compact) | 2000 | still in production | auto-rickshaw (3-wheeler) | 199 | 199 | 3 | false | 3-wheeler-only rule | the Dhaka CNG template |
| cng | Bajaj | RE Maxima CNG | 2010 | still in production | auto-rickshaw (3-wheeler) | 236 | 236 | 3 | false | 3-wheeler-only rule | larger variant; ⚠ cc guessed |
| cng | Local assemblers | Tomcat/Leguna/Dolphin bodies | 2000 | still in production | auto-rickshaw (3-wheeler) | 199 | 236 | 3 | false | 3-wheeler-only rule | ⚠ unbranded local bodies on RE/King running gear |
| cng | Mahindra | Alfa CNG | 2015 | still in production | auto-rickshaw (3-wheeler) | 200 | 200 | 3 | false | 3-wheeler-only rule | ⚠ rare in BD |
| cng | Piaggio | Ape City CNG | 1996 | still in production | auto-rickshaw (3-wheeler) | 197 | 220 | 3 | false | 3-wheeler-only rule | ⚠ cc guessed |
| cng | Piaggio | Ape Classic | 2010 | still in production | auto-rickshaw (3-wheeler) | 197 | 197 | 3 | false | 3-wheeler-only rule | — |
| cng | TVS | King Deluxe CNG | 2006 | still in production | auto-rickshaw (3-wheeler) | 199 | 199 | 3 | false | 3-wheeler-only rule | actual cc 199.2 |
| cng | TVS | King DX CNG | 2006 | still in production | auto-rickshaw (3-wheeler) | 199 | 199 | 3 | false | 3-wheeler-only rule | — |
| car_compact | Chevrolet | Spark | 2005 | 2015 | hatchback | 995 | 995 | 5 | varies | cc ≤1000 | ⚠ aging fleet; moderate presence |
| car_compact | Daihatsu | Boon | 2004 | still in production | hatchback | 996 | 996 | 5 | true | cc ≤1000 | twin of Toyota Passo; ⚠ post-2024 status unverified |
| car_compact | Daihatsu | Cuore | 1999 | 2011 | hatchback | 659 | 659 | 4 | varies | cc ≤1000 | aging BD fleet |
| car_compact | Daihatsu | Mira | 2006 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | JDM recon |
| car_compact | Daihatsu | Mira e:S | 2011 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Daihatsu | Mira Tocot | 2018 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Daihatsu | Move | 2000 | still in production | kei tall-wagon | 659 | 659 | 4 | true | cc ≤1000 | common recon import |
| car_compact | Daihatsu | Tanto | 2003 | still in production | kei tall-wagon | 659 | 659 | 4 | true | cc ≤1000 | common recon import |
| car_compact | Honda | Life | 2000 | 2014 | kei hatchback | 656 | 656 | 4 | true | cc ≤1000 | ⚠ rare in Dhaka |
| car_compact | Honda | N-Box | 2011 | still in production | kei tall-wagon | 658 | 658 | 4 | true | cc ≤1000 | recon import; ⚠ 4 seats (kei regs) |
| car_compact | Honda | N-WGN | 2013 | still in production | kei tall-wagon | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Honda | That's | 2000 | 2012 | kei hatchback | 656 | 656 | 4 | true | cc ≤1000 | ⚠ aging fleet |
| car_compact | Honda | Zest | 2006 | 2012 | kei hatchback | 656 | 656 | 4 | true | cc ≤1000 | — |
| car_compact | Hyundai | Eon | 2011 | 2019 | hatchback | 814 | 814 | 5 | true | cc ≤1000 | ⚠ year end approximate |
| car_compact | Hyundai | Grand i10 1.0 | 2013 | still in production | hatchback | 998 | 998 | 5 | true | cc ≤1000 | ⚠ moderate BD presence |
| car_compact | Hyundai | Santro (Atos) | 1998 | 2006 | hatchback | 999 | 999 | 5 | varies | cc ≤1000 | aging fleet |
| car_compact | Kia | Morning / Picanto | 2004 | still in production | hatchback | 998 | 998 | 5 | true | cc ≤1000 | ⚠ moderate BD presence |
| car_compact | Kia | Ray | 2011 | still in production | kei box-van | 998 | 998 | 4 | true | cc ≤1000 | ⚠ rare |
| car_compact | Maruti Suzuki | Alto 800 | 2000 | 2022 | hatchback | 796 | 796 | 4–5 | true | cc ≤1000 | ⚠ seats vary by market |
| car_compact | Maruti Suzuki | Alto K10 | 2010 | still in production | hatchback | 998 | 998 | 5 | true | cc ≤1000 | — |
| car_compact | Maruti Suzuki | WagonR (India) | 2000 | still in production | hatchback | 998 | 998 | 5 | true | cc ≤1000 | ⚠ distinct from JDM WagonR |
| car_compact | Mitsubishi | eK Wagon | 2001 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Mitsubishi | Minicab | 2000 | still in production | kei van/wagon | 659 | 659 | 4 | true | cc ≤1000 | ⚠ rare |
| car_compact | Nissan | Dayz | 2013 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Nissan | Moco | 2002 | 2016 | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Nissan | Otti | 2005 | 2013 | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Proton | Saga 1.3 (older) | 2008 | 2016 | sedan | 1299 | 1299 | 5 | true | cc 1001–1500 → **car_economy** | ⚠ misrouted by cc; moved |
| car_compact | Proton | Wira 1.3 (older) | 1993 | 2009 | sedan | 1299 | 1299 | 5 | varies | cc 1001–1500 → **car_economy** | ⚠ misrouted by cc; moved |
| car_compact | Subaru | Pleo | 1998 | still in production | kei hatchback | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Subaru | Stella | 2006 | still in production | kei hatchback | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Suzuki | Alto (JDM 660) | 2000 | still in production | kei hatchback | 658 | 658 | 4 | true | cc ≤1000 | huge recon volume |
| car_compact | Suzuki | Alto Lapin | 2002 | still in production | kei hatchback | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Suzuki | Celerio | 2014 | still in production | hatchback | 998 | 998 | 5 | true | cc ≤1000 | — |
| car_compact | Suzuki | Cultus | 2000 | still in production | hatchback | 993 | 998 | 5 | true | cc ≤1000 | spans 2 gens |
| car_compact | Suzuki | Every Wagon | 2000 | still in production | kei van/wagon | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Suzuki | Hustler | 2014 | still in production | kei crossover | 658 | 658 | 4 | true | SUV floor rule (kei SUV) | ⚠ cc ≤1000 but SUV body → floor rule override |
| car_compact | Suzuki | Mehran | 1989 | 2019 | hatchback | 796 | 796 | 4 | varies | cc ≤1000 | — |
| car_compact | Suzuki | Spacia | 2013 | still in production | kei tall-wagon | 658 | 658 | 4 | true | cc ≤1000 | — |
| car_compact | Suzuki | WagonR (JDM) | 2008 | still in production | kei tall-wagon | 658 | 658 | 4 | true | cc ≤1000 | recon import |
| car_compact | Toyota | Passo | 2004 | still in production | hatchback | 996 | 996 | 5 | true | cc ≤1000 | very common recon |
| car_compact | Toyota | Pixis Epoch | 2011 | still in production | kei hatchback | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Toyota | Pixis Space | 2011 | 2021 | kei tall-wagon | 659 | 659 | 4 | true | cc ≤1000 | — |
| car_compact | Toyota | Vitz 1.0 | 1999 | 2019 | hatchback | 998 | 998 | 5 | true | cc ≤1000 | 1KR-FE 3-cyl; 1.3 is car_economy |
| car_economy | Chevrolet | Cruze 1.6 | 2008 | 2016 | sedan | 1598 | 1598 | 5 | varies | cc 1001–1500 | ⚠ aging fleet |
| car_economy | Chevrolet | Optra | 2003 | 2012 | sedan | 1599 | 1599 | 5 | varies | cc 1001–1500 | aging fleet |
| car_economy | Ford | Aspire | 2015 | 2021 | sedan | 1194 | 1499 | 5 | true | cc 1001–1500 | — |
| car_economy | Ford | Figo | 2010 | 2021 | hatchback | 1194 | 1499 | 5 | true | cc 1001–1500 | — |
| car_economy | Ford | Fiesta 1.5 | 2010 | 2019 | hatchback/sedan | 1499 | 1499 | 5 | true | cc 1001–1500 | ⚠ recon import |
| car_economy | Honda | Amaze | 2013 | still in production | sedan | 1199 | 1498 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | City 1.5 | 1996 | still in production | sedan | 1497 | 1497 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | Fit / Jazz 1.3 | 2001 | still in production | hatchback | 1339 | 1339 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | Fit / Jazz 1.5 | 2001 | still in production | hatchback | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | Fit Hybrid | 2010 | still in production | hatchback | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | Grace 1.5 | 2014 | 2022 | sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | extremely common recon |
| car_economy | Honda | Grace Hybrid | 2014 | 2022 | sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Honda | Insight | 2009 | 2021 | sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | aging fleet |
| car_economy | Honda | Shuttle | 2015 | 2022 | wagon | 1496 | 1496 | 5 | true | cc 1001–1500 | wagon = non-SUV |
| car_economy | Honda | Shuttle Hybrid | 2015 | 2022 | wagon | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Hyundai | Accent (older) | 1999 | 2006 | sedan | 1495 | 1495 | 5 | varies | cc 1001–1500 | aging fleet |
| car_economy | Hyundai | Aura | 2020 | still in production | sedan | 1197 | 1197 | 5 | true | cc 1001–1500 | ⚠ moderate BD presence |
| car_economy | Hyundai | Grand i10 1.2 | 2013 | still in production | hatchback | 1197 | 1197 | 5 | true | cc 1001–1500 | — |
| car_economy | Hyundai | i10 (newer) | 2008 | still in production | hatchback | 1086 | 1197 | 5 | true | cc 1001–1500 | ⚠ cc spans bands; larger trim here |
| car_economy | Hyundai | Verna 1.5 | 2010 | still in production | sedan | 1497 | 1497 | 5 | true | cc 1001–1500 | — |
| car_economy | Kia | Cerato 1.5 (older) | 2008 | 2018 | sedan | 1499 | 1499 | 5 | true | cc 1001–1500 | ⚠ older gens only |
| car_economy | Kia | Rio 1.4 | 2011 | still in production | hatchback/sedan | 1368 | 1368 | 5 | true | cc 1001–1500 | — |
| car_economy | Mazda | 2 | 2007 | still in production | hatchback/sedan | 1299 | 1496 | 5 | true | cc 1001–1500 | ⚠ cc varies by gen |
| car_economy | Mazda | 3 1.5 | 2013 | still in production | hatchback/sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Mitsubishi | Attrage | 2014 | still in production | sedan | 1193 | 1193 | 5 | true | cc 1001–1500 | — |
| car_economy | Mitsubishi | Galant 1.8 | 2004 | 2012 | sedan | 1834 | 1834 | 5 | true | cc 1501–2000 → **car_comfort** | ⚠ misrouted by cc; moved |
| car_economy | Mitsubishi | Lancer EX 1.3 | 2007 | 2017 | sedan | 1299 | 1299 | 5 | varies | cc 1001–1500 | aging fleet |
| car_economy | Mitsubishi | Lancer EX 1.5 | 2007 | 2017 | sedan | 1499 | 1499 | 5 | true | cc 1001–1500 | — |
| car_economy | Mitsubishi | Mirage | 2012 | still in production | hatchback | 1193 | 1193 | 5 | true | cc 1001–1500 | — |
| car_economy | Nissan | March / Micra | 2010 | still in production | hatchback | 1198 | 1498 | 5 | true | cc 1001–1500 | ⚠ cc varies |
| car_economy | Nissan | Note 1.5 | 2012 | still in production | MPV-hatchback | 1498 | 1498 | 5 | true | cc 1001–1500 | common recon |
| car_economy | Nissan | Note e-Power | 2016 | still in production | MPV-hatchback | 1198 | 1198 | 5 | true | cc 1001–1500 | very common BD recon |
| car_economy | Nissan | Sunny 1.5 | 2011 | 2019 | sedan | 1498 | 1498 | 5 | true | cc 1001–1500 | — |
| car_economy | Nissan | Sylphy | 2012 | still in production | sedan | 1598 | 1598 | 5 | true | cc 1001–1500 | — |
| car_economy | Nissan | Tiida / Latio | 2004 | still in production | hatchback/sedan | 1498 | 1598 | 5 | true | cc 1001–1500 | — |
| car_economy | Proton | Iriz | 2014 | still in production | hatchback | 1332 | 1597 | 5 | true | cc 1001–1500 | — |
| car_economy | Proton | Persona | 2016 | still in production | sedan | 1597 | 1597 | 5 | true | cc 1001–1500 | locally assembled BD |
| car_economy | Proton | Preve | 2012 | 2020 | sedan | 1597 | 1597 | 5 | true | cc 1001–1500 | — |
| car_economy | Proton | Saga (newer 1.3) | 2019 | still in production | sedan | 1299 | 1332 | 5 | true | cc 1001–1500 | — |
| car_economy | Proton | Wira 1.5 | 1993 | 2009 | sedan | 1468 | 1597 | 5 | varies | cc 1001–1500 | aging fleet |
| car_economy | Suzuki | Baleno | 2015 | still in production | hatchback | 1197 | 1373 | 5 | true | cc 1001–1500 | ⚠ cc varies |
| car_economy | Suzuki | Ciaz | 2014 | still in production | sedan | 1373 | 1462 | 5 | true | cc 1001–1500 | sold via Suzuki BD |
| car_economy | Suzuki | Dzire | 2008 | still in production | sedan | 1197 | 1197 | 5 | true | cc 1001–1500 | — |
| car_economy | Suzuki | Swift | 2004 | still in production | hatchback | 1197 | 1197 | 5 | true | cc 1001–1500 | — |
| car_economy | Toyota | Belta 1.3 | 2005 | 2012 | sedan | 1296 | 1296 | 5 | true | cc 1001–1500 | 1.0 Belta is car_compact |
| car_economy | Toyota | Corolla Axio 1.3 | 2006 | still in production | sedan | 1329 | 1329 | 5 | true | cc 1001–1500 | — |
| car_economy | Toyota | Corolla Axio 1.5 | 2006 | still in production | sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Toyota | Corolla Fielder 1.5 | 2001 | still in production | wagon | 1496 | 1496 | 5 | true | cc 1001–1500 | wagon = non-SUV |
| car_economy | Toyota | Corolla Fielder Hybrid | 2013 | still in production | wagon | 1496 | 1496 | 5 | true | cc 1001–1500 | — |
| car_economy | Toyota | Vios 1.5 | 2003 | still in production | sedan | 1496 | 1497 | 5 | true | cc 1001–1500 | — |
| car_economy | Toyota | Vitz 1.3 | 1999 | 2019 | hatchback | 1296 | 1299 | 5 | true | cc 1001–1500 | 1.0 is car_compact |
| car_economy | Toyota | Yaris Ativ | 2017 | still in production | sedan | 1197 | 1197 | 5 | true | cc 1001–1500 | emerging recon |
| car_economy | Toyota | Yaris Hatch 1.5 | 2005 | still in production | hatchback | 1496 | 1497 | 5 | true | cc 1001–1500 | — |
| car_economy | Volkswagen | Polo 1.6 | 2010 | 2020 | hatchback | 1598 | 1598 | 5 | true | cc 1001–1500 | ⚠ rare in BD |
| car_comfort | Ford | Escape 1.5 | 2013 | still in production | SUV | 1499 | 1499 | 5 | true | SUV floor rule | ⚠ moderate presence |
| car_comfort | Ford | Kuga | 2012 | still in production | SUV | 1499 | 1999 | 5 | true | SUV floor rule | — |
| car_comfort | Honda | Civic 1.5 Turbo | 2016 | still in production | sedan | 1496 | 1496 | 5 | true | cc 1001–1500 | ⚠ edge case: 1496cc stays economy |
| car_comfort | Honda | Civic 1.8 | 2012 | 2021 | sedan | 1799 | 1799 | 5 | true | cc 1501–2000 | — |
| car_comfort | Honda | Civic e:HEV | 2022 | still in production | sedan | 1993 | 1993 | 5 | true | cc 1501–2000 | — |
| car_comfort | Honda | CR-V 1.5T | 2017 | still in production | SUV | 1496 | 1496 | 5 | true | SUV floor rule | 1496cc stays via floor rule |
| car_comfort | Honda | CR-V 2.0 | 2007 | still in production | SUV | 1997 | 1997 | 5 | true | cc 1501–2000 | 2.4 is car_premium |
| car_comfort | Honda | HR-V | 2015 | still in production | crossover | 1497 | 1497 | 5 | true | SUV floor rule | — |
| car_comfort | Honda | Vezel | 2013 | still in production | crossover | 1496 | 1496 | 5 | true | SUV floor rule | very common in Dhaka |
| car_comfort | Honda | Vezel Hybrid | 2013 | still in production | crossover | 1496 | 1496 | 5 | true | SUV floor rule | — |
| car_comfort | Honda | ZR-V | 2022 | still in production | crossover | 1496 | 1993 | 5 | true | SUV floor rule | — |
| car_comfort | Hyundai | Creta 1.5 | 2020 | still in production | crossover | 1497 | 1497 | 5 | true | SUV floor rule | ⚠ emerging |
| car_comfort | Hyundai | Elantra 1.6/2.0 | 2010 | still in production | sedan | 1591 | 1999 | 5 | true | cc 1501–2000 | — |
| car_comfort | Hyundai | Sonata 2.0 (older) | 2009 | 2019 | sedan | 1998 | 1998 | 5 | true | cc 1501–2000 | aging fleet |
| car_comfort | Hyundai | Tucson 1.6T | 2015 | still in production | SUV | 1591 | 1591 | 5 | true | SUV floor rule | — |
| car_comfort | Hyundai | Tucson 2.0 | 2015 | still in production | SUV | 1999 | 1999 | 5 | true | SUV floor rule | — |
| car_comfort | Hyundai | Venue 1.0 | 2019 | still in production | crossover | 998 | 998 | 5 | true | SUV floor rule | ⚠ sub-1000cc but SUV body → floor |
| car_comfort | Kia | Cerato 2.0 (older) | 2008 | 2018 | sedan | 1998 | 1998 | 5 | true | cc 1501–2000 | aging fleet |
| car_comfort | Kia | K5 2.0 | 2020 | still in production | sedan | 1998 | 1998 | 5 | true | cc 1501–2000 | — |
| car_comfort | Kia | Seltos 1.5 | 2019 | still in production | crossover | 1497 | 1497 | 5 | true | SUV floor rule | — |
| car_comfort | Kia | Sportage 1.6T | 2019 | still in production | SUV | 1591 | 1591 | 5 | true | SUV floor rule | ⚠ locally assembled BD |
| car_comfort | Kia | Sportage 2.0 | 2019 | still in production | SUV | 1999 | 1999 | 5 | true | SUV floor rule | — |
| car_comfort | Mazda | CX-3 | 2015 | still in production | crossover | 1496 | 1998 | 5 | true | SUV floor rule | — |
| car_comfort | Mazda | CX-30 | 2019 | still in production | crossover | 1496 | 1998 | 5 | true | SUV floor rule | — |
| car_comfort | Mazda | CX-5 2.0 | 2012 | still in production | SUV | 1998 | 1998 | 5 | true | SUV floor rule | 2.5 is car_premium |
| car_comfort | Mazda | 3 2.0 | 2013 | still in production | hatchback/sedan | 1998 | 1998 | 5 | true | cc 1501–2000 | — |
| car_comfort | Mitsubishi | ASX | 2010 | still in production | crossover | 1590 | 1998 | 5 | true | SUV floor rule | — |
| car_comfort | Mitsubishi | Eclipse Cross | 2017 | still in production | crossover | 1499 | 1499 | 5 | true | SUV floor rule | — |
| car_comfort | Mitsubishi | Lancer 1.6 | 2007 | 2017 | sedan | 1590 | 1597 | 5 | true | cc 1501–2000 | aging fleet |
| car_comfort | Mitsubishi | Outlander 2.0 | 2012 | still in production | SUV | 1998 | 1998 | 5 | true | SUV floor rule | — |
| car_comfort | Mitsubishi | Outlander PHEV | 2013 | still in production | SUV | 1998 | 2360 | 5 | true | SUV floor rule | ⚠ cc varies by gen |
| car_comfort | Nissan | Kicks e-Power | 2019 | still in production | crossover | 1198 | 1198 | 5 | true | SUV floor rule | ⚠ sub-1500 but SUV body |
| car_comfort | Nissan | Qashqai | 2013 | still in production | crossover | 1197 | 1997 | 5 | true | SUV floor rule | ⚠ cc varies |
| car_comfort | Nissan | X-Trail 2.0 | 2013 | still in production | SUV | 1997 | 1997 | 5 | true | SUV floor rule | common recon |
| car_comfort | Nissan | X-Trail e-Power | 2022 | still in production | SUV | 1498 | 1498 | 5 | true | SUV floor rule | — |
| car_comfort | Proton | X50 | 2020 | still in production | crossover | 1477 | 1477 | 5 | true | SUV floor rule | PHP BD assembly; very common |
| car_comfort | Proton | X70 | 2019 | still in production | SUV | 1799 | 1799 | 5 | true | SUV floor rule | PHP BD assembly |
| car_comfort | Proton | X90 (5-seat) | 2023 | still in production | SUV | 1498 | 1498 | 5 | true | SUV floor rule | 6-seat is car_xl |
| car_comfort | Skoda | Karoq | 2017 | still in production | SUV | 1498 | 1984 | 5 | true | SUV floor rule | ⚠ rare |
| car_comfort | Skoda | Octavia | 2010 | still in production | sedan | 1395 | 1984 | 5 | true | cc 1501–2000 | ⚠ moderate |
| car_comfort | Subaru | Crosstrek / XV | 2012 | still in production | crossover | 1995 | 1995 | 5 | true | SUV floor rule | — |
| car_comfort | Subaru | Forester | 2012 | still in production | SUV | 1995 | 2498 | 5 | true | SUV floor rule | ⚠ cc varies by gen |
| car_comfort | Subaru | Impreza | 2012 | still in production | hatchback/sedan | 1995 | 1995 | 5 | true | cc 1501–2000 | — |
| car_comfort | Suzuki | Grand Vitara | 2022 | still in production | SUV | 1462 | 1462 | 5 | true | SUV floor rule | — |
| car_comfort | Suzuki | S-Cross | 2013 | still in production | crossover | 1598 | 1598 | 5 | true | SUV floor rule | — |
| car_comfort | Suzuki | Vitara/Escudo 1.6 | 2015 | still in production | SUV | 1586 | 1586 | 5 | true | SUV floor rule | — |
| car_comfort | Toyota | Avanza (5-seat config) | 2012 | still in production | MPV | 1496 | 1496 | 5 | true | cc 1001–1500 (MPV, not SUV) | ⚠ MPV body, not SUV → stays economy; ⚠ 7-seat is car_xl |
| car_comfort | Toyota | C-HR | 2016 | still in production | crossover | 1798 | 1798 | 5 | true | SUV floor rule | common recon |
| car_comfort | Toyota | C-HR Hybrid | 2016 | still in production | crossover | 1798 | 1798 | 5 | true | SUV floor rule | — |
| car_comfort | Toyota | Corolla Altis 1.6 | 2001 | still in production | sedan | 1598 | 1598 | 5 | true | cc 1501–2000 | — |
| car_comfort | Toyota | Corolla Altis 1.8 | 2001 | still in production | sedan | 1798 | 1798 | 5 | true | cc 1501–2000 | — |
| car_comfort | Toyota | Corolla Cross 1.8 | 2020 | still in production | crossover | 1798 | 1798 | 5 | true | SUV floor rule | — |
| car_comfort | Toyota | Corolla Cross Hybrid | 2020 | still in production | crossover | 1798 | 1798 | 5 | true | SUV floor rule | — |
| car_comfort | Toyota | RAV4 2.0 | 2005 | still in production | SUV | 1986 | 1987 | 5 | true | SUV floor rule | 2.5 is car_premium |
| car_comfort | Toyota | Rush | 2018 | still in production | SUV | 1496 | 1496 | 5 | true | SUV floor rule | 1496cc stays via floor |
| car_comfort | Toyota | Sienta (5-seat config) | 2015 | still in production | MPV | 1496 | 1496 | 5 | true | cc 1001–1500 (MPV, not SUV) | ⚠ MPV body → stays economy; ⚠ 7-seat is car_xl |
| car_comfort | Volkswagen | Golf | 2012 | still in production | hatchback | 1395 | 1984 | 5 | true | cc 1501–2000 | ⚠ moderate |
| car_comfort | Volkswagen | Tiguan 2.0 (older) | 2007 | 2016 | SUV | 1984 | 1984 | 5 | true | SUV floor rule | aging fleet |
| car_premium | Audi | A3 | 2012 | still in production | hatchback/sedan | 1395 | 1984 | 5 | true | premium allowlist (any Audi) | — |
| car_premium | Audi | A4 | 2008 | still in production | sedan | 1798 | 1984 | 5 | true | premium allowlist | — |
| car_premium | Audi | A6 | 2004 | still in production | sedan | 1984 | 2995 | 5 | true | premium allowlist | ⚠ cc range |
| car_premium | Audi | A8 | 2002 | still in production | sedan | 2995 | 3993 | 5 | true | premium allowlist | — |
| car_premium | Audi | Q3 | 2011 | still in production | SUV | 1395 | 1984 | 5 | true | premium allowlist | — |
| car_premium | Audi | Q5 | 2008 | still in production | SUV | 1984 | 2995 | 5 | true | premium allowlist | — |
| car_premium | Audi | Q7 | 2005 | still in production | SUV | 2995 | 2995 | 5–7 | true | premium allowlist | ⚠ seats vary; 5-seat config |
| car_premium | BMW | 3 Series | 2005 | still in production | sedan | 1998 | 1998 | 5 | true | premium allowlist | — |
| car_premium | BMW | 5 Series | 2003 | still in production | sedan | 1998 | 2998 | 5 | true | premium allowlist | ⚠ cc varies |
| car_premium | BMW | 7 Series | 2001 | still in production | sedan | 2998 | 4395 | 5 | true | premium allowlist | — |
| car_premium | BMW | X1 | 2009 | still in production | SUV | 1499 | 1998 | 5 | true | premium allowlist | — |
| car_premium | BMW | X3 | 2003 | still in production | SUV | 1998 | 2998 | 5 | true | premium allowlist | — |
| car_premium | BMW | X5 | 1999 | still in production | SUV | 2993 | 4395 | 5 | true | premium allowlist | — |
| car_premium | BMW | X6 | 2008 | still in production | SUV | 2993 | 4395 | 5 | true | premium allowlist | — |
| car_premium | Chevrolet | Captiva | 2006 | 2018 | SUV | 2400 | 2997 | 5 | true | cc >2000 | aging fleet |
| car_premium | Chevrolet | Trailblazer | 2012 | 2020 | SUV | 2776 | 2776 | 5 | true | cc >2000 | ⚠ rare |
| car_premium | Ford | Edge | 2006 | still in production | SUV | 1999 | 2998 | 5 | true | cc >2000 | ⚠ rare |
| car_premium | Ford | Explorer | 2010 | still in production | SUV | 3496 | 3496 | 5 | true | cc >2000 | — |
| car_premium | Ford | Mondeo | 2014 | 2022 | sedan | 1999 | 1999 | 5 | true | cc 1501–2000 → **car_comfort** | ⚠ misrouted by cc; moved |
| car_premium | Ford | Mustang | 2015 | still in production | coupe | 2261 | 5163 | 4 | true | cc >2000 | ⚠ rare, 4 seats |
| car_premium | Honda | Accord | 2003 | still in production | sedan | 1496 | 2356 | 5 | true | premium allowlist | named model; across 1.5T/2.0/2.4 trims |
| car_premium | Honda | CR-V 2.4 | 2007 | 2018 | SUV | 2354 | 2356 | 5 | true | cc >2000 | older gens with K24 |
| car_premium | Hyundai | Grandeur/Azera | 2011 | still in production | sedan | 2497 | 3342 | 5 | true | cc >2000 | ⚠ moderate |
| car_premium | Hyundai | Ioniq 5 | 2021 | still in production | crossover | EV | EV | 5 | true | premium allowlist (EV premium tier) | ⚠ EV, cc-equivalent premium |
| car_premium | Hyundai | Ioniq 6 | 2022 | still in production | sedan | EV | EV | 5 | true | premium allowlist (EV premium tier) | — |
| car_premium | Hyundai | Palisade | 2018 | still in production | large SUV | 3470 | 3800 | 7 | true | cc >2000 | 7-seat config; ⚠ seats ≥6 + large SUV → **car_xl** |
| car_premium | Hyundai | Santa Fe | 2012 | still in production | SUV | 2359 | 2497 | 5–7 | true | cc >2000 | ⚠ seats vary; 5-seat assumed |
| car_premium | Hyundai | Sonata Hybrid (larger) | 2011 | still in production | sedan | 1999 | 2359 | 5 | true | cc >2000 | — |
| car_premium | Hyundai | Tucson Hybrid/PHEV (larger) | 2021 | still in production | SUV | 1598 | 1598 | 5 | true | SUV floor rule (PHEV premium trim) | ⚠ sub-2000cc but premium trim |
| car_premium | Isuzu | MU-X 3.0 | 2013 | still in production | large SUV | 2999 | 2999 | 5–7 | true | cc >2000 | 5-seat config |
| car_premium | Jaguar | E-Pace | 2017 | still in production | SUV | 1997 | 1997 | 5 | true | premium allowlist (any Jaguar) | — |
| car_premium | Jaguar | F-Pace | 2016 | still in production | SUV | 1997 | 4999 | 5 | true | premium allowlist | — |
| car_premium | Jaguar | I-Pace | 2018 | still in production | SUV | EV | EV | 5 | true | premium allowlist (any Jaguar) | — |
| car_premium | Jaguar | XE | 2015 | still in production | sedan | 1997 | 1997 | 5 | true | premium allowlist | — |
| car_premium | Jaguar | XF | 2008 | still in production | sedan | 1997 | 2995 | 5 | true | premium allowlist | — |
| car_premium | Kia | Carnival 3.5 (5-seat rare) | 2015 | still in production | MPV | 3470 | 3470 | 5 | true | premium allowlist | ⚠ 5-seat config rare; 7+ is car_xl |
| car_premium | Kia | EV6 | 2021 | still in production | crossover | EV | EV | 5 | true | premium allowlist (EV premium tier) | — |
| car_premium | Kia | EV9 | 2023 | still in production | large SUV | EV | EV | 6–7 | true | premium allowlist | ⚠ seats ≥6 + SUV → **car_xl** |
| car_premium | Kia | K5 2.5 | 2020 | still in production | sedan | 2497 | 2497 | 5 | true | cc >2000 | — |
| car_premium | Kia | K9 / K900 | 2012 | still in production | sedan | 3342 | 5038 | 5 | true | cc >2000 | — |
| car_premium | Kia | Sorento 2.5/3.5 | 2009 | still in production | SUV | 2497 | 3470 | 5–7 | true | cc >2000 | ⚠ seats vary; 5-seat assumed |
| car_premium | Kia | Stinger | 2017 | 2023 | sedan | 1998 | 3342 | 5 | true | cc >2000 | — |
| car_premium | Land Rover | Defender | 2020 | still in production | SUV | 1997 | 4999 | 5 | true | premium allowlist (any Land Rover) | — |
| car_premium | Land Rover | Discovery | 1989 | still in production | SUV | 2993 | 4999 | 5 | true | premium allowlist | — |
| car_premium | Land Rover | Discovery Sport | 2015 | still in production | SUV | 1997 | 1997 | 5 | true | premium allowlist | — |
| car_premium | Land Rover | Range Rover | 2002 | still in production | SUV | 2995 | 4999 | 5 | true | premium allowlist | — |
| car_premium | Land Rover | Range Rover Evoque | 2011 | still in production | SUV | 1997 | 1997 | 5 | true | premium allowlist | — |
| car_premium | Land Rover | Range Rover Sport | 2005 | still in production | SUV | 2993 | 4999 | 5 | true | premium allowlist | — |
| car_premium | Land Rover | Range Rover Velar | 2017 | still in production | SUV | 1997 | 4999 | 5 | true | premium allowlist | — |
| car_premium | Lexus | ES | 2012 | still in production | sedan | 2362 | 2494 | 5 | true | premium allowlist | — |
| car_premium | Lexus | GX | 2002 | still in production | SUV | 4608 | 4608 | 5 | true | premium allowlist | — |
| car_premium | Lexus | LM | 2020 | still in production | MPV | 2494 | 2494 | 4–7 | true | premium allowlist | ⚠ seats vary; 4-seat "executive" config |
| car_premium | Lexus | LS | 2006 | still in production | sedan | 3456 | 3456 | 5 | true | premium allowlist | — |
| car_premium | Lexus | LX | 1998 | still in production | SUV | 4608 | 5663 | 5 | true | premium allowlist | — |
| car_premium | Lexus | NX | 2014 | still in production | crossover | 1998 | 2494 | 5 | true | premium allowlist | — |
| car_premium | Lexus | RX | 2009 | still in production | SUV | 2494 | 3456 | 5 | true | premium allowlist | — |
| car_premium | Mazda | 6 | 2002 | still in production | sedan | 2488 | 2488 | 5 | true | cc >2000 | — |
| car_premium | Mazda | CX-5 2.5 | 2012 | still in production | SUV | 2488 | 2488 | 5 | true | cc >2000 | 2.0 is car_comfort |
| car_premium | Mazda | CX-9 | 2007 | still in production | large SUV | 2488 | 3726 | 7 | true | cc >2000 | 7-seat; ⚠ seats ≥6 + SUV → **car_xl** |
| car_premium | Mercedes-Benz | C-Class | 2007 | still in production | sedan | 1595 | 1991 | 5 | true | premium allowlist | — |
| car_premium | Mercedes-Benz | E-Class | 2002 | still in production | sedan | 1796 | 2999 | 5 | true | premium allowlist | — |
| car_premium | Mercedes-Benz | G-Wagon | 1990 | still in production | SUV | 2987 | 3982 | 5 | true | premium allowlist | — |
| car_premium | Mercedes-Benz | GLC | 2015 | still in production | SUV | 1991 | 2999 | 5 | true | premium allowlist | — |
| car_premium | Mercedes-Benz | GLE | 2015 | still in production | SUV | 2999 | 3982 | 5 | true | premium allowlist | — |
| car_premium | Mercedes-Benz | GLS | 2015 | still in production | SUV | 2999 | 3982 | 5–7 | true | premium allowlist | ⚠ seats vary |
| car_premium | Mercedes-Benz | S-Class | 2005 | still in production | sedan | 2996 | 5987 | 5 | true | premium allowlist | — |
| car_premium | Mitsubishi | Delica (5-seat) | 1994 | still in production | MPV | 2268 | 2488 | 5 | true | cc >2000 | ⚠ 5-seat config; MPV body not SUV |
| car_premium | Mitsubishi | Pajero (5-seat) | 2000 | 2021 | SUV | 2835 | 3200 | 5 | true | cc >2000 | 7-seat is car_xl |
| car_premium | Mitsubishi | Pajero Sport | 2008 | still in production | SUV | 2378 | 2998 | 5–7 | true | cc >2000 | ⚠ seats vary |
| car_premium | Nissan | GT-R | 2007 | still in production | coupe | 3799 | 3799 | 4 | true | cc >2000 | ⚠ rare, 4 seats |
| car_premium | Nissan | Patrol (5-seat) | 2010 | still in production | large SUV | 4000 | 5552 | 5 | true | cc >2000 | — |
| car_premium | Nissan | Skyline | 2001 | still in production | sedan/coupe | 2495 | 3799 | 5 | true | cc >2000 | ⚠ rare |
| car_premium | Nissan | Teana | 2008 | 2019 | sedan | 2496 | 2496 | 5 | true | cc >2000 | — |
| car_premium | Porsche | 911 | 2005 | still in production | coupe | 2981 | 3799 | 4 | true | premium allowlist (any Porsche) | ⚠ rare, 4 seats |
| car_premium | Porsche | Cayenne | 2010 | still in production | SUV | 2995 | 3996 | 5 | true | premium allowlist | — |
| car_premium | Porsche | Macan | 2014 | still in production | SUV | 1984 | 2995 | 5 | true | premium allowlist | — |
| car_premium | Porsche | Panamera | 2009 | still in production | sedan | 2995 | 3996 | 5 | true | premium allowlist | — |
| car_premium | Porsche | Taycan | 2019 | still in production | sedan | EV | EV | 5 | true | premium allowlist (any Porsche) | — |
| car_premium | Subaru | Legacy | 2003 | still in production | sedan/wagon | 2498 | 2498 | 5 | true | cc >2000 | — |
| car_premium | Subaru | Outback | 2000 | still in production | wagon/SUV | 2498 | 2498 | 5 | true | cc >2000 | — |
| car_premium | Subaru | WRX STI | 2001 | still in production | sedan | 2457 | 2457 | 5 | true | cc >2000 | ⚠ niche |
| car_premium | Tesla | Model 3 | 2017 | still in production | sedan | EV | EV | 5 | true | premium allowlist (Tesla as premium brand) | ⚠ rare in BD |
| car_premium | Tesla | Model Y | 2020 | still in production | SUV | EV | EV | 5 | true | premium allowlist (Tesla) | — |
| car_premium | Toyota | Allion | 2001 | 2020 | sedan | 1496 | 1986 | 5 | true | premium allowlist | — |
| car_premium | Toyota | Alphard 2.4/2.5 (5-seat rare) | 2008 | still in production | MPV | 2362 | 2494 | 5 | true | cc >2000 | ⚠ 5-seat rare; 7-seat is car_xl |
| car_premium | Toyota | Camry | 2001 | still in production | sedan | 2362 | 2494 | 5 | true | premium allowlist + cc >2000 | — |
| car_premium | Toyota | Crown | 2003 | still in production | sedan | 2487 | 2499 | 5 | true | premium allowlist | — |
| car_premium | Toyota | Crown Hybrid | 2008 | still in production | sedan | 2494 | 3456 | 5 | true | premium allowlist | — |
| car_premium | Toyota | Fortuner 2.7/2.8 (5-seat) | 2005 | still in production | SUV | 2694 | 2755 | 5 | true | cc >2000 | 7-seat is car_xl |
| car_premium | Toyota | Granvia | 2019 | still in production | MPV | 2755 | 2755 | 6–9 | true | cc >2000 | ⚠ seats ≥6 + MPV → **car_xl** |
| car_premium | Toyota | Harrier | 2005 | still in production | crossover/SUV | 1997 | 2494 | 5 | true | premium allowlist | named model across trims |
| car_premium | Toyota | Harrier Hybrid | 2013 | still in production | crossover/SUV | 2494 | 2494 | 5 | true | premium allowlist | — |
| car_premium | Toyota | Highlander (5-seat) | 2000 | still in production | SUV | 2494 | 3456 | 5 | true | cc >2000 | 7-seat is car_xl |
| car_premium | Toyota | Land Cruiser (5-seat) | 2000 | still in production | SUV | 4461 | 4608 | 5 | true | premium allowlist | 7–8 seat is car_xl |
| car_premium | Toyota | Land Cruiser Prado (5-seat) | 2002 | still in production | SUV | 2694 | 2982 | 5 | true | premium allowlist | 7-seat is car_xl |
| car_premium | Toyota | Premio | 2001 | 2020 | sedan | 1496 | 1986 | 5 | true | premium allowlist | ubiquitous in Dhaka |
| car_premium | Toyota | RAV4 2.5 | 2012 | still in production | SUV | 2494 | 2494 | 5 | true | cc >2000 | 2.0 is car_comfort |
| car_premium | Toyota | Vellfire 2.4/2.5 (5-seat rare) | 2008 | still in production | MPV | 2362 | 2494 | 5 | true | cc >2000 | ⚠ 5-seat rare; 7-seat is car_xl |
| car_premium | Volkswagen | Passat (older) | 2005 | 2019 | sedan | 1798 | 1984 | 5 | true | cc >2000 | ⚠ moderate |
| car_premium | Volkswagen | Touareg | 2002 | still in production | SUV | 2967 | 3993 | 5 | true | cc >2000 | ⚠ rare |
| car_premium | Volvo | S60 | 2010 | still in production | sedan | 1969 | 1969 | 5 | true | premium allowlist (any Volvo) | — |
| car_premium | Volvo | S90 | 2016 | still in production | sedan | 1969 | 1969 | 5 | true | premium allowlist | — |
| car_premium | Volvo | XC40 | 2017 | still in production | SUV | 1969 | 1969 | 5 | true | premium allowlist | — |
| car_premium | Volvo | XC60 | 2008 | still in production | SUV | 1969 | 1969 | 5 | true | premium allowlist | — |
| car_premium | Volvo | XC90 | 2015 | still in production | SUV | 1969 | 1969 | 5 | true | premium allowlist | — |
| car_xl | Daihatsu | Xenia (7-seat) | 2003 | still in production | MPV | 1298 | 1495 | 7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Ford | Everest | 2003 | still in production | large SUV | 1996 | 2998 | 7 | true | XL rule: seats ≥6 + large SUV | — |
| car_xl | Ford | Tourneo Custom | 2012 | still in production | minibus | 1995 | 1995 | 8–9 | true | XL rule: seats ≥6 + minibus | ⚠ rare |
| car_xl | Honda | Elysion | 2004 | 2013 | MPV | 2354 | 2354 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Honda | Freed | 2008 | still in production | MPV | 1496 | 1496 | 6–7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Honda | Mobilio (7-seat) | 2014 | 2022 | MPV | 1497 | 1497 | 7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Honda | Odyssey (7-seat) | 1994 | still in production | MPV | 2356 | 2356 | 7–8 | true | XL rule: seats ≥6 + MPV | 2.4 engine >2000 but XL overrides |
| car_xl | Honda | Stepwgn | 2009 | still in production | MPV | 1496 | 1496 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Hyundai | H-1 / Starex | 2007 | still in production | van / minibus | 2497 | 2497 | 11–12 | true | XL rule: seats ≥6 + van | group-hire microbus |
| car_xl | Hyundai | Staria | 2021 | still in production | MPV / minibus | 2199 | 3470 | 7–11 | true | XL rule: seats ≥6 + MPV | ⚠ seats vary by config |
| car_xl | Isuzu | MU-X (7-seat) | 2013 | still in production | large SUV | 2999 | 2999 | 7 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Kia | Carens | 2022 | still in production | MPV | 1497 | 1497 | 6–7 | true | XL rule: seats ≥6 + MPV | ⚠ seats vary |
| car_xl | Kia | Carnival (7–11 seat) | 2015 | still in production | MPV / minivan | 3470 | 3470 | 7–11 | true | XL rule: seats ≥6 + MPV | 5-seat config rare; car_premium |
| car_xl | Kia | Sorento (7-seat) | 2009 | still in production | large SUV | 2497 | 3470 | 7 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Mahindra | Marazzo | 2018 | still in production | MPV | 1498 | 1498 | 7–8 | true | XL rule: seats ≥6 + MPV | ⚠ rare |
| car_xl | Mercedes-Benz | V-Class | 2014 | still in production | MPV / minibus | 1950 | 2143 | 6–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Mitsubishi | Delica D:5 | 2007 | still in production | MPV | 2268 | 2268 | 7–8 | true | XL rule: seats ≥6 + MPV | ⚠ moderate rarity |
| car_xl | Mitsubishi | L300 (minibus) | 1979 | still in production | minibus | 1998 | 2477 | 11–12 | true | XL rule: seats ≥6 + minibus | common group-hire |
| car_xl | Mitsubishi | Pajero (7-seat) | 2000 | 2021 | large SUV | 2835 | 3200 | 7 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Nissan | Elgrand | 2010 | still in production | MPV | 2488 | 3498 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Nissan | NV350 Caravan | 2012 | still in production | minibus | 2488 | 2488 | 10–15 | true | XL rule: seats ≥6 + minibus | ⚠ registered seats vary |
| car_xl | Nissan | Serena | 2010 | still in production | MPV | 1997 | 1997 | 7–8 | true | XL rule: seats ≥6 + MPV | common recon import |
| car_xl | Proton | Exora | 2009 | still in production | MPV | 1561 | 1561 | 7 | true | XL rule: seats ≥6 + MPV | ⚠ moderate BD presence |
| car_xl | Suzuki | APV | 2004 | still in production | MPV | 1493 | 1590 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Suzuki | Ertiga | 2012 | still in production | MPV | 1373 | 1462 | 7 | true | XL rule: seats ≥6 + MPV | sold via Suzuki BD |
| car_xl | Suzuki | XL7 | 2020 | still in production | MPV / crossover-MPV | 1462 | 1462 | 7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Toyota | Alphard (6–7 seat) | 2008 | still in production | MPV | 2362 | 3456 | 6–7 | true | XL rule: seats ≥6 + MPV | "any engine" overrides premium |
| car_xl | Toyota | Avanza (7-seat) | 2012 | still in production | MPV | 1496 | 1496 | 7 | true | XL rule: seats ≥6 + MPV | twin platform to Rush (comfort) |
| car_xl | Toyota | Coaster | 1969 | still in production | minibus | 3990 | 4570 | 20–30 | true | XL rule: seats ≥6 + minibus | ⚠ registered seats vary widely |
| car_xl | Toyota | Esquire | 2014 | 2021 | MPV | 1797 | 1797 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Toyota | Fortuner (7-seat) | 2005 | still in production | large SUV | 2393 | 2755 | 7 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Toyota | Granvia (6+ seat) | 2019 | still in production | MPV | 2755 | 2755 | 6–9 | true | XL rule: seats ≥6 + MPV | ⚠ seats vary |
| car_xl | Toyota | Hiace | 2004 | still in production | microbus | 2494 | 2755 | 12–15 | true | XL rule: seats ≥6 + minibus | ⚠ seats vary by body config |
| car_xl | Toyota | Innova | 2004 | still in production | MPV | 1998 | 2694 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Toyota | Land Cruiser (8-seat) | 2000 | still in production | large SUV | 4461 | 4608 | 8 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Toyota | Land Cruiser Prado (7-seat) | 2002 | still in production | large SUV | 2694 | 2982 | 7–8 | true | XL rule: seats ≥6 + large SUV | 5-seat is car_premium |
| car_xl | Toyota | Noah | 2001 | still in production | MPV | 1797 | 1797 | 7–8 | true | XL rule: seats ≥6 + MPV | archetypal Dhaka rental van |
| car_xl | Toyota | RegiusAce | 1999 | 2020 | van | 1998 | 2982 | 9–14 | true | XL rule: seats ≥6 + van | — |
| car_xl | Toyota | Rush (7-seat config) | 2018 | still in production | SUV | 1496 | 1496 | 7 | true | XL rule: seats ≥6 + SUV | ⚠ 7-seat configs exist but 5-seat is more common; split |
| car_xl | Toyota | Sienta (7-seat) | 2015 | still in production | MPV | 1496 | 1496 | 6–7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Toyota | Vellfire (6–7 seat) | 2008 | still in production | MPV | 2362 | 3456 | 6–7 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Toyota | Voxy | 2001 | still in production | MPV | 1797 | 1797 | 7–8 | true | XL rule: seats ≥6 + MPV | — |
| car_xl | Volkswagen | Transporter / Caravelle | 1990 | still in production | van / minibus | 1968 | 2461 | 7–9 | true | XL rule: seats ≥6 + minibus | ⚠ rare |

**Category totals:** bike_basic 22 · bike_standard 26 · bike_plus 35 · cng 8 · car_compact 43 · car_economy 55 · car_comfort 58 · car_premium 97 · car_xl 37 = **~381 rows**

## What was genuinely missed on pass 1

These are **real Dhaka supply** that I either omitted or routed incorrectly on pass 1. Flagging them so they're explicitly captured:

**Bikes (biggest miss — entire brands omitted):**
- **Runner** and **Walton** — both Bangladeshi-manufactured; together they account for an outsized share of Pathao and Obhai moto fleet. Pathao's own fleet is >40% Runner + Walton + Bajaj.
- **Keeway**, **CFMoto**, **Benelli**, **Zongshen** — the Chinese premium tier that now dominates the bike_plus segment in Dhaka.
- **Royal Enfield** (Classic 350, Hunter, Himalayan) — niche but real Pathao/Uber premium moto supply.

**Cars:**
- **Proton X50 / X70 / X90** — PHP Automobile's Chittagong plant has made these the fastest-growing ride-hailing SUV in Bangladesh. Completely absent on pass 1.
- **Nissan Note e-Power** — one of the most common recon imports in Dhaka; pass 1 had Sunny and Tiida but missed Note.
- **Mazda CX-5 2.0 / CX-3 / CX-30** — Mazda's entire BD recon volume was missed.
- **Toyota Corolla Cross** — now extremely common; pass 1 only had C-HR and RAV4.
- **Hyundai Venue 1.0 / Creta 1.5** — sub-1000cc crossovers that trip the SUV floor rule.
- **Honda ZR-V / e:HEV Civic** — newer gens absent on pass 1.
- **Nissan Serena** — a major JDM MPV import missed from car_xl.
- **Hyundai Staria**, **Kia Carnival (7-seat)**, **Ford Everest** — all common in car_xl.
- **Toyota Coaster / Hiace / RegiusAce** minibus variants — the backbone of group hires.
- **Pickup segment** (Toyota Hilux, Isuzu D-Max) — not rowed because they're not typically used for ride-hailing; they're Obhai cargo/parcel. Flag if your platform has a cargo tier.

## Rule-conflict resolutions carried forward

These are the places where the rules fight each other — worth flagging before the enum is seeded:

1. **Alphard / Vellfire / Granvia / Odyssey / CX-9 / CX-5 (5-seat config):** `>2000cc` → car_premium, but `seats ≥6 + MPV/SUV body` → car_xl. The XL rule's wording ("any engine size") reads as an explicit override, so car_xl wins. If luxury MPVs should stay premium, that's a product decision — the rules as written don't.
2. **Pajero / Prado / Land Cruiser / Highlander / Sorento / Palisade:** split by seat count. The allowlist is explicit that Land Cruiser and Prado are 5-seat only, so 7–8-seat configs fall to car_xl. Fortuner follows the same split.
3. **Civic 1.5 Turbo (1496cc):** 4cc short of the 1501 comfort threshold. Strict reading → car_economy. Operationally odd since the 1.8 Civic is car_comfort.
4. **Suzuki Hustler** (658cc kei crossover): SUV floor rule overrides cc band → still car_compact (since SUV floor says "apply even if cc alone would suggest car_economy"; here it would suggest car_compact, so floor doesn't change anything). Worth reviewing if you want any SUV to auto-escalate.
5. **Hyundai Venue 1.0 (998cc):** sub-1000cc SUV → SUV floor rule applies but doesn't escalate past car_comfort because the rule's minimum landing zone is car_comfort, not car_premium.

## Schema / enum implications for the codebase

Per AGENTS.md: `vehicleTypeEnum` in `lib/vehicleTypes.ts` has **8 values** (`bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`). This dataset is spec'd against **9 categories**. If the platform has added `car_compact` as a 9th value (which the pass-1 repo audit didn't find in `lib/vehicleTypes.ts`), this dataset slots in cleanly. If not, this is a schema migration:

```
ALTER TYPE vehicle_type_enum ADD VALUE 'car_compact';
```

...plus Zod enum update, admin vehicle-model catalog seed, dispatch vehicle-type filter updates, and the `vehicleModels` table needs a `category` column (or a mapping table) so the add-vehicle screen's `GET /api/driver/vehicle-models?type={type}` can filter by category rather than by brand alone.
