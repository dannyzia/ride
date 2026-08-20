Ride-Hailing Platform — Fleet Management & Fleet SaaS

Complete Implementation Specification v1.0

Purpose: Implementation handoff to an AI coding orchestrator.

Primary objective: Add Fleet Management to the existing ride-hailing platform while keeping the mobile UX simple and allowing the Fleet Management system to operate both:

1. Native fleets whose vehicles use this ride-hailing platform.
2. External fleets whose vehicles operate on another ride-hailing platform and send permitted operational data through API.

---

1. Core Product Decision

1.1 Do NOT create three independent login systems

The platform should have:

ONE AUTHENTICATION SYSTEM

User
 ├── Rider capability
 ├── Driver capability
 └── Fleet Owner capability

A user may have one or multiple capabilities.

Examples:

User A
 └── Rider

User B
 └── Driver

User C
 └── Fleet Owner

User D
 ├── Rider
 └── Fleet Owner

User E
 ├── Driver
 └── Fleet Owner

Do not duplicate authentication, user profiles, phone verification, NID information, etc.

Use role/capability-based authorization after authentication.

---

2. Product Model

The platform has three commercial layers.

Layer A — Ride-Hailing

Rider
   ↓
Booking
   ↓
Driver
   ↓
Vehicle
   ↓
Trip
   ↓
Fare

Revenue:

Subscription quota
+
Percentage commission on fare

---

Layer B — Native Fleet Management

Fleet Owner
   ↓
Fleet
   ├── Vehicles
   ├── Drivers
   ├── Documents
   ├── Maintenance
   ├── Assignments
   └── Fleet financials

Vehicles can operate on this platform.

---

Layer C — External Fleet Management SaaS

External fleet:

External Fleet
   ↓
Fleet Management System
   ↓
API Integration
   ↓
External Ride-Hailing Platform

The fleet owner pays a Fleet Management subscription/fee even when the rides are generated elsewhere.

The external platform must explicitly authorize the API integration.

---

3. Commercial Models

3.1 Ride-Hailing Subscription

The platform charges according to a weekly ride/call quota.

Example:

Plan A
100 rides/week

Plan B
250 rides/week

Plan C
500 rides/week

Plan D
1000 rides/week

Important implementation decision

The quota should be based on completed trips, not merely ride requests.

Otherwise a rider/driver can generate thousands of rejected/cancelled requests and consume or manipulate the quota.

Recommended:

quota_consumption_event = completed_trip

Admin configuration should allow the exact billing event to be changed later.

---

4. Ride Commission

In addition to the subscription:

Platform Revenue =
Subscription Fee
+
Ride Commission

Commission should be configurable.

Example:

Fare = ৳500
Commission = 15%

Platform commission = ৳75
Remaining = ৳425

Do not hard-code commission percentages.

Commission should support:

- Global default
- Service/category-specific commission
- Fleet-specific commission
- Driver-specific override if required later
- Promotional commission
- Effective date
- Expiry date

---

5. Fleet Management Commercial Model

Introduce a separate Fleet Management subscription/fee.

The fleet fee is independent of whether the fleet generates rides through this platform.

Supported fleet types:

NATIVE

EXTERNAL_API

Native fleet

Vehicles use this ride-hailing platform.

Potential charges:

Fleet Management Fee
+
Ride Commission

External/API fleet

Vehicles operate on another ride-hailing platform.

Potential charges:

Fleet Management Subscription
+
Optional API/integration fee

No ride commission should be charged by this platform for rides that did not originate on this platform.

---

6. External Fleet API Model

This should NOT be implemented as an uncontrolled "scraping" system.

Only support:

- Official API
- Authorized integration
- Explicit fleet-owner authorization
- Appropriate API credentials/OAuth
- Data permitted by the external platform

Architecture:

External Ride Platform
          │
          │ Authorized API
          ▼
Integration Gateway
          │
          ▼
Fleet Management API
          │
          ├── Vehicles
          ├── Drivers
          ├── Trips
          ├── Earnings
          ├── Location
          └── Status

Do not assume every external platform will provide every data type.

Each integration should declare its supported capabilities.

Example:

Uber Integration
 ├── Vehicles        ✓
 ├── Drivers         ✓
 ├── Trips           ✓
 ├── Earnings        ✓
 └── Live Location   ✗

Platform B
 ├── Vehicles        ✓
 ├── Drivers         ✓
 ├── Trips           ✓
 ├── Earnings        ✓
 └── Live Location   ✓

---

7. Account / Role Architecture

Do not create:

Rider Login
Driver Login
Fleet Owner Login

Instead:

Login
 ↓
Authenticated User
 ↓
Determine capabilities
 ↓
Open appropriate home experience

Possible capabilities:

RIDER
DRIVER
FLEET_OWNER
FLEET_MANAGER
DISPATCHER
FLEET_ACCOUNTANT
ADMIN

Fleet staff roles should belong to a fleet.

---

8. Mobile UX Principle

The mobile application must remain simple.

Do NOT expose 30 fleet-management functions on the main screen.

Fleet Owner home screen should primarily show:

Fleet Overview

Vehicles       24
Drivers        28
On Trip         9
Available      11
Maintenance     2

Today's Trips  84
Today's Revenue ৳42,500

[Vehicles]
[Drivers]
[Trips]

More

Advanced functionality should be placed under:

More

---

9. Application Navigation

Rider

Home
Activity
Wallet/Payments
Profile

Driver

Home
Trips
Earnings
Profile

Fleet Owner

Dashboard
Operations
Finance
More

Do not create a completely separate application unless future business requirements justify it.

---

10. Role Switching

