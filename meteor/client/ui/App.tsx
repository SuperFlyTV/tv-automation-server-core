import * as React from 'react'
import { translate, InjectedI18nProps } from 'react-i18next'
import * as m from 'moment'
import 'moment/min/locales'
import { parse as queryStringParse } from 'query-string'
import Header from './Header'
import {
	setAllowStudio,
	setAllowConfigure,
	getAllowStudio,
	getAllowConfigure,
	setAllowDeveloper,
	setAllowTesting,
	getAllowTesting,
	getAllowDeveloper,
	setAllowSpeaking,
	setAllowService,
	getAllowService,
	setHelpMode,
	setUIZoom,
	getUIZoom
} from '../lib/localStorage'
import Status from './Status'
import SettingsComponent from './Settings'
import TestTools from './TestTools'
import { RundownList } from './RundownList'
import { RundownView } from './RundownView'
import { ActiveRundownView } from './ActiveRundownView'
import { ClockView } from './ClockView'
import { ConnectionStatusNotification } from './ConnectionStatusNotification'
import {
  BrowserRouter as Router,
  Route,
  Switch,
  Redirect
} from 'react-router-dom'
import { ErrorBoundary } from '../lib/ErrorBoundary'
import { PrompterView } from './Prompter/PrompterView'
import { ModalDialogGlobalContainer } from '../lib/ModalDialog'
import { Settings } from '../../lib/Settings'
import { LoginPage } from './LoginPage'
import { SignupPage } from './SignupPage'
import { RequestResetPage } from './RequestResetPage'
import { ResetPage } from './ResetPage'
import { AccountPage } from './AccountPage'
import { getUserId, UserId } from '../../lib/collections/Users'
import { PubSub, meteorSubscribe } from '../../lib/api/pubsub'
import { translateWithTracker, Translated } from '../lib/ReactMeteorData/ReactMeteorData'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'

const NullComponent = () => null

const CRON_INTERVAL = 30 * 60 * 1000
const LAST_RESTART_LATENCY = 3 * 60 * 60 * 1000
const WINDOW_START_HOUR = 3
const WINDOW_END_HOUR = 5

interface iAppProps extends InjectedI18nProps {
	userId: UserId | null
}
interface IAppState {
	allowStudio: boolean
	allowConfigure: boolean
	allowTesting: boolean
	allowDeveloper: boolean
	allowService: boolean
	subscriptionsReady: boolean
}

