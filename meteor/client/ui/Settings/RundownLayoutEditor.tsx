import * as _ from 'underscore'
import * as React from 'react'
import * as ClassNames from 'classnames'
import { EditAttribute } from '../../lib/EditAttribute'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { faStar, faUpload, faPlus, faCheck, faPencilAlt, faDownload, faTrash } from '@fortawesome/fontawesome-free-solid'
import * as FontAwesomeIcon from '@fortawesome/react-fontawesome'
import { RundownLayouts, RundownLayout, RundownLayoutType, RundownLayoutBase, RundownLayoutFilter, PieceDisplayStyle, RundownLayoutFilterBase } from '../../../lib/collections/RundownLayouts'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { callMethod } from '../../lib/clientAPI'
import { PubSub } from '../../../lib/api/pubsub'
import { literal } from '../../../lib/lib'
import { Random } from 'meteor/random'
import { SourceLayerType } from 'tv-automation-sofie-blueprints-integration'
import { UploadButton } from '../../lib/uploadButton'
import { doModalDialog } from '../../lib/ModalDialog'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { fetchFrom } from '../../lib/lib'
// import { Link } from 'react-router-dom'

export interface IProps {
	showStyleBase: ShowStyleBase
}

interface IState {
	editedItems: string[]
	uploadFileKey: number
}

interface ITrackedProps {
	rundownLayouts: RundownLayoutBase[]
}