If a user has multiple capabilities:

Current Mode

Rider
Driver
Fleet Owner

Allow switching from Profile/Account.

Example:

My Account

Current mode:
Fleet Owner

[Switch to Rider]
[Switch to Driver]

Do not force logout.

---

11. Fleet Owner Screens

Target approximately 12–16 primary screens, not dozens.

F01 — Fleet Dashboard

Display:

- Fleet name
- Fleet status
- Vehicles
- Drivers
- Active vehicles
- Vehicles on trip
- Available vehicles
- Maintenance vehicles
- Today's trips
- Today's revenue
- Outstanding alerts

Primary actions:

Vehicles
Drivers
Trips

---

F02 — Fleet Profile

Fields:

- Fleet name
- Owner
- Phone
- Email
- Address
- Business information
- Fleet type
- Subscription
- Fleet status

Fleet types:

Native
External/API
Hybrid

---

12. F03 — Vehicle List

Display:

Vehicle
Status
Driver
Trips
Documents

Filters:

- Active
- Available
- On trip
- Maintenance
- Suspended
- Expired documents

Search:

- Registration number
- Vehicle ID
- Driver

---

13. F04 — Vehicle Details

Sections:

Overview
Driver
Documents
Trips
Maintenance
Inspection
Financials

Basic information:

- Registration
- Make
- Model
- Year
- Color
- Engine
- Chassis
- Fuel
- Seats
- Category
- BRTA classification
- Status

Reuse the existing vehicle model and existing BRTA/eligibility logic.

Do NOT create a second fleet-specific vehicle table that duplicates the platform vehicle.

---

14. F05 — Add Vehicle

Native fleet:

Registration Number
Vehicle information
Vehicle category
Documents

External fleet:

Vehicle information
External Vehicle ID
External Platform

If external API supplies the information, allow automatic synchronization.

---

15. F06 — Driver List

Display:

Driver
Vehicle
Status
Rating
Trips
Revenue

Filters:

- Online
- Offline
- On trip
- Suspended
- Documents expired

---

16. F07 — Driver Details

Sections:

Profile
Documents
Current Vehicle
Trip History
Performance
Earnings
Compliance

Reuse the existing driver entity.

Do not create duplicate fleet drivers.

---

17. F08 — Driver ↔ Vehicle Assignment

Actions:

Assign Driver
Change Vehicle
Remove Assignment

Maintain complete historical records.

Example:

Driver: Rahim

Current Vehicle:
DHA-1234

Previous:
DHA-9876
Jan 10 → Feb 20

Never overwrite assignment history.

---

18. F09 — Fleet Trips

List:

- Trip ID
- Driver
- Vehicle
- Date
- Status
- Fare
- Source

Source:

NATIVE
EXTERNAL_API
MANUAL

Filters:

- Date
- Vehicle
- Driver
- Status
- Source

---

19. F10 — Trip Details

Display:

Trip ID
Source
Vehicle
Driver
Passenger/reference if permitted
Pickup
Destination
Distance
Duration
Fare
Commission
Fleet revenue
Status

For external trips, only display data actually supplied by the integration.

---

20. F11 — Live Fleet Map

Show:

- Vehicle location
- Vehicle status
- Driver
- Current trip
- Last GPS update

Important:

Do not continuously track vehicles when there is no legitimate operational requirement.

Respect:

- Driver consent
- Platform policy
- API permissions
- Privacy requirements

---

21. F12 — Fleet Finance

Display:

Today's Revenue
This Week
This Month
Pending
Settled

Breakdown:

Gross Fare
Platform Commission
Driver Share
Adjustments
Fleet Revenue

For external fleets:

External Trip Revenue

must remain separate from native ride revenue.

---

22. F13 — Fleet Subscription

Display:

Current Plan
Billing Cycle
Vehicles Allowed
Drivers Allowed
API Usage
Renewal Date
Current Status

For example:

Fleet Pro

Vehicles: 50
Drivers: 75
API integrations: 2

Renewal:
16 September 2026

---

23. F14 — Maintenance

Keep the first version simple.

Display:

Vehicle
Last Service
Next Service
Status

Maintenance record:

- Type
- Date
- Mileage
- Cost
- Provider
- Notes

Do not build a full enterprise workshop management system in MVP.

---

24. F15 — Documents / Compliance

Show:

Expired
Expiring Soon
Valid

For each vehicle/driver:

- Registration
- Fitness
- Insurance
- Tax token
- Driving license
- Other platform documents

Reuse the existing document system.

---

25. F16 — Alerts

Centralized alerts:

3 documents expiring
2 vehicles require maintenance
1 driver suspended
5 trips require attention
Subscription renewal approaching

---

26. External/API Integration Screens

Keep these under:

More → Integrations

Integration List

Show:

Connected
Disconnected
Requires Attention

---

Add Integration

Flow:

Select External Platform
        ↓
Authorize
        ↓
Grant permissions
        ↓
Connection test
        ↓
Initial synchronization
        ↓
Active

Never ask users to paste credentials into arbitrary text fields if OAuth/API authorization is available.

---

27. Integration Details

Display:

Platform
Connection status
Last sync
Vehicles synced
Drivers synced
Trips synced
Errors

Actions:

Sync Now
Pause
Reconnect
Disconnect

---

28. Backend Architecture

Use the existing backend architecture.

Do NOT introduce a separate fleet backend unless the existing architecture technically requires it.

Recommended domain structure:

Auth
Users
Riders
Drivers
Vehicles
Bookings
Trips
Payments
Fleets
Fleet Members
Fleet Assignments
Fleet Billing
Fleet Integrations
Fleet Maintenance
Fleet Compliance
Fleet Analytics
Notifications

