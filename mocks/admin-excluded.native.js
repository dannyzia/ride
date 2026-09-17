// mocks/admin-excluded.native.js — P3.1 native exclusion stub.
//
// Metro resolveRequest (metro.config.js) redirects any resolution of a
// module under app/admin/** or components/admin/** to THIS file on native
// platforms. Admin is a web-only surface (AGENTS.md): on web the real
// modules resolve normally (Render deploy untouched); on native nothing
// under admin/ may enter the bundle graph — a real admin module reaching
// this stub means a new import path leaked, and this stub's runtime throw
// surfaces it loudly instead of silently shrinking the graph.
//
// Keep in sync with docs/size-audit.md §7.3 item 1 and the ADMIN_BLOCKLIST
// in scripts/check-web-imports.js (if that list ever adds admin paths).
import React from 'react';
import { View, Text } from 'react-native';

export default function AdminExcludedStub() {
  if (__DEV__) {
    throw new Error(
      '[admin-excluded] An app/admin/** or components/admin/** module was resolved into the NATIVE bundle graph. ' +
        'Admin is web-only: fix the import site, or if a shared helper must serve both, move it out of components/admin/.'
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Admin is available on web only.</Text>
    </View>
  );
}
