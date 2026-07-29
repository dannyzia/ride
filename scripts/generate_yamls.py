import yaml
import os

driver_tasks = {
    "meta": {
        "role": "driver",
        "priority": "P0",
        "total_tasks": 9,
        "note": "These tasks have been strictly aligned with the Definitive Audit."
    },
    "tasks": [
        {
            "id": "DRIVER-AUTH-001",
            "wireframe_number": "phone-entry",
            "wireframe_name": "Auth Entry Point",
            "file_path": "app/(auth)/phone-entry.tsx",
            "action": "modify",
            "reason_if_modify": "Ensure no console.log is used. Fix any layout bugs.",
            "store_used": None,
            "components_to_reuse": [
                {"name": "CustomButton", "props": ["title", "onPress", "bgVariant"]}
            ],
            "api_calls": [
                {
                    "method": "POST",
                    "url": "`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/check-user`",
                    "body": "{ phone }"
                }
            ],
            "ui_description": "Phone input field with +880 prefix. Rider/Driver role toggle using setRole('rider')/setRole('driver'). Login and Register buttons.",
            "fonts": {"body": "font-[Urbanist]"},
            "colors": {"background": "bg-goBgDark"}
        },
        {
            "id": "DRIVER-AUTH-002",
            "wireframe_number": "login",
            "wireframe_name": "Login Form",
            "file_path": "app/(auth)/login.tsx",
            "action": "modify",
            "reason_if_modify": "CRITICAL SECURITY FIX: Remove plaintext password logging at line 41.",
            "store_used": None,
            "api_calls": [
                {
                    "method": "supabase.auth.signInWithPassword",
                    "url": "N/A",
                    "body": "{ phone: fullPhone, password }"
                }
            ],
            "ui_description": "Password input field. Submit button to sign in. Remove any console.log or logger outputting the password.",
            "fonts": {"body": "font-[Urbanist]"},
            "colors": {"background": "bg-goBgDark"}
        },
        {
            "id": "DRIVER-001",
            "wireframe_number": 137,
            "wireframe_name": "Driver Home",
            "file_path": "app/(main)/(rider)/index.tsx",
            "action": "modify",
            "reason_if_modify": "Ensure correct store import, correct fonts, and replace console logs.",
            "store_used": {
                "import_path": "@/store/useDriverStore",
                "store_name": "useDriverStore",
                "state_fields": ["driver", "isOnline", "activeSubscription", "wsConnected"]
            },
            "components_to_reuse": [
                {"name": "RideOfferSheet", "props": []},
                {"name": "CustomButton", "props": ["title", "onPress"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "auth:hello", "payload": "{ type: 'auth:hello', access_token, role: 'driver' }"},
                    {"name": "heartbeat", "payload": "{ type: 'heartbeat', lat, lng, ts }"}
                ],
                "received": [
                    {"name": "ride:offer", "payload": "14-field payload"},
                    {"name": "offer:accepted", "payload": "{ ride_id }"},
                    {"name": "offer:lost", "payload": "{ ride_id }"},
                    {"name": "offer:expired", "payload": "{ ride_id }"}
                ]
            },
            "api_calls": [],
            "auth": "const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token;",
            "ui_description": "Main driver map view. Online/offline toggle. Renders <RideOfferSheet /> when an offer is received.",
            "fonts": {"heading": "font-[Urbanist] font-bold", "body": "font-[Inter]"},
            "colors": {"background": "bg-goBgLight"}
        },
        {
            "id": "DRIVER-141",
            "wireframe_number": 141,
            "wireframe_name": "Navigate to Pickup",
            "file_path": "app/(main)/(rider)/find-customer/index.tsx",
            "action": "modify",
            "reason_if_modify": "Align with actual components used (SlideButton, RideLayout) and actual store (useDriver).",
            "store_used": {
                "import_path": "@/store",
                "store_name": "useDriver",
                "state_fields": ["id", "role", "userLatitude", "userLongitude", "userAddress"]
            },
            "components_to_reuse": [
                {"name": "SlideButton", "props": ["title", "onComplete", "bgColor", "textColor"]},
                {"name": "RideLayout", "props": ["disabled", "title", "snapPoints"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "location:update", "payload": "{ type: 'location:update', ride_id, lat, lng }"}
                ]
            },
            "api_calls": [],
            "ui_description": "Uses RideLayout as bottom sheet. Shows pickup/destination. Has SlideButton 'Slide to Confirm Arrival'. Watch position sends location:update.",
            "fonts": {"heading": "font-[Urbanist] font-bold", "body": "font-[Urbanist]"},
            "colors": {"background": "bg-goBgLight"}
        },
        {
            "id": "DRIVER-142",
            "wireframe_number": 142,
            "wireframe_name": "Arrived at Pickup",
            "file_path": "app/(main)/(rider)/find-customer/index.tsx",
            "action": "modify",
            "reason_if_modify": "Arrival is triggered by SlideButton in DRIVER-141. Fix WS event and navigation.",
            "store_used": {
                "import_path": "@/store",
                "store_name": "useDriver",
                "state_fields": ["id", "role"]
            },
            "ws_events": {
                "sent": [
                    {"name": "ride:arrived", "payload": "{ type: 'ride:arrived', ride_id }"}
                ]
            },
            "navigation": {
                "on_arrival_complete": "router.push('/(main)/(rider)/enter-otp')"
            }
        },
        {
            "id": "DRIVER-145",
            "wireframe_number": 145,
            "wireframe_name": "Driver Start Trip (Enter OTP)",
            "file_path": "app/(main)/(rider)/enter-otp/index.tsx",
            "action": "modify",
            "reason_if_modify": "Uses external OtpInput. 4-digit PIN, not 6. Uses bg-white and font-Jakarta for error text.",
            "store_used": {
                "import_path": "@/store",
                "store_name": "useRideOfferStore, useWSStore",
                "state_fields": ["activeRideId", "ws"]
            },
            "components_to_reuse": [
                {"name": "OtpInput", "props": ["numberOfDigits", "onTextChange", "focusColor", "theme"]},
                {"name": "CustomButton", "props": ["title", "onPress", "bgVariant"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "ride:start", "payload": "{ type: 'ride:start', ride_id, pin }"}
                ],
                "received": [
                    {"name": "ride:started", "payload": "{ ride_id }"},
                    {"name": "ride:start_failed", "payload": "{ ride_id }"}
                ]
            },
            "ui_description": "4-digit Ride PIN entry. CustomButton uses default bgVariant='primary' (renders Blue bg-goBlue). Error text uses font-Jakarta.",
            "colors": {"background": "bg-white"}
        },
        {
            "id": "DRIVER-146",
            "wireframe_number": 146,
            "wireframe_name": "Heading to Destination (Finish Ride)",
            "file_path": "app/(main)/(rider)/finish-ride/index.tsx",
            "action": "modify",
            "reason_if_modify": "Fix bugs: +91 to +880, riderLocationUpdate to location:update, role 'rider' to 'driver'.",
            "store_used": {
                "import_path": "@/store",
                "store_name": "useDriver",
                "state_fields": ["id", "role", "userLatitude", "userLongitude"]
            },
            "components_to_reuse": [
                {"name": "SlideButton", "props": ["title", "onComplete", "bgColor", "textColor"]},
                {"name": "RideLayout", "props": ["disabled", "title", "snapPoints"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "location:update", "payload": "{ type: 'location:update', ride_id, lat, lng }"}
                ]
            },
            "api_calls": [],
            "auth": "const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token;",
            "ui_description": "Ride in progress screen. Uses RideLayout. SlideButton to drop off. Phone links use tel:+880.",
            "fonts": {"body": "font-[Urbanist]"},
            "colors": {"background": "bg-goBgLight"}
        },
        {
            "id": "DRIVER-150",
            "wireframe_number": 150,
            "wireframe_name": "Trip Completed",
            "file_path": "app/(main)/(rider)/finish-ride/index.tsx",
            "action": "modify",
            "reason_if_modify": "Uses HTTP for completion, not WS.",
            "api_calls": [
                {
                    "method": "POST",
                    "url": "`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${activeRideId}/complete`",
                    "headers": {"Authorization": "Bearer ${token}"}
                }
            ],
            "ui_description": "On SlideButton complete, calls API to complete ride. Navigates to /(main)/(rider)/home on success.",
            "navigation": {
                "on_success": "router.push('/(main)/(rider)/home')"
            }
        },
        {
            "id": "DRIVER-OFFER-SHEET",
            "wireframe_number": "138-140",
            "wireframe_name": "Ride Offer Sheet",
            "file_path": "components/RideOfferSheet.tsx",
            "action": "verify",
            "reason_if_modify": "Verify CountdownRing usage and WS handshake.",
            "components_to_reuse": [
                {"name": "CountdownRing", "props": ["expiresAt", "onExpire", "size"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "fetch:confirm", "payload": "{ type: 'fetch:confirm', ride_id }"},
                    {"name": "offer:accept", "payload": "{ type: 'offer:accept', ride_id }"},
                    {"name": "offer:reject", "payload": "{ type: 'offer:reject', ride_id, reason }"}
                ],
                "received": [
                    {"name": "fetch:confirmed", "payload": "{ ride_id }"},
                    {"name": "fetch:error", "payload": "{ ride_id, error }"}
                ]
            },
            "ui_description": "Incoming offer bottom sheet. Uses CountdownRing for timer. Uses font-[Urbanist] and font-[Inter]."
        }
    ]
}

