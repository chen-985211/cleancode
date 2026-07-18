import {
  applyServicePortBinding,
  validateServicePortIntent
} from '../../../../src/contexts/run/domain/value-objects/ServicePortIntent'

describe('service port intent', () => {
  it('accepts fixed, preferred, and auto policies only with compatible bindings', () => {
    expect(
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'fixed', port: 3_000 },
        binding: { type: 'none' }
      })
    ).toMatchObject({ policy: { type: 'fixed', port: 3_000 } })
    expect(
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'preferred', port: 3_000 },
        binding: { type: 'environment', variableName: 'PORT' }
      })
    ).toMatchObject({ binding: { type: 'environment', variableName: 'PORT' } })
    expect(
      validateServicePortIntent({
        protocol: 'tcp',
        policy: { type: 'auto' },
        binding: { type: 'argument', template: '-- --port {port}' }
      })
    ).toMatchObject({ policy: { type: 'auto' } })

    expect(() =>
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'auto' },
        binding: { type: 'none' }
      })
    ).toThrow('Dynamic port policies require an explicit port binding.')
  })

  it('rejects reserved environment names and unsafe shell argument templates', () => {
    expect(() =>
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'preferred', port: 3_000 },
        binding: { type: 'environment', variableName: 'CLEANCODE_INTERNAL_PORT' }
      })
    ).toThrow('Port environment variable is reserved.')
    expect(() =>
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'auto' },
        binding: { type: 'argument', template: '--port {port}; curl example.com' }
      })
    ).toThrow('Port argument template contains unsafe shell syntax.')
    expect(() =>
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'auto' },
        binding: { type: 'argument', template: '--port {port} {port}' }
      })
    ).toThrow('Port argument template must contain exactly one {port} placeholder.')
  })

  it.each([
    ['line feed', '--port {port}\n--host=127.0.0.1'],
    ['carriage return', '--port {port}\r--host=127.0.0.1'],
    ['NUL', '--port {port}\0--host=127.0.0.1']
  ])('rejects an argument template containing %s', (_name, template) => {
    expect(() =>
      validateServicePortIntent({
        protocol: 'http',
        policy: { type: 'auto' },
        binding: { type: 'argument', template }
      })
    ).toThrow('Port argument template contains unsafe shell syntax.')
  })

  it('applies environment and safe argument bindings without mutating the source command', () => {
    const environmentBound = applyServicePortBinding({
      launchCommand: 'pnpm dev',
      environment: { NODE_ENV: 'development' },
      port: 41_234,
      binding: { type: 'environment', variableName: 'PORT' }
    })
    const argumentBound = applyServicePortBinding({
      launchCommand: 'pnpm dev',
      environment: undefined,
      port: 41_235,
      binding: { type: 'argument', template: '-- --port={port}' }
    })

    expect(environmentBound).toEqual({
      launchCommand: 'pnpm dev',
      environment: { NODE_ENV: 'development', PORT: '41234' }
    })
    expect(argumentBound).toEqual({
      launchCommand: 'pnpm dev -- --port=41235',
      environment: undefined
    })
  })
})