---

29. Database Architecture

Use the existing PostgreSQL database and PostGIS if already present.

The fleet module should extend the existing schema.

29.1 users

Existing table.

Important fields:

id
phone
email
name
status
created_at
updated_at

Do not duplicate users for fleet owners.

---

30. user_roles

If the existing application uses a role table, extend it.

id
user_id
role
created_at

Possible values:

RIDER
DRIVER
FLEET_OWNER
FLEET_MANAGER
DISPATCHER
FLEET_ACCOUNTANT
ADMIN

If the existing codebase already has an RBAC implementation, reuse it.

---

31. fleets

id UUID PK
owner_user_id UUID FK users.id
name
fleet_type
status
phone
email
address
business_name
trade_license_number
tax_identifier
subscription_plan_id
subscription_status
created_at
updated_at

fleet_type:

NATIVE
EXTERNAL
HYBRID

status:

PENDING
ACTIVE
SUSPENDED
BLOCKED
CLOSED

---

32. fleet_members

This table handles staff.

id UUID PK
fleet_id UUID FK
user_id UUID FK
role
status
joined_at
removed_at
created_at
updated_at

Roles:

OWNER
MANAGER
DISPATCHER
ACCOUNTANT
VIEWER

A fleet owner should not be represented only through "owner_user_id"; use "fleet_members" for authorization as well.

---

33. fleet_vehicles

Do NOT duplicate vehicle information here.

Use a relationship table:

id UUID PK
fleet_id UUID FK
vehicle_id UUID FK
status
joined_at
left_at
created_at
updated_at

This connects the existing platform vehicle to the fleet.

---

34. fleet_drivers

Likewise, do not duplicate the driver.

id UUID PK
fleet_id UUID FK
driver_id UUID FK
status
joined_at
left_at
created_at
updated_at

---

35. fleet_vehicle_assignments

This is essential.

id UUID PK
fleet_id UUID FK
vehicle_id UUID FK
driver_id UUID FK
assigned_at
unassigned_at
assigned_by
reason
status
created_at

This provides historical accountability.

---

36. fleet_subscriptions

id UUID PK
fleet_id UUID FK
plan_id UUID FK
status
started_at
current_period_start
current_period_end
cancelled_at
created_at
updated_at

---

37. fleet_subscription_plans

id UUID PK
name
description
billing_period
price
vehicle_limit
driver_limit
api_limit
features JSONB
active
created_at
updated_at

Possible billing period:

WEEKLY
MONTHLY
YEARLY

---

38. fleet_billing_transactions

id UUID PK
fleet_id UUID FK
subscription_id UUID FK
transaction_type
amount
currency
status
reference
metadata JSONB
created_at

Types:

SUBSCRIPTION
API_FEE
ADJUSTMENT
REFUND
OTHER

---

39. fleet_trip_records

Do not duplicate native trip records.

For native trips, reference the existing trip.

id UUID PK
fleet_id UUID FK
trip_id UUID FK NULL
external_trip_id NULL
source
vehicle_id UUID FK
driver_id UUID FK
gross_fare
platform_commission
fleet_revenue
currency
trip_started_at
trip_completed_at
metadata JSONB
created_at

source:

NATIVE
EXTERNAL_API
MANUAL

For native trips:

trip_id != NULL

For external trips:

external_trip_id != NULL

---

40. fleet_integrations

id UUID PK
fleet_id UUID FK
provider
status
external_account_id
access_token_reference
refresh_token_reference
scopes JSONB
last_sync_at
last_successful_sync_at
last_error
metadata JSONB
created_at
updated_at

IMPORTANT:

Never store OAuth/API secrets in plaintext.

Use the platform's secure secret storage/encryption mechanism.

---

41. integration_sync_jobs

id UUID PK
integration_id UUID FK
entity_type
started_at
completed_at
status
records_received
records_created
records_updated
records_failed
error_message
cursor
created_at

entity_type:

VEHICLES
DRIVERS
TRIPS
EARNINGS
LOCATIONS

---

42. fleet_maintenance_records

id UUID PK
fleet_id UUID FK
vehicle_id UUID FK
maintenance_type
service_date
odometer
cost
currency
provider
description
next_service_date
next_service_odometer
status
created_at
updated_at

---

43. fleet_documents

If the existing document system is reusable, extend it rather than creating another system.

If a fleet-specific entity is required:

id UUID PK
fleet_id UUID FK
entity_type
entity_id
document_type
document_number
issue_date
expiry_date
file_reference
verification_status
verified_at
created_at
updated_at

entity_type:

FLEET
VEHICLE
DRIVER

---

44. fleet_alerts

id UUID PK
fleet_id UUID FK
type
severity
title
message
entity_type
entity_id
is_read
created_at
resolved_at

Severity:

INFO
WARNING
CRITICAL

---

45. Fleet Analytics

Do not calculate every dashboard number by scanning millions of trip rows in real time.

Use:

- Aggregation queries
- Materialized views where appropriate
- Daily fleet statistics
- Cached dashboard metrics

Possible table:

fleet_daily_metrics

id
fleet_id
date
trip_count
completed_trip_count
cancelled_trip_count
gross_revenue
commission
fleet_revenue
active_vehicle_count
active_driver_count
distance
created_at

---

46. API Structure

Use the existing API conventions.

Conceptually:

/api/fleets
/api/fleets/{fleetId}
/api/fleets/{fleetId}/vehicles
/api/fleets/{fleetId}/drivers
/api/fleets/{fleetId}/assignments
/api/fleets/{fleetId}/trips
/api/fleets/{fleetId}/finance
/api/fleets/{fleetId}/subscription
/api/fleets/{fleetId}/maintenance
/api/fleets/{fleetId}/documents
/api/fleets/{fleetId}/alerts
/api/fleets/{fleetId}/integrations

---

47. External Integration API

Expose a controlled integration API.

Example:

POST /api/integrations/{integrationId}/sync
GET  /api/integrations/{integrationId}/status
POST /api/integrations/{integrationId}/disconnect

Webhook endpoint if supported:

POST /api/integrations/{provider}/webhook

Every webhook must support:

- Authentication/signature validation
- Idempotency
- Replay protection
- Event logging
- Error handling

---

48. API Data Model

Normalize incoming external data.

External:

provider_vehicle_id
provider_driver_id
provider_trip_id

Internal:

vehicle_id
driver_id
fleet_id
trip_record_id

Never allow external providers to become the primary identity of internal entities.

---

49. Sync Strategy

Use:

Initial Import
      ↓
Incremental Sync
      ↓
Webhook where available
      ↓
Periodic Reconciliation

If a provider supports webhooks:

Webhook = near real-time

Otherwise:

Scheduled polling = fallback

Every synchronization should be idempotent.

If the same external trip arrives twice:

DO NOT create two trips.

Use:

(provider, external_trip_id)

as a unique constraint.

---

50. Native Fleet Trip Integration

The existing trip engine remains the source of truth.

When a native trip completes:

Trip completed
     ↓
Determine fleet
     ↓
Determine vehicle
     ↓
Determine driver
     ↓
Create/update fleet financial record
     ↓
Update fleet analytics

Do not create a second trip-processing engine.

---

51. Subscription Quota Engine

Create a reusable quota/billing component.

Example:

Plan:
500 completed trips/week

Usage:
372

Remaining:
128

Tables:

subscription_plans
subscriptions
subscription_usage

"subscription_usage":

id
subscription_id
period_start
period_end
metric
quantity
updated_at

metric:

COMPLETED_TRIPS

Later it can support:

API_CALLS
VEHICLES
DRIVERS

without redesigning the subscription engine.

---

52. Important Distinction: Ride Subscription vs Fleet Subscription

Do not mix these.

Ride platform subscription

Controls:

Ride/trip usage

Fleet Management subscription

Controls:

Fleet management service

External fleet customers should be able to pay the fleet subscription without having a native ride account.

---

53. External Fleet Without Native Drivers

An external fleet driver does not necessarily need to create a full driver account on your ride-hailing platform.

The integration can create:

External Driver Record

associated with the fleet.

However, if the driver wants to use your ride platform directly later, the external driver record should be linkable to an actual user/driver account.

Do not create duplicate people.

Recommended architecture:

Person/User
   │
   ├── Native Driver
   │
   └── External Driver Profiles
         └── Provider A
         └── Provider B

---

54. External Vehicle Architecture

Same principle.

A vehicle should have:

Internal Vehicle

and provider mappings:

vehicle_provider_accounts

Example:

Internal Vehicle
DHA-12345

External mappings:
Provider A → vehicle_789
Provider B → car_456

This allows one physical vehicle to potentially operate across multiple platforms.

---

55. Multi-Platform Fleet

Eventually:

Fleet
 │
 ├── Native Ride Platform
 │
 ├── External Platform A
 │
 └── External Platform B

The fleet owner can see consolidated:

Trips
Revenue
Vehicles
Drivers
Utilization

but every record retains its source.

Example:

Today's Trips: 127

Native Platform       52
External Platform A   48
External Platform B   27

This is the long-term strategic value of the Fleet SaaS.

---

56. Security Requirements

Mandatory:

- RBAC
- Fleet-level authorization
- Object-level authorization
- API authentication
- OAuth where supported
- Encrypted secrets
- Audit logs
- Rate limiting
- Idempotency
- Webhook signature validation
- Input validation
- File access controls
- PII protection

A fleet user must NEVER be able to access:

/fleets/{anotherFleetId}

even if they manually change the URL/API parameter.

Authorization must happen server-side.

---

57. Audit Log

Create:

audit_logs

Record:

actor_user_id
fleet_id
action
entity_type
entity_id
old_value
new_value
ip_address
user_agent
created_at

Important actions:

- Add vehicle
- Remove vehicle
- Add driver
- Remove driver
- Assign driver
- Unassign driver
- Change fleet role
- Change subscription
- Connect API
- Disconnect API
- Financial adjustment
- Document verification

---

58. Notifications

Support:

Push
In-app
Email
SMS

But keep mobile notifications focused.

Examples:

Vehicle fitness expires in 7 days.

Driver Rahim has been assigned to DHA-1234.

Fleet subscription renews in 3 days.

Vehicle DHA-4567 requires maintenance.

---

59. Admin Panel Requirements

The platform admin needs fleet management too.

Admin screens:

Fleets
Fleet Details
Fleet Vehicles
Fleet Drivers
Fleet Subscriptions
Fleet Billing
Fleet Integrations
Fleet Compliance
Fleet Analytics
Fleet Audit Logs

Admin should be able to:

- Approve fleet
- Suspend fleet
- Block fleet
- Approve documents
- View fleet activity
- Configure plans
- Configure commission
- Configure fleet fees
- Review API integrations
- Disconnect integration
- View synchronization errors

---

60. Fleet Onboarding Flow

Mobile:

Profile
   ↓
Become a Fleet Owner
   ↓
Fleet Information
   ↓
Business/identity verification
   ↓
Select Fleet Plan
   ↓
Payment
   ↓
Fleet Created
   ↓
