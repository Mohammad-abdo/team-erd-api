import { describe, it, expect } from '@jest/globals'
import { HttpError } from '../../src/utils/httpError.js'

describe('HttpError', () => {
  it('creates error with status and message', () => {
    const error = new HttpError(404, 'Not Found')
    
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Not Found')
    expect(error.name).toBe('HttpError')
  })

  it('defaults to 500 status code', () => {
    const error = new HttpError(500, 'Server Error')
    
    expect(error.status).toBe(500)
    expect(error.message).toBe('Server Error')
  })

  it('handles numeric status and string message', () => {
    const error = new HttpError(400, 'Bad Request')
    
    expect(error.status).toBe(400)
    expect(error.message).toBe('Bad Request')
  })

  it('captures stack trace', () => {
    const error = new HttpError(500, 'Error')
    
    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('HttpError')
  })
})
