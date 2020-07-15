import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'
import { getCurrentTime, waitTime, waitForPromiseAll } from '../lib/lib'
import { Context } from '@popperjs/core'
import * as crypto from 'crypto'
import { Random } from 'meteor/random'

interface WorkFlowOptions {
	id: string
}
interface StepOptionsBase {
	id?: string
	tags?: string[]
}
interface StepOptionsNormal extends StepOptionsBase {
	continueOnThrow?: boolean
}
interface StepOptionsLast extends StepOptionsBase {}
interface StepOptionsSkippable extends StepOptionsNormal {
	skip: {
		isAfter?: string
		isBefore?: string
	}[]
	continueOnThrow?: boolean
}
type StepOptions = Partial<StepOptionsNormal & StepOptionsLast & StepOptionsSkippable>
// interface InnerContextBase {
// 	gotoStep: (stepId: string) => void
// }
// interface InnerContextBase {
// 	gotoStep: (stepId: string) => void
// }
export function createWorkFlow<Context, Arguments, InnerContext, ReturnValue>(
	runner: WorkFlowRunner,
	options: WorkFlowOptions
) {
	return new WorkFlow<Context, Arguments, InnerContext, ReturnValue>(runner, options)
}
type StepFunction<Context, Arguments, InnerContext> = (
	innerContext: InnerContext,
	context: Context,
	args: Arguments
) => Promise<InnerContext>
type LastStepFunction<Context, Arguments, InnerContext, ReturnValue> = (
	innerContext: InnerContext,
	context: Context,
	args: Arguments
) => Promise<ReturnValue>
interface WorkFlowStep<Context, Arguments, InnerContext> {
	options: StepOptions
	fcn: StepFunction<Context, Arguments, InnerContext>
	hasReturnValue: boolean
	index: number
}
// interface WorkFlowStepStep<Context, Arguments, InnerContext> {
// 	options: StepOptionsNormal
// 	fcn: StepFunction<Context, Arguments, InnerContext>
// 	hasReturnValue: boolean
// }
interface IWorkFlow<Context, Arguments, InnerContext, ReturnValue> {
	step: (
		options: StepOptionsNormal,
		fcn: StepFunction<Context, Arguments, InnerContext>
	) => IWorkFlow<Context, Arguments, InnerContext, ReturnValue>
	lastStep: (
		options: StepOptionsNormal,
		fcn: LastStepFunction<Context, Arguments, InnerContext, ReturnValue>
	) => IWorkFlow<Context, Arguments, InnerContext, ReturnValue>
	register: () => IWorkFlow<Context, Arguments, InnerContext, ReturnValue>

