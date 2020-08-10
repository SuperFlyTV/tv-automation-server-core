import { Mongo } from 'meteor/mongo'
import { testInFiber, beforeAllInFiber, testInFiberOnly } from '../../../__mocks__/helpers/jest'
import { WorkFlowRunner, createWorkFlow } from '../contextWorkFlow'

describe('Contextual job runner', () => {
	let jobRunner: WorkFlowRunner
	beforeAllInFiber(() => {
		jobRunner = new WorkFlowRunner({
			id: 'Bob',
			collections: {
				runners: new Mongo.Collection('workflow-runners'),
				jobs: new Mongo.Collection('workflow-jobs'),
				common: new Mongo.Collection('workflow-common'),
			},
			tags: [],
		})
		jobRunner.debug = true
		if (jobRunner.debug) {
			console.log('===================================================')
			console.log('===================================================')
			console.log('===================================================')
			console.log('===================================================')
			console.log('===================================================')
		}
		jobRunner.register()
	})
	testInFiber('simplest', async () => {
		interface Context {
			contextValue: number
		}
		type Argument = number
		interface InnerContext {}
		type ReturnValue = number
		const simplestFunction = createWorkFlow<Context, Argument, InnerContext, ReturnValue>(jobRunner, {
			id: 'simplestFunction',
		})
			.lastStep({}, async (innerContext: InnerContext, context: Context, addValue: Argument) => {
				// Hello world!
				return context.contextValue + addValue
			})
			.register()

		const result = await simplestFunction.call(
			{
				contextValue: 10,
			},
			1
		)
		expect(result).toEqual(11)
	})
	testInFiber('multiple steps', async () => {
		interface Context {
			city: string
		}
		interface Argument {
			name: string
			age: number
		}
		interface InnerContext {
			helloPhrase: string
		}
		type ReturnValue = string
		const multiStepFunction = createWorkFlow<Context, Argument, InnerContext, ReturnValue>(jobRunner, {
			id: 'multiStepFunction',
		})
			.step({}, async (innerContext: InnerContext, context: Context, args: Argument) => {
				return {
					helloPhrase: 'Hello',
				}
			})
			.step({}, async (innerContext: InnerContext, context: Context, args: Argument) => {
				return {
					helloPhrase: innerContext.helloPhrase + `, my name is ${args.name}, I am ${args.age} years old`,
				}
			})
			.lastStep({}, async (innerContext: InnerContext, context: Context, args: Argument) => {
				return innerContext.helloPhrase + ` and I am from ${context.city}`
			})
			.register()

		const result = await multiStepFunction.call(
			{
				city: 'Hudiksvall, Sweden',
			},
			{
				name: 'Johan',
				age: 31,
			}
		)
		expect(result).toEqual(`Hello, my name is Johan, I am 31 years old and I am from Hudiksvall, Sweden`)
	})
	testInFiberOnly('skippable steps', async () => {
		interface Context {}
		type Argument = string
		type InnerContext = string
		type ReturnValue = string
		const skippableStepFunction = createWorkFlow<Context, Argument, InnerContext, ReturnValue>(jobRunner, {
			id: 'skippableStepFunction',
		})
			.skippableStep(
				{
					tags: ['has-started'],
					skip: [
						{
							isAfter: 'has-started',
						},
					],
				},
				async (innerContext: InnerContext, context: Context, name: Argument) => {
					return 'Hello'
				}
			)
			.step(
				{
					tags: ['has-started'],
				},
				async (innerContext: InnerContext, context: Context, name: Argument) => {
					return innerContext + `, ${name}`
				}
			)
			.skippableStep(
				{
					tags: ['has-started'],
					skip: [
						{
							isBefore: 'has-started',
						},
					],
				},
				async (innerContext: InnerContext, context: Context, name: Argument) => {
					return innerContext + `, goodbye`
				}
			)
			.register()

		console.log('callings steps...')
		const pResult0 = skippableStepFunction.call({}, 'AAA')
		const pResult1 = skippableStepFunction.call({}, 'BBB')
		// const pResult2 = skippableStepFunction.call({}, 'CCC')
		console.log('callings steps done!')

		pResult0.then((r) => {
			console.log('pResult0 done')
		})

		const result0 = await pResult0
		const result1 = await pResult1
		// const result2 = await pResult2

		expect(result0).toEqual(`Hello, AAA`)
		expect(result1).toEqual(`BBB`)
		// expect(result2).toEqual(`CCC, goodbye`)
	})
})
