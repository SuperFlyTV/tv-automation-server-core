import * as _ from 'underscore'
import * as React from 'react'
import * as ClassNames from 'classnames'
import { EditAttribute } from '../../lib/EditAttribute'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Spinner } from '../../lib/Spinner'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { Blueprints } from '../../../lib/collections/Blueprints'
import { ShowStyleBase, ShowStyleBases, HotkeyDefinition } from '../../../lib/collections/ShowStyleBases'
import { doModalDialog } from '../../lib/ModalDialog'
import * as faTrash from '@fortawesome/fontawesome-free-solid/faTrash'
import * as faPencilAlt from '@fortawesome/fontawesome-free-solid/faPencilAlt'
import * as faCheck from '@fortawesome/fontawesome-free-solid/faCheck'
import * as faPlus from '@fortawesome/fontawesome-free-solid/faPlus'
import * as FontAwesomeIcon from '@fortawesome/react-fontawesome'
import { findHighestRank } from './StudioSettings'
import { literal } from '../../../lib/lib'
import { Random } from 'meteor/random'
import { translate } from 'react-i18next'
import { mousetrapHelper } from '../../lib/mousetrapHelper'
import { ShowStyleVariants, ShowStyleVariant } from '../../../lib/collections/ShowStyleVariants'
import { callMethod } from '../../lib/clientAPI'
import { ShowStylesAPI } from '../../../lib/api/showStyles'
import { ISourceLayer, SourceLayerType, IOutputLayer, IBlueprintRuntimeArgumentsItem, BlueprintManifestType } from 'tv-automation-sofie-blueprints-integration'
import { ConfigManifestSettings, collectConfigs } from './ConfigManifestSettings'
import { Studios, Studio } from '../../../lib/collections/Studios'
import { Link } from 'react-router-dom'
import RundownLayoutEditor from './RundownLayoutEditor'
import { SettingsNavigation } from '../../lib/SettingsNavigation'

