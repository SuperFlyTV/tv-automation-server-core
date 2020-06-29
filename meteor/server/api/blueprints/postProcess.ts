import * as _ from 'underscore'
import { Piece, PieceId } from '../../../lib/collections/Pieces'
import { AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import {
	extendMandadory,
	getHash,
	protectString,
	unprotectString,
	Omit,
	ProtectedStringProperties,
	literal,
} from '../../../lib/lib'
import { TimelineObjGeneric, TimelineObjRundown, TimelineObjType } from '../../../lib/collections/Timeline'
import { Studio } from '../../../lib/collections/Studios'
import { Meteor } from 'meteor/meteor'
import {
	TimelineObjectCoreExt,
	IBlueprintPiece,
	IBlueprintAdLibPiece,
	RundownContext,
	TSR,
	IBlueprintActionManifest,
	SomeContent,
	NotesContext as INotesContext,
} from 'tv-automation-sofie-blueprints-integration'
import { RundownAPI } from '../../../lib/api/rundown'
import { BucketAdLib } from '../../../lib/collections/BucketAdlibs'
import { ShowStyleContext, NotesContext } from './context'
import { RundownImportVersions } from '../../../lib/collections/Rundowns'
import { BlueprintId } from '../../../lib/collections/Blueprints'
import { PartId } from '../../../lib/collections/Parts'
import { BucketId } from '../../../lib/collections/Buckets'
import { AdLibAction } from '../../../lib/collections/AdLibActions'
import { RundownBaselineAdLibAction } from '../../../lib/collections/RundownBaselineAdLibActions'
import { RundownId } from '../../../lib/collections/Rundowns'
import { prefixAllObjectIds } from '../playout/lib'

export function postProcessPieces(
	innerContext: ShowStyleContext,
	pieces: IBlueprintPiece[],
	blueprintId: BlueprintId,
	rundownId: RundownId,
	partId: PartId,
	allowNowForPiece?: boolean,
	prefixAllTimelineObjects?: boolean
): Piece[] {
	let i = 0
	let partsUniqueIds: { [id: string]: true } = {}
	let timelineUniqueIds: { [id: string]: true } = {}
	return _.map(_.compact(pieces), (itemOrig: IBlueprintPiece) => {
		let piece: Piece = {
			...(itemOrig as Omit<IBlueprintPiece, '_id' | 'continuesRefId'>),
			_id: protectString(itemOrig._id),
			continuesRefId: protectString(itemOrig.continuesRefId),
			rundownId: rundownId,
			partId: partId,
			status: RundownAPI.PieceStatusCode.UNKNOWN,
		}

		if (!piece._id) piece._id = protectString(innerContext.getHashId(`${blueprintId}_${partId}_piece_${i++}`))
		if (!piece.externalId && !piece.isTransition)
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" externalId not set for piece in ${partId}! ("${innerContext.unhashId(
					unprotectString(piece._id)
				)}")`
			)
		if (!allowNowForPiece && piece.enable.start === 'now')
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" piece cannot have a start of 'now' in ${partId}! ("${innerContext.unhashId(
					unprotectString(piece._id)
				)}")`
			)

		if (partsUniqueIds[unprotectString(piece._id)])
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" ids of pieces must be unique! ("${innerContext.unhashId(
					unprotectString(piece._id)
				)}")`
			)
		partsUniqueIds[unprotectString(piece._id)] = true

		if (piece.content && piece.content.timelineObjects) {
			piece.content.timelineObjects = postProcessTimelineObjects(
				innerContext,
				piece._id,
				blueprintId,
				piece.content.timelineObjects,
				prefixAllTimelineObjects || false,
				timelineUniqueIds
			)
		}

		return piece
	})
}

export function postProcessTimelineObjects(
	innerContext: INotesContext,
	pieceId: PieceId,
	blueprintId: BlueprintId,
	timelineObjects: TSR.TSRTimelineObjBase[],
	prefixAllTimelineObjects: boolean,
	timelineUniqueIds: { [key: string]: boolean }
) {
	let newObjs = _.map(_.compact(timelineObjects), (o: TimelineObjectCoreExt, i) => {
		const obj: TimelineObjRundown = {
			...o,
			id: o.id,
			_id: protectString(''), // set later
			studioId: protectString(''), // set later
			objectType: TimelineObjType.RUNDOWN,
		}

		if (!obj.id) obj.id = innerContext.getHashId(pieceId + '_' + i++)
		if (obj.enable.start === 'now')
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" timelineObjs cannot have a start of 'now'! ("${innerContext.unhashId(
					unprotectString(pieceId)
				)}")`
			)

		if (timelineUniqueIds[obj.id])
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}": ids of timelineObjs must be unique! ("${innerContext.unhashId(
					obj.id
				)}")`
			)
		timelineUniqueIds[obj.id] = true

		return obj
	})

	if (prefixAllTimelineObjects) {
		newObjs = prefixAllObjectIds(newObjs, unprotectString(pieceId) + '_')
	}

	return newObjs
}

