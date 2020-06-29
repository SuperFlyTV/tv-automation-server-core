import * as _ from 'underscore'
import { logger } from '../../logging'
import { Meteor } from 'meteor/meteor'
import { BlueprintManifestSet } from 'tv-automation-sofie-blueprints-integration'
import { ServerResponse, IncomingMessage } from 'http'
import { check, Match } from '../../../lib/check'
import { parse as parseUrl } from 'url'
import { uploadBlueprint } from './api'
import { protectString } from '../../../lib/lib'
import { BlueprintId } from '../../../lib/collections/Blueprints'
import { PickerPOST } from '../http'

PickerPOST.route('/blueprints/restore/:blueprintId', (params, req: IncomingMessage, res: ServerResponse, next) => {
	res.setHeader('Content-Type', 'text/plain')

	let content = ''
	try {
		const blueprintId = params.blueprintId
		const url = parseUrl(req.url || '', true)
		const force = url.query.force === '1' || url.query.force === 'true'

		const blueprintNames = url.query['name'] || undefined
		const blueprintName: string | undefined = _.isArray(blueprintNames) ? blueprintNames[0] : blueprintNames

		check(blueprintId, String)
		check(blueprintName, Match.Maybe(String))

		const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
		const body = (req as any).body as string | undefined
		if (!body) throw new Meteor.Error(400, 'Restore Blueprint: Missing request body')

		if (!_.isString(body) || body.length < 10)
			throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')

		uploadBlueprint(
			{ userId: protectString(userId) },
			protectString<BlueprintId>(blueprintId),
			body,
			blueprintName,
			force
		)

		res.statusCode = 200
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Blueprint restore failed: ' + e)
	}

	res.end(content)
})
PickerPOST.route('/blueprints/restore', (params, req: IncomingMessage, res: ServerResponse, next) => {
	res.setHeader('Content-Type', 'text/plain')

	let content = ''
	try {
		const body = req.body
		if (!body) throw new Meteor.Error(400, 'Restore Blueprint: Missing request body')

		let collection = body
		if (typeof body === 'string') {
			if (body.length < 10) throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')
			try {
				collection = JSON.parse(body) as BlueprintManifestSet
			} catch (e) {
				throw new Meteor.Error(400, 'Restore Blueprint: Failed to parse request body')
			}
		} else if (typeof body !== 'object') {
			throw new Meteor.Error(400, 'Restore Blueprint: Invalid request body')
		}

		if (!Meteor.isTest) logger.info(`Got blueprint collection. ${Object.keys(body).length} blueprints`)

		let errors: any[] = []
		for (const id of _.keys(collection)) {
			try {
				const userId = req.headers.authorization ? req.headers.authorization.split(' ')[1] : ''
				uploadBlueprint({ userId: protectString(userId) }, protectString<BlueprintId>(id), collection[id], id)
			} catch (e) {
				logger.error('Blueprint restore failed: ' + e)
				errors.push(e)
			}
		}

		// Report errors
		if (errors.length > 0) {
			res.statusCode = 500
			content += 'Errors were encountered: \n'
			for (const e of errors) {
				content += e + '\n'
			}
		} else {
			res.statusCode = 200
		}
	} catch (e) {
		res.statusCode = 500
		content = e + ''
		logger.error('Blueprint restore failed: ' + e)
	}

	res.end(content)
})
