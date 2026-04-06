import { describe, it, expect, beforeEach } from '@jest/globals'
import { jest } from '@jest/globals'
import { asyncHandler } from '../../src/utils/asyncHandler.js'

describe('asyncHandler', () => {
  it('passes resolved value when async function succeeds', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const handler = asyncHandler(mockFn)
    const req = {}
    const res = {}
    const next = jest.fn()

    await handler(req, res, next)
    
    expect(mockFn).toHaveBeenCalledWith(req, res, next)
  })

  it('catches and passes errors to next', async () => {
    const error = new Error('Test error')
    const mockFn = jest.fn().mockRejectedValue(error)
    const handler = asyncHandler(mockFn)
    const req = {}
    const res = {}
    const next = jest.fn()

    await handler(req, res, next)
    
    expect(next).toHaveBeenCalledWith(error)
  })
})
