import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import _ from 'underscore'

// TODO: Ensure execution order is the same, for method calls from same Worker

/** Instance worker */
export class Worker {
	/** Unique id for each instance of Worker. */
	private workerInstanceId: string

	/** After this time, method calls are aborted with an error timeout message */
	private methodTimeoutTime: number = 2000
	/** If a job in a isn't picked up after this time, its token is goinf to be contested */
	private jobNotPickedUpTime: number = 300
	/** If a token is not re-claimed within this time when contested, it'll go open for anyone to claim */
	private tokenContestedTime: number = 200

	private customDelay?: () => number

	private jobs: Mongo.Collection<JobPosting>
	private tokens: Mongo.Collection<TokenAssignment>

	/** Collection of all registered methods on this worker */
	private registeredMethods: {
		[methodIdentifier: string]: Method
	} = {}

	/** Contains all tokens that are assigned to this worker */
	private assignedTokensHash: { [token: string]: string } = {}

	private tokenHashCache: { [token: string]: string | null } = {} // TODO: make sure this doesn't grow infinitely over time

	private timeoutSetupSubscriptions: number | null = null

	private observerTokens: Meteor.LiveQueryHandle | undefined
	private observerOpenTokens: Meteor.LiveQueryHandle | undefined
	private observeJobs: Meteor.LiveQueryHandle | undefined

	public debug: boolean = false

	private killed: boolean = false

	private pendingMethods: {
		[jobId: string]: {
			resolve: (result: any) => void
			reject: (err: any) => void
			observer: Meteor.LiveQueryHandle
			fallbackTimeout: number
			methodTimeout: number
		}
	} = {}

	constructor(options: InstanceWorkerOptions) {
		this.workerInstanceId = Random.id()

		if (options.methodTimeoutTime) this.methodTimeoutTime = options.methodTimeoutTime
		if (options.jobNotPickedUpTime) this.jobNotPickedUpTime = options.jobNotPickedUpTime
		if (options.tokenContestedTime) this.tokenContestedTime = options.tokenContestedTime
		if (options.delay) this.customDelay = options.delay

		this.jobs = options.jobs
		this.tokens = options.tokens

		this.debug = options.debug || false

		this.setupSubscriptions()
	}
	/** The unique id of this worker instance */
	public get workerId(): string {
		return this.workerInstanceId
	}
	/** Kill the worker */
	public kill() {
		// Kill gracefully

		// Todo: handle jobs & tokens

		this.killInstantly()
	}
	/** Kill the worker instantly. No graceful cleanup, intended to debugging purposes. */
	public killInstantly() {
		// Kill instantly (for debugging)
		this.killed = true
		this.stopSubscriptions()
	}