export function postProcessAdLibPieces(
	innerContext: RundownContext,
	adLibPieces: IBlueprintAdLibPiece[],
	blueprintId: BlueprintId,
	partId?: PartId
): AdLibPiece[] {
	let i = 0
	let partsUniqueIds: { [id: string]: true } = {}
	let timelineUniqueIds: { [id: string]: true } = {}
	return _.map(_.compact(adLibPieces), (itemOrig: IBlueprintAdLibPiece) => {
		let piece: AdLibPiece = {
			...itemOrig,
			_id: protectString(innerContext.getHashId(`${blueprintId}_${partId}_adlib_piece_${i++}`)),
			rundownId: protectString(innerContext.rundown._id),
			partId: partId,
			status: RundownAPI.PieceStatusCode.UNKNOWN,
			disabled: false,
		}

		if (!piece.externalId)
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" externalId not set for piece in ' + partId + '! ("${innerContext.unhashId(
					unprotectString(piece._id)
				)}")`
			)

		if (partsUniqueIds[unprotectString(piece._id)])
			throw new Meteor.Error(
				400,
				`Error in blueprint "${blueprintId}" ids of pieces must be unique! ("${innerContext.unhashId(
					unprotectString(piece._id)
				)}")`
			)
		partsUniqueIds[unprotectString(piece._id)] = true

		if (piece.content && piece.content.timelineObjects) {
			piece.content.timelineObjects = postProcessTimelineObjects(
				innerContext,
				piece._id,
				blueprintId,
				piece.content.timelineObjects,
				false,
				timelineUniqueIds
			)
		}

		return piece
	})
}

export function postProcessGlobalAdLibActions(
	innerContext: RundownContext,
	adlibActions: IBlueprintActionManifest[],
	blueprintId: BlueprintId
): RundownBaselineAdLibAction[] {
	return _.map(adlibActions, (action, i) =>
		literal<RundownBaselineAdLibAction>({
			...action,
			actionId: action.actionId,
			_id: protectString(innerContext.getHashId(`${blueprintId}_global_adlib_action_${i}`)),
			rundownId: protectString(innerContext.rundownId),
			partId: undefined,
		})
	)
}

export function postProcessAdLibActions(
	innerContext: RundownContext,
	adlibActions: IBlueprintActionManifest[],
	blueprintId: BlueprintId,
	partId: PartId
): AdLibAction[] {
	return _.map(adlibActions, (action, i) =>
		literal<AdLibAction>({
			...action,
			actionId: action.actionId,
			_id: protectString(innerContext.getHashId(`${blueprintId}_${partId}_adlib_action_${i}`)),
			rundownId: protectString(innerContext.rundownId),
			partId: partId,
		})
	)
}

export function postProcessStudioBaselineObjects(studio: Studio, objs: TSR.TSRTimelineObjBase[]): TimelineObjRundown[] {
	const timelineUniqueIds: { [id: string]: true } = {}
	const context = new NotesContext('studio', 'studio', false)
	return postProcessTimelineObjects(
		context,
		protectString('studio'),
		studio.blueprintId!,
		objs,
		false,
		timelineUniqueIds
	)
}

export function postProcessRundownBaselineItems(
	innerContext: RundownContext,
	blueprintId: BlueprintId,
	baselineItems: TSR.TSRTimelineObjBase[]
): TimelineObjGeneric[] {
	const timelineUniqueIds: { [id: string]: true } = {}
	return postProcessTimelineObjects(
		innerContext,
		protectString('baseline'),
		blueprintId,
		baselineItems,
		false,
		timelineUniqueIds
	)
}

export function postProcessBucketAdLib(
	innerContext: ShowStyleContext,
	itemOrig: IBlueprintAdLibPiece,
	blueprintId: BlueprintId,
	bucketId: BucketId,
	rank: number | undefined,
	importVersions: RundownImportVersions
): BucketAdLib {
	let i = 0
	let partsUniqueIds: { [id: string]: true } = {}
	let timelineUniqueIds: { [id: string]: true } = {}
	let piece: BucketAdLib = {
		...itemOrig,
		_id: protectString(
			innerContext.getHashId(
				`${innerContext.showStyleVariantId}_${innerContext.studioId}_${bucketId}_bucket_adlib_${itemOrig.externalId}`
			)
		),
		studioId: innerContext.studioId,
		showStyleVariantId: innerContext.showStyleVariantId,
		bucketId,
		importVersions,
		_rank: rank || itemOrig._rank,
	}

	if (!piece.externalId)
		throw new Meteor.Error(
			400,
			`Error in blueprint "${blueprintId}" externalId not set for piece in ' + partId + '! ("${innerContext.unhashId(
				unprotectString(piece._id)
			)}")`
		)

	if (partsUniqueIds[unprotectString(piece._id)])
		throw new Meteor.Error(
			400,
			`Error in blueprint "${blueprintId}" ids of pieces must be unique! ("${innerContext.unhashId(
				unprotectString(piece._id)
			)}")`
		)
	partsUniqueIds[unprotectString(piece._id)] = true

	if (piece.content && piece.content.timelineObjects) {
		piece.content.timelineObjects = postProcessTimelineObjects(
			innerContext,
			piece._id,
			blueprintId,
			piece.content.timelineObjects,
			false,
			timelineUniqueIds
		)
	}

	return piece
}