rider_tasks = {
    "meta": {
        "role": "rider",
        "priority": "P0",
        "total_tasks": 7,
        "note": "These tasks have been strictly aligned with the Definitive Audit."
    },
    "tasks": [
        {
            "id": "RIDER-HOME",
            "wireframe_number": 16,
            "wireframe_name": "Rider Home",
            "file_path": "app/(main)/(customer)/(tabs)/home/index.tsx",
            "action": "modify",
            "reason_if_modify": "Fix store imports, fix font usage, fix uid usage.",
            "store_used": {
                "import_path": "@/store",
                "store_name": "useCustomer, useRidesStore, useAppUserStore, useWSStore",
                "state_fields": ["All different fields explicitly pulled from barrel"]
            },
            "components_to_reuse": [
                {"name": "Map", "props": []},
                {"name": "RideCard", "props": ["ride"]}
            ],
            "ws_events": {
                "sent": [
                    {"name": "auth:hello", "payload": "{ type: 'auth:hello', access_token, role: 'rider' }"}
                ]
            },
            "auth": "Use session.user.uid instead of user.id",
            "ui_description": "Main rider map view. Uses RideCard in FlatList. Search routes to /autocomplete.",
            "fonts": {"heading": "font-[Urbanist] font-bold", "body": "font-[Inter]"}
        },
        {
            "id": "RIDER-AUTOCOMPLETE",
            "wireframe_number": 20,
            "wireframe_name": "Type Destination",
            "file_path": "app/(main)/(customer)/autocomplete/index.tsx",
            "action": "modify",
            "reason_if_modify": "Ensure BarikoiAutocomplete is used correctly.",
            "components_to_reuse": [
                {"name": "BarikoiAutocomplete", "props": []}
            ],
            "ui_description": "Address search screen using BarikoiAutocomplete."
        },
        {
            "id": "RIDER-FINAL-PAGE",
            "wireframe_number": "31-36, 44-45, 49",
            "wireframe_name": "Ride State Machine (final-page)",
            "file_path": "app/(main)/(customer)/final-page/index.tsx",
            "action": "modify",
            "reason_if_modify": "Huge state machine. Uses useRiderStore. Connects to WS events.",
            "store_used": {
                "import_path": "@/store/useRiderStore",
                "store_name": "useRiderStore",
                "state_fields": ["activeRide", "searchingRideId", "rideStatus", "mapStatus"]
            },
            "ws_events": {
                "sent": [
                    {"name": "ride:subscribe", "payload": "{ type: 'ride:subscribe', ride_id }"},
                    {"name": "ride:unsubscribe", "payload": "{ type: 'ride:unsubscribe', ride_id }"}
                ],
                "received": [
                    {"name": "ride:status", "payload": "{ ride_id, status, ride, pin }"},
                    {"name": "location:driver", "payload": "{ ride_id, lat, lng, eta_minutes }"}
                ]
            },
            "api_calls": [
                {
                    "method": "GET",
                    "url": "`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/ride/active`",
                    "note": "Called in store's fetchActiveRide action"
                },
                {
                    "method": "POST",
                    "url": "`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/cancel`",
                    "body": "{ cancelled_by: 'rider', reason: 'rider_cancelled' }"
                }
            ],
            "ui_description": "Renders finding, matched, arriving, in_progress, completed states. Displays fare in integer paisa / 100.",
            "fonts": {"body": "font-[Urbanist]", "heading": "font-[Inter]"}
        },
        {
            "id": "RIDER-RATE-DRIVER",
            "wireframe_number": 46,
            "wireframe_name": "Rate the Driver",
            "file_path": "app/(main)/(customer)/rate-driver.tsx",
            "action": "create_or_modify",
            "reason_if_modify": "Ensure correct API payload.",
            "api_calls": [
                {
                    "method": "POST",
                    "url": "`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/rate`",
                    "body": "{ rating, comment, rated_role: 'driver' }"
                }
            ],
            "ui_description": "Star rating UI. CustomButton for submission."
        },
        {
            "id": "RIDER-RIDES-TAB",
            "wireframe_number": "63+",
            "wireframe_name": "Rides Tab",
            "file_path": "app/(main)/(customer)/(tabs)/rides/index.tsx",
            "action": "modify",
            "components_to_reuse": [
                {"name": "RiderRidesItem", "props": ["ride"]}
            ],
            "ui_description": "FlatList of past rides."
        },
        {
            "id": "RIDER-PROFILE-TAB",
            "wireframe_number": 78,
            "wireframe_name": "Profile Tab",
            "file_path": "app/(main)/(customer)/(tabs)/profile/index.tsx",
            "action": "modify",
            "ui_description": "Account info and logout button."
        }
    ]
}

def write_yaml(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write("# " + filename.split('/')[-1] + "\\n")
        f.write("# Extremely detailed, corrected instructions strictly aligning with the Definitive Audit.\\n")
        f.write("# Target audience: A weak/small coding model (Raptor Mini).\\n\\n")
        yaml.dump(data, f, sort_keys=False, default_flow_style=False)

write_yaml("D:/My Projects/Current Project/Ride/docs/Plan/DRIVER-P0-TASKS.yaml", driver_tasks)
write_yaml("D:/My Projects/Current Project/Ride/docs/Plan/RIDER-P0-TASKS.yaml", rider_tasks)
