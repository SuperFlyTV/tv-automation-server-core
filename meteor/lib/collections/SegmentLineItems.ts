import { Mongo } from 'meteor/mongo'
import { RunningOrderAPI } from '../api/runningOrder'
import { TimelineTransition } from 'timeline-state-resolver-types'
import { TransformedCollection } from '../typings/meteor'
import { SegmentLineTimings } from './SegmentLines'
import { registerCollection } from '../lib'
import { Meteor } from 'meteor/meteor'

import { IBlueprintSegmentLineItem, SegmentLineItemLifespan } from 'tv-automation-sofie-blueprints-integration'
import { TimelineTrigger } from 'tv-automation-sofie-blueprints-integration'
import { SomeContent } from 'tv-automation-sofie-blueprints-integration'

/** A Single item in a "line": script, VT, cameras */
export interface SegmentLineItemGeneric {
	_id: string
	/** ID of the source object in MOS */
	mosId: string
	/** The segment line this item belongs to - can be undefined for global ad lib segment line items */
	segmentLineId?: string
	/** The running order this item belongs to */
	runningOrderId: string
	/** User-presentable name for the timeline item */
	name: string
	/** Timeline item trigger. Possibly, most of these will be manually triggered as next, but maybe some will be automatic. */
	trigger?: TimelineTrigger
	/** Playback availability status */
	status: RunningOrderAPI.LineItemStatusCode
	/** Source layer the timeline item belongs to */
	sourceLayerId: string
  	/** Layer output this segment line item belongs to */
	outputLayerId: string
	/** Expected duration of the item as planned or as estimated by the system (in case of Script layers), in milliseconds. */
	expectedDuration?: number | string
	/** Actual duration of the item, as played-back, in milliseconds. This value will be updated during playback for some types of items. */
	duration?: number
	/** A flag to signal a given SegmentLineItem has been deactivated manually */
	disabled?: boolean
	/** A flag to signal that a given SegmentLineItem should be hidden from the UI */
	hidden?: boolean
	/** A flag to signal that a given SegmentLineItem has no content, and exists only as a marker on the timeline */
	virtual?: boolean
	/** The transition used by this segment line item to transition to and from the item */
	transitions?: {
		/** In transition for the item */
		inTransition?: TimelineTransition
		/** The out transition for the item */
		outTransition?: TimelineTransition
	}
	/** The object describing the item in detail */
	content?: SomeContent
	/** The id of the item this item is a continuation of. If it is a continuation, the inTranstion must not be set, and trigger must be 0 */
	continuesRefId?: string
	/** If this item has been created play-time using an AdLibItem, this should be set to it's source item */
	adLibSourceId?: string
	/** If this item has been insterted during run of RO (such as adLibs). Df set, this won't be affected by updates from MOS */
	dynamicallyInserted?: boolean,
	/** The time the system started playback of this segment line, null if not yet played back (milliseconds since epoch) */
	startedPlayback?: number
	/** Playout timings, in here we log times when playout happens */
	timings?: SegmentLineTimings
	/** If this item has been inserted by the post-process blueprint step */
	fromPostProcess?: boolean

	isTransition?: boolean
	infiniteMode?: SegmentLineItemLifespan
	extendOnHold?: boolean
}

export interface SegmentLineItem extends SegmentLineItemGeneric, IBlueprintSegmentLineItem {
	trigger: TimelineTrigger
	segmentLineId: string
	expectedDuration: number | string
	/** This is set when an item's duration needs to be overriden */
	durationOverride?: number
	isTransition?: boolean

	/** This is set when the item is infinite, to deduplicate the contents on the timeline, while allowing out of order */
	infiniteMode?: SegmentLineItemLifespan
	infiniteId?: string

	/** Whether this line should be extended into the next segment line when HOLD is activated */
	extendOnHold?: boolean

	startedPlayback?: number

	adLibSourceId?: string // only set when generated from an adlib
	dynamicallyInserted?: boolean // only set when generated from an adlib

	fromPostProcess?: boolean // only set when generated by post-process step

	/** This is set when the item isn't infinite, but should overflow it's duration onto the adjacent (not just next) segment line on take */
	overflows?: boolean
}

export const SegmentLineItems: TransformedCollection<SegmentLineItem, SegmentLineItem>
	= new Mongo.Collection<SegmentLineItem>('segmentLineItems')
registerCollection('SegmentLineItems', SegmentLineItems)
Meteor.startup(() => {
	if (Meteor.isServer) {
		SegmentLineItems._ensureIndex({
			runningOrderId: 1,
			segmentLineId: 1
		})
	}
})
