import { PieceGeneric } from './Pieces'
import { TransformedCollection } from '../typings/meteor'
import { registerCollection, ProtectedString } from '../lib'
import { Meteor } from 'meteor/meteor'
import { IBlueprintAdLibPiece, BaseContent } from 'tv-automation-sofie-blueprints-integration'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'

export type BucketId = ProtectedString<'BucketId'>

/**
 * A Bucket is an container for AdLib pieces that do not come from a MOS gateway and are
 * free-floating between mutliple rundowns/rundown playlists
 */
export interface Bucket {
	_id: BucketId
	/** A user-presentable name for a bucket */
	name: string
	/** Rank used for sorting buckets */
	_rank: number

	/** The studio this bucket belongs to, */
	studioId: StudioId
	/** Only the owner can delete a bucket from the RundownView UI. Anyone who can see the bucket can add and remove stuff from it. */
	userId: string | null

	/** The default width of the bucket. Can possibly be runtime-modified by the user (stored in localStorage?) */
	width?: number

	/** Scaling factors for the buttons. Quite possibly not settable in the UI at all? */
	buttonWidthScale: number
	buttonHeightScale: number
}
export const Buckets: TransformedCollection<Bucket, Bucket> = createMongoCollection<Bucket>('buckets')
registerCollection('Buckets', Buckets)
Meteor.startup(() => {
	if (Meteor.isServer) {
		Buckets._ensureIndex({
			studioId: 1,
		})
	}
})
