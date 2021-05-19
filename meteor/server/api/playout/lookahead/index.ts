import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import {
	LookaheadMode,
	Timeline as TimelineTypes,
	OnGenerateTimelineObj,
} from '@sofie-automation/blueprints-integration'
import { MappingExt } from '../../../../lib/collections/Studios'
import {
	OnGenerateTimelineObjExt,
	TimelineObjRundown,
	updateLookaheadLayer,
} from '../../../../lib/collections/Timeline'
import { PartId } from '../../../../lib/collections/Parts'
import { Piece, Pieces } from '../../../../lib/collections/Pieces'
import { clone } from '../../../../lib/lib'
import { profiler } from '../../profiler'
import {
	hasPieceInstanceDefinitelyEnded,
	SelectedPartInstancesTimelineInfo,
	SelectedPartInstanceTimelineInfo,
} from '../timeline'
import { Mongo } from 'meteor/mongo'
import { getOrderedPartsAfterPlayhead, PartInstanceAndPieceInstances } from './util'
import { findLookaheadForLayer, LookaheadResult } from './findForLayer'
import { CacheForPlayout, getRundownIDsFromCache } from '../cache'
import { asyncCollectionFindFetch } from '../../../lib/database'

const LOOKAHEAD_OBJ_PRIORITY = 0.1

function findLargestLookaheadDistance(mappings: Array<[string, MappingExt]>): number {
	const defaultSearchDistance = 10
	const values = mappings.map(([id, m]) => m.lookaheadMaxSearchDistance ?? defaultSearchDistance)
	return _.max(values)
}

type ValidLookaheadMode = LookaheadMode.PRELOAD | LookaheadMode.WHEN_CLEAR

export async function getLookeaheadObjects(
	cache: CacheForPlayout,
	partInstancesInfo0: SelectedPartInstancesTimelineInfo
): Promise<Array<TimelineObjRundown & OnGenerateTimelineObjExt>> {
	const span = profiler.startSpan('getLookeaheadObjects')
	const mappingsToConsider = Object.entries(cache.Studio.doc.mappings ?? {}).filter(
		([id, map]) => map.lookahead !== LookaheadMode.NONE && map.lookahead !== undefined
	)
	if (mappingsToConsider.length === 0) {
		if (span) span.end()
		return []
	}

	const maxLookaheadDistance = findLargestLookaheadDistance(mappingsToConsider)
	const orderedPartsFollowingPlayhead = getOrderedPartsAfterPlayhead(cache, maxLookaheadDistance)

	const piecesToSearchQuery: Mongo.Query<Piece> = {
		startPartId: { $in: orderedPartsFollowingPlayhead.map((p) => p._id) },
		startRundownId: { $in: getRundownIDsFromCache(cache) },
		invalid: { $ne: true },
	}
	const pPiecesToSearch = asyncCollectionFindFetch(Pieces, piecesToSearchQuery)

	function getPrunedEndedPieceInstances(info: SelectedPartInstanceTimelineInfo) {
		if (!info.partInstance.timings?.startedPlayback) {
			return info.pieceInstances
		} else {
			return info.pieceInstances.filter((p) => !hasPieceInstanceDefinitelyEnded(p, info.nowInPart))
		}
	}
	const partInstancesInfo: PartInstanceAndPieceInstances[] = _.compact([
		partInstancesInfo0.current
			? {
					part: partInstancesInfo0.current.partInstance,
					onTimeline: true,
					nowInPart: partInstancesInfo0.current.nowInPart,
					allPieces: getPrunedEndedPieceInstances(partInstancesInfo0.current),
			  }
			: undefined,
		partInstancesInfo0.next
			? {
					part: partInstancesInfo0.next.partInstance,
					onTimeline: !!partInstancesInfo0.current?.partInstance?.part?.autoNext,
					nowInPart: partInstancesInfo0.next.nowInPart,
					allPieces: partInstancesInfo0.next.pieceInstances,
			  }
			: undefined,
	])
	// Track the previous info for checking how the timeline will be built
	let previousPartInfo: PartInstanceAndPieceInstances | undefined
	if (partInstancesInfo0.previous) {
		previousPartInfo = {
			part: partInstancesInfo0.previous.partInstance,
			onTimeline: true,
			nowInPart: partInstancesInfo0.previous.nowInPart,
			allPieces: getPrunedEndedPieceInstances(partInstancesInfo0.previous),
		}
	}

	// TODO: Do we need to use processAndPrunePieceInstanceTimings on these pieces? In theory yes, but that gets messy and expensive.
	// In reality, there are not likely to be any/many conflicts if the blueprints are written well so it shouldnt be a problem
	const piecesToSearch = await pPiecesToSearch

	const piecesByPart = new Map<PartId, Piece[]>()
	for (const piece of piecesToSearch) {
		const existing = piecesByPart.get(piece.startPartId)
		if (existing) {
			existing.push(piece)
		} else {
			piecesByPart.set(piece.startPartId, [piece])
		}
	}

	const timelineObjs: Array<TimelineObjRundown & OnGenerateTimelineObjExt> = []
	const futurePartCount = orderedPartsFollowingPlayhead.length + (partInstancesInfo0.next ? 1 : 0)
	for (const [layerId, mapping] of mappingsToConsider) {
		if (mapping.lookahead !== LookaheadMode.NONE) {
			const lookaheadTargetObjects = mapping.lookaheadDepth || 1
			const lookaheadMaxSearchDistance =
				mapping.lookaheadMaxSearchDistance !== undefined && mapping.lookaheadMaxSearchDistance >= 0
					? mapping.lookaheadMaxSearchDistance
					: futurePartCount

			const lookaheadObjs = findLookaheadForLayer(
				cache.Playlist.doc.currentPartInstanceId,
				partInstancesInfo,
				previousPartInfo,
				orderedPartsFollowingPlayhead,
				piecesByPart,
				layerId,
				lookaheadTargetObjects,
				lookaheadMaxSearchDistance
			)

			timelineObjs.push(...processResult(lookaheadObjs, mapping.lookahead))
		}
	}
	if (span) span.end()
	return timelineObjs
}

