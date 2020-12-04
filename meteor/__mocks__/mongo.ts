import * as _ from 'underscore'
import {
	mongoWhere,
	literal,
	Omit,
	ProtectedString,
	unprotectString,
	protectString,
	mongoModify,
	mongoFindOptions,
} from '../lib/lib'
import { RandomMock } from './random'
import {
	UpsertOptions,
	UpdateOptions,
	FindOptions,
	ObserveChangesCallbacks,
	ObserveCallbacks,
} from '../lib/typings/meteor'
import { MeteorMock } from './meteor'
import { Random } from 'meteor/random'
import { Meteor } from 'meteor/meteor'
import {
	BulkWriteOperation,
	BulkWriteInsertOneOperation,
	BulkWriteUpdateOneOperation,
	BulkWriteUpdateManyOperation,
	BulkWriteReplaceOneOperation,
	BulkWriteDeleteOneOperation,
	BulkWriteDeleteManyOperation,
} from 'mongodb'
const clone = require('fast-clone')

export namespace MongoMock {
	interface ObserveEntry<T extends CollectionObject> {
		id: string
		query: any
		documents: { [id: string]: T }
		callbacks: ObserveCallbacks<T>
		changeCallbacks: ObserveChangesCallbacks<T>
	}

	export interface MockCollections<T extends CollectionObject> {
		[collectionName: string]: MockCollection<T>
	}
	export interface MockCollection<T extends CollectionObject> {
		[id: string]: T
	}
	interface CollectionObject {
		_id: ProtectedString<any>
	}

	const mockCollections: MockCollections<any> = {}
	export interface MongoCollection<T extends CollectionObject> {}
	export class Collection<T extends CollectionObject> implements MongoCollection<T> {
		public _name: string
		private _options: any = {}
		private _isMock: true = true // used in test to check that it's a mock
		private observers: ObserveEntry<T>[] = []

		private _transform?: (o: T) => T
		private updateObserversTimeout: any | undefined

		constructor(name: string, options?: any) {
			this._options = options || {}
			this._name = name
			this._transform = this._options.transform
		}
		find(query: any, options?: FindOptions<T>) {
			if (_.isString(query)) query = { _id: query }
			query = query || {}

			const unimplementedUsedOptions = _.without(_.keys(options), 'sort', 'limit', 'fields')
			if (unimplementedUsedOptions.length > 0) {
				throw new Error(`find being performed using unimplemented options: ${unimplementedUsedOptions}`)
			}

			let docsArray = _.values(this.documents)
			if (query._id && _.isString(query._id)) {
				// Optimization
				docsArray = [this.documents[query._id]]
			}
			let docs = _.compact(_.filter(docsArray, (doc) => mongoWhere(doc, query)))

			docs = mongoFindOptions(docs, options)

			const observers = this.observers
			const updateObservers = () => this.updateObservers()

			return {
				_fetchRaw: () => {
					return docs
				},
				fetch: () => {
					const transform = this._transform ? this._transform : (doc) => doc
					return _.map(docs, (doc) => {
						return transform(clone(doc))
					}) as CollectionObject[]
				},
				count: () => {
					return docs.length
				},
				observe(clbs: ObserveCallbacks<T>) {
					// todo - finish implementing uses of callbacks
					const id = Random.id(5)
					observers.push(
						literal<ObserveEntry<T>>({
							id: id,
							changeCallbacks: {},
							callbacks: clbs,
							query: query,
							documents: {},
						})
					)
					updateObservers()
					return {
						stop() {
							const index = observers.findIndex((o) => o.id === id)
							if (index === -1) throw new Meteor.Error(500, 'Cannot stop observer that is not registered')
							observers.splice(index, 1)
						},
					}
				},
				observeChanges(clbs: ObserveChangesCallbacks<T>) {
					// todo - finish implementing uses of callbacks
					const id = Random.id(5)
					observers.push(
						literal<ObserveEntry<T>>({
							id: id,
							changeCallbacks: clbs,
							callbacks: {},
							query: query,
							documents: {},
						})
					)
					updateObservers()
					return {
						stop() {
							const index = observers.findIndex((o) => o.id === id)
							if (index === -1) throw new Meteor.Error(500, 'Cannot stop observer that is not registered')
							observers.splice(index, 1)
						},
					}
				},
				forEach(f) {
					docs.forEach(f)
				},
				map(f) {
					return docs.map(f)
				},
			}
		}
		findOne(query, options?: Omit<FindOptions<T>, 'limit'>) {
			return this.find(query, options).fetch()[0]
		}
		update(query: any, modifier, options?: UpdateOptions, cb?: Function) {
			try {
				const unimplementedUsedOptions = _.without(_.keys(options), 'multi')
				if (unimplementedUsedOptions.length > 0) {
					throw new Error(`update being performed using unimplemented options: ${unimplementedUsedOptions}`)
				}

				// todo
				let docs = this.find(query)._fetchRaw()

				// By default mongo only updates one doc, unless told multi
				if (this.documents.length && !options?.multi) {
					docs = [docs[0]]
				}

				_.each(docs, (doc) => {
					const modifiedDoc = mongoModify(query, doc, modifier)
					this.documents[unprotectString(doc._id)] = modifiedDoc

					this.updateObservers()
				})

				if (cb) cb(undefined, docs.length)
				else return docs.length
			} catch (error) {
				if (cb) cb(error, undefined)
				else throw error
			}
		}
		insert(doc: T, cb?: Function) {
			try {
				const d = _.clone(doc)
				if (!d._id) d._id = protectString(RandomMock.id())

				if (this.documents[unprotectString(d._id)]) {
					throw new MeteorMock.Error(500, `Duplicate key '${d._id}'`)
				}

				this.documents[unprotectString(d._id)] = d

				this.updateObservers()

				if (cb) cb(undefined, d._id)
				else return d._id
			} catch (error) {
				if (cb) cb(error, undefined)
				else throw error
			}
		}
		upsert(query: any, modifier, options?: UpsertOptions, cb?: Function) {
			let id = _.isString(query) ? query : query._id

			const docs = this.find(id)._fetchRaw()

			if (docs.length) {
				this.update(docs[0]._id, modifier, options, cb)
			} else {
				const doc = mongoModify(query, { _id: id }, modifier)
				this.insert(doc, cb)
			}
		}
		remove(query: any, cb?: Function) {
			try {
				const docs = this.find(query)._fetchRaw()

				_.each(docs, (doc) => {
					delete this.documents[unprotectString(doc._id)]

					this.updateObservers()
				})
				if (cb) cb(undefined, docs.length)
				else return docs.length
			} catch (error) {
				if (cb) cb(error, undefined)
				else throw error
			}
		}