interface IProps {
	match: {
		params: {
			showStyleBaseId: string
		}
	}
}
interface IState {
	uploadFileKey: number // Used to force clear the input after use
	showUploadConfirm: boolean
	uploadFileName?: string
	uploadFileContents?: string
}
interface ITrackedProps {
	showStyleBase?: ShowStyleBase
	showStyleVariants: Array<ShowStyleVariant>
	compatibleStudios: Array<Studio>
}
export default translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	let showStyleBase = ShowStyleBases.findOne(props.match.params.showStyleBaseId)
	const compatibleStudios = showStyleBase ? Studios.find({
		supportedShowStyleBase: {
			$in: [showStyleBase._id]
		}
	}).fetch() : []
	return {
		showStyleBase: showStyleBase,
		showStyleVariants: showStyleBase ? ShowStyleVariants.find({
			showStyleBaseId: showStyleBase._id
		}).fetch() : [],
		compatibleStudios: compatibleStudios
	}
})(class ShowStyleBaseSettings extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
	constructor (props: Translated<IProps & ITrackedProps>) {
		super(props)
		this.state = {
			uploadFileKey: Date.now(),
			showUploadConfirm: false
		}
	}

	onUploadFile (e) {
		const file = e.target.files[0]
		if (!file) {
			return
		}

		const reader = new FileReader()
		reader.onload = (e2) => {
			this.setState({
				uploadFileKey: Date.now(),
				showUploadConfirm: true,
				uploadFileName: file.name,
				uploadFileContents: (e2.target as any).result
			})
		}

		reader.readAsText(file)
	}

	getOptionBlueprints () {
		return _.map(Blueprints.find({ blueprintType: BlueprintManifestType.SHOWSTYLE }).fetch(), (blueprint) => {
			return {
				name: blueprint.name ? blueprint.name + ` (${blueprint._id})` : blueprint._id,
				value: blueprint._id
			}
		})
	}

	renderEditForm (showStyleBase: ShowStyleBase) {
		const { t } = this.props

		return (
			<div className='studio-edit mod mhl mvn'>
				<div>
					<label className='field'>
						{t('Show Style Base Name')}
						<div className='mdi'>
							<EditAttribute
								modifiedClassName='bghl'
								attribute='name'
								obj={showStyleBase}
								type='text'
								collection={ShowStyleBases}
								className='mdinput'></EditAttribute>
							<span className='mdfx'></span>
						</div>
					</label>
					<label className='field'>
						{t('Blueprint')}
						<div className='mdi'>
							<EditAttribute
								modifiedClassName='bghl'
								attribute='blueprintId'
								obj={showStyleBase}
								type='dropdown'
								options={this.getOptionBlueprints()}
								collection={ShowStyleBases}
								className='mdinput'></EditAttribute>
							<SettingsNavigation
								attribute='blueprintId'
								obj={this.props.showStyleBase}
								type='blueprint'></SettingsNavigation>
							<span className='mdfx'></span>
						</div>
					</label>
				</div>
				<div>
					<p className='mod mhn mvs'>{t('Compatible Studios:')}</p>
					<p className='mod mhn mvs'>
						{this.props.compatibleStudios.length > 0 ?
							this.props.compatibleStudios.map(i =>
								<span key={i._id} className='pill'>
									<Link className='pill-link' to={`/settings/studio/${i._id}`}>{i.name}</Link>
								</span>) :
							t('This Show Style is not compatible with any Studio')}
					</p>
				</div>
				<div className='row'>
					<div className='col c12 rl-c6'>
						<SourceLayerSettings showStyleBase={showStyleBase} />
					</div>
					<div className='col c12 rl-c6'>
						<OutputSettings showStyleBase={showStyleBase} />
					</div>
				</div>
				<div className='row'>
					<div className='col c12 r1-c12'>
						<HotkeyLegendSettings showStyleBase={showStyleBase}/>
					</div>
				</div>
				<div className='row'>
					<div className='col c12 r1-c12'>
						<StudioRuntimeArgumentsSettings showStyleBase={showStyleBase} />
					</div>
				</div>
				<div className='row'>
					<div className='col c12 r1-c12'>
						<RundownLayoutEditor showStyleBase={showStyleBase} />
					</div>
				</div>
				<div className='row'>
					<div className='col c12 r1-c12'>
						<ConfigManifestSettings
							t={this.props.t}
							manifest={collectConfigs(showStyleBase)}
							object={showStyleBase}
							collection={ShowStyleBases}
							configPath={'config'}
							/>
					</div>
				</div>
				<div className='row'>
					<div className='col c12 r1-c12'>
						<ShowStyleVariantsSettings
							showStyleVariants={this.props.showStyleVariants}
							showStyleBase={showStyleBase}
						/>
					</div>
				</div>
			</div>
		)
	}

	render () {

		if (this.props.showStyleBase) {
			return this.renderEditForm(this.props.showStyleBase)
		} else {
			return <Spinner />
		}
	}
})

interface IStudioRuntimeArgumentsSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IStudioRuntimeArgumentsSettingsState {
	editedItems: Array<string>
}

