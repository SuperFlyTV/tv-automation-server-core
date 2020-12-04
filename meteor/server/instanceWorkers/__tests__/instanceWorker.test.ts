import { worker } from 'cluster'
import { Mongo } from 'meteor/mongo'
import _ from 'underscore'
import { tic, toc, waitTime } from '../../../lib/lib'
import { Worker } from '../instanceWorker'

describe('instanceWorker', () => {
	const jobs = new Mongo.Collection<any>('jobs')
	const tokens = new Mongo.Collection<any>('tokens')

	class MockSystem {
		private studio: number = 0
		private playlist: number = 0
		private rundown: number = 0

		private workers: Worker[] = []

		// public worker: Worker

		// incrementrundown: (studioId: string, rundownId: string) => Promise<number>
		// getWorkerId: (studioId: string) => Promise<string>

		addWorker(debug: boolean) {
			const worker = new Worker({
				jobs: jobs,
				tokens: tokens,
				debug: debug,
			})
			this.workers.push(worker)

			const db = this

			const process = {
				studioCache: 0,
				playlistCache: 0,
				rundownCache: 0,
			}

			return {
				worker,
				incrementrundown: worker.registerMethod(
					// const methodA = worker.registerMethod(
					'incrementrundown',
					(studioId: string, rundownId: string) => {
						return {
							instanceToken: studioId,
							readTokens: [],
							writeTokens: [],
						}
					},
					async function(studioId: string, rundownId: string) {
						// This is the function

						if (this.isExclusive) {
							// no other instance has been using our tokens
							console.log('is isExclusive')
						} else {
							process.studioCache = db.studio || 0
							process.rundownCache = db.rundown || 0
						}

						// Now to the real work:
						process.rundownCache++

						// and finally store it:
						db.rundown = process.rundownCache

						// and return value
						return process.rundownCache
					}
				),
				getWorkerId: worker.registerMethod(
					'getWorkerId',
					(studioId: string) => studioId,
					async function(_studioId: string) {
						return this.workerId as string
					}
				),
			}
		}
		killAllWorkers() {
			this.workers.forEach((worker) => worker.kill())
			this.workers = []
		}
	}

	test('Basic method', async () => {
		const system = new MockSystem()
		const instance0 = system.addWorker(false)
		expect(await instance0.incrementrundown('studio0', 'rundown0')).toBe(1)
		expect(await instance0.incrementrundown('studio0', 'rundown0')).toBe(2)

		// Subsequent calls:
		const p0 = instance0.incrementrundown('studio0', 'rundown0')
		const p1 = instance0.incrementrundown('studio0', 'rundown0')
		const p2 = instance0.incrementrundown('studio0', 'rundown0')
		const p3 = instance0.incrementrundown('studio0', 'rundown0')
		const p4 = instance0.incrementrundown('studio0', 'rundown0')

		expect(await p0).toBe(3)
		expect(await p1).toBe(4)
		expect(await p2).toBe(5)
		expect(await p3).toBe(6)
		expect(await p4).toBe(7)

		system.killAllWorkers()
	})
	test('Execution time', async () => {
		const system = new MockSystem()
		const instance0 = system.addWorker(false)
		tic()
		expect(await instance0.incrementrundown('studio0', 'rundown0')).toBe(1)
		expect(toc()).toBeLessThan(200)

		instance0.worker.debug = false
		tic()
		expect(await instance0.incrementrundown('studio0', 'rundown0')).toBe(2)
		expect(toc()).toBeLessThan(20)

		tic()
		await instance0.getWorkerId('studio0')
		await instance0.getWorkerId('studio0')
		await instance0.getWorkerId('studio0')
		await instance0.getWorkerId('studio0')
		await instance0.getWorkerId('studio0')
		expect(toc()).toBeLessThan(100)

		system.killAllWorkers()
	})

	test('Multiple workers', async () => {
		const system = new MockSystem()
		const instance0 = system.addWorker(false)
		const instance1 = system.addWorker(false)
		const instance2 = system.addWorker(false)
		const instance3 = system.addWorker(false)

		const id0 = await instance0.getWorkerId('studio0')
		const id1 = await instance0.getWorkerId('studio1')
		const id2 = await instance0.getWorkerId('studio2')
		const id3 = await instance0.getWorkerId('studio3')

		const getWorker = (id: string) => {
			return instance0.worker.workerId === id
				? instance0.worker
				: instance1.worker.workerId === id
				? instance1.worker
				: instance2.worker.workerId === id
				? instance2.worker
				: instance3.worker.workerId === id
				? instance3.worker
				: null
		}
		const worker0 = getWorker(id0)
		const worker1 = getWorker(id1)
		const worker2 = getWorker(id2)
		const worker3 = getWorker(id3)

		if (!worker0) throw new Error('nope')

		// expect at least some to be on different workers (due to random, it's not clear where goes where)
		expect(id0 !== id1 || id1 !== id2 || id2 !== id3).toBe(true)

		// Expect it to continue on the same instance
		expect(await instance0.getWorkerId('studio0')).toBe(id0)
		expect(await instance1.getWorkerId('studio0')).toBe(id0)
		expect(await instance2.getWorkerId('studio0')).toBe(id0)
		expect(await instance3.getWorkerId('studio0')).toBe(id0)

		expect(await instance0.getWorkerId('studio1')).toBe(id1)
		expect(await instance1.getWorkerId('studio1')).toBe(id1)
		expect(await instance2.getWorkerId('studio1')).toBe(id1)
		expect(await instance3.getWorkerId('studio1')).toBe(id1)

		expect(await instance0.getWorkerId('studio2')).toBe(id2)
		expect(await instance1.getWorkerId('studio2')).toBe(id2)
		expect(await instance2.getWorkerId('studio2')).toBe(id2)
		expect(await instance3.getWorkerId('studio2')).toBe(id2)

		system.killAllWorkers()
	})
	test('Worker dies', async () => {
		const system = new MockSystem()

		const worker0 = system.addWorker(false)
		const id0 = await worker0.getWorkerId('studio0')

		const worker1 = system.addWorker(false)
		const id1 = await worker1.getWorkerId('studio1')
		const id2 = await worker1.getWorkerId('studio2')
		const id3 = await worker1.getWorkerId('studio3')

		// Simulate worker0 being killed unexpectedly:
		worker0.worker.killInstantly()

		const id4 = await worker1.getWorkerId('studio4')

		// All calls should now run by worker1
		expect(await worker1.getWorkerId('studio0')).toBe(id4)
		expect(await worker1.getWorkerId('studio1')).toBe(id4)
		expect(await worker1.getWorkerId('studio2')).toBe(id4)
		expect(await worker1.getWorkerId('studio3')).toBe(id4)
		expect(await worker1.getWorkerId('studio4')).toBe(id4)

		// Add another worker
		const worker2 = system.addWorker(false)
		const id5 = await worker1.getWorkerId('studio5')
		expect(id5).toBe(worker2.worker.workerId) // Since worker1 is pretty busy, worker2 should have gotten it

		// Simulate worker2 being killed unexpectedly:
		worker2.worker.killInstantly()

		// worker1.worker.debug = true

		// All calls should now run by worker1
		expect(await worker1.getWorkerId('studio5')).toBe(id4)

		system.killAllWorkers()
	})
	test('Random method calls', async () => {
		let r = 748245
		const rand = () => {
			return (r++ / 1.68) % 1 // 0 - 1
		}
		const randPick = <T>(arr: T[]): T => {
			return arr[Math.floor(rand() * (arr.length - 0.0001))]
		}

		const system = new MockSystem()

		const instances: any[] = []
		instances.push(system.addWorker(false))
		instances.push(system.addWorker(false))
		instances.push(system.addWorker(false))
		instances.push(system.addWorker(false))
		instances.push(system.addWorker(false))

		const rundowns: { [id: string]: number } = {}
		rundowns['r0'] = 0
		rundowns['r1'] = 0
		rundowns['r2'] = 0
		rundowns['r3'] = 0
		rundowns['r4'] = 0

		const studios: string[] = ['studio0', 'studio1', 'studio2', 'studio3']

		for (let i = 0; i < 10; i++) {
			const instance = randPick(instances)
			const rundownId = randPick(Object.keys(rundowns))
			const studioId = randPick(studios)

			console.log(i, rundownId, studioId)

			const value = await instance.incrementrundown(studioId, rundownId)

			rundowns[rundownId]++

			try {
				expect(value).toBe(rundowns[rundownId])
			} catch (e) {
				console.log(i, rundownId, studioId)
				throw e
			}
		}

		system.killAllWorkers()
	})
})
