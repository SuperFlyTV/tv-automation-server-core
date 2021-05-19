import { ExpectedPackage } from '@sofie-automation/blueprints-integration'
import { TransformedCollection } from '../typings/meteor'
import { registerCollection, ProtectedString, hashObj, assertNever } from '../lib'
import { createMongoCollection } from './lib'
import { RundownId } from './Rundowns'
import { StudioId } from './Studios'
import { PieceId } from './Pieces'
import { registerIndex } from '../database'
import { AdLibActionId } from './AdLibActions'
import { BucketAdLibId } from './BucketAdlibs'
import { BucketAdLibActionId } from './BucketAdlibActions'
import { RundownBaselineAdLibActionId } from './RundownBaselineAdLibActions'
/*
 Expected Packages are created from Pieces in the rundown.
 A "Package" is a generic term for a "thing that can be played", such as media files, audio, graphics etc..
 The blueprints generate Pieces with expectedPackages on them.
 These are then picked up by a Package Manager who then tries to fullfill the expectations.
 Example: An ExpectedPackage could be a "Media file to be present on the location used by a playout device".
   The Package Manager will then copy the file to the right place.
*/

export type ExpectedPackageId = ProtectedString<'ExpectedPackageId'>

export type ExpectedPackageDB =
	| ExpectedPackageDBFromPiece
	| ExpectedPackageDBFromAdLibAction
	| ExpectedPackageDBFromBaselineAdLibAction
	| ExpectedPackageDBFromBucketAdLib
	| ExpectedPackageDBFromBucketAdLibAction

export enum ExpectedPackageDBType {
	PIECE = 'piece',
	ADLIB_ACTION = 'adlib_action',
	BASELINE_ADLIB_ACTION = 'baseline_adlib_action',
	BUCKET_ADLIB = 'bucket_adlib',
	BUCKET_ADLIB_ACTION = 'bucket_adlib_action',
}
export interface ExpectedPackageDBBase extends Omit<ExpectedPackage.Base, '_id'> {
	_id: ExpectedPackageId

	/** The studio of the Rundown of the Piece this package belongs to */
	studioId: StudioId

	/** Hash that changes whenever the content or version changes. See getContentVersionHash() */
	contentVersionHash: string

	pieceId: ProtectedString<any>
	fromPieceType: ExpectedPackageDBType
}
export interface ExpectedPackageDBFromPiece extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.PIECE
	/** The Piece this package belongs to */
	pieceId: PieceId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}

export interface ExpectedPackageDBFromAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.ADLIB_ACTION
	/** The Piece this package belongs to */
	pieceId: AdLibActionId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}
export interface ExpectedPackageDBFromBaselineAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BASELINE_ADLIB_ACTION
	/** The Piece this package belongs to */
	pieceId: RundownBaselineAdLibActionId
	/** The rundown of the Piece this package belongs to */
	rundownId: RundownId
}
export interface ExpectedPackageDBFromBucketAdLib extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BUCKET_ADLIB
	/** The Bucket adlib this package belongs to */
	pieceId: BucketAdLibId
}
export interface ExpectedPackageDBFromBucketAdLibAction extends ExpectedPackageDBBase {
	fromPieceType: ExpectedPackageDBType.BUCKET_ADLIB_ACTION
	/** The Bucket adlib-action this package belongs to */
	pieceId: BucketAdLibActionId
}
export const ExpectedPackages: TransformedCollection<
	ExpectedPackageDB,
	ExpectedPackageDB
> = createMongoCollection<ExpectedPackageDB>('expectedPackages')
registerCollection('ExpectedPackages', ExpectedPackages)

registerIndex(ExpectedPackages, {
	studioId: 1,
})
export function getContentVersionHash(expectedPackage: Omit<ExpectedPackage.Any, '_id'>): string {
	return hashObj({
		content: expectedPackage.content,
		version: expectedPackage.version,
		// todo: should expectedPackage.sources.containerId be here as well?
	})
}
export function getPreviewPackageSettings(
	expectedPackage: ExpectedPackage.Any
): ExpectedPackage.SideEffectPreviewSettings | undefined {
	let packagePath: string | undefined

	if (expectedPackage.type === ExpectedPackage.PackageType.MEDIA_FILE) {
		packagePath = expectedPackage.content.filePath
	} else if (expectedPackage.type === ExpectedPackage.PackageType.QUANTEL_CLIP) {
		packagePath = expectedPackage.content.guid || expectedPackage.content.title
	} else {
		assertNever(expectedPackage)
	}
	if (packagePath) {
		return {
			path: packagePath + '_preview.webm',
		}
	}
	return undefined
}
export function getThumbnailPackageSettings(
	expectedPackage: ExpectedPackage.Any
): ExpectedPackage.SideEffectThumbnailSettings | undefined {
	let packagePath: string | undefined

	if (expectedPackage.type === ExpectedPackage.PackageType.MEDIA_FILE) {
		packagePath = expectedPackage.content.filePath
	} else if (expectedPackage.type === ExpectedPackage.PackageType.QUANTEL_CLIP) {
		packagePath = expectedPackage.content.guid || expectedPackage.content.title
	} else {
		assertNever(expectedPackage)
	}
	if (packagePath) {
		return {
			path: packagePath + '_thumbnail.png',
		}
	}
	return undefined
}
