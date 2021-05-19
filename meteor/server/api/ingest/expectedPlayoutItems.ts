import { Piece } from '../../../lib/collections/Pieces'
import { ExpectedPlayoutItem } from '../../../lib/collections/ExpectedPlayoutItems'
import * as _ from 'underscore'
import { RundownId } from '../../../lib/collections/Rundowns'
import { AdLibPiece } from '../../../lib/collections/AdLibPieces'
import { PartId } from '../../../lib/collections/Parts'
import { protectString } from '../../../lib/lib'
import { CacheForIngest } from './cache'
import { saveIntoCache } from '../../cache/lib'
import { StudioId } from '../../../lib/collections/Studios'
import { AdLibAction } from '../../../lib/collections/AdLibActions'
import { RundownBaselineAdLibAction } from '../../../lib/collections/RundownBaselineAdLibActions'

function extractExpectedPlayoutItems(
	studioId: StudioId,
	rundownId: RundownId,
	partId: PartId | undefined,
	piece: Piece | AdLibPiece | AdLibAction | RundownBaselineAdLibAction
): ExpectedPlayoutItem[] {
	let expectedPlayoutItemsGeneric: ExpectedPlayoutItem[] = []

	if (piece.expectedPlayoutItems) {
		_.each(piece.expectedPlayoutItems, (pieceItem, i) => {
			expectedPlayoutItemsGeneric.push({
				...pieceItem,
				_id: protectString(piece._id + '_' + i),
				studioId: studioId,
				rundownId: rundownId,
				// pieceId: piece._id,
				partId: partId,
			})
		})
	}

	return expectedPlayoutItemsGeneric
}

/** @deprecated */
export function updateExpectedPlayoutItemsOnRundown(cache: CacheForIngest): void {
	const expectedPlayoutItems: ExpectedPlayoutItem[] = []

	const studioId = cache.Studio.doc._id
	const rundownId = cache.RundownId

	for (const piece of cache.Pieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, piece.startPartId, piece))
	}
	for (const piece of cache.AdLibPieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, piece.partId, piece))
	}
	for (const piece of cache.RundownBaselineAdLibPieces.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, undefined, piece))
	}
	for (const action of cache.AdLibActions.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, action.partId, action))
	}
	for (const action of cache.RundownBaselineAdLibActions.findFetch({})) {
		expectedPlayoutItems.push(...extractExpectedPlayoutItems(studioId, rundownId, undefined, action))
	}

	saveIntoCache<ExpectedPlayoutItem, ExpectedPlayoutItem>(cache.ExpectedPlayoutItems, {}, expectedPlayoutItems)
}