	call: (context: Context, args: Arguments) => Promise<ReturnValue>
}
type FirstStepFunction<Context, Arguments> = StepFunction<Context, Arguments, undefined>
interface WorkFlowStepFirst<Context, Arguments, InnerContext> {
	options: StepOptionsNormal
	fcn: FirstStepFunction<Context, Arguments>
}
interface IWorkFlowFirst<Context, Arguments, InnerContext, ReturnValue>
	extends Omit<IWorkFlow<Context, Arguments, InnerContext, ReturnValue>, 'step'> {
	step: (
		options: StepOptionsNormal,
		fcn: FirstStepFunction<Context, Arguments>
	) => IWorkFlow<Context, Arguments, InnerContext, ReturnValue>
}
class WorkFlow<Context, Arguments, InnerContext, ReturnValue>
	implements IWorkFlow<Context, Arguments, InnerContext, ReturnValue> {
	public steps: WorkFlowStep<Context, Arguments, InnerContext>[] = []
	private lastStepHasBeenSetup: boolean = false
	private lastStepType: 'normal' | 'skippable' | 'last'
	private stepIds: { [stepId: string]: true } = {}
	constructor(private runner: WorkFlowRunner, private _options: WorkFlowOptions) {}
	step(options: StepOptionsNormal, fcn: StepFunction<Context, Arguments, InnerContext>) {
		if (this.lastStepType === 'last') throw new Error(`WorkFlow.step can't be called after WorkFlow.lastStep!`)
		this.lastStepType = 'normal'
		return this._step(options, fcn, false)
	}
	skippableStep(options: StepOptionsSkippable, fcn: StepFunction<Context, Arguments, InnerContext>) {
		if (this.lastStepType === 'last')
			throw new Error(`WorkFlow.skippableStep can't be called after WorkFlow.lastStep!`)
		this.lastStepType = 'skippable'
		return this._step(options, fcn, false)
	}
	lastStep(options: StepOptionsLast, fcn: LastStepFunction<Context, Arguments, InnerContext, ReturnValue>) {
		if (this.lastStepType === 'last') throw new Error(`WorkFlow.lastStep can only be called once`)
		this.lastStepType = 'last'
		return this._step(options, fcn, true)
	}
	register() {
		if (this.lastStepType !== 'last' && this.lastStepType !== 'skippable')
			throw new Error(`WorkFlow.lastStep or WorkFlow.skippableStep must be called last`)
		// Register

		this.runner.registerWorkFlow(this)

		return this
	}
	call(context: Context, args: Arguments): Promise<ReturnValue> {
		return this.runner.callWorkFlow(this, context, args)
	}
	get id() {
		return this._options.id
	}

	private _step(options: StepOptionsNormal, fcn: any, hasReturnValue: boolean) {
		if (options.id) {
			if (this.stepIds[options.id]) {
				throw new Error(`Error: Step id:s must be unique within a workflow ("${options.id}")`)
			}
			this.stepIds[options.id] = true
		}
		this.steps.push({
			options,
			fcn,
			hasReturnValue,
			index: this.steps.length,
		})
		return this
	}
	public getStep(index: number): WorkFlowStep<Context, Arguments, InnerContext> {
		const step = this.steps[index]
		if (!step) throw new Error(`Error: getStep didn't find a step for ${index} in "${this.id}"`)
		return step
	}
	public getFirstStep(): WorkFlowStepFirst<Context, Arguments, InnerContext> {
		// @ts-ignore first step is a little different
		return this.steps[0]
	}
	// public getNextWorkStep (previousWorkStepContext: WorkStepContext | null): WorkStepContext {

	// 	if (previousWorkStepContext === null) {
	// 		const nextStep = this._getFirstStep()

	// 		return {
	// 			doStep: () => {

	// 				nextStep.fcn(undefined, )
	// 			}
	// 		}
	// 	}

	// }
}
interface JobQueue {
	workFlow: WorkFlow<any, any, any, any>
	jobId: string
	args: any
	hasStarted: boolean
	started: () => void
	finished: (error: any, result: any) => void
}
class WorkFlowContextWorker<Context> {
	private jobQueue: JobQueue[] = []
	private innerContext: any
	private currentStep: WorkFlowStep<any, any, any> | null = null
	private working: boolean = false
	public debug: boolean = false