const StudioRuntimeArgumentsSettings = translate()(class StudioRuntimeArgumentsSettings extends React.Component<Translated<IStudioRuntimeArgumentsSettingsProps>, IStudioRuntimeArgumentsSettingsState> {
	constructor (props: Translated<IStudioRuntimeArgumentsSettingsProps>) {
		super(props)

		this.state = {
			editedItems: []
		}
	}
	isItemEdited = (item: IBlueprintRuntimeArgumentsItem) => {
		return this.state.editedItems.indexOf(item._id) >= 0
	}

	finishEditItem = (item: IBlueprintRuntimeArgumentsItem) => {
		let i = this.state.editedItems.indexOf(item._id)
		if (i >= 0) {
			this.state.editedItems.splice(i, 1)
			this.setState({
				editedItems: this.state.editedItems
			})
		}
	}

	editItem = (item: IBlueprintRuntimeArgumentsItem) => {
		if (this.state.editedItems.indexOf(item._id) < 0) {
			this.state.editedItems.push(item._id)
			this.setState({
				editedItems: this.state.editedItems
			})
		} else {
			this.finishEditItem(item)
		}
	}
	onDeleteROArgument = (item: IBlueprintRuntimeArgumentsItem) => {
		if (this.props.showStyleBase) {
			ShowStyleBases.update(this.props.showStyleBase._id, {
				$pull: {
					runtimeArguments: {
						_id: item._id
					}
				}
			})
		}
	}
	onAddROArgument = () => {

		const newItem = literal<IBlueprintRuntimeArgumentsItem>({
			_id: Random.id(),
			property: 'new-property',
			value: '1',
			hotkeys: 'mod+shift+z'
		})

		ShowStyleBases.update(this.props.showStyleBase._id, {
			$push: {
				runtimeArguments: newItem
			}
		})
	}
	confirmDelete = (item: IBlueprintRuntimeArgumentsItem) => {
		const { t } = this.props
		doModalDialog({
			title: t('Delete this item?'),
			no: t('Cancel'),
			yes: t('Delete'),
			onAccept: () => {
				this.onDeleteROArgument(item)
			},
			message: <React.Fragment>
				<p>{t('Are you sure you want to delete this runtime argument "{{property}}: {{value}}"?', { property: (item && item.property), value: (item && item.value) })}</p>
				<p>{t('Please note: This action is irreversible!')}</p>
			</React.Fragment>
		})
	}
	renderItems () {
		const { t } = this.props
		return (
			(this.props.showStyleBase.runtimeArguments || []).map((item, index) => {
				return <React.Fragment key={index + '_' + item.property}>
					<tr className={ClassNames({
						'hl': this.isItemEdited(item)
					})}>
						<th className='settings-studio-custom-config-table__name c2'>
							{mousetrapHelper.shortcutLabel(item.hotkeys)}
						</th>
						<td className='settings-studio-custom-config-table__value c3'>
							{item.property}
						</td>
						<td className='settings-studio-custom-config-table__value c3'>
							{item.value}
						</td>
						<td className='settings-studio-custom-config-table__actions table-item-actions c3'>
							<button className='action-btn' onClick={(e) => this.editItem(item)}>
								<FontAwesomeIcon icon={faPencilAlt} />
							</button>
							<button className='action-btn' onClick={(e) => this.confirmDelete(item)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>
					{this.isItemEdited(item) &&
						<tr className='expando-details hl'>
							<td colSpan={4}>
								<div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Hotkeys')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'runtimeArguments.' + index + '.hotkeys'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Property')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'runtimeArguments.' + index + '.property'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Value')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'runtimeArguments.' + index + '.value'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
								</div>
								<div className='mod alright'>
									<button className='btn btn-primary' onClick={(e) => this.finishEditItem(item)}>
										<FontAwesomeIcon icon={faCheck} />
									</button>
								</div>
							</td>
						</tr>
					}
				</React.Fragment>
			})
		)
	}

	render () {
		const { t } = this.props
		return (
			<div>
				<h2 className='mhn'>{t('Runtime Arguments for Blueprints')}</h2>
				<table className='expando settings-studio-custom-config-table'>
					<tbody>
						{this.renderItems()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddROArgument}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
				</div>
			</div>
		)
	}
})

interface IStudioSourcesSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IStudioSourcesSettingsState {
	editedSources: Array<string>
}