export default translateWithTracker<IProps, IState, ITrackedProps>((props: IProps) => {
	const rundownLayouts = RundownLayouts.find({
		showStyleBaseId: props.showStyleBase._id,
		userId: { $exists: false }
	}).fetch()

	return {
		rundownLayouts
	}
})(class RundownLayoutEditor extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
	constructor (props: Translated<IProps & ITrackedProps>) {
		super(props)

		this.state = {
			editedItems: [],
			uploadFileKey: Date.now()
		}
	}

	componentDidMount () {
		super.componentDidMount && super.componentDidMount()

		this.subscribe(PubSub.rundownLayouts, {
			showStyleBaseId: this.props.showStyleBase._id
		})
	}

	onAddLayout = (e: any) => {
		const { t, showStyleBase } = this.props
		callMethod(
			e,
			RundownLayoutsAPI.methods.createRundownLayout,
			t('New Layout'),
			RundownLayoutType.RUNDOWN_LAYOUT,
			showStyleBase._id
		)
	}

	onAddFilter = (item: RundownLayoutBase) => {
		const { t } = this.props

		const isRundownLayout = RundownLayoutsAPI.isRundownLayout(item)
		const isDashboardLayout = RundownLayoutsAPI.isDashboardLayout(item)

		RundownLayouts.update(item._id, {
			$push: {
				filters: literal<RundownLayoutFilter>({
					_id: Random.id(),
					name: isRundownLayout ?
							t('New Tab') :
						isDashboardLayout ?
							t('New Panel') :
							t('New Item'),
					currentSegment: false,
					displayStyle: PieceDisplayStyle.LIST,
					label: undefined,
					sourceLayerIds: undefined,
					outputLayerIds: undefined,
					sourceLayerTypes: undefined,
					tags: undefined,
					rank: 0,
					rundownBaseline: false,
					default: false
				})
			}
		})
	}

	onToggleDefault = (item: RundownLayout, index: number, value: boolean) => {
		const obj = _.object(item.filters.map((item, i) => [`filters.${i}.default`, i === index ? value : false]))
		RundownLayouts.update(item._id, {
			$set: obj
		})
	}

	onRemoveFilter = (item: RundownLayoutBase, filter: RundownLayoutFilterBase) => {
		RundownLayouts.update(item._id, {
			$pull: {
				filters: {
					_id: filter._id
				}
			}
		})
	}

	isItemEdited = (item: RundownLayoutBase) => {
		return this.state.editedItems.indexOf(item._id) >= 0
	}

	editItem = (item: RundownLayoutBase) => {
		if (!this.isItemEdited(item)) {
			this.state.editedItems.push(item._id)

			this.setState({
				editedItems: this.state.editedItems
			})
		} else {
			this.finishEditItem(item)
		}
	}

	downloadItem = (item: RundownLayoutBase) => {
		window.location.replace(`/shelfLayouts/download/${item._id}`)
	}

	finishEditItem = (item: RundownLayoutBase) => {
		if (this.isItemEdited(item)) {
			const idx = this.state.editedItems.indexOf(item._id)
			this.state.editedItems.splice(idx, 1)

			this.setState({
				editedItems: this.state.editedItems
			})
		}
	}

	onDeleteLayout = (e: any, item: RundownLayoutBase) => {
		const { t } = this.props

		doModalDialog({
			title: t('Delete layout?'),
			yes: t('Delete'),
			no: t('Cancel'),
			message: t('Are you sure you want to delete the shelf layout "{{name}}"?', { name: item.name }),
			onAccept: () => {
				callMethod(
					e,
					RundownLayoutsAPI.methods.removeRundownLayout,
					item._id
				)
			}

		})
	}

	renderFilters (item: RundownLayoutBase) {
		const { t } = this.props
		const rundownBaselineOptions = [
			{
				name: t('Yes'),
				value: true
			},
			{
				name: t('No'),
				value: false
			},
			{
				name: t('Only Match Global AdLibs'),
				value: 'only'
			}
		]

		const isRundownLayout = RundownLayoutsAPI.isRundownLayout(item)
		const isDashboardLayout = RundownLayoutsAPI.isDashboardLayout(item)

		return <React.Fragment>
			<h4 className='mod mhs'>
				{isRundownLayout ?
					t('Tabs') :
				 isDashboardLayout ?
					t('Panels') :
					null
				}
			</h4>
			{item.filters.map((tab, index) => (
				<div className='rundown-layout-editor-filter mod pan mas' key={tab._id}>
					<button className='action-btn right mod man pas' onClick={(e) => this.onRemoveFilter(item, tab)}>
						<FontAwesomeIcon icon={faTrash} />
					</button>
					{isRundownLayout &&
						<button className={ClassNames('action-btn right mod man pas', {
							'star': (tab as RundownLayoutFilter).default
						})} onClick={(e) => this.onToggleDefault(item as RundownLayout, index, !(tab as RundownLayoutFilter).default)}>
							<FontAwesomeIcon icon={faStar} />
						</button>
					}
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Name')}
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.name`}
								obj={item}
								type='text'
								collection={RundownLayouts}
								className='input text-input input-l' />
						</label>
					</div>
					{isDashboardLayout &&
						<React.Fragment>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('X')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.x`}
										obj={item}
										type='int'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Y')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.y`}
										obj={item}
										type='int'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Width')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.width`}
										obj={item}
										type='int'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Height')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.height`}
										obj={item}
										type='int'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Button width scale factor')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.buttonWidthScale`}
										obj={item}
										type='float'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Button height scale factor')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.buttonHeightScale`}
										obj={item}
										type='float'
										collection={RundownLayouts}
										className='input text-input input-l' />
								</label>
							</div>
						</React.Fragment>
					}
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Display Rank')}
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.rank`}
								obj={item}
								type='float'
								collection={RundownLayouts}
								className='input text-input input-l' />
						</label>
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Enable search toolbar')}
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.enableSearch`}
								obj={item}
								type='checkbox'
								collection={RundownLayouts}
								className='mod mas' />
						</label>
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Only Display AdLibs from Current Segment')}
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.currentSegment`}
								obj={item}
								type='checkbox'
								collection={RundownLayouts}
								className='mod mas' />
						</label>
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Include Global AdLibs')}
						</label>
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.rundownBaseline`}
							obj={item}
							options={rundownBaselineOptions}
							type='dropdown'
							label={t('Filter Disabled')}
							collection={RundownLayouts}
							className='input text-input input-l dropdown' />
					</div>
					{isDashboardLayout &&
						<React.Fragment>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Include Clear Source Layer in Ad-Libs')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.includeClearInRundownBaseline`}
										obj={item}
										type='checkbox'
										collection={RundownLayouts}
										className='mod mas' />
								</label>
							</div>
						</React.Fragment>
					}
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Source Layers')}
						</label>
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.sourceLayerIds`}
							obj={item}
							type='checkbox'
							collection={RundownLayouts}
							className='mod mas'
							mutateDisplayValue={(v) => (v === undefined || v.length === 0) ? false : true }
							mutateUpdateValue={(v) => undefined } />
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.sourceLayerIds`}
							obj={item}
							options={this.props.showStyleBase.sourceLayers.map(l => { return { name: l.name, value: l._id } })}
							type='multiselect'
							label={t('Filter Disabled')}
							collection={RundownLayouts}
							className='input text-input input-l dropdown'
							mutateUpdateValue={v => v && v.length > 0 ? v : undefined} />
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Source Layer Types')}
						</label>
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.sourceLayerTypes`}
							obj={item}
							type='checkbox'
							collection={RundownLayouts}
							className='mod mas'
							mutateDisplayValue={(v) => (v === undefined || v.length === 0) ? false : true}
							mutateUpdateValue={(v) => undefined} />
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.sourceLayerTypes`}
							obj={item}
							options={SourceLayerType}
							type='multiselect'
							optionsAreNumbers={true}
							label={t('Filter disabled')}
							collection={RundownLayouts}
							className='input text-input input-l dropdown'
							mutateUpdateValue={(v: string[] | undefined) => v && v.length > 0 ? v.map(a => parseInt(a, 10)) : undefined} />
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Output Channels')}
						</label>
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.outputLayerIds`}
							obj={item}
							type='checkbox'
							collection={RundownLayouts}
							className='mod mas'
							mutateDisplayValue={(v) => (v === undefined || v.length === 0) ? false : true}
							mutateUpdateValue={(v) => undefined} />
						<EditAttribute
							modifiedClassName='bghl'
							attribute={`filters.${index}.outputLayerIds`}
							obj={item}
							options={this.props.showStyleBase.outputLayers.map(l => { return { name: l.name, value: l._id } })}
							type='multiselect'
							label={t('Filter Disabled')}
							collection={RundownLayouts}
							className='input text-input input-l dropdown'
							mutateUpdateValue={v => v && v.length > 0 ? v : undefined} />
					</div>
					<div className='mod mvs mhs'>
						<label className='field'>
							{t('Label contains')}
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.label`}
								obj={item}
								type='checkbox'
								collection={RundownLayouts}
								className='mod mas'
								mutateDisplayValue={(v) => (v === undefined || v.length === 0) ? false : true}
								mutateUpdateValue={(v) => undefined} />
							<EditAttribute
								modifiedClassName='bghl'
								attribute={`filters.${index}.label`}
								obj={item}
								type='text'
								collection={RundownLayouts}
								className='input text-input input-l'
								label={t('Filter Disabled')}
								mutateDisplayValue={(v) => (v === undefined || v.length === 0) ? undefined : v.join(', ')}
								mutateUpdateValue={(v) => (v === undefined || v.length === 0) ? undefined : v.split(',').map(i => i.trim())} />
						</label>
					</div>
					{isDashboardLayout &&
						<React.Fragment>
							<div className='mod mvs mhs'>
								<label className='field'>
									{t('Register Shortcuts for this Panel')}
									<EditAttribute
										modifiedClassName='bghl'
										attribute={`filters.${index}.assignHotKeys`}
										obj={item}
										type='checkbox'
										collection={RundownLayouts}
										className='mod mas' />
								</label>
							</div>
						</React.Fragment>
					}
				</div>
			))}
		</React.Fragment>
	}

	renderItems () {
		const { t } = this.props
		return (this.props.rundownLayouts || []).map((item, index) =>
			<React.Fragment key={item._id}>
				<tr className={ClassNames({
					'hl': this.isItemEdited(item)
				})}>
					<th className='settings-studio-rundown-layouts-table__name c3'>
						{item.name || t('Default Layout')}
					</th>
					<td className='settings-studio-rundown-layouts-table__value c2'>
						{item.type}
					</td>
					<td className='settings-studio-rundown-layouts-table__actions table-item-actions c3'>
						<button className='action-btn' onClick={(e) => this.downloadItem(item)}>
							<FontAwesomeIcon icon={faDownload} />
						</button>
						<button className='action-btn' onClick={(e) => this.editItem(item)}>
							<FontAwesomeIcon icon={faPencilAlt} />
						</button>
						<button className='action-btn' onClick={(e) => this.onDeleteLayout(e, item)}>
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
										{t('Name')}
										<EditAttribute
											modifiedClassName='bghl'
											attribute={'name'}
											obj={item}
											type='text'
											collection={RundownLayouts}
											className='input text-input input-l'></EditAttribute>
									</label>
								</div>
								<div className='mod mvs mhs'>
									<label className='field'>
										{t('Type')}
										<EditAttribute
											modifiedClassName='bghl'
											attribute={'type'}
											obj={item}
											options={RundownLayoutType}
											type='dropdown'
											collection={RundownLayouts}
											className='input text-input input-l'></EditAttribute>
									</label>
								</div>
							</div>
							<div>
								{item.type === RundownLayoutType.RUNDOWN_LAYOUT ?
									this.renderFilters(item) :
								 item.type === RundownLayoutType.DASHBOARD_LAYOUT ?
									this.renderFilters(item)
									: null}
							</div>
							<div className='mod mls'>
								<button className='btn btn-primary right' onClick={(e) => this.finishEditItem(item)}>
									<FontAwesomeIcon icon={faCheck} />
								</button>
								<button className='btn btn-secondary' onClick={(e) => this.onAddFilter(item)}>
									<FontAwesomeIcon icon={faPlus} />
								</button>
							</div>
						</td>
					</tr>
				}
			</React.Fragment>
		)
	}

	onUploadFile (e) {
		const { t } = this.props

		const file = e.target.files[0]
		if (!file) {
			return
		}

		const reader = new FileReader()
		reader.onload = (e2) => {
			// On file upload

			this.setState({
				uploadFileKey: Date.now()
			})

			let uploadFileContents = (e2.target as any).result

			doModalDialog({
				title: t('Upload Layout?'),
				yes: t('Upload'),
				no: t('Cancel'),
				message: <React.Fragment>
					<p>{t('Are you sure you want to upload the shelf layout from the file "{{fileName}}"?',
						{ fileName: file.name })}</p>,
				</React.Fragment>,
				onAccept: () => {
					if (uploadFileContents) {
						fetchFrom(`/shelfLayouts/upload/${this.props.showStyleBase._id}`, {
							method: 'POST',
							body: uploadFileContents,
							headers: {
								'content-type': 'text/javascript'
							},
						}).then(res => {
							// console.log('Blueprint restore success')
							NotificationCenter.push(new Notification(
								undefined,
								NoticeLevel.NOTIFICATION,
								t('Shelf layout uploaded successfully.'),
								'RundownLayouts'))
						}).catch(err => {
							// console.error('Blueprint restore failure: ', err)
							NotificationCenter.push(new Notification(
								undefined,
								NoticeLevel.WARNING,
								t('Failed to upload shelf layout: {{errorMessage}}', { errorMessage: err + '' }),
								'RundownLayouts'))
						})
					}
				},
				onSecondary: () => {
					this.setState({
						uploadFileKey: Date.now()
					})
				}
			})
		}
		reader.readAsText(file)
	}

	render () {
		const { t } = this.props

		return (
			<div className='studio-edit rundown-layout-editor'>
				<h2 className='mhn'>{t('Shelf Layouts')}</h2>
				<table className='expando settings-studio-rundown-layouts-table'>
					<tbody>
						{this.renderItems()}
					</tbody>
				</table>
				<div className='mod mhs'>
					<button className='btn btn-primary' onClick={this.onAddLayout}>
						<FontAwesomeIcon icon={faPlus} />
					</button>
					<UploadButton className='btn btn-secondary mls' onChange={(e) => this.onUploadFile(e)} accept='application/json,.json'>
						<FontAwesomeIcon icon={faUpload} />
					</UploadButton>
				</div>
			</div>
		)
	}
})