	constructor(private context: Context) {
		this.reset()
	}
	private reset() {
		this.currentStep = null
		this.innerContext = undefined
	}
	public isWorkingOnJob(jobId: string) {
		for (const job of this.jobQueue) {
			if (job.jobId === jobId) return true
		}
		return false
	}
	public addJob(
		workFlow: WorkFlow<any, any, any, any>,
		jobId: string,
		args: any,
		callbackStarted: () => void,
		callbackFinished: (error: any, result: any) => void
	) {
		this.jobQueue.push({
			workFlow,
			jobId,
			args,
			hasStarted: false,
			started: callbackStarted,
			finished: callbackFinished,
		})
		this.startWorking().catch(console.error)
	}
	public async startWorking(): Promise<void> {
		if (this.working) return
		this.working = true
		let continueWorking = true
		while (continueWorking) {
			continueWorking = await this.doNextStep()
		}
	}
	private shouldSkipStep(
		previousStep: WorkFlowStep<any, any, any> | null,
		currentStep: WorkFlowStep<any, any, any>,
		nextStep: WorkFlowStep<any, any, any> | null
	): boolean {
		let shouldSkip: boolean = false
		if (currentStep.options.skip) {
			for (const skip of currentStep.options.skip) {
				const skipIsAfter = !!(skip.isAfter && (previousStep?.options.tags || []).includes(skip.isAfter))
				const skipIsBefore = !!(skip.isBefore && (nextStep?.options.tags || []).includes(skip.isBefore))

				if (skip.isAfter && skip.isBefore) {
					shouldSkip = skipIsAfter && skipIsBefore
				} else if (skip.isAfter) {
					shouldSkip = skipIsAfter
				} else if (skip.isBefore) {
					shouldSkip = skipIsBefore
				}
				if (shouldSkip) break
			}
		}
		return shouldSkip
	}
	public async doNextStep(): Promise<boolean> {
		if (!this.jobQueue[0]) {
			// No more jobs to do, we're done
			return false
		}
		// Determine which is the next step:

		const previousStep = this.currentStep
		this.currentStep = null

		let currentStep: { step: WorkFlowStep<any, any, any>; jobIndex: number } | null = null
		let nextStep: { step: WorkFlowStep<any, any, any>; jobIndex: number } | null = null

		let stepIndex = previousStep ? previousStep.index + 1 : 0
		this.debugLog('  doNextStep...  ', stepIndex)
		let searchJobIndex = 0
		let searchJob: JobQueue | undefined = this.jobQueue[searchJobIndex]
		while (searchJob) {
			this.debugLog('    search...')
			if (!searchJob.workFlow.steps.length) {
				// There are no steps in that workflow
				throw new Error(`WorkFlow "${searchJob.workFlow.id}" has no steps!`)
			}

			if (stepIndex >= searchJob.workFlow.steps.length) {
				// No step found in current job, move into the next job:
				stepIndex -= searchJob.workFlow.steps.length
				if (stepIndex < 0) {
					throw new Error(`Error: stepIndex < 0`)
				}
				searchJobIndex++
				searchJob = this.jobQueue[searchJobIndex]
				if (!searchJob) break
			}
			this.debugLog('    job:', searchJobIndex)
			// A step is found:
			const step = searchJob.workFlow.getStep(stepIndex)
			this.debugLog('    step:', step.index)
			if (!currentStep) {
				currentStep = { step, jobIndex: searchJobIndex }
			} else {
				nextStep = { step, jobIndex: searchJobIndex }
			}

			if (currentStep && nextStep) {
				if (this.shouldSkipStep(previousStep, currentStep.step, nextStep.step)) {
					// Skip the current step
					this.debugLog('    SKIPPING:', currentStep.step.index)

					if (nextStep.jobIndex !== currentStep.jobIndex) {
						// By skipping this step, we're moving into the next job:
						// stepIndex = -1 // will later be incremented to 0
						// searchJobIndex++
					}
					// The next step is now the currentStep:
					currentStep = nextStep
					nextStep = null
				}
			}
			if (currentStep && nextStep) {
				this.debugLog('    selecting:', currentStep.jobIndex + '-' + currentStep.step.index)
				break
			}
			stepIndex++
		}
		if (currentStep && !nextStep) {
			// Do a final check, in the case of it being the last step:
			if (this.shouldSkipStep(previousStep, currentStep.step, null)) {
				// Skip the current step:
				this.debugLog('    skipping last:', currentStep.step.index)
				currentStep = null
			}
		}
		// Tie off any finished (or finished-by-skipping-last-step) jobs:
		while (this.jobQueue.length > 1) {
			// save the last one for later
			if (currentStep && currentStep?.jobIndex === 0) {
				break
			}
			const job = this.jobQueue.shift() as JobQueue
			// Since the job was completed by skipping the last step, return value is undefined
			job.finished(undefined, undefined)
			if (currentStep) currentStep.jobIndex--
		}

		this.currentStep = currentStep?.step || null
		const currentJob = this.jobQueue[0]
		if (!currentJob) throw new Error(`Error: currentJob is undefined`)
		// Work on the next step:
		if (!this.currentStep) {
			// There is no step to run
			this.debugLog('  no current step')

			if (previousStep) {
				// There are no more steps to run, that means that the job is done
				const returnValue = this.innerContext
				currentJob.finished(undefined, previousStep.hasReturnValue ? returnValue : undefined)
			} else {
				// TODO: handle better?
				// throw and exit the job:
				currentJob.finished(new Error(`No next Step`), undefined)
			}
			// Clear the job and continue with the next job:
			this.jobQueue.shift()
			this.reset()
		} else {
			this.debugLog('  current step:', this.currentStep.index)
			if (!currentJob.hasStarted) {
				currentJob.hasStarted = true
				currentJob.started()
			}
			try {
				this.innerContext = await this.currentStep.fcn(this.innerContext, this.context, currentJob.args)
			} catch (e) {
				if (this.currentStep.options.continueOnThrow) {
					// TODO: log the error somewhere?
				} else {
					// throw and exit the job:
					currentJob.finished(e, null)
					this.jobQueue.shift()
					this.reset()
					return true
				}
			}
		}

		return true
	}
	private debugLog(...args) {
		if (this.debug) console.log('Debug: ', ...args)
	}
}
interface WorkStepContext {
	doStep: () => Promise<any>
}