const SourceLayerSettings = translate()(class SourceLayerSettings extends React.Component<Translated<IStudioSourcesSettingsProps>, IStudioSourcesSettingsState> {
	constructor (props: Translated<IStudioSourcesSettingsProps>) {
		super(props)

		this.state = {
			editedSources: []
		}
	}

	isItemEdited = (item: ISourceLayer) => {
		return this.state.editedSources.indexOf(item._id) >= 0
	}

	finishEditItem = (item: ISourceLayer) => {
		let index = this.state.editedSources.indexOf(item._id)
		if (index >= 0) {
			this.state.editedSources.splice(index, 1)
			this.setState({
				editedSources: this.state.editedSources
			})
		}
	}

	editItem = (item: ISourceLayer) => {
		if (this.state.editedSources.indexOf(item._id) < 0) {
			this.state.editedSources.push(item._id)
			this.setState({
				editedSources: this.state.editedSources
			})
		} else {
			this.finishEditItem(item)
		}
	}

	sourceLayerString (type: SourceLayerType) {
		const { t } = this.props
		switch (type) {
			case SourceLayerType.CAMERA:
				return t('Camera')
			case SourceLayerType.GRAPHICS:
				return t('Graphics')
			case SourceLayerType.LIVE_SPEAK:
				return t('Live Speak')
			case SourceLayerType.LOWER_THIRD:
				return t('Lower Third')
			case SourceLayerType.MIC:
				return t('Studio Microphone')
			case SourceLayerType.REMOTE:
				return t('Remote Source')
			case SourceLayerType.SCRIPT:
				return t('Generic Script')
			case SourceLayerType.SPLITS:
				return t('Split Screen')
			case SourceLayerType.VT:
				return t('Clips')
			case SourceLayerType.METADATA:
				return t('Metadata')
			case SourceLayerType.CAMERA_MOVEMENT:
				return t('Camera Movement')
			case SourceLayerType.UNKNOWN:
				return t('Unknown Layer')
			case SourceLayerType.AUDIO:
				return t('Audio Mixing')
			case SourceLayerType.TRANSITION:
				return t('Transition')
			case SourceLayerType.LIGHTS:
				return t('Lights')
			default:
				return SourceLayerType[type]
		}
	}
	onAddSource = () => {
		const maxRank = findHighestRank(this.props.showStyleBase.sourceLayers)
		const { t } = this.props

		const newSource = literal<ISourceLayer>({
			_id: this.props.showStyleBase._id + '-' + Random.id(5),
			_rank: maxRank ? maxRank._rank + 10 : 0,
			name: t('New Source'),
			type: SourceLayerType.UNKNOWN,
			unlimited: false,
			onPGMClean: true
		})

		ShowStyleBases.update(this.props.showStyleBase._id, {
			$push: {
				sourceLayers: newSource
			}
		})
	}
	onDeleteSource = (item: ISourceLayer) => {
		if (this.props.showStyleBase) {
			ShowStyleBases.update(this.props.showStyleBase._id, {
				$pull: {
					sourceLayers: {
						_id: item._id
					}
				}
			})
		}
	}
	confirmDelete = (item: ISourceLayer) => {
		const { t } = this.props
		doModalDialog({
			title: t('Delete this item?'),
			no: t('Cancel'),
			yes: t('Delete'),
			onAccept: () => {
				this.onDeleteSource(item)
			},
			message: <React.Fragment>
				<p>{t('Are you sure you want to delete source layer "{{sourceLayerId}}"?',{ sourceLayerId: item && item.name })}</p>
				<p>{t('Please note: This action is irreversible!')}</p>
			</React.Fragment>
		})
	}
	renderInputSources () {
		const { t } = this.props

		return (
			_.map(this.props.showStyleBase.sourceLayers, (item, index) => {
				let newItem = _.clone(item) as (ISourceLayer & {index: number})
				newItem.index = index
				return newItem
			}).sort((a, b) => {
				return a._rank - b._rank
			}).map((item, index) => {
				return <React.Fragment key={item._id}>
					<tr className={ClassNames({
						'hl': this.isItemEdited(item)
					})}>
						<th className='settings-studio-source-table__name c2'>
							{item.name}
						</th>
						<td className='settings-studio-source-table__id c4'>
							{item._id}
						</td>
						<td className='settings-studio-source-table__type c3'>
							{this.sourceLayerString(Number.parseInt(item.type.toString(), 10) as SourceLayerType)}
						</td>
						<td className='settings-studio-source-table__actions table-item-actions c3'>
							<button className='action-btn' onClick={(e) => this.editItem(item)}>
								<FontAwesomeIcon icon={faPencilAlt} />
							</button>
							<button className='action-btn' onClick={(e) => this.confirmDelete(item)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>
					{this.isItemEdited(item) &&
						<tr className='expando-details hl'>
							<td colSpan={4}>
								<div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Source Name')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.name'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Source Abbreviation')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.abbreviation'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Internal ID')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '._id'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Source Type')}
											<div className='select focusable'>
												<EditAttribute
													modifiedClassName='bghl'
													attribute={'sourceLayers.' + item.index + '.type'}
													obj={this.props.showStyleBase}
													type='dropdown'
													options={SourceLayerType}
													optionsAreNumbers
													collection={ShowStyleBases}
													className='focusable-main input-l'></EditAttribute>
											</div>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.unlimited'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is unlimited')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.onPGMClean'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is on clean PGM')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.isRemoteInput'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is a Live Remote Input')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.isGuestInput'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is a Guest Input')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.isHidden'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is hidden')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Display Rank')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '._rank'}
												obj={this.props.showStyleBase}
												type='int'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.onPresenterScreen'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Display on Presenter\'s Screen')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Shortcut List')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.activateKeyboardHotkeys'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Clear Shortcut')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.clearKeyboardHotkey'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.assignHotkeysToGlobalAdlibs'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Assign Hotkeys to Global AdLibs')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.isSticky'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Items on this layer are sticky')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Activate Sticky Item Shortcut')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.activateStickyKeyboardHotkey'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.allowDisable'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''
											/>
											{t('Allow disabling of elements')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.isQueueable'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Adlibs on this layer can be queued')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Exclusivity group')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'sourceLayers.' + item.index + '.exclusiveGroup'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
								</div>
								<div className='mod alright'>
									<button className='btn btn-primary' onClick={(e) => this.finishEditItem(item)}>
										<FontAwesomeIcon icon={faCheck} />
									</button>
								</div>
							</td>
						</tr>
					}
				</React.Fragment>
			})
		)
	}

	render () {
		const { t } = this.props
		return (
			<div>
				<h2 className='mhn'>{t('Source Layers')}</h2>
				<table className='expando settings-studio-source-table'>
					<tbody>
						{this.renderInputSources()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddSource}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
				</div>
			</div>
		)
	}
})

