import { describe, it, expect } from '@jest/globals'
import { durationToMs } from '../../src/utils/time.js'

describe('durationToMs', () => {
  it('parses milliseconds (ms)', () => {
    expect(durationToMs('100ms')).toBe(100)
    expect(durationToMs('500ms')).toBe(500)
  })

  it('parses seconds (s)', () => {
    expect(durationToMs('30s')).toBe(30000)
    expect(durationToMs('1s')).toBe(1000)
  })

  it('parses minutes (m)', () => {
    expect(durationToMs('5m')).toBe(300000)
    expect(durationToMs('1m')).toBe(60000)
  })

  it('parses hours (h)', () => {
    expect(durationToMs('2h')).toBe(7200000)
    expect(durationToMs('1h')).toBe(3600000)
  })

  it('parses days (d)', () => {
    expect(durationToMs('7d')).toBe(604800000)
    expect(durationToMs('1d')).toBe(86400000)
  })

  it('parses weeks (w)', () => {
    expect(durationToMs('2w')).toBe(1209600000)
    expect(durationToMs('1w')).toBe(604800000)
  })

  it('returns default (7 days) for invalid input', () => {
    expect(durationToMs('invalid')).toBe(7 * 24 * 60 * 60 * 1000)
    expect(durationToMs('')).toBe(7 * 24 * 60 * 60 * 1000)
    expect(durationToMs(null)).toBe(7 * 24 * 60 * 60 * 1000)
    expect(durationToMs(undefined)).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('handles whitespace', () => {
    expect(durationToMs('  30s  ')).toBe(30000)
  })

  it('is case insensitive', () => {
    expect(durationToMs('30S')).toBe(30000)
    expect(durationToMs('30M')).toBe(1800000)
    expect(durationToMs('30H')).toBe(108000000)
  })

  it('handles large numbers', () => {
    expect(durationToMs('1000s')).toBe(1000000)
    expect(durationToMs('24h')).toBe(86400000)
  })
})