Add Vehicles
   ↓
Add Drivers

For external fleet:

Create Fleet
   ↓
Choose External/API Fleet
   ↓
Select Platform
   ↓
Authorize Integration
   ↓
Import Vehicles/Drivers
   ↓
Verify Imported Data
   ↓
Fleet Active

---

61. Native Fleet Onboarding

Fleet Owner
 ↓
Create Fleet
 ↓
Add vehicle
 ↓
Existing vehicle eligibility system
 ↓
Existing document verification
 ↓
Existing inspection
 ↓
Vehicle approved
 ↓
Assign driver
 ↓
Driver approved
 ↓
Vehicle available

Reuse existing onboarding logic.

---

62. Fleet Vehicle Eligibility

The existing Bangladesh vehicle eligibility engine remains authoritative.

Do not duplicate the eligibility matrix.

It should determine:

Eligible
Conditionally Eligible
Not Eligible

based on the existing:

- Vehicle category
- Engine CC
- BRTA class
- Registration age
- Required documents
- Inspection
- Other existing platform rules

Fleet Management consumes the result.

---

63. Driver Eligibility

Likewise reuse the existing driver onboarding/KYC system.

Fleet assignment should be blocked if:

Driver not approved
OR
Driver license invalid
OR
Driver suspended

unless an authorized admin override exists.

---

64. Assignment Rules

Before assigning driver → vehicle:

Validate:

Driver belongs to fleet
Vehicle belongs to fleet
Driver is active
Vehicle is active
Driver is eligible
Vehicle is eligible
Required documents valid
No conflicting active assignment

Then create assignment.

---

65. Vehicle Status State Machine

Use a controlled state machine.

PENDING
   ↓
ACTIVE
   ↓
AVAILABLE
   ↓
ON_TRIP
   ↓
AVAILABLE

Other states:

MAINTENANCE
SUSPENDED
DOCUMENT_EXPIRED
DEACTIVATED

Do not allow arbitrary status changes from the mobile client.

---

66. Driver Status

Recommended:

PENDING
ACTIVE
ONLINE
ON_TRIP
OFFLINE
SUSPENDED
BLOCKED

The server determines valid transitions.

---

67. Fleet Financial Ledger

Do not rely only on aggregated totals.

Create a ledger.

fleet_ledger_entries

id
fleet_id
trip_id
type
amount
currency
direction
reference
metadata
created_at

Types:

TRIP_REVENUE
PLATFORM_COMMISSION
DRIVER_PAYOUT
SUBSCRIPTION_FEE
API_FEE
ADJUSTMENT
REFUND
WITHDRAWAL

This allows reliable reconciliation.

---

68. External Revenue

For external trips, store whatever the provider actually reports.

Example:

External Fare:
৳600

Provider Fee:
৳120

Fleet Revenue:
৳480

Do not invent missing values.

The integration adapter should normalize provider-specific financial data into the internal ledger.

---

69. Reporting

Fleet owner reports:

Daily
Weekly
Monthly
Custom Range

Reports:

- Trips
- Revenue
- Vehicle performance
- Driver performance
- Maintenance
- Expenses
- Profitability
- Subscription
- External platform performance

CSV/PDF export can be added after the core module works.

---

70. MVP Scope

Do NOT implement everything simultaneously.

MVP 1

Implement:

1. Multi-role account system
2. Fleet creation
3. Fleet owner dashboard
4. Fleet vehicle management
5. Fleet driver management
6. Driver ↔ vehicle assignment
7. Vehicle/driver document visibility
8. Native trip aggregation
9. Fleet earnings
10. Fleet subscription
11. Fleet alerts
12. Basic fleet analytics
13. Admin fleet management
14. RBAC
15. Audit log

This is the minimum viable Fleet Management product.

---

71. MVP 2

Then add:

16. Maintenance
17. Inspection integration
18. Fleet live map
19. Advanced financial ledger
20. Driver performance
21. Vehicle performance
22. Fleet staff roles
23. Fleet notifications

---

72. MVP 3 — Fleet SaaS

Then:

24. External fleet type
25. Integration framework
26. OAuth/API connections
27. External vehicle synchronization
28. External driver synchronization
29. External trip synchronization
30. External earnings synchronization
31. Integration monitoring
32. Multi-platform fleet dashboard
33. Fleet SaaS billing

Do not build individual integrations before building the generic integration architecture.

---

73. Recommended Implementation Order

The orchestrator should execute in this order.

Phase 0 — Codebase Audit

Before changing code:

Inspect:
- Authentication
- User model
- Roles
- Driver model
- Vehicle model
- Vehicle eligibility
- BRTA logic
- Document system
- Inspection system
- Booking
- Trip
- Fare
- Payment
- Commission
- Subscription
- Notifications
- Admin
- Database
- API conventions
- Mobile navigation

Produce a dependency map.

Do not redesign existing systems unnecessarily.

---

74. Phase 1 — Data Model

Implement migrations/models for:

fleets
fleet_members
fleet_vehicles
fleet_drivers
fleet_vehicle_assignments
fleet_subscriptions
fleet_subscription_plans
fleet_billing_transactions
fleet_trip_records
fleet_ledger_entries
fleet_alerts
audit_logs

Only add tables that do not already exist in equivalent form.

---

75. Phase 2 — Authorization

Implement:

FLEET_OWNER
FLEET_MANAGER
DISPATCHER
FLEET_ACCOUNTANT
VIEWER

Add fleet-scoped authorization.

Test cross-fleet access thoroughly.

---

76. Phase 3 — Mobile Fleet UX

Implement:

Fleet activation
Fleet dashboard
Vehicles
Vehicle detail
Drivers
Driver detail
Assignments
Trips
Finance
Alerts
More

Keep screens simple.

Avoid forms with 20 fields on one screen.

Use:

step-by-step forms
sections
progressive disclosure

---

77. Phase 4 — Native Fleet Integration

Connect:

Existing Vehicle
Existing Driver
Existing Trip
Existing Fare
Existing Commission
Existing Document System
Existing Inspection

to fleet records.

Test:

Fleet → Vehicle
Fleet → Driver
Driver → Vehicle
Vehicle → Trip
Trip → Revenue
Revenue → Fleet Ledger

---

78. Phase 5 — Subscription Engine

Implement:

Fleet subscription
Ride subscription
Quota tracking
Billing periods
Usage
Commission
Ledger

Keep them logically separate.

---

79. Phase 6 — Admin

Implement admin controls for:

Fleet approval
Fleet suspension
Plans
Pricing
Commission
Fees
Documents
Integrations
Billing
Audit

---

80. Phase 7 — External Integration Framework

Build generic:

IntegrationProvider
IntegrationConnection
SyncJob
Webhook
ExternalEntityMapping

Do not hard-code one provider into the entire application.

Recommended adapter interface:

connect()
disconnect()
testConnection()
syncVehicles()
syncDrivers()
syncTrips()
syncEarnings()
getCapabilities()
handleWebhook()

Each external platform gets an adapter.

---

81. Phase 8 — First External Integration

Only after the generic framework is stable:

Provider Adapter
      ↓
Authentication
      ↓
Vehicle sync
      ↓
Driver sync
      ↓
Trip sync
      ↓
Earnings sync
      ↓
Reconciliation

Use mocked provider responses in development.

Do not block the rest of the Fleet Management implementation waiting for an external platform's API approval.

---

82. API Failure Handling

External APIs will fail.

Design for:

Timeout
Rate limit
Expired token
Permission revoked
Malformed response
Partial sync
Duplicate webhook
Missing data
Provider outage

The fleet application should show:

Last successful sync:
08:42 AM

Status:
Needs attention

Reason:
Authorization expired

It should not silently show stale data as current.

---

83. Database Constraints

Important unique constraints:

fleets.id

fleet_vehicles:
UNIQUE(fleet_id, vehicle_id)

fleet_drivers:
UNIQUE(fleet_id, driver_id)

fleet_vehicle_assignments:
prevent multiple active assignments

fleet_integrations:
appropriate provider/account uniqueness

external mappings:
UNIQUE(provider, external_entity_id)

fleet_trip_records:
UNIQUE(provider, external_trip_id)

Use database constraints in addition to application validation.

---

84. Performance Requirements

Fleet dashboard should not execute dozens of expensive queries.

Use:

parallel queries
aggregations
indexes
cached metrics
materialized views where justified

Required indexes should include:

fleet_id
vehicle_id
driver_id
trip_id
status
created_at
external_trip_id
provider

For geospatial data, use PostGIS indexes if the existing system already uses PostGIS.

---

85. Mobile Performance

Fleet owner dashboard must work on normal Android devices and mobile networks.

Avoid:

- Huge tables
- Constant map polling
- Large document downloads
- Heavy animations
- Loading all vehicles at once

Use:

pagination
lazy loading
server-side filtering
cached dashboard
incremental map updates

---

86. Acceptance Criteria

The implementation is not complete until these flows work.

Flow 1 — Fleet creation

User
→ Fleet Owner
→ Create Fleet
→ Fleet active

---

Flow 2 — Add vehicle

Fleet Owner
→ Add vehicle
→ Existing eligibility
→ Existing documents
→ Vehicle approved
→ Fleet vehicle visible

---

Flow 3 — Add driver

Fleet Owner
→ Add/associate driver
→ Existing driver verification
→ Driver associated with fleet

---

Flow 4 — Assignment

Fleet Owner
→ Assign driver
→ Vehicle validated
→ Assignment created
→ History recorded

---

Flow 5 — Native trip

Rider books
→ Driver accepts
→ Trip completes
→ Existing fare calculation
→ Fleet identified
→ Fleet ledger updated
→ Fleet dashboard updated

---

Flow 6 — Subscription

Fleet selects plan
→ Payment
→ Subscription active
→ Usage tracked
→ Renewal

---

Flow 7 — External fleet

Fleet created
→ External/API selected
→ Integration authorized
→ Vehicles imported
→ Drivers imported
→ Trips synchronized
→ Fleet dashboard displays external data
→ Fleet subscription billed

---

87. Critical Design Rules for the Orchestrator

The coding orchestrator MUST follow these rules.

Rule 1

Do not duplicate existing entities.

If the codebase already has:

users
drivers
vehicles
trips
documents
payments
subscriptions

extend them.

---

Rule 2

Do not rewrite the existing ride-hailing engine.

Fleet Management is an additional domain layer.

---

Rule 3

Do not create a separate authentication system.

Use the existing authentication.

---

Rule 4

Do not create a separate trip engine for fleets.

Native fleet trips originate from the existing trip system.

---

Rule 5

External trips are integration records, not native trips.

Keep the source clearly identified.

---

Rule 6

All fleet data must be fleet-scoped.

A fleet member can only access authorized fleet data.

---

Rule 7

Mobile UX takes priority over feature density.

Complexity belongs in:

backend
admin
automation

not on the fleet owner's home screen.

---

Rule 8

Build the integration framework before individual external integrations.

---

Rule 9

Do not assume an external ride-hailing platform provides an API.

The system must support:

API available → integrate

API unavailable → integration unavailable