interface WorkFlowRunnerOptions {
	collections: {
		runners: Mongo.Collection<DBRunner>
		jobs: Mongo.Collection<DBJob>
		common: Mongo.Collection<any>
	}
	/** Unique id */
	id: string
	tags: string[]
	// acceptWorkFlow: (context: any) => boolean
}
interface DBRunner {
	_id: string
	lastSeen: number
	sessionId: string
	primaryContexts: { [contextHash: string]: true }
}
interface DBJob {
	_id: string
	workFlowId: string
	context: any
	arguments: any

	/** With Runner requested the job */
	requestRunnerId: string
	/** With Runner is currently running this workflow */
	workRunnerId: string | null

	status: DBJobStatus
	/** The resulting result (or error) */
	result?: any

	/** The time of which the job was created */
	createTime: number
	/** The time of which the job is picked up by a runner */
	queueTime?: number
	/** The time of which the job is started working on */
	startTime?: number
	/** The time of which the job is finished */
	endTime?: number

	/** Duration between creation & picked up */
	pickupDuration?: number
	/** Duration between picked up & started working */
	inQueueDuration?: number
	/** Duration between started working & finish */
	workDuration?: number
}
interface DBJobInit extends DBJob {
	status: DBJobStatus.INIT
	workRunnerId: null
	createTime: number
}
interface DBJobQueued extends DBJob {
	status: DBJobStatus.PICKED_UP
	workRunnerId: string
	queueTime: number
	pickupDuration: number
}
interface DBJobStarted extends DBJobQueued {
	startTime: number
	inQueueDuration: number
}
interface DBJobFinished extends Omit<DBJobStarted, 'status'> {
	status: DBJobStatus.RESOLVED | DBJobStatus.REJECTED
	result: any

	endTime: number
	workDuration: number
}
enum DBJobStatus {
	// Job is registered in db
	INIT = 0,
	// Job has been picked up by a runner and is being worked on (or is queued)
	PICKED_UP = 1,
	// Job has finished as resolved
	RESOLVED = 10,
	// Job has finished as rejected
	REJECTED = 20,
}
export class WorkFlowRunner {
	public debug: boolean = false

	private registeredWorkFlows: { [workFlowId: string]: WorkFlow<any, any, any, any> } = {}

	/** Time after which a runner is considered dead */
	private RUNNER_TIMEOUT = 5000
	private CRONJOB_INTERVAL = 60 * 1000
	/** Contains the jobs this runner has started that are currently running */
	private pendingJobs: {
		[jobId: string]: { job: DBJob; finish: (job: DBJob, error: string | null, result: any) => void }
	} = {}

	private currentJob: DBJobStarted | null = null
	private _cronjob: number = 0
	/** The contexts I consider to be my primary for */
	private _primaryContexts: { [contextHash: string]: true } = {}
	private _sessionId: string
	private _dbRunner: DBRunner
	private _finishedJobs: DBJobFinished[] = []
	// private workingJobs: { [instanceId: string]: { job: DBJob; } } = {}

	private contextWorkers: { [contextHash: string]: WorkFlowContextWorker<any> } = {}

