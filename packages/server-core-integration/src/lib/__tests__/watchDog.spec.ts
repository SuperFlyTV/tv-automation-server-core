import { WatchDog } from '../watchDog'

let setTimeoutOrg = setTimeout
let delay = (time: any) => {
	return new Promise((resolve) => {
		setTimeoutOrg(resolve, time)
	})
}

describe('watchDog', () => {
	let coreIsHappy: any
	let coreReplies: any
	let watchDog: WatchDog
	let checkFcn = jest.fn(() => {
		// mock that we're sending the message to Core
		// console.log('checkFcn')
		// Core replies with message
		// we receive the message and send that back into watchDog:

		return new Promise((resolver, reject) => {
			if (coreIsHappy) resolver()
			else if (coreReplies) reject()
		})
	})
	let exitFcn = jest.fn(() => {
		// console.log('exit')
	})
	let timeout = 10000

	beforeEach(() => {
		jest.useFakeTimers()
		checkFcn.mockClear()
		exitFcn.mockClear()

		coreIsHappy = true
		coreReplies = true

		watchDog = new WatchDog(timeout)
		watchDog.on('exit', exitFcn)
		watchDog.on('message', () => { return })
		watchDog.addCheck(checkFcn)

	})
	afterEach(() => {
		watchDog.removeCheck(checkFcn)

		jest.useRealTimers()
	})

	test('good reply', async () => {
		coreIsHappy = true
		watchDog.startWatching()

		jest.advanceTimersByTime(1000) // 1000
		await delay(1) // allow for promises to be resolved
		expect(checkFcn).toHaveBeenCalledTimes(0)

		jest.advanceTimersByTime(timeout)
		await delay(1) // allow for promises to be resolved

		expect(checkFcn).toHaveBeenCalledTimes(1)
		expect(exitFcn).toHaveBeenCalledTimes(0)

		jest.advanceTimersByTime(timeout)
		await delay(1) // allow for promises to be resolved
		expect(checkFcn).toHaveBeenCalledTimes(2)
		expect(exitFcn).toHaveBeenCalledTimes(0)

	})
	test('bad reply', async () => {
		coreIsHappy = false
		watchDog.startWatching()

		jest.advanceTimersByTime(timeout)
		await delay(1) // allow for promises to be resolved

		expect(checkFcn).toHaveBeenCalledTimes(1)
		expect(exitFcn).toHaveBeenCalledTimes(0)

		jest.advanceTimersByTime(10000)
		await delay(1) // allow for promises to be resolved

		expect(exitFcn).toHaveBeenCalledTimes(1)

	})
	test('no reply', async () => {
		coreIsHappy = false
		coreReplies = false // will cause the promise not to be resolved at all
		watchDog.startWatching()

		jest.advanceTimersByTime(timeout)
		await delay(1) // allow for promises to be resolved

		expect(checkFcn).toHaveBeenCalledTimes(1)
		expect(exitFcn).toHaveBeenCalledTimes(0)

		jest.advanceTimersByTime(10000)
		await delay(1) // allow for promises to be resolved

		expect(exitFcn).toHaveBeenCalledTimes(1)

	})
})
