import { OrganizationId } from '../../lib/collections/Organization'
import { StudioId, Studios } from '../../lib/collections/Studios'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { protectString, getCurrentTime, getRandomId, saveIntoDb } from '../../lib/lib'
import { Meteor } from 'meteor/meteor'
import { getUser } from '../../lib/collections/Users'
import { insertStudioInner } from '../api/studios'
import { DBRundownPlaylist, RundownPlaylists } from '../../lib/collections/RundownPlaylists'
import { DBRundown, Rundowns } from '../../lib/collections/Rundowns'
import { insertShowStyleBaseInner, insertShowStyleVariantInner } from '../api/showStyles'
import { ShowStyleVariant, ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { DBSegment, Segments } from '../../lib/collections/Segments'
import { DBPart, Parts } from '../../lib/collections/Parts'
import { Piece, Pieces } from '../../lib/collections/Pieces'

export function superFlySetupOrganization(orgId: OrganizationId) {
	let studio = Studios.findOne({
		organizationId: orgId,
	})
	if (!studio) {
		const studioId = insertStudioInner(orgId)
		Studios.update(studioId, { $set: { name: 'Example Studio' } })
		studio = Studios.findOne(studioId)
		if (!studio) throw new Meteor.Error(404, `Studio "${studioId}" not found`)
	}
	let showStyleBase = ShowStyleBases.findOne({
		organizationId: orgId,
	})
	if (!showStyleBase) {
		const showStyleBaseId = insertShowStyleBaseInner(orgId)
		ShowStyleBases.update(showStyleBaseId, { $set: { name: 'Example Showstyle' } })
		showStyleBase = ShowStyleBases.findOne(showStyleBaseId)
		if (!showStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${showStyleBaseId}" not found`)
	}
	let showStyleVariant = ShowStyleVariants.findOne({
		showStyleBaseId: showStyleBase._id,
	})
	if (!showStyleVariant) {
		const showStyleVariantId = insertShowStyleVariantInner(showStyleBase)
		showStyleVariant = ShowStyleVariants.findOne(showStyleVariantId)
		if (!showStyleVariant) throw new Meteor.Error(404, `ShowStyleVariant "${showStyleVariantId}" not found`)
	}

	const { playlist, rundown, segments, parts, pieces } = getExampleData(orgId, studio._id, showStyleVariant)

	let existingPlaylist = RundownPlaylists.findOne({
		organizationId: orgId,
		name: playlist.name,
	})

	if (!existingPlaylist) {
		// Insert existing example playlist:
		RundownPlaylists.insert(playlist)
		Rundowns.insert(rundown)

		saveIntoDb<DBSegment, DBSegment>(
			Segments,
			{
				rundownId: rundown._id,
			},
			segments
		)
		saveIntoDb<DBPart, DBPart>(
			Parts,
			{
				rundownId: rundown._id,
			},
			parts
		)
		saveIntoDb<Piece, Piece>(
			Pieces,
			{
				rundownId: rundown._id,
			},
			pieces
		)
	}
}

export function getExampleData(organizationId: OrganizationId, studioId: StudioId, variant: ShowStyleVariant) {
	const playlist: DBRundownPlaylist = {
		_id: getRandomId(),

		externalId: '',
		peripheralDeviceId: protectString(''),
		organizationId: organizationId,
		studioId: studioId,

		name: 'Example Rundown',
		created: getCurrentTime(),
		modified: getCurrentTime(),

		active: false,
		rehearsal: false,
		currentPartInstanceId: null,
		nextPartInstanceId: null,
		previousPartInstanceId: null,
	}
	const rundown: DBRundown = {
		peripheralDeviceId: protectString(''),
		organizationId: organizationId,
		studioId: studioId,
		showStyleBaseId: variant.showStyleBaseId,
		showStyleVariantId: variant._id,

		playlistId: playlist._id,
		_rank: 0,

		_id: getRandomId(),
		externalId: '',
		name: playlist.name,

		created: getCurrentTime(),
		modified: getCurrentTime(),
		importVersions: {
			studio: '',
			showStyleBase: '',
			showStyleVariant: '',
			blueprint: '',
			core: '',
		},
		dataSource: 'example',
	}
	const segments: DBSegment[] = []
	const parts: DBPart[] = []
	const pieces: Piece[] = []
	return {
		playlist,
		rundown,
		segments,
		parts,
		pieces,
	}
}

Meteor.methods({
	debug_superfly_SetupOrganization: () => {
		const user = getUser()
		if (user?.superAdmin) {
			// @ts-ignore
			superFlySetupOrganization(user.organizationId)
		} else throw new Meteor.Error(403, `Only SuperAdmins are allowed to do that`)
	},
})
