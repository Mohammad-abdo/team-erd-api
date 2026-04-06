import { describe, it, expect } from '@jest/globals'
import { slugify } from '../../src/utils/slug.js'

describe('slugify', () => {
  it('converts text to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Hello@World!')).toBe('helloworld')
  })

  it('handles multiple spaces and underscores', () => {
    expect(slugify('hello   world_test')).toBe('hello-world-test')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello')
  })

  it('returns "project" for null or undefined', () => {
    expect(slugify(null)).toBe('project')
    expect(slugify(undefined)).toBe('project')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('project')
  })

  it('handles numbers as input', () => {
    expect(slugify(123)).toBe('123')
  })

  it('trims whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world')
  })

  it('handles single word', () => {
    expect(slugify('hello')).toBe('hello')
  })
})