	constructor(private options: WorkFlowRunnerOptions) {}
	debugLog(...args) {
		if (this.debug) console.log('Debug: ', ...args)
	}
	register() {
		if (this._sessionId) throw new Error(`.register() can only be called once!`)
		this._sessionId = Random.id()
		this.debugLog(`Registering Runner "${this.id}"`)

		// Run a cronjob first, to clear out any old ones
		this.onCronjob(true)

		const runner: DBRunner = {
			_id: this.id,
			primaryContexts: this._primaryContexts,
			sessionId: this._sessionId,
			lastSeen: getCurrentTime(),
		}
		const existingRunner = this.options.collections.runners.findOne(runner._id)
		if (existingRunner)
			throw new Error(
				`Can't register runner ${runner._id}, because it already exists in db. Close down the other one first.`
			)
		this.options.collections.runners.insert(runner)

		this._cronjob = Meteor.setInterval(() => {
			this.onCronjob()
		}, 60 * 1000)

		// Subscribe to my own requested jobs:
		this.options.collections.jobs
			.find({
				requestRunnerId: this.id,
			})
			.observe({
				// added: (doc: DBJob) => {},
				changed: (doc: DBJob) => {
					this.debugLog(`Observe: own requested job changed: "${doc._id}"`)
					const pendingJob = this.pendingJobs[doc._id]
					if (pendingJob) {
						if (doc.status === DBJobStatus.RESOLVED) {
							pendingJob.finish(doc, null, doc.result)
							delete this.pendingJobs[doc._id]
							this._actionClearJob(doc._id)
						} else if (doc.status === DBJobStatus.REJECTED) {
							pendingJob.finish(doc, doc.result, null)
							delete this.pendingJobs[doc._id]
							this._actionClearJob(doc._id)
						}
					}
				},
				removed: (doc: DBJob) => {
					this.debugLog(`Observe: own requested job removed: "${doc._id}"`)
					const pendingJob = this.pendingJobs[doc._id]
					if (pendingJob) {
						pendingJob.finish(doc, `Error: Job was removed from DB`, null)
						delete this.pendingJobs[doc._id]
					}
				},
			})
		// Subscribe to jobs directly assigned to me:
		this.options.collections.jobs
			.find({
				status: DBJobStatus.PICKED_UP,
				workRunnerId: this.id,
			})
			.observe({
				added: (newJob: DBJobQueued) => {
					this.debugLog(`Observe: assigned job added: "${newJob._id}"`)

					if (newJob.workFlowId === '__ping') {
						// Special: reply on pings right away
						this.debugLog(`Replying to ping`)
						this._actionResolveJob(newJob, 'pong')
					} else {
						// Check if the job is already added:
						if (!this.isJobPickedUp(newJob._id)) {
							// Start processing the job:
							this.workOnJob({
								...newJob,
								queueTime: getCurrentTime(),
							})
						} else {
							this.debugLog(`Observe: assigned job already picked up: "${newJob._id}"`)
						}
					}
				},
			})

		// Subscribe to new jobs:
		this.options.collections.jobs
			.find({
				status: DBJobStatus.INIT,
			})
			.observe({
				added: (newJob: DBJobInit) => {
					this.debugLog(`Observe: new job added: "${newJob._id}"`)
					// Check if the job is already added:
					if (!this.isJobPickedUp(newJob._id)) {
						// Can I pick up this job?
						const workFlow = this.registeredWorkFlows[newJob.workFlowId]
						if (workFlow) {
							// The load-balancing depends on the "response-time" of the runners,
							// ie the first one to pick up a job gets it.
							const responseTime = this.getResponseTime(newJob.context)
							this.debugLog(`About to try to pick up "${newJob._id}"... (in ${responseTime} ms)`)
							waitTime(responseTime)

							const queueTime = getCurrentTime()
							const pickedUpJob: DBJobQueued = {
								...newJob,
								workRunnerId: this.id,
								status: DBJobStatus.PICKED_UP,
								queueTime: queueTime,
								pickupDuration: queueTime - newJob.createTime,
							}
							const jobWasPickedUp = this._actionTryToPickUpJob(pickedUpJob)
							if (jobWasPickedUp) {
								// success, the job was picked up by me

								// Start processing the job:
								this.workOnJob(pickedUpJob)
							}
						} else {
							this.debugLog(`new job added: Workflow ${newJob.workFlowId} not supported`)
						}
					}
				},
			})
	}
	destroy() {
		if (this._cronjob) Meteor.clearInterval(this._cronjob)
	}
	get id() {
		return this.options.id
	}
	public callWorkFlow(workFlow: WorkFlow<any, any, any, any>, context: any, args: any): Promise<any> {
		if (!this._sessionId) throw new Error(`WorkFlowRunner.register() must be called before starting to use it.`)
		return this._callWorkFlow(workFlow.id, context, args)
	}
	public registerWorkFlow(workFlow: WorkFlow<any, any, any, any>) {
		if (this.registeredWorkFlows[workFlow.id]) throw new Error(`WorkFlow "${workFlow.id}" already registered!`)
		this.registeredWorkFlows[workFlow.id] = workFlow
	}
	private onCronjob(force: boolean = false) {
		interface Cronjob {
			lastDone: number
		}
		this.debugLog('onCronJob running...')
		let cronJob = this.options.collections.common.findOne('cronjob') as Cronjob | undefined
		const lastDone = cronJob?.lastDone || 0
		if (force || getCurrentTime() - lastDone > this.CRONJOB_INTERVAL) {
			// It's time to do the cronjob:
			cronJob = {
				lastDone: getCurrentTime(),
			}
			this.options.collections.common.upsert('cronjob', cronJob)

			// Remove old runners
			const ps: Promise<any>[] = []
			this.options.collections.runners
				.find({
					$or: [
						{
							lastSeen: { $lt: getCurrentTime() - this.CRONJOB_INTERVAL },
						},
						{
							_id: this.id,
						},
					],
				})
				.forEach((runner) => {
					ps.push(
						this._actionPingRunner(runner._id).catch((e) => {
							if (e.toString().match(/timeout/i)) {
								this._actionUnregisterRunner(runner._id)
							}
						})
					)
				})
			// Remove old jobs
			this.options.collections.jobs.remove({
				status: { $in: [DBJobStatus.REJECTED, DBJobStatus.RESOLVED] },
				endTime: { $lt: getCurrentTime() - this.CRONJOB_INTERVAL },
			})

			waitForPromiseAll(ps)
		}
		this.debugLog('onCronJob done...')
	}
	private getContextHash(context: Context) {
		return crypto
			.createHash('md5')
			.update(JSON.stringify(context))
			.digest('hex')
	}
	private getResponseTime(context: Context): number {
		// The responseTime is everything

		const hash = this.getContextHash(context)

		const iAmPrimary = !!this._primaryContexts[hash]

		if (iAmPrimary) {
			return 0
		} else {
			// calculate responseTime
			let responseTime = 0

			// Make response-time slower if having a great responsibility (many primary contexts):
			responseTime += Object.keys(this._primaryContexts).length * 10

			// Make response-time slower if having been under heavy load recently:
			const recentDuration = 10 * 1000 // 10s
			const recent = getCurrentTime() - recentDuration
			const recentlyFinishedJobs = this._finishedJobs.filter((j) => j.endTime > recent)
			if (recentlyFinishedJobs.length) {
				let totalDuration = recentlyFinishedJobs.reduce((mem, j) => mem + j.workDuration, 0)
				if (this.currentJob) {
					totalDuration += getCurrentTime() - this.currentJob.queueTime
				}
				const fracBusy = totalDuration / recentDuration
				responseTime += fracBusy * 100
			}

			return 10 + Math.round(this.lnFcn(responseTime) * 2)
		}
	}
	private lnFcn(value: number): number {
		// Returns a value that is 1 => 1, then falls off, so 2 => 1.5, 3 => 2, 10 => 3.5, 100 => 6.7...
		return Math.log(value + 1) / Math.log(2)
	}
	/** Triggered when there is a new context that should be handled */
	// private onCallForArms() {}
	// private onUpdatedWorkFlow() {}