// elsewhere uses prefixAllObjectIds to do this, but we want to apply to a single object from itself
const getStartOfObjectRef = (obj: TimelineObjRundown & OnGenerateTimelineObj): string =>
	`#${obj.pieceInstanceId ?? ''}${obj.originalId ?? obj.id}.start`
const calculateStartAfterPreviousObj = (
	prevObj: TimelineObjRundown & OnGenerateTimelineObj
): TimelineTypes.TimelineEnable => {
	const prevHasDelayFlag = (prevObj.classes || []).indexOf('_lookahead_start_delay') !== -1

	// Start with previous piece
	const startOffset = prevHasDelayFlag ? 2000 : 0
	return {
		start: `${getStartOfObjectRef(prevObj)} + ${startOffset}`,
	}
}
function mutateLookaheadObject(
	rawObj: TimelineObjRundown & OnGenerateTimelineObjExt,
	i: string,
	enable: TimelineObjRundown['enable'],
	mode: ValidLookaheadMode,
	priority: number,
	disabled: boolean
): TimelineObjRundown & OnGenerateTimelineObjExt {
	const obj = clone(rawObj)

	obj.id = `lookahead_${i}_${obj.id}`
	obj.priority = priority
	obj.enable = enable
	obj.isLookahead = true
	if (obj.keyframes) {
		obj.keyframes = obj.keyframes.filter((kf) => kf.preserveForLookahead)
	}
	delete obj.inGroup // force it to be cleared

	if (mode === LookaheadMode.PRELOAD) {
		// Set lookaheadForLayer to reference the original layer:
		updateLookaheadLayer(obj)
	}
	return obj
}

function processResult(
	lookaheadObjs: LookaheadResult,
	mode: ValidLookaheadMode
): Array<TimelineObjRundown & OnGenerateTimelineObjExt> {
	const res: Array<TimelineObjRundown & OnGenerateTimelineObjExt> = []

	// Add the objects that have some timing info
	lookaheadObjs.timed.forEach((obj, i) => {
		let enable: TimelineTypes.TimelineEnable = {
			start: 1, // Absolute 0 without a group doesnt work
		}
		if (i !== 0) {
			const prevObj = lookaheadObjs.timed[i - 1]
			enable = calculateStartAfterPreviousObj(prevObj)
		}
		if (!obj.id) throw new Meteor.Error(500, 'lookahead: timeline obj id not set')

		enable.end = getStartOfObjectRef(obj)

		res.push(mutateLookaheadObject(obj, `timed${i}`, enable, mode, LOOKAHEAD_OBJ_PRIORITY, false))
	})

	// Add each of the future objects, that have no end point
	const futureObjCount = lookaheadObjs.future.length
	const futurePriorityScale = LOOKAHEAD_OBJ_PRIORITY / (futureObjCount + 1)
	lookaheadObjs.future.some((obj, i) => {
		if (!obj.id) throw new Meteor.Error(500, 'lookahead: timeline obj id not set')

		// WHEN_CLEAR mode can't take multiple futures, as they are always flattened into the single layer.
		// so give it some real timings, and only leave one enabled. The rest are added for onTimelineGenerate to do some 'magic'
		const singleEnabledObj = mode === LookaheadMode.WHEN_CLEAR

		const lastTimedObj = _.last(lookaheadObjs.timed)
		const enable =
			singleEnabledObj && i === 0 && lastTimedObj ? calculateStartAfterPreviousObj(lastTimedObj) : { while: '1' }
		// We use while: 1 for the enabler, as any time before it should be active will be filled by either a playing object, or a timed lookahead.
		// And this allows multiple futures to be timed in a way that allows them to co-exist

		// Prioritise so that the earlier ones are higher, decreasing within the range 'reserved' for lookahead
		const priority = futurePriorityScale * (futureObjCount - i)
		res.push(mutateLookaheadObject(obj, `future${i}`, enable, mode, priority, singleEnabledObj && i !== 0))
	})

	return res
}