	/** Register a new method to the Worker */
	public registerMethod<F extends (...args: any) => Promise<any>>(
		methodIdentifier: string,
		cbContext: (...args: Parameters<F>) => MethodContext | string,
		cbFunction: F
	): F {
		// register method

		const method: Method = {
			cbFunction: cbFunction,
		}
		this.registeredMethods[methodIdentifier] = method

		const fcn: any = (...args: any[]) => {
			// At this point, the method is called.
			if (this.killed) throw new Error('Worker was killed and cannot receive method calls')

			this.trace(`Method called: ${methodIdentifier}`)

			// @ts-ignore argument
			let context0 = cbContext(...args)
			const context: MethodContext = _.isString(context0) ? { instanceToken: context0 } : context0

			// First, check if the token is assigned to any worker:
			const instanceTokenHash = this.getTokenHash(context.instanceToken)

			this.trace(`tokenhash`, instanceTokenHash)
			if (!instanceTokenHash) {
				this.trace(
					`Token not set up: ${context.instanceToken} ${
						instanceTokenHash === null
							? 'null'
							: instanceTokenHash === undefined
							? 'undefined'
							: instanceTokenHash
					}`
				)
				// There is no token set up
				this.setupToken(context.instanceToken)
			}

			// Post the job:
			const jobId = this.jobs.insert({
				created: Date.now(),
				methodIdentifier: methodIdentifier,

				instanceToken: context.instanceToken,
				instanceTokenHash: instanceTokenHash,

				readTokens: context.readTokens || [],
				writeTokens: context.writeTokens || [],

				arguments: args,
				status: JobStatus.OPEN,
			})

			this.trace(`Job created: ${jobId}`)

			const fallbackTimeout = Meteor.setTimeout(() => {
				if (this.killed) return
				this.trace(`fallback timeout for job ${jobId}`)
				// If no one has picked up the job within this time, the token needs to be contested.
				this.contestToken(context.instanceToken)

				// Note: When the contest has been resolved and the token has been claimed by a worker,
				// The job will be reassigned to that worker
			}, this.jobNotPickedUpTime)
			const methodTimeout = Meteor.setTimeout(() => {
				if (this.killed) return
				this.trace(`Method timeout for job ${jobId}`)
				// Enough time has passed so the method goes into timeout
				this.resolveMethod(jobId, undefined, `Error: Method "${methodIdentifier}" timed out`)

				// Note: When the contest has been resolved and the token has been claimed by a worker,
				// The job will be reassigned to that worker
			}, this.methodTimeoutTime)

			return new Promise((resolve, reject) => {
				// Listen to when the job has been finished:
				const completeObserver = this.jobs
					.find({
						_id: jobId,
						status: JobStatus.COMPLETED,
					})
					.observe({
						added: (document) => {
							this.resolveMethod(document._id, document.result, document.error)
						},
					})

				this.pendingMethods[jobId] = {
					resolve,
					reject,
					observer: completeObserver,
					fallbackTimeout: fallbackTimeout,
					methodTimeout: methodTimeout,
				}
			})
		}

		return fcn
	}
	private resolveMethod(jobId: string, result: any, err: any) {
		this.trace(`Method ${jobId} resolved`, result, err)
		const pendingMethod = this.pendingMethods[jobId]

		if (pendingMethod) {
			// The job has been completed

			pendingMethod.observer.stop()
			Meteor.clearTimeout(pendingMethod.fallbackTimeout)
			Meteor.clearTimeout(pendingMethod.methodTimeout)

			if (err) {
				if (_.isString(err)) err = new Error(err)
				pendingMethod.reject(err)
			} else {
				pendingMethod.resolve(result)
			}
			delete this.pendingMethods[jobId]
		} else {
			this.trace(`Method ${jobId} not found in pendingMethods`)
		}
		// Clear the job from collection
		this.jobs.remove(jobId)
	}
	private triggerSetupSubscriptions() {
		if (this.timeoutSetupSubscriptions) Meteor.clearTimeout(this.timeoutSetupSubscriptions)

		this.timeoutSetupSubscriptions = Meteor.setTimeout(() => {
			if (this.killed) return
			this.timeoutSetupSubscriptions = null
			this.setupSubscriptions()
		}, 10)
	}
	private stopSubscriptions() {
		if (this.observerTokens) {
			this.observerTokens.stop()
			delete this.observerTokens
		}
		if (this.observerOpenTokens) {
			this.observerOpenTokens.stop()
			delete this.observerOpenTokens
		}
		if (this.observeJobs) {
			this.observeJobs.stop()
			delete this.observeJobs
		}
	}
	private setupSubscriptions() {
		this.trace(`setupSubscriptions`)
		// Stop previous opservers:
		this.stopSubscriptions()

		// Observe tokens related to us:
		const relevantTokenIds = _.uniq(
			_.compact([...Object.keys(this.assignedTokensHash), ...Object.keys(this.tokenHashCache)])
		)
		this.trace('relevantTokenIds', relevantTokenIds)

		const handleChangedToken = (token: TokenAssignment) => {
			this.trace(`Updated Token ${token._id}`)
			this.updateTokenHashCache(token._id, token.tokenHash)

			if (token.claimedByWorkerInstanceId === this.workerInstanceId) {
				if (token.status === TokenStatus.ASSIGNED) {
					this.trace(`Token ${token._id} is assigned to worker`)
					// The token is assigned to us.
					this.pickUpJobsForToken(token)

					if (!this.assignedTokensHash[token._id]) {
						this.trace(`Token ${token._id} was newly assigned to worker`)
						// The token was newly been assigned to us.
						this.assignedTokensHash[token._id] = token.tokenHash
						this.triggerSetupSubscriptions()
					}
				} else if (token.status === TokenStatus.CONTESTED && this.assignedTokensHash[token._id]) {
					this.trace(`Token ${token._id} is contested`)
					// Our token is being contested.
					// We have to re-claim it!
					this.reclaimToken(token._id)
				}
			} else {
				if (this.assignedTokensHash[token._id]) {
					this.trace(`Token ${token._id} removed from worker`)
					// The token has been removed from us.
					delete this.assignedTokensHash[token._id]
					this.triggerSetupSubscriptions()
				}
			}
		}
		this.observerTokens = this.tokens
			.find({
				_id: { $in: relevantTokenIds },
			})
			.observe({
				added: (token) => handleChangedToken(token),
				changed: (token) => handleChangedToken(token),
				removed: (token) => {
					this.updateTokenHashCache(token._id, null)
					this.trace(`Removed token ${token._id}`)

					if (this.assignedTokensHash[token._id]) {
						this.trace(`Lost token ${token._id}`)
						delete this.assignedTokensHash[token._id]
						this.triggerSetupSubscriptions()
					}
				},
			})

		// Observe open tokens
		const tryToClaimOpenToken = (token: TokenAssignment) => {
			this.trace(`Try to claim token ${token._id}`)
			const originalTokenHash = token.tokenHash

			// A token is open, try to claim it:

			const delaytime: number = this.customDelay?.() || this.defaultDelay()

			Meteor.setTimeout(() => {
				if (this.killed) return
				if (this.getTokenHash(token._id) !== originalTokenHash) {
					// The tokenHash has been modified. Someone else beat us to it.
					// Do nothing
					this.trace(`Claim token ${token._id} unsuccessful`)
					return
				}
				// Try to pick up the token:
				const newTokenHash = Random.id()
				const updateCount: number = this.tokens.update(
					{
						_id: token._id,
						status: TokenStatus.OPEN,
						tokenHash: token.tokenHash, // to prevent race-conditions
					},
					{
						$set: {
							status: TokenStatus.ASSIGNED,
							claimedByWorkerInstanceId: this.workerInstanceId,
							tokenHash: newTokenHash,
						},
					}
				)
				if (updateCount === 1) {
					this.trace(`Claim token ${token._id} successful!`)
					// The update succeeded, we got the token.
					// Reaction to this is handled in the assigned-token-observer

					this.assignedTokensHash[token._id] = newTokenHash
					this.triggerSetupSubscriptions()
				}
			}, delaytime)
		}
		this.observerOpenTokens = this.tokens
			.find({
				status: TokenStatus.OPEN,
			})
			.observe({
				added: (token) => {
					this.updateTokenHashCache(token._id, token.tokenHash)

					tryToClaimOpenToken(token)
				},
				changed: (token, oldToken) => {
					this.updateTokenHashCache(token._id, token.tokenHash)
					if (token.status === TokenStatus.OPEN && oldToken.status !== TokenStatus.OPEN) {
						// The token has turned to open:
						tryToClaimOpenToken(token)
					}
				},
				removed: (token) => {
					this.updateTokenHashCache(token._id, null)
				},
			})

		// Observe jobs
		const myTokenIds = Object.keys(this.assignedTokensHash)

		const handleChangedJob = (job: JobPosting) => {
			// Verify that the job is actually assigned to this worker:
			if (job.instanceTokenHash && this.assignedTokensHash[job.instanceToken] === job.instanceTokenHash) {
				// Start working on open jobs
				if (job.status === JobStatus.OPEN) {
					this.startWorkingOnJob(job)
				}
			}
		}
		this.observeJobs = this.jobs
			.find({
				instanceToken: { $in: myTokenIds },
			})
			.observe({
				added: (job) => handleChangedJob(job),
				changed: (job) => handleChangedJob(job),
				removed: (job) => {
					if (this.pendingMethods[job._id]) {
						// A job we where currently working on was removed
						this.resolveMethod(job._id, undefined, 'Job got unexpectedly removed from queue')
					}
				},
			})
	}
	private pickUpJobsForToken(token: TokenAssignment) {
		// Assign open jobs that haven't been assigned to any worker, the worker of the token:
		const updateCount = this.jobs.update(
			{
				status: JobStatus.OPEN,
				instanceToken: token._id,
				instanceTokenHash: null,
			},
			{
				$set: {
					instanceTokenHash: token.tokenHash,
				},
			}
		)
		this.trace(`Picked up ${updateCount} jobs for token ${token._id}`)
	}
	private startWorkingOnJob(job: JobPosting) {
		this.trace(`Start working on job ${job._id}`)
		const method = this.registeredMethods[job.methodIdentifier]
		if (!method) {
			this.completeJob(
				job,
				undefined,
				`Worker ${this.workerInstanceId}: Unknown method "${job.methodIdentifier}"`
			)
			return
		}

		this.setJobInProgress(job)

		const context = {
			isExclusive: false, // TODO
			workerId: this.workerInstanceId,
		}

		// @ts-ignore arguments type
		method.cbFunction
			.apply(context, job.arguments)
			.then((result) => {
				this.completeJob(job, result, undefined)
			})
			.catch((error) => {
				this.completeJob(job, undefined, error)
			})
	}
	private setJobInProgress(job: JobPosting) {
		this.trace(`Job ${job._id}: in progress`)
		this.jobs.update(
			{
				_id: job._id,
				status: JobStatus.OPEN,
			},
			{
				$set: {
					status: JobStatus.IN_PROGRESS,
				},
			}
		)
	}
	private completeJob(job: JobPosting, result: any, error: any) {
		this.trace(`Job ${job._id}: in complete`, result, error)
		this.jobs.update(
			{
				_id: job._id,
				status: { $in: [JobStatus.IN_PROGRESS, JobStatus.OPEN] },
			},
			{
				$set: {
					status: JobStatus.COMPLETED,
					result: result,
					error: error,
				},
			}
		)
	}
	private setupToken(tokenId: string) {
		// This function inserts a new token if no token exists

		this.trace(`Setup token ${tokenId}`)

		try {
			this.tokens.insert({
				_id: tokenId,
				claimedByWorkerInstanceId: null,
				status: TokenStatus.OPEN,
				tokenHash: Random.id(),
			})
			// Now, there will be a contest for workers to pick up the token.
		} catch (e) {
			if (e.toString().match(/Duplicate key/i)) {
				// ignore this error, there was already a token in the collection.
				// and that's OK

				this.trace(`Token ${tokenId} already exists`)
			} else {
				throw e
			}
		}
	}
	private contestToken(tokenId: string) {
		// Contest a token.
		// This is done when a worker suspects that another worker has lost connection or doesn't keep track of its assigned worker anymore.
		// How it works:
		// * The Token is Contested
		// * If the original Worker is still active, it re-claims the Token
		// * After a timeout, the token is reverted to be an Open token

		this.trace(`Contest token ${tokenId}: Start`)

		const existingToken = this.tokens.findOne(tokenId)
		if (existingToken) {
			this.updateTokenHashCache(tokenId, existingToken.tokenHash)
			if (existingToken.status === TokenStatus.ASSIGNED) {
				this.trace(`Contest token ${tokenId}: Make contested`)
				const updateCount = this.tokens.update(
					{
						_id: tokenId,
						status: TokenStatus.ASSIGNED, // to avoid race conditions
						tokenHash: existingToken.tokenHash, // to avoid race conditions
					},
					{
						$set: {
							status: TokenStatus.CONTESTED,
						},
					}
				)
				if (updateCount === 0) return // Someone else made an update, Abort!

				const originalTokenHash = existingToken.tokenHash

				// There is now going to be a contest for the previously assigned worker to re-claim the token.

				Meteor.setTimeout(() => {
					if (this.killed) return
					if (this.getTokenHash(existingToken._id) !== originalTokenHash) {
						// The tokenHash has been modified. Someone else beat us to it.
						// Do nothing
						return
					}
					// After this time, we consider the previously assigned worker to have had its change to re-claim the token.

					this.trace(`Contest token ${tokenId}: Make open`)

					const updateCount = this.tokens.update(
						{
							_id: tokenId,
							status: TokenStatus.CONTESTED, // to avoid race conditions
							tokenHash: existingToken.tokenHash, // to avoid race conditions
						},
						{
							$set: {
								status: TokenStatus.OPEN,
								tokenHash: Random.id(),
							},
						}
					)
					if (updateCount === 0) return // Someone else made an update, Abort!

					// All open job are unassigned from old worker:
					this.jobs.update(
						{
							status: JobStatus.OPEN,
							instanceToken: existingToken._id,
							instanceTokenHash: existingToken.tokenHash,
						},
						{
							$set: {
								instanceTokenHash: null,
							},
						}
					)
					// All in-progress jobs are considered to be dead:
					this.jobs.update(
						{
							status: JobStatus.IN_PROGRESS,
							instanceToken: existingToken._id,
							instanceTokenHash: existingToken.tokenHash,
						},
						{
							$set: {
								status: JobStatus.COMPLETED,
								error: 'Worker went away',
							},
						}
					)

					this.trace(`Contest token ${tokenId}: Opened`)

					// TODO: handle the situation if a token is left as contested
				}, this.tokenContestedTime)
			} else if (existingToken.status === TokenStatus.CONTESTED) {
				this.trace(`Contest token ${tokenId}: Token status = ${existingToken.status}`)
				// The token is already contested by someone else
				// do nothing
			} else if (existingToken.status === TokenStatus.OPEN) {
				this.trace(`Contest token ${tokenId}: Token status = ${existingToken.status}`)
				// The token is open
				// Do nothing
			}
		} else {
			this.trace(`Contest token ${tokenId}: Token not found`)
			this.setupToken(tokenId)
		}
	}
	/** Reclaim a contested token */
	private reclaimToken(tokenId: string) {
		this.trace(`Reclaim token ${tokenId}: Start`)
		const existingToken = this.tokens.findOne(tokenId)
		if (existingToken) {
			if (
				existingToken.claimedByWorkerInstanceId === this.workerInstanceId &&
				existingToken.status === TokenStatus.CONTESTED
			) {
				// Reclaim this token:
				const updatedCount: number = this.tokens.update(
					{
						_id: existingToken._id,
						status: TokenStatus.CONTESTED,
						tokenHash: existingToken.tokenHash,
					},
					{
						$set: {
							status: TokenStatus.ASSIGNED,
						},
					}
				)
				if (updatedCount === 1) {
					// we successfully reclaimed the token
					this.trace(`Reclaim token ${tokenId}: Success`)
				} else {
					this.trace(`Reclaim token ${tokenId}: Failed`)
					// we failed to reclaim the token. it's lost to someone else.

					// Todo: if there are any running methods on this token, they should be aborted.

					delete this.assignedTokensHash[tokenId]
					this.triggerSetupSubscriptions()
				}
			}
		}
	}
	private getTokenHash(tokenId: string): string | null {
		// undefined means that we don't know wether the token is existant or not
		// null means that we know that it is non-existant

		if (this.tokenHashCache[tokenId] !== undefined) {
			return this.tokenHashCache[tokenId]
		} else {
			const token = this.tokens.findOne({
				_id: tokenId,
			})
			if (token) {
				this.updateTokenHashCache(tokenId, token.tokenHash)
				return token.tokenHash
			} else {
				this.updateTokenHashCache(tokenId, null)
				return null
			}
		}
	}
	private updateTokenHashCache(tokenId: string, tokenHash: string | null) {
		// null means that we explicitly know that the token is non-existant

		if (tokenHash !== undefined) {
			this.tokenHashCache[tokenId] = tokenHash
		} else {
			delete this.tokenHashCache[tokenId]
		}
	}
	private defaultDelay() {
		return (
			Object.keys(this.assignedTokensHash).length * 10 + // Add more delay if the worker already has a lot of assigned tokens
			Math.floor(Math.random() * 50)
		)
	}
	private trace(...args: any[]) {
		if (this.debug) console.log(Date.now() % 1000, this.workerInstanceId, ...args)
	}
}
interface InstanceWorkerOptions {
	jobs: Mongo.Collection<JobPosting>
	tokens: Mongo.Collection<TokenAssignment>

