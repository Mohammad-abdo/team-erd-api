import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import supertest from 'supertest'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000'

describe('Backend Test Setup', () => {
  test('Jest configuration is working', () => {
    expect(true).toBe(true)
  })

  test('Environment is configured', () => {
    expect(process.env.NODE_ENV).toBeDefined()
  })
})

export { supertest, BASE_URL }