	private async _callWorkFlow(workFlowId: string, context: any, args: any, assignedRunnerId?: string): Promise<any> {
		return new Promise((resolve, reject) => {
			let newJob: DBJobInit = {
				_id: '',
				workFlowId: workFlowId,
				context: context,
				arguments: args,
				requestRunnerId: this.id,
				workRunnerId: null,
				status: DBJobStatus.INIT,
				createTime: getCurrentTime(),
			}
			delete newJob._id // filled in later
			if (assignedRunnerId) {
				const assignedJob: DBJobQueued = {
					...newJob,
					workRunnerId: assignedRunnerId,
					status: DBJobStatus.PICKED_UP,
					queueTime: newJob.createTime,
					pickupDuration: 0,
				}
				newJob = (assignedJob as any) as DBJobInit // somewhat of a hack
			}
			const id = this.options.collections.jobs.insert(newJob)
			newJob._id = id
			this.debugLog(`Calling WorkFlow "${this.id}": job: "${newJob._id}"`)

			/** Called when the job has finished */
			const onJobFinished = (doc: DBJob, error: string | null, result: any) => {
				this.debugLog(`Job: "${newJob._id}" finished`)
				if (error) {
					reject(new Error(error))
				} else {
					resolve(result)
				}
			}

			// The work has been registered
			this.pendingJobs[id] = {
				job: newJob,
				finish: onJobFinished,
			}
		})
	}
	private _actionPingRunner(runnerId: string): Promise<void> {
		this.debugLog(`Pinging "${runnerId}"`)
		return new Promise((resolve, reject) => {
			this._callWorkFlow('__ping', '', '', runnerId)
				.then(resolve)
				.catch(reject)
			Meteor.setTimeout(() => {
				reject('timeout')
			}, 500)
		})
	}
	private _actionUnregisterRunner(runnerId: string) {
		this.options.collections.jobs.remove({
			$or: [
				{
					requestRunnerId: runnerId,
				},
				{
					workRunnerId: runnerId,
				},
			],
		})
		this.options.collections.runners.remove(runnerId)
	}
	private _actionClearJob(jobId: string) {
		this.options.collections.jobs.remove(jobId)
	}
	private _actionResolveJob(job: DBJobStarted | DBJobQueued, result: any) {
		this._actionReportFinishedJob(job, DBJobStatus.RESOLVED, result)
	}
	private _actionRejectJob(job: DBJobStarted | DBJobQueued, error: string) {
		this._actionReportFinishedJob(job, DBJobStatus.REJECTED, error)
	}
	private _actionReportFinishedJob(
		job: DBJobStarted | DBJobQueued,
		status: DBJobStatus.REJECTED | DBJobStatus.RESOLVED,
		resultOrError: any
	) {
		const endTime = getCurrentTime()

		const finishedJob: DBJobFinished = {
			...job,
			status,
			result: resultOrError,
			endTime,
			startTime: job.startTime || job.queueTime,
			inQueueDuration: job.inQueueDuration || endTime - job.queueTime,
			workDuration: endTime - (job.startTime || job.queueTime),
		}

		this.options.collections.jobs.update(
			{
				_id: finishedJob._id,
				status: { $nin: [DBJobStatus.RESOLVED, DBJobStatus.REJECTED] },
			},
			{
				$set: {
					status: finishedJob.status,
					result: finishedJob.result,
					endTime: finishedJob.endTime,
					startTime: finishedJob.startTime,
					inQueueDuration: finishedJob.inQueueDuration,
					workDuration: finishedJob.workDuration,
				},
			}
		)
		// For statistics:
		this._finishedJobs.push(finishedJob)
		// this.finishedJobs max length:
		if (this._finishedJobs.length > 100) {
			this._finishedJobs.shift()
		}
	}
	/** Try to pick up a job from the db, returns true if successful */
	private _actionTryToPickUpJob(job: DBJobQueued): boolean {
		const changedCount = this.options.collections.jobs.update(
			{
				_id: job._id,
				status: DBJobStatus.INIT,
			},
			{
				$set: {
					status: job.status,
					workRunnerId: job.workRunnerId,
					queueTime: job.queueTime,
				},
			}
		)
		if (changedCount > 1) throw new Error(`Unknown error: changedCount in _actionTryToPickUpJob is ${changedCount}`)
		return changedCount === 1
	}
	// --------------
	// private triggerJobQueue() {
	// 	if (this.currentJob) return

