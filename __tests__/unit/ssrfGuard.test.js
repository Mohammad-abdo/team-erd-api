import { describe, test, expect } from "@jest/globals";
import {
  isBlockedHostname,
  isPrivateIpAddress,
} from "../../src/lib/ssrfGuard.js";

describe("ssrfGuard", () => {
  test("blocks localhost and private hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("app.local")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("10.0.0.5")).toBe(true);
    expect(isBlockedHostname("192.168.1.10")).toBe(true);
  });

  test("allows public-looking hostnames", () => {
    expect(isBlockedHostname("db.example.com")).toBe(false);
    expect(isBlockedHostname("8.8.8.8")).toBe(false);
  });

  test("detects private IPv4 and IPv6", () => {
    expect(isPrivateIpAddress("10.1.2.3")).toBe(true);
    expect(isPrivateIpAddress("172.16.0.1")).toBe(true);
    expect(isPrivateIpAddress("::1")).toBe(true);
    expect(isPrivateIpAddress("8.8.4.4")).toBe(false);
  });
});
