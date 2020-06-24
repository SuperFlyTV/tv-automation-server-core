import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { Settings } from '../../lib/Settings'

Meteor.startup(function() {
	if (!Settings.enableUserAccounts) return
	process.env.MAIL_URL = Meteor.settings.MAIL_URL
	Accounts.urls.verifyEmail = function(token) {
		return Meteor.absoluteUrl('login/verify-email/' + token)
	}
})
