import * as React from 'react'
import * as _ from 'underscore'
import { getElementWidth } from '../../../utils/dimensions'
import { Time } from '../../../../lib/lib'
import { RundownUtils } from '../../../lib/rundown'
import Moment from 'react-moment'

import { PieceLifespan, NoraContent } from 'tv-automation-sofie-blueprints-integration'

import { FloatingInspector } from '../../FloatingInspector'

import { CustomLayerItemRenderer, ICustomLayerItemProps } from './CustomLayerItemRenderer'
import { translate, InjectedTranslateProps } from 'react-i18next'
import { NoraPreviewController } from './NoraPreviewRenderer'

type KeyValue = { key: string, value: string }
interface IProps extends ICustomLayerItemProps {
}
interface IState {
}
export const L3rdSourceRenderer = translate()(class extends CustomLayerItemRenderer<IProps & InjectedTranslateProps, IState> {
	leftLabel: HTMLElement
	rightLabel: HTMLElement

	updateAnchoredElsWidths = () => {
		const leftLabelWidth = getElementWidth(this.leftLabel)
		const rightLabelWidth = getElementWidth(this.rightLabel)

		this.setAnchoredElsWidths(leftLabelWidth, rightLabelWidth)
	}

	setLeftLabelRef = (e: HTMLSpanElement) => {
		this.leftLabel = e
	}

	setRightLabelRef = (e: HTMLSpanElement) => {
		this.rightLabel = e
	}

	componentDidMount () {
		this.updateAnchoredElsWidths()
	}

	componentDidUpdate (prevProps: Readonly<IProps & InjectedTranslateProps>, prevState: Readonly<IState>) {
		if (super.componentDidUpdate && typeof super.componentDidUpdate === 'function') {
			super.componentDidUpdate(prevProps, prevState)
		}

		if (this.props.piece.name !== prevProps.piece.name) {
			this.updateAnchoredElsWidths()
		}
	}

	render () {
		const { t } = this.props

		const noraContent = this.props.piece.content as NoraContent

		let properties: Array<KeyValue> = []
		if (noraContent && noraContent.payload && noraContent.payload.content) {
			// @ts-ignore
			properties = _.compact(_.map(noraContent.payload.content, (value, key: string): {
				key: string,
				value: string
			} | undefined => {
				let str: string
				if (key.startsWith('_') || key.startsWith('@') || value === '') {
					return undefined
				} else {
					if (_.isObject(value)) {
						// @ts-ignore
						str = JSON.stringify(value, '', 2)
					} else {
						str = value + ''
					}
					return {
						key: key,
						value: str
					}
				}
			})) as Array<KeyValue>
		}

		let changed: Time | undefined = undefined
		if (noraContent && noraContent.payload && noraContent.payload.changed) {
			changed = noraContent.payload.changed
		}

		let templateName
		let templateVariant

		if (noraContent && noraContent.payload && noraContent.payload.metadata && noraContent.payload.metadata.templateName) {
			templateName = noraContent.payload.metadata.templateName
		}

		if (noraContent && noraContent.payload && noraContent.payload.metadata && noraContent.payload.metadata.templateVariant) {
			templateVariant = noraContent.payload.metadata.templateVariant
		}

		return <React.Fragment>
					<span className='segment-timeline__piece__label' ref={this.setLeftLabelRef} style={this.getItemLabelOffsetLeft()}>
						<span className='segment-timeline__piece__label'>
							{this.props.piece.name}
						</span>
					</span>
					<span className='segment-timeline__piece__label right-side' ref={this.setRightLabelRef} style={this.getItemLabelOffsetRight()}>
						{this.renderInfiniteIcon()}
						{this.renderOverflowTimeLabel()}
					</span>
					<FloatingInspector key={this.props.piece._id + '-inspector'} shown={this.props.showMiniInspector && this.props.itemElement !== undefined}>
						{ noraContent && noraContent.payload && noraContent.previewRenderer ?
						<NoraPreviewController noraContent={noraContent} style={this.getFloatingInspectorStyle()} />
						 :
						<div className={'segment-timeline__mini-inspector ' + this.props.typeClass} style={this.getFloatingInspectorStyle()}>
							{ templateName && <div className='mini-inspector__header'>{templateName}{
								templateVariant && <span className='mini-inspector__sub-header'>{templateVariant}</span>
							}</div>}
							<table>
								<tbody>
									{properties.map((item) => (
										<tr key={item.key}>
											<td className='mini-inspector__label'>{item.key}</td>
											<td className='mini-inspector__value'>{item.value}</td>
										</tr>
									))}
									<tr>
										<td className='mini-inspector__row--timing'></td>
										<td className='mini-inspector__row--timing'>
											<span className='mini-inspector__in-point'>{RundownUtils.formatTimeToShortTime(this.props.piece.renderedInPoint || 0)}</span>
											{this.props.piece.infiniteMode ?
												(
													(this.props.piece.infiniteMode === PieceLifespan.OutOnNextPart && <span className='mini-inspector__duration'>{t('Until next take')}</span>) ||
													(this.props.piece.infiniteMode === PieceLifespan.OutOnNextSegment && <span className='mini-inspector__duration'>{t('Until next segment')}</span>) ||
													(this.props.piece.infiniteMode === PieceLifespan.Infinite && <span className='mini-inspector__duration'>{t('Infinite')}</span>)
												)
												: <span className='mini-inspector__duration'>{RundownUtils.formatTimeToShortTime(this.props.piece.renderedDuration || (_.isNumber(this.props.piece.enable.duration) ? parseFloat(this.props.piece.enable.duration as any as string) : 0))}</span>
											}
											{changed && <span className='mini-inspector__changed'><Moment date={changed} calendar={true} /></span>}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						}
					</FloatingInspector>
				</React.Fragment>
	}
})
