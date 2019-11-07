import { CoreSystem } from '../../../lib/collections/CoreSystem'
import { IncomingMessage, ServerResponse } from 'http'
import { Picker } from 'meteor/meteorhacks:picker'
import { postHandler } from './postHandler'
import { logger } from '../../logging'
import * as bodyParser from 'body-parser'
import { deleteMessage, readAllMessages } from './serviceMessagesApi'

const postRoute = Picker.filter((req, res) => req.method === 'POST')
postRoute.middleware(bodyParser.json())
postRoute.route('/serviceMessages', postHandler)

const getRoute = Picker.filter((req, res) => req.method === 'GET')
getRoute.route('/serviceMessages', getHandler)
getRoute.route('/serviceMessages/:id', getMessageHandler)

const deleteRoute = Picker.filter((req, res) => req.method === 'DELETE')
deleteRoute.route('/serviceMessages/:id', deleteHandler)


/**
 * List all current messages stored on this instance
 */
function getHandler (
	params,
	req: IncomingMessage,
	res: ServerResponse,
	next: () => void
) {
	try {
		const valuesArray = readAllMessages()
		res.setHeader('Content-Type', 'application/json; charset-utf8')
		res.end(JSON.stringify(valuesArray), 'utf-8')
	} catch (error) {
		res.statusCode = 500
		res.end('Unable to list service messages')
		return
	}
}

/**
 * Delete a message
 */
function deleteHandler (
	params,
	req: IncomingMessage,
	res: ServerResponse,
	next: () => void
) {
	const { id } = params
	try {
		if (readAllMessages().find(m => m.id === id)) {
			const deleted = deleteMessage(id)
			res.setHeader('Content-Type', 'application/json; charset-utf8')
			res.end(JSON.stringify(deleted), 'utf-8')
		} else {
			res.statusCode = 404
			res.end(`Message with id ${id} can not be found`)
		}
	} catch (error) {
		res.statusCode = 500
		res.end(`Unable to delete service message ${id}`)
	}
}

/**
 * Retrieves a single message based on a given id
 */
function getMessageHandler (
	params,
	req: IncomingMessage,
	res: ServerResponse,
	next: () => void
) {
	const { id } = params
	try {
		const message = readAllMessages().find(m => m.id === id)
		if (message) {
			res.setHeader('Content-Type', 'application/json; charset-utf8')
			res.end(JSON.stringify(message), 'utf-8')
		} else {
			res.statusCode = 404
			res.end(`Message with id ${id} can not be found`)
		}
	} catch (error) {
		res.statusCode = 500
		res.end(`Unable to retrieve service message ${id}`)
	}
}
