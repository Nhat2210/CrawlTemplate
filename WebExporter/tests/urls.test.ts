import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrl,
  privateAddress,
  pagePath,
  relativeUrl,
} from "../packages/core/src/urls.ts";
test("normalization preserves content parameters, removes tracking and deduplicates fragments", () => {
  assert.equal(
    normalizeUrl("https://example.com/a?z=2&utm_source=test&a=1#section"),
    "https://example.com/a?a=1&z=2",
  );
  assert.throws(() => normalizeUrl("file:///etc/passwd"));
  assert.throws(() => normalizeUrl("https://user:secret@example.com"));
});
test("private network guard covers IPv4 and mapped IPv6 loopback", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.31.0.2",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
  ])
    assert.equal(privateAddress(ip), true, ip);
  for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(privateAddress(ip), false, ip);
});
test("page paths avoid traversal and distinguish query-driven pages", () => {
  const entry = "https://example.com/";
  assert.equal(pagePath(entry, entry), "index.html");
  assert.notEqual(
    pagePath(`${entry}products?id=1`, entry),
    pagePath(`${entry}products?id=2`, entry),
  );
  const nested = pagePath(`${entry}about`, entry);
  assert.equal(
    relativeUrl(nested, "assets/image.png"),
    "../../assets/image.png",
  );
  assert.equal(relativeUrl(nested, "index.html"), "../../index.html");
  assert.ok(!pagePath(`${entry}%2e%2e/private`, entry).includes(".."));
});
