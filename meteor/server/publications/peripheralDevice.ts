import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { PeripheralDeviceReadAccess } from '../security/peripheralDevice'
import { PeripheralDevices, PeripheralDeviceId, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceCommands } from '../../lib/collections/PeripheralDeviceCommands'
import { MediaWorkFlowSteps } from '../../lib/collections/MediaWorkFlowSteps'
import { MediaWorkFlows } from '../../lib/collections/MediaWorkFlows'
import { OrganizationReadAccess } from '../security/organization'
import { StudioReadAccess } from '../security/studio'
import { FindOptions, UserId } from '../../lib/typings/meteor'
import { Credentials, ResolvedCredentials } from '../security/lib/credentials'
import { NoSecurityReadAccess } from '../security/noSecurity'
import { meteorCustomPublishArray } from '../lib/customPublication'
import {
	getActiveRoutes,
	getRoutedMappings,
	MappingExt,
	MappingsExt,
	routeExpectedPackages,
	Studio,
	StudioId,
	StudioPackageContainer,
	Studios,
} from '../../lib/collections/Studios'
import { setUpOptimizedObserver } from '../lib/optimizedObserver'
import {
	ExpectedPackageDB,
	ExpectedPackages,
	getPreviewPackageSettings,
	getThumbnailPackageSettings,
} from '../../lib/collections/ExpectedPackages'
import _, { map } from 'underscore'
import {
	ExpectedPackage,
	PackageContainer,
	Accessor,
	PackageContainerOnPackage,
	AccessorOnPackage,
} from '@sofie-automation/blueprints-integration'
import { DBRundownPlaylist, RundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { DBRundown, Rundowns } from '../../lib/collections/Rundowns'
import { clone, DBObj, literal, omit, protectString, unprotectObject, unprotectString } from '../../lib/lib'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { PlayoutDeviceSettings } from '../../lib/collections/PeripheralDeviceSettings/playoutDevice'
import deepExtend from 'deep-extend'

function checkAccess(cred: Credentials | ResolvedCredentials, selector) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	return (
		NoSecurityReadAccess.any() ||
		(selector._id && PeripheralDeviceReadAccess.peripheralDevice(selector, cred)) ||
		(selector.organizationId && OrganizationReadAccess.organizationContent(selector, cred)) ||
		(selector.studioId && StudioReadAccess.studioContent(selector, cred))
	)
}
meteorPublish(PubSub.peripheralDevices, function(selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	if (checkAccess(cred, selector)) {
		const modifier: FindOptions<PeripheralDevice> = {
			fields: {
				token: 0,
				secretSettings: 0,
			},
		}
		if (selector._id && token && modifier.fields) {
			// in this case, send the secretSettings:
			delete modifier.fields.secretSettings
		}
		return PeripheralDevices.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.peripheralDevicesAndSubDevices, function(selector0, token) {
	const { cred, selector } = AutoFillSelector.organizationId(this.userId, selector0, token)
	if (checkAccess(cred, selector)) {
		const parents = PeripheralDevices.find(selector).fetch()

		const modifier: FindOptions<PeripheralDevice> = {
			fields: {
				token: 0,
				secretSettings: 0,
			},
		}

		const cursor = PeripheralDevices.find(
			{
				$or: [
					{
						parentDeviceId: { $in: parents.map((i) => i._id) },
					},
					selector,
				],
			},
			modifier
		)

		return cursor
	}
	return null
})
meteorPublish(PubSub.peripheralDeviceCommands, function(deviceId: PeripheralDeviceId, token) {
	if (!deviceId) throw new Meteor.Error(400, 'deviceId argument missing')
	check(deviceId, String)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent({ deviceId: deviceId }, { userId: this.userId, token })) {
		return PeripheralDeviceCommands.find({ deviceId: deviceId })
	}
	return null
})
meteorPublish(PubSub.mediaWorkFlows, function(selector0, token) {
	const { cred, selector } = AutoFillSelector.deviceId(this.userId, selector0, token)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent(selector, cred)) {
		return MediaWorkFlows.find(selector)
	}
	return null
})
meteorPublish(PubSub.mediaWorkFlowSteps, function(selector0, token) {
	const { cred, selector } = AutoFillSelector.deviceId(this.userId, selector0, token)
	if (PeripheralDeviceReadAccess.peripheralDeviceContent(selector, cred)) {
		return MediaWorkFlowSteps.find(selector)
	}
	return null
})