		_ensureIndex(obj: any) {
			// todo
		}
		allow() {
			// todo
		}
		rawCollection() {
			return {
				// indexes: () => {}
				// stats: () => {}
				// drop: () => {}
				bulkWrite: (updates: BulkWriteOperation<any>[], _options) => {
					for (let update of updates) {
						if (update['insertOne']) {
							update = update as BulkWriteInsertOneOperation<any>
							this.insert(update.insertOne.document)
						} else if (update['updateOne']) {
							update = update as BulkWriteUpdateOneOperation<any>
							if (update.updateOne.upsert) {
								this.upsert(update.updateOne.filter, update.updateOne.update, { multi: false })
							} else {
								this.update(update.updateOne.filter, update.updateOne.update, { multi: false })
							}
						} else if (update['updateMany']) {
							update = update as BulkWriteUpdateManyOperation<any>
							if (update.updateMany.upsert) {
								this.upsert(update.updateMany.filter, update.updateMany.update, { multi: true })
							} else {
								this.update(update.updateMany.filter, update.updateMany.update, { multi: true })
							}
						} else if (update['deleteOne']) {
							update = update as BulkWriteDeleteOneOperation<any>
							const docs = this.find(update.deleteOne.filter).fetch()
							if (docs.length) {
								this.remove(docs[0]._id)
							}
						} else if (update['deleteMany']) {
							update = update as BulkWriteDeleteManyOperation<any>
							this.remove(update.deleteMany.filter)
						} else if (update['replaceOne']) {
							update = update as BulkWriteReplaceOneOperation<any>
							this.upsert(update.replaceOne.filter, update.replaceOne.replacement)
						}
					}
				},
				collectionName: this._name,
			}
		}
		// observe () {
		// 	// todo
		// }
		private get documents(): MockCollection<T> {
			if (!mockCollections[this._name]) mockCollections[this._name] = {}
			return mockCollections[this._name]
		}
		private updateObservers() {
			if (this.updateObserversTimeout) {
				clearTimeout(this.updateObserversTimeout)
			}
			this.updateObserversTimeout = setTimeout(() => {
				// console.log(Date.now() % 1000, 'updateObservers', this._name, this.observers.length)
				this.observers.forEach((observer: ObserveEntry<CollectionObject>) => {
					// console.log('observer')
					const newDocuments = this.find(observer.query).fetch()

					const newIds: { [id: string]: true } = {}
					for (const newDoc of newDocuments) {
						// if (onlyUpdatedId && newDoc._id !== onlyUpdatedId) continue
						const id = unprotectString(newDoc._id)

						newIds[id] = true

						const oldDoc = observer.documents[id]
						if (!oldDoc) {
							// Inserted
							observer.callbacks.added?.(newDoc)
							observer.changeCallbacks.added?.(newDoc._id, newDoc) // TODO: Figure out what's changed

							observer.documents[id] = clone(newDoc)
						} else {
							if (!_.isEqual(newDoc, oldDoc)) {
								// Changed
								observer.callbacks.changed?.(newDoc, oldDoc)
								observer.changeCallbacks.changed?.(newDoc._id, {}) // TODO: Figure out what's changed

								observer.documents[id] = clone(newDoc)
							}
						}
					}
					for (const id of Object.keys(observer.documents)) {
						const oldDoc = observer.documents[id]

						if (!newIds[id]) {
							// Removed
							observer.callbacks.removed?.(oldDoc)
							observer.changeCallbacks.removed?.(oldDoc._id)

							delete observer.documents[id]
						}
					}
				})
			}, 1)
		}
	}
	// Mock functions:
	export function mockSetData<T extends CollectionObject>(
		collection: string | MongoCollection<T>,
		data: MockCollection<T> | Array<T> | null
	) {
		const collectionName: string = _.isString(collection)
			? collection
			: (collection as MongoMock.Collection<any>)._name
		data = data || {}
		if (_.isArray(data)) {
			const collectionData = {}
			_.each(data, (doc) => {
				if (!doc._id) throw Error(`mockSetData: "${collectionName}": doc._id missing`)
				collectionData[unprotectString(doc._id)] = doc
			})
			mockCollections[collectionName] = collectionData
		} else {
			mockCollections[collectionName] = data
		}
	}

	export function deleteAllData() {
		Object.keys(mockCollections).forEach((id) => {
			mockCollections[id] = {}
		})
	}
}
export function setup() {
	return {
		Mongo: MongoMock,
	}
}

MeteorMock.mockSetUsersCollection(new MongoMock.Collection('Meteor.users'))
