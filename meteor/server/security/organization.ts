import { Meteor } from 'meteor/meteor'
import { check } from '../../lib/check'
import { OrganizationId } from '../../lib/collections/Organization'
import { Snapshots, SnapshotItem, SnapshotId } from '../../lib/collections/Snapshots'
import { Blueprints, Blueprint, BlueprintId } from '../../lib/collections/Blueprints'
import { logNotAllowed } from './lib/lib'
import { MongoQuery, UserId } from '../../lib/typings/meteor'
import { allowAccessToOrganization } from './lib/security'
import { Credentials, ResolvedCredentials, resolveCredentials } from './lib/credentials'
import { Settings } from '../../lib/Settings'
import { MethodContext } from '../../lib/api/methods'
import { triggerWriteAccess } from './lib/securityVerify'
import { isProtectedString } from '../../lib/lib'
import { Studio, StudioId, Studios } from '../../lib/collections/Studios'
import { ShowStyleBase, ShowStyleBaseId, ShowStyleBases } from '../../lib/collections/ShowStyleBases'

type OrganizationContent = { organizationId: OrganizationId }
export namespace OrganizationReadAccess {
	export function organization(
		selector: MongoQuery<{ _id: OrganizationId }>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		return organizationContent({ organizationId: selector._id }, cred)
	}
	/** Handles read access for all organization content (UserActions, Evaluations etc..) */
	export function organizationContent(
		selector: MongoQuery<OrganizationContent>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		check(selector, Object)
		if (!Settings.enableUserAccounts) return true
		if (!selector.organizationId) throw new Meteor.Error(400, 'selector must contain organizationId')

		const access = allowAccessToOrganization(cred, selector.organizationId)
		if (!access.read) return logNotAllowed('Organization content', access.reason)

		return true
	}
	export function adminUsers(
		selector: MongoQuery<OrganizationContent>,
		cred: Credentials | ResolvedCredentials
	): boolean {
		// TODO: User roles
		return organizationContent(selector, cred)
	}
}
export namespace OrganizationContentWriteAccess {
	// These functions throws if access is not allowed.

	export function studio(cred0: Credentials, existingStudio?: Studio | StudioId) {
		triggerWriteAccess()
		if (existingStudio && isProtectedString(existingStudio)) {
			const studioId = existingStudio
			existingStudio = Studios.findOne(studioId)
			if (!existingStudio) throw new Meteor.Error(404, `Studio "${studioId}" not found!`)
		}
		return { ...anyContent(cred0, existingStudio), studio: existingStudio }
	}
	export function evaluation(cred0: Credentials) {
		return anyContent(cred0)
	}
	export function mediaWorkFlows(cred0: Credentials, organizationId: OrganizationId) {
		// "All mediaWOrkflows in all devices of an organization"
		return anyContent(cred0, { organizationId: organizationId })
	}
	export function blueprint(cred0: Credentials, existingBlueprint?: Blueprint | BlueprintId, allowMissing?: boolean) {
		triggerWriteAccess()
		if (existingBlueprint && isProtectedString(existingBlueprint)) {
			const blueprintId = existingBlueprint
			existingBlueprint = Blueprints.findOne(blueprintId)
			if (!existingBlueprint && !allowMissing)
				throw new Meteor.Error(404, `Blueprint "${blueprintId}" not found!`)
		}
		/** Temporary secuirty bypasss for blueprint read only */
		const cred = resolveCredentials(cred0)
		if (!cred.organization) throw new Meteor.Error(500, `User has no organization`)
		return { userId: null, organizationId: cred.organization._id, cred: cred0 }
		/** Correct check is below */
		// return { ...anyContent(cred0, existingBlueprint), blueprint: existingBlueprint }
	}
	export function snapshot(cred0: Credentials, existingSnapshot?: SnapshotItem | SnapshotId) {
		triggerWriteAccess()
		if (existingSnapshot && isProtectedString(existingSnapshot)) {
			const snapshotId = existingSnapshot
			existingSnapshot = Snapshots.findOne(snapshotId)
			if (!existingSnapshot) throw new Meteor.Error(404, `Snapshot "${snapshotId}" not found!`)
		}
		return { ...anyContent(cred0, existingSnapshot), snapshot: existingSnapshot }
	}
	export function dataFromSnapshot(cred0: Credentials, organizationId: OrganizationId) {
		return anyContent(cred0, { organizationId: organizationId })
	}
	export function showStyleBase(cred0: Credentials, existingShowStyleBase?: ShowStyleBase | ShowStyleBaseId) {
		triggerWriteAccess()
		if (existingShowStyleBase && isProtectedString(existingShowStyleBase)) {
			const showStyleBaseId = existingShowStyleBase
			existingShowStyleBase = ShowStyleBases.findOne(showStyleBaseId)
			if (!existingShowStyleBase) throw new Meteor.Error(404, `ShowStyleBase "${showStyleBaseId}" not found!`)
		}
		return { ...anyContent(cred0, existingShowStyleBase), showStyleBase: existingShowStyleBase }
	}
	/** Return credentials if writing is allowed, throw otherwise */
	export function anyContent(
		cred0: Credentials | MethodContext,
		existingObj?: { organizationId: OrganizationId | null }
	): {
		userId: UserId | null
		organizationId: OrganizationId | null
		cred: ResolvedCredentials | Credentials
	} {
		triggerWriteAccess()
		if (!Settings.enableUserAccounts) {
			return { userId: null, organizationId: null, cred: cred0 }
		}
		const cred = resolveCredentials(cred0)
		if (!cred.user) throw new Meteor.Error(403, `Not logged in`)
		if (!cred.organization) throw new Meteor.Error(500, `User has no organization`)
		const access = allowAccessToOrganization(cred, existingObj ? existingObj.organizationId : cred.organization._id)
		if (!access.update) throw new Meteor.Error(403, `Not allowed: ${access.reason}`)

		return {
			userId: cred.user._id,
			organizationId: cred.organization._id,
			cred: cred,
		}
	}
}