// App component - represents the whole app
export const App = translateWithTracker(() => {
	const userId = getUserId() // just for reactivity
	meteorSubscribe(PubSub.organization, {})
	return { userId }
})(class App extends MeteorReactComponent<Translated<iAppProps>, IAppState> {
	private lastStart = 0

	constructor (props) {
		super(props)

		const params = queryStringParse(location.search)

		if (params['studio']) 	setAllowStudio(params['studio'] === '1')
		if (params['configure']) setAllowConfigure(params['configure'] === '1')
		if (params['develop']) setAllowDeveloper(params['develop'] === '1')
		if (params['testing']) setAllowTesting(params['testing'] === '1')
		if (params['speak']) setAllowSpeaking(params['speak'] === '1')
		if (params['service']) setAllowService(params['service'] === '1')
		if (params['help']) setHelpMode(params['help'] === '1')
		if (params['zoom'] && typeof params['zoom'] === 'string') {
			setUIZoom(parseFloat(params['zoom'] as string || '1') / 100 || 1)
		}

		if (params['admin']) {
			if (!Settings.enableUserAccounts) {
				const val = params['admin'] === '1'
				setAllowStudio(val)
				setAllowConfigure(val)
				setAllowDeveloper(val)
				setAllowTesting(val)
				setAllowService(val)
			}
		}

		this.state = {
			allowStudio: getAllowStudio(),
			allowConfigure: getAllowConfigure(),
			allowTesting: getAllowTesting(),
			allowDeveloper: getAllowDeveloper(),
			allowService: getAllowService(),
			subscriptionsReady: false
		}

		this.lastStart = Date.now()
		this.protectedRoute = this.protectedRoute.bind(this)
	}
	private protectedRoute ({ component: Component, ...args }: any) {
		if (!Settings.enableUserAccounts) {
			return <Route {...args} render={(props) => <Component {...props} />}/>
		} else {
			return <Route {...args} render={(props) => (
				this.props.userId
					? <Component {...props} />
					: <Redirect to='/' />
			)}/>
		}
	}
	cronJob = () => {
		const now = new Date()
		const hour = now.getHours() + (now.getMinutes() / 60)
		// if the time is between 3 and 5
		if ((hour >= WINDOW_START_HOUR) && (hour < WINDOW_END_HOUR) &&
		// and the previous restart happened more than 3 hours ago
			(Date.now() - this.lastStart > LAST_RESTART_LATENCY) &&
		// and not in an active rundown
			(document.querySelector('.rundown.active') === null)
		) {
			// forceReload is marked as deprecated, but it's still usable
			// tslint:disable-next-line
			setTimeout(() => window.location.reload(true))
		}
	}


	componentDidMount () {
		const { i18n } = this.props

		// Global subscription of the currently logged in user:
		this.subscribe(PubSub.loggedInUser, {})
		this.autorun(() => {
			// Set state just to force a re-render of the whole app when the user-data has arrived:
			this.setState({
				subscriptionsReady: this.subscriptionsReady() // reactive
			})
		})

		m.locale(i18n.language)
		document.documentElement.lang = i18n.language
		setInterval(this.cronJob, CRON_INTERVAL)

		const uiZoom = getUIZoom()
		if (uiZoom !== 1) {
			document.documentElement.style.fontSize = (uiZoom * 16) + 'px'
		}
	}

	componentDidUpdate () {
		if (Settings.enableUserAccounts && this.props.userId) {
			const roles = {
				allowConfigure: getAllowConfigure(),
				allowStudio: getAllowStudio(),
				allowDeveloper: getAllowDeveloper(),
				allowTesting: getAllowTesting()
			}
			const invalid = Object.keys(roles).findIndex(k => roles[k] !== this.state[k])
			if (invalid !== -1) this.setState({ ...roles })
		}
	}

	render () {
		return (
			<Router>
				<div className='container-fluid'>
					{/* Header switch - render the usual header for all pages but the rundown view */}
					{(!Settings.enableUserAccounts || this.props.userId) && <ErrorBoundary>
						<Switch>
							<Route path='/rundown/:playlistId' component={NullComponent} />
							<Route path='/countdowns/:studioId/presenter' component={NullComponent} />
							<Route path='/countdowns/presenter' component={NullComponent} />
							<Route path='/activeRundown' component={NullComponent} />
							<Route path='/prompter/:studioId' component={NullComponent} />
							<Route path='/' render={(props) => <Header
								{...props}
								userId={this.props.userId}
								allowConfigure={this.state.allowConfigure}
								allowTesting={this.state.allowTesting}
								allowDeveloper={this.state.allowDeveloper}
							/>} />
						</Switch>
					</ErrorBoundary>}
					{/* Main app switch */}
					<ErrorBoundary>
						<Switch>
							{Settings.enableUserAccounts ? [
								<Route key='0' exact path='/' component={(props) => <LoginPage {...props}/>} />,
								<Route key='1' exact path='/login' component={() => <Redirect to='/'/>}/>,
								<Route key='2' exact path='/signup' component={SignupPage} />,
								<Route key='3' exact path='/reset' component={RequestResetPage} />,
								<Route key='4' exact path='/reset/:token' component={ResetPage} />,
								<this.protectedRoute key='5' exact path='/account' component={AccountPage} />
							] : <Route exact path='/' component={RundownList} />
							}
							<this.protectedRoute path='/rundowns' component={RundownList} />
							<this.protectedRoute path='/rundown/:playlistId' component={RundownView} />
							<this.protectedRoute path='/activeRundown/:studioId' component={ActiveRundownView} />
							<this.protectedRoute path='/prompter/:studioId' component={PrompterView} />
							<this.protectedRoute path='/countdowns/:studioId/presenter' component={ClockView} />
							<this.protectedRoute path='/status' component={Status} />
							<this.protectedRoute path='/settings' component={() => <SettingsComponent userAccounts={Settings.enableUserAccounts}/>}/>
							<Route path='/testTools' component={TestTools} />
						</Switch>
					</ErrorBoundary>
					<ErrorBoundary>
						<Switch>
							{/* Put views that should NOT have the Notification center here: */}
							<Route path='/countdowns/:studioId/presenter' component={NullComponent} />
							<Route path='/countdowns/presenter' component={NullComponent} />
							<Route path='/prompter/:studioId' component={NullComponent} />
							<Route path='/' component={ConnectionStatusNotification} />
						</Switch>
					</ErrorBoundary>
					<ErrorBoundary>
						<ModalDialogGlobalContainer />
					</ErrorBoundary>
				</div>
			</Router>
		)
	}
})

export default App
