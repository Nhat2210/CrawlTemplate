import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "./config.ts";
export function normalizeUrl(input: string, base?: string): string {
  const u = new URL(input, base);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.href;
}
export function privateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.includes(":")) {
    if (ip.startsWith("::ffff:")) {
      const tail = ip.slice(7);
      if (net.isIP(tail) === 4) return privateAddress(tail);
      const words = tail.split(":");
      if (words.length === 2) {
        const n = parseInt(words[0], 16) * 65536 + parseInt(words[1], 16);
        return privateAddress(
          `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`,
        );
      }
    }
    // Only globally routed unicast IPv6; excludes loopback, ULA and link-local.
    return !/^[23][0-9a-f]{3}:/.test(ip) || ip.startsWith("2001:db8:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function assertPublic(input: string): Promise<string> {
  const url = normalizeUrl(input);
  if (config.allowPrivate) return url;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  )
    throw new Error("Private-network URLs are disabled.");
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw new Error("Private-network URLs are disabled.");
  return url;
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);
export function pagePath(url: string, entry: string): string {
  if (normalizeUrl(url) === normalizeUrl(entry)) return "index.html";
  const slug =
    new URL(url).pathname
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "page";
  return `pages/${slug}-${digest(url)}/index.html`;
}
export function relativeUrl(fromFile: string, toFile: string): string {
  const value = path.posix.relative(path.posix.dirname(fromFile), toFile);
  return value.startsWith(".") ? value : `./${value}`;
}
export const tracker = (url: string) =>
  /(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|connect\.facebook\.net|hotjar\.com|clarity\.ms|plausible\.io|segment\.(?:com|io))(?:[/:]|$)/i.test(
    url,
  );