meteorCustomPublishArray(PubSub.expectedPackagesForDevice, 'deviceExpectedPackages', function(
	pub,
	deviceId: PeripheralDeviceId,
	filterPlayoutDeviceIds: PeripheralDeviceId[] | undefined,
	token: string
) {
	if (PeripheralDeviceReadAccess.peripheralDeviceContent({ deviceId: deviceId }, { userId: this.userId, token })) {
		let peripheralDevice = PeripheralDevices.findOne(deviceId)

		if (!peripheralDevice) throw new Meteor.Error('PeripheralDevice "' + deviceId + '" not found')

		const studioId = peripheralDevice.studioId
		if (!studioId) return []

		const observer = setUpOptimizedObserver(
			`pub_${PubSub.mappingsForDevice}_${studioId}`,
			(triggerUpdate) => {
				// Set up observers:
				return [
					Studios.find(studioId, {
						fields: {
							mappingsHash: 1, // is changed when routes are changed
							packageContainers: 1,
						},
					}).observe({
						added: () => triggerUpdate({ studioId: studioId, invalidateStudio: true }),
						changed: () => triggerUpdate({ studioId: studioId, invalidateStudio: true }),
						removed: () => triggerUpdate({ studioId: null, invalidateStudio: true }),
					}),
					PeripheralDevices.find(
						{ studioId: studioId },
						{
							fields: {
								// Only monitor settings
								settings: 1,
							},
						}
					).observe({
						added: () => triggerUpdate({ invalidatePeripheralDevices: true }),
						changed: () => triggerUpdate({ invalidatePeripheralDevices: true }),
						removed: () => triggerUpdate({ invalidatePeripheralDevices: true }),
					}),
					ExpectedPackages.find({
						studioId: studioId,
					}).observe({
						added: () => triggerUpdate({ invalidateExpectedPackages: true }),
						changed: () => triggerUpdate({ invalidateExpectedPackages: true }),
						removed: () => triggerUpdate({ invalidateExpectedPackages: true }),
					}),
					RundownPlaylists.find(
						{
							studioId: studioId,
						},
						{
							fields: {
								// It should be enough to watch these fields for changes
								_id: 1,
								activationId: 1,
								rehearsal: 1,
								currentPartInstanceId: 1,
							},
						}
					).observe({
						added: () => triggerUpdate({ invalidateRundownPlaylist: true }),
						changed: () => triggerUpdate({ invalidateRundownPlaylist: true }),
						removed: () => triggerUpdate({ invalidateRundownPlaylist: true }),
					}),
				]
			},
			() => {
				// Initialize data
				return {
					studioId: studioId,
					deviceId: deviceId,

					// All invalidate flags should be true, so that they run on first run:
					invalidateStudio: true,
					invalidatePeripheralDevices: true,
					invalidateExpectedPackages: true,
					invalidateRundownPlaylist: true,

					studio: undefined,
					expectedPackages: [],
					routedExpectedPackages: [],
					activePlaylist: undefined,
					activeRundowns: [],
				}
			},
			(context: {
				// Input data:
				studioId: StudioId | undefined
				deviceId: PeripheralDeviceId

				// Data invalidation flags:
				invalidateStudio: boolean
				invalidatePeripheralDevices: boolean
				invalidateExpectedPackages: boolean
				invalidateRundownPlaylist: boolean

				// cache:
				studio: Studio | undefined
				expectedPackages: ExpectedPackageDB[]
				routedExpectedPackages: ResultingExpectedPackage[]
				activePlaylist: DBRundownPlaylist | undefined
				activeRundowns: DBRundown[]
			}) => {
				// Prepare data for publication:

				let invalidateRoutedExpectedPackages = false

				if (context.invalidateStudio) {
					context.invalidateStudio = false
					invalidateRoutedExpectedPackages = true
					context.studio = Studios.findOne(context.studioId)
				}
				if (!context.studio) return []

				if (context.invalidatePeripheralDevices) {
					context.invalidatePeripheralDevices = false
					invalidateRoutedExpectedPackages = true
				}
				if (context.invalidateExpectedPackages) {
					context.invalidateExpectedPackages = false
					invalidateRoutedExpectedPackages = true
					context.expectedPackages = ExpectedPackages.find({
						studioId: studioId,
					}).fetch()
				}
				// if (!context.expectedPackages.length) return []

				if (context.invalidateRundownPlaylist) {
					context.invalidateRundownPlaylist = false
					context.activePlaylist = RundownPlaylists.findOne({
						studioId: studioId,
						active: true,
					})
					context.activeRundowns = context.activePlaylist
						? Rundowns.find({
								playlistId: context.activePlaylist._id,
						  }).fetch()
						: []
				}

				const studio: Studio = context.studio

				interface MappingsExtWithPackage {
					[layerName: string]: MappingExt & { expectedPackages: ExpectedPackageDB[] }
				}

				if (invalidateRoutedExpectedPackages) {
					// Map the expectedPackages onto their specified layer:
					const routedMappingsWithPackages = routeExpectedPackages(studio, context.expectedPackages)

					// Filter, keep only the routed mappings for this device:
					const routedExpectedPackages: ResultingExpectedPackage[] = []

					for (const layerName of Object.keys(routedMappingsWithPackages)) {
						const mapping = routedMappingsWithPackages[layerName]

						if (!filterPlayoutDeviceIds || filterPlayoutDeviceIds.includes(mapping.deviceId)) {
							for (const expectedPackage of mapping.expectedPackages) {
								// Lookup Package sources:
								const combinedSources: PackageContainerOnPackage[] = []

								for (const packageSource of expectedPackage.sources) {
									const lookedUpSource = context.studio?.packageContainers[packageSource.containerId]
									if (lookedUpSource) {
										// We're going to combine the accessor attributes set on the Package with the ones defined on the source
										const combinedSource: PackageContainerOnPackage = {
											...omit(clone(lookedUpSource.container), 'accessors'),
											accessors: {},
											containerId: packageSource.containerId,
										}

										const accessorIds = _.uniq(
											Object.keys(lookedUpSource.container.accessors).concat(
												Object.keys(packageSource.accessors)
											)
										)

										for (const accessorId of accessorIds) {
											const sourceAccessor = lookedUpSource.container.accessors[accessorId] as
												| Accessor.Any
												| undefined

											const packageAccessor = packageSource.accessors[accessorId] as
												| AccessorOnPackage.Any
												| undefined

											if (
												packageAccessor &&
												sourceAccessor &&
												packageAccessor.type === sourceAccessor.type
											) {
												combinedSource.accessors[accessorId] = deepExtend(
													{},
													sourceAccessor,
													packageAccessor
												)
											} else if (packageAccessor) {
												combinedSource.accessors[accessorId] = clone<AccessorOnPackage.Any>(
													packageAccessor
												)
											} else if (sourceAccessor) {
												combinedSource.accessors[accessorId] = clone<Accessor.Any>(
													sourceAccessor
												) as AccessorOnPackage.Any
											}
										}

										// for (const [packageAccessorId, packageAccessor] of Object.entries(
										// 	packageSource.accessors
										// )) {
										// 	const sourceAccessor = lookedUpSource.container.accessors[
										// 		packageAccessorId
										// 	] as Accessor.Any | undefined

										// 	if (sourceAccessor && sourceAccessor.type === packageAccessor.type) {
										// 		combinedSource.accessors[packageAccessorId] = deepExtend(
										// 			{},
										// 			sourceAccessor,
										// 			packageAccessor
										// 		)
										// 	} else {
										// 		combinedSource.accessors[packageAccessorId] = packageAccessor
										// 	}
										// }
										combinedSources.push(combinedSource)
									}
								}

								// Lookup Package targets:

								const mappingDeviceId = unprotectString(mapping.deviceId)

								let packageContainerId: string | undefined
								for (const [containerId, packageContainer] of Object.entries(
									studio.packageContainers
								)) {
									if (packageContainer.deviceIds.includes(mappingDeviceId)) {
										// TODO: how to handle if a device has multiple containers?
										packageContainerId = containerId
										break // just picking the first one found, for now
									}
								}

								const combinedTargets: PackageContainerOnPackage[] = []
								if (packageContainerId) {
									const lookedUpTarget = context.studio?.packageContainers[packageContainerId]
									if (lookedUpTarget) {
										// Todo: should the be any combination of properties here?
										combinedTargets.push({
											...(lookedUpTarget.container as PackageContainerOnPackage),
											containerId: packageContainerId,
										})
									}
								}

								if (combinedSources.length && combinedTargets.length) {
									if (!expectedPackage.sideEffect.previewPackageSettings)
										expectedPackage.sideEffect.previewPackageSettings = getPreviewPackageSettings(
											expectedPackage as ExpectedPackage.Any
										)

									if (!expectedPackage.sideEffect.thumbnailPackageSettings)
										expectedPackage.sideEffect.thumbnailPackageSettings = getThumbnailPackageSettings(
											expectedPackage as ExpectedPackage.Any
										)

									routedExpectedPackages.push({
										expectedPackage: unprotectObject(expectedPackage),
										sources: combinedSources,
										targets: combinedTargets,
										playoutDeviceId: mapping.deviceId,
									})
								}
							}
						}
					}
					context.routedExpectedPackages = routedExpectedPackages
				}

				const packageContainers: { [containerId: string]: PackageContainer } = {}
				for (const [containerId, studioPackageContainer] of Object.entries(studio.packageContainers)) {
					packageContainers[containerId] = studioPackageContainer.container
				}

				const pubData = literal<DBObj[]>([
					{
						_id: protectString(`${deviceId}_expectedPackages`),
						type: 'expected_packages',
						studioId: studioId,
						expectedPackages: context.routedExpectedPackages,
						packageContainers: packageContainers,
					},
					{
						_id: protectString(`${deviceId}_rundownPlaylist`),
						type: 'active_playlist',
						studioId: studioId,
						activeplaylist: context.activePlaylist
							? {
									_id: context.activePlaylist._id,
									active: !!context.activePlaylist.activationId,
									rehearsal: context.activePlaylist.rehearsal,
							  }
							: undefined,
						activeRundowns: context.activeRundowns.map((rundown) => {
							return {
								_id: rundown._id,
								_rank: rundown._rank,
							}
						}),
					},
				])
				return pubData
			},
			(newData) => {
				pub.updatedDocs(newData)
			},
			500 // ms, wait this time before sending an update
		)
		pub.onStop(() => {
			observer.stop()
		})
	}
})

interface ResultingExpectedPackage {
	expectedPackage: ExpectedPackage.Base
	sources: PackageContainerOnPackage[]
	targets: PackageContainerOnPackage[]
	playoutDeviceId: PeripheralDeviceId
}
