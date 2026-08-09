import { once } from 'node:events'
import { connect } from 'node:net'

import {
  createProcessEpochLease,
  observeProcessEpoch,
  type ProcessEpochLease
} from '../../../../src/contexts/run/infrastructure/provider/ProcessEpochLiveness'

describe('process epoch liveness', () => {
  const leases: ProcessEpochLease[] = []

  afterEach(async () => {
    await Promise.all(leases.splice(0).map((lease) => lease.close()))
  })

  it('distinguishes an active lease from a closed lease in the same process', async () => {
    const lease = await createLease()

    await expect(observeProcessEpoch(lease.reference)).resolves.toBe('alive')
    await lease.close()
    await expect(observeProcessEpoch(lease.reference)).resolves.toBe('dead')
  })

  it('ignores additional client frames after completing the first probe', async () => {
    const lease = await createLease()
    const socket = connect(lease.reference.endpoint)
    socket.on('error', () => undefined)
    await once(socket, 'connect')
    socket.write('invalid-lease\n')
    await once(socket, 'data')
    socket.write('second-invalid-lease\n')
    await new Promise<void>((resolve) => setImmediate(resolve))
    socket.destroy()

    await expect(observeProcessEpoch(lease.reference)).resolves.toBe('alive')
  })

  async function createLease(): Promise<ProcessEpochLease> {
    const lease = await createProcessEpochLease()
    leases.push(lease)
    return lease
  }
})