Do not scrape private endpoints or reverse-engineer unofficial APIs.

---

Rule 10

Every external data record must retain its source.

---

88. Suggested Mobile Information Architecture

Final fleet navigation:

FLEET OWNER

Dashboard
│
├── Operations
│   ├── Live Vehicles
│   ├── Trips
│   └── Drivers
│
├── Vehicles
│
├── Finance
│
└── More
    ├── Documents
    ├── Maintenance
    ├── Subscription
    ├── Integrations
    ├── Staff
    ├── Alerts
    └── Fleet Settings

Do not put every function in bottom navigation.

Recommended bottom navigation:

Dashboard | Operations | Finance | More

---

89. Strategic Product Position

The long-term product should not be viewed simply as:

«"Fleet management for our ride-hailing app."»

It should be architected as:

«Fleet Management SaaS that can also manage vehicles operating on our own ride-hailing marketplace.»

This distinction matters.

The architecture becomes:

                    FLEET MANAGEMENT
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     Our Platform      Platform A      Platform B
       Vehicles          Vehicles        Vehicles
       Drivers           Drivers         Drivers
       Trips             Trips           Trips
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                  Unified Fleet View
                           │
                           ▼
                 Fleet Owner Dashboard

That creates a much larger addressable market than limiting fleet management to your own ride-hailing network.

---

90. Final Recommended Product Structure

RIDE-HAILING PLATFORM
│
├── RIDER
│
├── DRIVER
│
├── FLEET MANAGEMENT
│   │
│   ├── Native Fleet
│   │   └── Our Ride Platform
│   │
│   └── External Fleet
│       ├── Platform A
│       ├── Platform B
│       └── Platform C
│
├── ADMIN
│
└── SHARED SERVICES
    ├── Authentication
    ├── Users
    ├── Vehicles
    ├── Drivers
    ├── Documents
    ├── Trips
    ├── Payments
    ├── Subscriptions
    ├── Notifications
    ├── Maps/GPS
    └── Audit

Final implementation priority

Build this first:

Multi-role account
        ↓
Fleet
        ↓
Fleet ↔ Vehicle
Fleet ↔ Driver
        ↓
Driver ↔ Vehicle Assignment
        ↓
Existing Trips
        ↓
Fleet Revenue
        ↓
Fleet Subscription
        ↓
Dashboard

Then:

Maintenance
Compliance
Live tracking
Analytics
Fleet staff

Then:

External API Integration
        ↓
External Vehicles
External Drivers
External Trips
External Revenue
        ↓
Multi-platform Fleet SaaS

The most important architectural decision is to make Fleet Management a layer around your existing ride-hailing entities, not a second ride-hailing system. That keeps the mobile app simple, prevents duplicate data, and leaves you with a path to sell Fleet Management independently to fleets that operate on competing ride-hailing platforms.

# Fleet Management — Architecture & Phased Plan (v1)

**Adapted from:** ChatGPT fleet management spec (shared 2026-08-16)
**Status:** Pre-implementation architecture plan. Requires a Phase 0 codebase audit before schema/code work begins — table and column names below are provisional pending that audit.

## Key decisions (resolved with Zia, 2026-08-16)

| Question | Decision |
|---|---|
| Fleet owner revenue | Ledger/reporting only — no real money movement. Rider still pays driver directly (cash/MFS). Owner and driver settle off-platform; Ride only reports what fleet-assigned vehicles/drivers earned. |
| Call-package subscriptions | Untouched. Each driver buys/tops up their own call package regardless of fleet membership. Fleet Management has zero coupling to the subscription/balance engine or `balanceScore`. |
| External Fleet SaaS (Layer C) | In roadmap as a later phase (MVP3), per the original draft's own sequencing — generic integration framework first, specific provider integrations only once a real partner API exists. |

These three decisions remove the two most expensive/risky parts of the original draft (a parallel payment/commission-splitting system, and a driver-credit-allocation system) from MVP1 scope entirely.

## What Fleet Management is (and isn't) for MVP1–2

- **Is:** a reporting and oversight layer for owners who run multiple vehicles/drivers on Ride — visibility into vehicles, drivers, assignments, trip volume, and gross earnings, plus admin-side approval/compliance tooling.
- **Isn't:** a payment processor, escrow holder, or commission-splitting engine. No money moves through the platform on a fleet owner's behalf. If/when real fare-split payments become a business requirement, that's a distinct, much larger project — not part of this plan.

## Core architecture principles (kept from the draft, all consistent with existing Ride patterns)

1. One auth system, capability-based (`RIDER`, `DRIVER`, `FLEET_OWNER`, plus fleet staff roles) — no separate fleet login.
2. Fleet Management extends existing entities (`users`, `drivers`, `vehicles`, `trips`, documents) via join/relationship tables — never duplicates them.
3. Existing vehicle eligibility (BRTA/category logic) and driver KYC remain authoritative; fleet assignment just gates on their existing approval status.
4. Existing trip/dispatch engine is untouched — fleet vehicles dispatch identically to independent drivers, no special fleet priority in the five-factor scorer for MVP.
5. Everything fleet-owner-facing is scoped server-side to their own fleet; cross-fleet access is a hard authorization boundary, tested explicitly.
6. Mobile UX stays shallow — Dashboard / Operations / Finance / More — with depth pushed into "More".
7. Admin controls all fleet-related rates (fleet management fee, plan limits) via existing `system_config`/`pricing`-style tables — zero hardcoding, consistent with the rest of Ride.

## Data model — MVP1

Reporting-only design means several of the draft's tables collapse or disappear. No table below stores split/commission money fields.

