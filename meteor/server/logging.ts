import * as Winston from 'winston'
import * as fs from 'fs'
import { getAbsolutePath } from './lib'

// @todo: remove this and do a PR to https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/winston
// because there's an error in the typings logging.debug() takes any, not only string
interface LoggerInstanceFixed extends Winston.Logger {
	error: LeveledLogMethodFixed
	warn: LeveledLogMethodFixed
	help: LeveledLogMethodFixed
	data: LeveledLogMethodFixed
	info: LeveledLogMethodFixed
	debug: LeveledLogMethodFixed
	prompt: LeveledLogMethodFixed
	verbose: LeveledLogMethodFixed
	input: LeveledLogMethodFixed
	silly: LeveledLogMethodFixed

	emerg: LeveledLogMethodFixed
	alert: LeveledLogMethodFixed
	crit: LeveledLogMethodFixed
	warning: LeveledLogMethodFixed
	notice: LeveledLogMethodFixed
}
interface LeveledLogMethodFixed {
	(msg: any, callback: Winston.LogCallback): LoggerInstanceFixed
	(msg: any, meta: any, callback: Winston.LogCallback): LoggerInstanceFixed
	(msg: any, ...meta: any[]): LoggerInstanceFixed
}
let leadingZeros = (num: number | string, length: number) => {
	num = num + ''
	if (num.length < length) {
		return '00000000000000000000000000000000000000000'.slice(0, length - num.length) + num
	} else {
		return num
	}
}
let logToFile = false
if (process.env.LOG_TO_FILE) logToFile = true

let logPath = process.env.LOG_FILE || ''

let logger: LoggerInstanceFixed
let transports

function safeStringify(o: any): string {
	try {
		return JSON.stringify(o) // make single line
	} catch (e) {
		return 'ERROR in safeStringify: ' + (e || 'N/A').toString()
	}
}
const customFormat = Winston.format.printf(({ timestamp, level, message, meta }) => {
	return `${timestamp} [${level}] ${message} ${meta ? safeStringify(meta) : ''}` // kz: TODO make this format correct
})

if (logToFile || logPath !== '') {
	// console.log(Meteor)
	if (logPath === '') {
		let time = new Date()
		let startDate =
			time.getFullYear() +
			'-' +
			leadingZeros(time.getMonth(), 2) +
			'-' +
			leadingZeros(time.getDate(), 2) +
			'_' +
			leadingZeros(time.getHours(), 2) +
			'_' +
			leadingZeros(time.getMinutes(), 2) +
			'_' +
			leadingZeros(time.getSeconds(), 2)
		let logDirectory = getAbsolutePath() + '/.meteor/local/log'
		logPath = logDirectory + '/log_' + startDate + '.log'
		// let logPath = './log/'

		if (!fs.existsSync(logDirectory)) {
			fs.mkdirSync(logDirectory)
		}
	}
	transports = {
		console: new Winston.transports.Console({
			level: 'verbose',
			handleExceptions: true,
		}),
		file: new Winston.transports.File({
			level: 'silly',
			handleExceptions: true,
			filename: logPath,
		}),
	}
	logger = Winston.createLogger({
		format: Winston.format.json(),
		transports: [transports.console, transports.file],
	})
	console.log('Logging to ' + logPath)
} else {
	transports = {
		console: new Winston.transports.Console({
			level: 'silly',
			handleExceptions: true,
		}),
	}
	logger = Winston.createLogger({
		format: Winston.format.combine(Winston.format.timestamp(), customFormat),
		transports: [transports.console],
	})
}

export { logger, transports }