	// const newJob = this.jobQueue.shift()
	// 	if (!newJob) return
	// 	const startTime = getCurrentTime()
	// 	this.currentJob = {
	// 		...newJob,
	// 		startTime: startTime,
	// 		inQueueDuration: startTime - newJob.queueTime
	// 	}

	// 	const workFlow = this.registeredWorkFlows[newJob.workFlowId]
	// 	if (!workFlow) {
	// 		this._actionRejectJob(newJob, `Error: No workflow "${newJob.workFlowId}" found on Runner "${this.id}"`)
	// 		this.currentJob = null
	// 		this.triggerJobQueue()
	// 		return
	// 	}

	// 	// Start working on Job:
	// 	this.workOnJob()
	// }
	private isJobPickedUp(jobId: string) {
		for (const worker of Object.values(this.contextWorkers)) {
			if (worker.isWorkingOnJob(jobId)) {
				return true
			}
		}
		return false
	}
	private workOnJob(newJob: DBJobQueued) {
		this.debugLog(`Work on job "${newJob._id}" queued...`)
		// const job: DBJobStarted | null = this.currentJob
		// if (!job) return
		const startTime = getCurrentTime()

		const job: DBJobStarted = {
			...newJob,
			startTime: startTime,
			inQueueDuration: startTime - newJob.queueTime,
		}

		const workFlow = this.registeredWorkFlows[newJob.workFlowId]
		if (!workFlow) {
			this._actionRejectJob(job, `Error: No workflow "${newJob.workFlowId}" found on Runner "${this.id}"`)
			// this.currentJob = null
			// this.triggerJobQueue()
			return
		}

		const hash = this.getContextHash(job.context)
		if (!this.contextWorkers[hash]) {
			this.contextWorkers[hash] = new WorkFlowContextWorker<any>(job.context)
		}
		let worker = this.contextWorkers[hash]
		worker.debug = this.debug
		worker.addJob(
			workFlow,
			job._id,
			job.arguments,
			() => {
				// Job has started
				// do something?
				this.debugLog(`Work on job "${newJob._id}" starting...`)
			},
			(error: any, result: any) => {
				// Job has finished
				if (error) {
					this.debugLog(`Work on job "${newJob._id}" finished with error: ${error}`)
					this._actionRejectJob(job, error.toString())
				} else {
					this.debugLog(`Work on job "${newJob._id}" finished!`)
					this._actionResolveJob(job, result)
				}
			}
		)
	}
}