- `fleets` — id, owner_user_id, name, fleet_type (`NATIVE` for MVP1), status, business info, created/updated_at
- `fleet_members` — fleet staff (OWNER/MANAGER/DISPATCHER/ACCOUNTANT/VIEWER), fleet_id, user_id, role, status
- `fleet_vehicles` — join table, fleet_id + vehicle_id, unique constraint, status, joined_at/left_at
- `fleet_drivers` — join table, fleet_id + driver_id, unique constraint, status, joined_at/left_at
- `fleet_vehicle_assignments` — driver↔vehicle history, fleet_id, vehicle_id, driver_id, assigned_at/unassigned_at, assigned_by, reason — append-only, never overwritten
- `fleet_management_plans` — admin-configurable: name, billing period, price, vehicle_limit, driver_limit, features
- `fleet_management_subscriptions` — fleet_id, plan_id, status, current_period_start/end — the platform's fee for using fleet tools, entirely separate from driver call packages
- `fleet_alerts` — fleet_id, type, severity, message, entity_type/id, is_read, resolved_at
- `audit_logs` — reuse if one already exists in the codebase; extend with fleet-scoped actions if not

**No `fleet_trip_records` in MVP1.** Native trips already exist in the `trips` table. Fleet revenue reporting is a read query: trips joined to whichever vehicle/driver was assigned to that fleet at the time of the trip (via `fleet_vehicle_assignments`), aggregated for the dashboard/finance screens. This keeps trip completion's write path completely untouched — no new triggers, no new writes on the hot path.

For dashboard performance, compute `fleet_daily_metrics` (trip_count, gross_revenue, active_vehicle_count, etc.) via a scheduled job or cached-with-TTL query, matching the pattern already used for dispatch weight caching — not a live write-on-trip-complete hook.

## Data model — Deferred (MVP2 / MVP3)

- **MVP2:** `fleet_maintenance_records`, `fleet_documents` (or extend existing document system), driver/vehicle performance views, live fleet map
- **MVP3 (external SaaS):** `fleet_integrations`, `integration_sync_jobs`, external entity mapping tables (`provider`, `external_*_id` with unique constraints), and **only then** `fleet_trip_records` — needed specifically because external trips have no native `trips` row to join against. Build the generic adapter interface (`connect / syncVehicles / syncDrivers / syncTrips / getCapabilities`) before any specific provider. Treat the first integration as mocked in development — don't block the rest of the roadmap on any external platform granting API access, which for Uber/Pathao in Dhaka is not guaranteed.

## Screens — MVP1

Dashboard, Fleet Profile, Vehicle List/Detail, Add Vehicle, Driver List/Detail, Driver↔Vehicle Assignment, Fleet Trips (native only), Fleet Finance (reporting-only, no commission breakdown), Fleet Management Subscription, Alerts. Maintenance, live map, and staff-role management move to MVP2.

## Phased delivery plan

**Phase 0 — Codebase audit (mandatory before any schema is finalized)**
- [ ] Confirm whether the existing auth/user model already supports multiple capabilities per user, or is currently one-role-per-user
- [ ] Locate existing driver, vehicle, trip, document, and dispatch schemas — confirm exact table/column names for the joins above
- [ ] Confirm whether a commission mechanism exists in code today even though it defaults to 0%, and confirm it stays fully decoupled from fleet reporting
- [ ] Confirm `_bdt`/paisa scaling convention for any BDT fields introduced (plan pricing, subscription fees)
- [ ] Confirm existing document-verification system's extensibility for fleet-scoped documents

**Phase 1 — Data model**
- [ ] Migrations for the MVP1 tables above
- [ ] Unique constraints: `(fleet_id, vehicle_id)`, `(fleet_id, driver_id)`, single active assignment per vehicle/driver

**Phase 2 — Authorization**
- [ ] Add `FLEET_OWNER` capability + fleet staff roles to existing role/capability system
- [ ] Fleet-scoped authorization middleware; explicit cross-fleet access tests

**Phase 3 — Native fleet backend**
- [ ] Fleet CRUD, vehicle/driver join endpoints, assignment endpoints with history
- [ ] Read-only fleet revenue/trip reporting queries (joins only, no new writes to trip pipeline)
- [ ] `fleet_daily_metrics` aggregation job or cached query

**Phase 4 — Mobile UX**
- [ ] Fleet onboarding flow (Profile → Become a Fleet Owner → Fleet info → Plan selection → Fleet created)
- [ ] Dashboard, Vehicles, Drivers, Assignment, Trips, Finance, More screens
- [ ] Role switching (Rider/Driver/Fleet Owner) from Profile, no forced logout

**Phase 5 — Fleet management subscription**
- [ ] Admin-configurable plan table, billing cycle, vehicle/driver limits
- [ ] Subscription purchase flow (reuse existing payment rails used for driver call-package purchases where possible)

**Phase 6 — Admin panel**
- [ ] Fleet approval/suspension, plan configuration, fleet list/detail, audit log viewer

**Phase 7 (MVP3, later) — External Fleet SaaS**
- [ ] Generic integration adapter interface
- [ ] Mocked provider for development
- [ ] `fleet_integrations`, sync jobs, external entity mapping, webhook handling with signature validation and idempotency
- [ ] First real integration only once a partner API is actually available

## Assumption flagged for confirmation

I've assumed the Fleet Management fee (Phase 5) is a genuine new platform revenue stream — a subscription an owner pays for fleet tooling itself, distinct from driver call packages, admin-configurable and zero-able like other Ride rates. If that's not the intended monetization (e.g. fleet tools should be free/bundled for now), Phase 5 can be dropped from MVP1 without affecting anything else in this plan.