interface IOutputSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IOutputSettingsState {
	editedOutputs: Array<string>
}

const OutputSettings = translate()(class OutputSettings extends React.Component<Translated<IOutputSettingsProps>, IOutputSettingsState> {
	constructor (props: Translated<IOutputSettingsProps>) {
		super(props)

		this.state = {
			editedOutputs: []
		}
	}

	isItemEdited = (item: IOutputLayer) => {
		return this.state.editedOutputs.indexOf(item._id) >= 0
	}

	finishEditItem = (item: IOutputLayer) => {
		let index = this.state.editedOutputs.indexOf(item._id)
		if (index >= 0) {
			this.state.editedOutputs.splice(index, 1)
			this.setState({
				editedOutputs: this.state.editedOutputs
			})
		}
	}

	editItem = (item: IOutputLayer) => {
		if (this.state.editedOutputs.indexOf(item._id) < 0) {
			this.state.editedOutputs.push(item._id)
			this.setState({
				editedOutputs: this.state.editedOutputs
			})
		} else {
			this.finishEditItem(item)
		}
	}

	confirmDelete = (output: IOutputLayer) => {
		const { t } = this.props
		doModalDialog({
			title: t('Delete this output?'),
			no: t('Cancel'),
			yes: t('Delete'),
			onAccept: () => {
				this.onDeleteOutput(output)
			},
			message: <React.Fragment>
				<p>{t('Are you sure you want to delete source layer "{{outputId}}"?',{ outputId: output && output.name })}</p>
				<p>{t('Please note: This action is irreversible!')}</p>
			</React.Fragment>
		})
	}
	onAddOutput = () => {
		const maxRank = findHighestRank(this.props.showStyleBase.outputLayers)
		const { t } = this.props

		const newOutput = literal<IOutputLayer>({
			_id: this.props.showStyleBase._id + '-' + Random.id(5),
			_rank: maxRank ? maxRank._rank + 10 : 0,
			name: t('New Output'),
			isPGM: false
		})

		ShowStyleBases.update(this.props.showStyleBase._id, {
			$push: {
				outputLayers: newOutput
			}
		})
	}
	onDeleteOutput = (item: IOutputLayer) => {
		if (this.props.showStyleBase) {
			ShowStyleBases.update(this.props.showStyleBase._id, {
				$pull: {
					outputLayers: {
						_id: item._id
					}
				}
			})
		}
	}

	renderOutputs () {
		const { t } = this.props
		return (
			_.map(this.props.showStyleBase.outputLayers, (item, index) => {
				let newItem = _.clone(item) as (IOutputLayer & { index: number })
				newItem.index = index
				return newItem
			}).sort((a, b) => {
				return a._rank - b._rank
			}).map((item, index) => {
				return [
					<tr key={item._id} className={ClassNames({
						'hl': this.isItemEdited(item)
					})}>
						<th className='settings-studio-output-table__name c2'>
							{item.name}
						</th>
						<td className='settings-studio-output-table__id c4'>
							{item._id}
						</td>
						<td className='settings-studio-output-table__isPGM c3'>
							<div className={ClassNames('switch', 'switch-tight', {
								'switch-active': item.isPGM
							})}>PGM</div>
						</td>
						<td className='settings-studio-output-table__actions table-item-actions c3'>
							<button className='action-btn' onClick={(e) => this.editItem(item)}>
								<FontAwesomeIcon icon={faPencilAlt} />
							</button>
							<button className='action-btn' onClick={(e) => this.confirmDelete(item)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>,
					this.isItemEdited(item) ?
						<tr className='expando-details hl' key={item._id + '-details'}>
							<td colSpan={4}>
								<div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Channel Name')}
												<EditAttribute
													modifiedClassName='bghl'
													attribute={'outputLayers.' + item.index + '.name'}
													obj={this.props.showStyleBase}
													type='text'
													collection={ShowStyleBases}
													className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Internal ID')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'outputLayers.' + item.index + '._id'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'outputLayers.' + item.index + '.isPGM'}
												obj={this.props.showStyleBase}
												type='checkbox'
												collection={ShowStyleBases}
												className=''></EditAttribute>
											{t('Is PGM Output')}
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Display Rank')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'outputLayers.' + item.index + '._rank'}
												obj={this.props.showStyleBase}
												type='int'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
								</div>
								<div className='mod alright'>
									<button className='btn btn-primary' onClick={(e) => this.finishEditItem(item)}>
										<FontAwesomeIcon icon={faCheck} />
									</button>
								</div>
							</td>
						</tr>
					:
						null
				]
			})
		)
	}

	render () {
		const { t } = this.props
		return (
			<div>
				<h2 className='mhn'>{t('Output channels')}</h2>
				<table className='expando settings-studio-output-table'>
					<tbody>
						{this.renderOutputs()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddOutput}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
				</div>
			</div>
		)
	}
})

interface IHotkeyLegendSettingsProps {
	showStyleBase: ShowStyleBase
}
interface IHotkeyLegendSettingsState {
	editedItems: Array<string>
}

const HotkeyLegendSettings = translate()(class HotkeyLegendSettings extends React.Component<Translated<IHotkeyLegendSettingsProps>, IHotkeyLegendSettingsState> {
	constructor (props: Translated<IHotkeyLegendSettingsProps>) {
		super(props)

		this.state = {
			editedItems: []
		}
	}

	isItemEdited = (item: HotkeyDefinition) => {
		return this.state.editedItems.indexOf(item._id) >= 0
	}
	finishEditItem = (item: HotkeyDefinition) => {
		let index = this.state.editedItems.indexOf(item._id)
		if (index >= 0) {
			this.state.editedItems.splice(index, 1)
			this.setState({
				editedItems: this.state.editedItems
			})
		}
	}

	editItem = (item: HotkeyDefinition) => {
		if (this.state.editedItems.indexOf(item._id) < 0) {
			this.state.editedItems.push(item._id)
			this.setState({
				editedItems: this.state.editedItems
			})
		} else {
			this.finishEditItem(item)
		}
	}

	onDeleteHotkeyLegend = (item: HotkeyDefinition) => {
		if (this.props.showStyleBase) {
			ShowStyleBases.update(this.props.showStyleBase._id, {
				$pull: {
					hotkeyLegend: {
						_id: item._id
					}
				}
			})
		}
	}
	onAddHotkeyLegend = () => {

		const newItem = literal<HotkeyDefinition>({
			_id: Random.id(),
			key: '',
			label: 'New hotkey'
		})

		ShowStyleBases.update(this.props.showStyleBase._id, {
			$push: {
				hotkeyLegend: newItem
			}
		})
	}

	renderItems () {
		const { t } = this.props
		return (
			(this.props.showStyleBase.hotkeyLegend || []).map((item, index) => {
				return <React.Fragment key={item.key}>
					<tr className={ClassNames({
						'hl': this.isItemEdited(item)
					})}>
						<th className='settings-studio-custom-config-table__name c2'>
							{mousetrapHelper.shortcutLabel(item.key)}
						</th>
						<td className='settings-studio-custom-config-table__value c3'>
							{item.label}
						</td>
						<td className='settings-studio-custom-config-table__actions table-item-actions c3'>
							<button className='action-btn' onClick={(e) => this.editItem(item)}>
								<FontAwesomeIcon icon={faPencilAlt} />
							</button>
							<button className='action-btn' onClick={(e) => this.onDeleteHotkeyLegend && this.onDeleteHotkeyLegend(item)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>
					{this.isItemEdited(item) &&
						<tr className='expando-details hl'>
							<td colSpan={4}>
								<div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Key')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'hotkeyLegend.' + index + '.key'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Value')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'hotkeyLegend.' + index + '.label'}
												obj={this.props.showStyleBase}
												type='text'
												collection={ShowStyleBases}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
								</div>
								<div className='mod alright'>
									<button className='btn btn-primary' onClick={(e) => this.finishEditItem(item)}>
										<FontAwesomeIcon icon={faCheck} />
									</button>
								</div>
							</td>
						</tr>
					}
				</React.Fragment>
			})
		)
	}

	render () {
		const { t } = this.props
		return (
			<div>
				<h2 className='mhn'>{t('Custom Hotkey Labels')}</h2>
				<table className='expando settings-studio-custom-config-table'>
					<tbody>
						{this.renderItems()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddHotkeyLegend}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
				</div>
			</div>
		)
	}
})
interface IShowStyleVariantsProps {
	showStyleBase: ShowStyleBase
	showStyleVariants: Array<ShowStyleVariant>
}
interface IShowStyleVariantsSettingsState {
	editedMappings: Array<string>
}
const ShowStyleVariantsSettings = translate()(class ShowStyleVariantsSettings extends React.Component<Translated<IShowStyleVariantsProps>, IShowStyleVariantsSettingsState> {
	constructor (props: Translated<IShowStyleVariantsProps>) {
		super(props)

		this.state = {
			editedMappings: []
		}
	}
	isItemEdited = (layerId: string) => {
		return this.state.editedMappings.indexOf(layerId) >= 0
	}
	finishEditItem = (layerId: string) => {
		let index = this.state.editedMappings.indexOf(layerId)
		if (index >= 0) {
			this.state.editedMappings.splice(index, 1)
			this.setState({
				editedMappings: this.state.editedMappings
			})
		}
	}
	editItem = (layerId: string) => {
		if (this.state.editedMappings.indexOf(layerId) < 0) {
			this.state.editedMappings.push(layerId)
			this.setState({
				editedMappings: this.state.editedMappings
			})
		} else {
			this.finishEditItem(layerId)
		}
	}
	onAddShowStyleVariant = () => {
		callMethod('Menu', ShowStylesAPI.methods.insertShowStyleVariant, this.props.showStyleBase._id)
	}
	confirmRemove = (showStyleVariant: ShowStyleVariant) => {
		const { t } = this.props
		doModalDialog({
			title: t('Remove this Variant?'),
			no: t('Cancel'),
			yes: t('Remove'),
			onAccept: () => {
				callMethod('ModalDialog', ShowStylesAPI.methods.removeShowStyleVariant, showStyleVariant._id)
			},
			message: <React.Fragment>
				<p>{t('Are you sure you want to remove the variant "{{showStyleVariantId}}"?', { showStyleVariantId: showStyleVariant.name })}</p>
			</React.Fragment>
		})
	}

	renderShowStyleVariants () {
		const { t } = this.props

		return (
			this.props.showStyleVariants.map((showStyleVariant, index) => {
				return <React.Fragment key={showStyleVariant._id}>
					<tr className={ClassNames({
						'hl': this.isItemEdited(showStyleVariant._id)
					})}>
						<th className='settings-studio-showStyleVariant__name c3'>
							{showStyleVariant.name || t('Unnamed variant')}
						</th>
						<td className='settings-studio-showStyleVariant__actions table-item-actions c3'>
							<button className='action-btn' onClick={(e) => this.editItem(showStyleVariant._id)}>
								<FontAwesomeIcon icon={faPencilAlt} />
							</button>
							<button className='action-btn' onClick={(e) => this.confirmRemove(showStyleVariant)}>
								<FontAwesomeIcon icon={faTrash} />
							</button>
						</td>
					</tr>
					{this.isItemEdited(showStyleVariant._id) &&
						<tr className='expando-details hl'>
							<td colSpan={5}>
								<div>
									<div className='mod mvs mhs'>
										<label className='field'>
											{t('Variant Name')}
											<EditAttribute
												modifiedClassName='bghl'
												attribute={'name'}
												obj={showStyleVariant}
												type='text'
												collection={ShowStyleVariants}
												className='input text-input input-l'></EditAttribute>
										</label>
									</div>
								</div>
								<div className='row'>
									<div className='col c12 r1-c12 phs'>
										<ConfigManifestSettings
											t={this.props.t}
											manifest={collectConfigs(showStyleVariant)}
											collection={ShowStyleVariants}
											configPath={'config'}
											object={showStyleVariant}
											subPanel={true} />
									</div>
								</div>
								<div className='mod alright'>
									<button className='btn btn-primary' onClick={(e) => this.finishEditItem(showStyleVariant._id)}>
										<FontAwesomeIcon icon={faCheck} />
									</button>
								</div>
							</td>
						</tr>
					}
				</React.Fragment>
			})
		)
	}

	render () {
		const { t } = this.props
		return (
			<div>
				<h2 className='mhn'>{t('Variants')}</h2>
				<table className='table expando settings-studio-showStyleVariants-table'>
					<tbody>
						{this.renderShowStyleVariants()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddShowStyleVariant}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
				</div>
			</div>
		)
	}
})