	debug?: boolean

	/** After this time, method calls are aborted with an error timeout message */
	methodTimeoutTime?: number
	/** If a job in a isn't picked up after this time, it's up for anyone else to pick up */
	jobNotPickedUpTime?: number
	/** If a token is not re-claimed within this time when contested, it'll go open for anyone to claim */
	tokenContestedTime?: number

	/** How much to delay before picking up an open job. */
	delay?: () => number

	// preferTokens: string[]
}
/** A tokenAssignment represents a token being assigned to a worker instance */
interface TokenAssignment {
	_id: string // the instanceToken

	claimedByWorkerInstanceId: string | null

	status: TokenStatus
	/** Random string, is regenerated whenever the status is set to Assigned or Open*/
	tokenHash: string
}
/** A Job posting represents the lifetime of a method call. */
interface JobPosting {
	_id: string
	/** Timestamp when a job was created */
	created: number
	/** "function name" */
	methodIdentifier: string

	/** Reference to the Token this method is to be executed with */
	instanceToken: string
	/** Reference to the Token-workerInstance assignement this job is assigned to. null = not assigned to any worker */
	instanceTokenHash: string | null

	readTokens: string[] // TODO: implement queue
	writeTokens: string[] // TODO: implement queue

	arguments: any[]

	status: JobStatus

	/** Which instance who picked up the job */
	instanceId?: string

	result?: any
	error?: any
}
enum TokenStatus {
	/** The token is open to be picked up by a worker instance*/
	OPEN = 'open',
	/** The token is assigned to a worker instance */
	ASSIGNED = 'assigned',
	/** The token is contested, if not picked up by original worker instance, it'll decay to being OPEN */
	CONTESTED = 'contested',
}
enum JobStatus {
	OPEN = 'open',

	// OPEN_FALLBACK = 'open_fallback',

	IN_PROGRESS = 'in_progress',

	COMPLETED = 'completed',
}
export interface MethodContext {
	/** Methods with the same instanceToken will be (most likely) executed on the same instance */
	instanceToken: string

	/**
	 * Indicates that this method depends on data with these tokens.
	 * The method will wait for any other methods with these writeTokens set to complete before starting.
	 */
	readTokens?: string[]
	/** Indicates that this method writes to data with these tokens.
	 * The method will wait for any other methods with these writeTokens set to complete before starting.
	 */
	writeTokens?: string[]
}
interface Method {
	// cbContext: () => MethodContext
	cbFunction: () => Promise<any>
}