// ----------------------------------------------------
// ----------------------------------------------------
// ----------------------------------------------------
// ----------------------------------------------------
// ----------------------------------------------------

console.log('-----------------------------------------------------------')
console.log('-----------------------------------------------------------')
console.log('-----------------------------------------------------------')
console.log('-----------------------------------------------------------')

const runner = new WorkFlowRunner({
	id: 'Bob',
	collections: {
		runners: new Mongo.Collection('workflow-runners'),
		jobs: new Mongo.Collection('workflow-jobs'),
		common: new Mongo.Collection('workflow-common'),
	},
	tags: [],
})
runner.debug = false
runner.register()

interface StudioContext {
	studioId: string
}
interface TakeArguments {
	playlistId: string
}
interface InnerTakeContext {
	data: string
}
type TakeReturn = string
const studioTake = createWorkFlow<StudioContext, TakeArguments, InnerTakeContext, TakeReturn>(runner, {
	id: 'StudioTake',
})
	.skippableStep(
		{
			id: 'Load Data',
			tags: ['loadStore', 'workWithData'],
			skip: [
				{
					isAfter: 'workWithData', // No need to load, if data is already loaded
				},
			],
		},
		async (innerContext: InnerTakeContext, context: StudioContext, args: TakeArguments) => {
			// Load data
			console.log('LOAD DATA ' + args.playlistId)
			const ctx: InnerTakeContext = {
				data: args.playlistId,
			}
			return ctx
		}
	)
	.step(
		{
			id: 'Manipulate Data',
			tags: ['workWithData'],
			continueOnThrow: true,
		},
		async (innerContext: InnerTakeContext, context: StudioContext, args: TakeArguments) => {
			console.log('MANIPULATE DATA ', args.playlistId)
			waitTime(1000)
			// manipulate data
			innerContext.data += '_a'
			return innerContext
		}
	)
	.skippableStep(
		{
			id: 'Save data',
			tags: ['workWithData'],
			skip: [
				{
					isBefore: 'workWithData', // No need to save if data is going to be worked at, later
				},
			],
		},
		async (innerContext: InnerTakeContext, context: StudioContext, args: TakeArguments) => {
			console.log('SAVE DATA ', args.playlistId)
			return innerContext
			// return innerContext.data + '_returned'
		}
	)
	.register()

Meteor.startup(() => {
	console.log('====================================')

	console.log('Calling function A....')
	studioTake
		.call({ studioId: 'studio0' }, { playlistId: 'A' })
		.then(() => console.log('Function A end!'))
		.catch(console.error)

	console.log('Calling function B....')
	studioTake
		.call({ studioId: 'studio0' }, { playlistId: 'B' })
		.then(() => console.log('Function B end!'))
		.catch(console.error)
})
