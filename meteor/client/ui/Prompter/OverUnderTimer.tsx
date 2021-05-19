import * as React from 'react'
import { withTiming, WithTiming } from '../RundownView/RundownTiming/withTiming'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownUtils } from '../../lib/rundown'
import ClassNames from 'classnames'

interface IProps {
	rundownPlaylist: RundownPlaylist
	style?: React.CSSProperties | undefined
}

/**
 * Shows an over/under timer for the rundownPlaylist. Requires a RundownTimingContext from the RundownTimingProvider
 */
export const OverUnderTimer = withTiming<IProps, {}>()(
	class OverUnderTimer extends React.Component<WithTiming<IProps>> {
		render() {
			const target = this.props.rundownPlaylist.expectedDuration || this.props.timingDurations.totalRundownDuration || 0
			return target ? (
				<span
					style={this.props.style}
					className={ClassNames('prompter-timing-clock heavy-light', {
						heavy: (this.props.timingDurations.asPlayedRundownDuration || 0) <= target,
						light: (this.props.timingDurations.asPlayedRundownDuration || 0) > target,
					})}
				>
					{RundownUtils.formatDiffToTimecode(
						(this.props.timingDurations.asPlayedRundownDuration || 0) - target,
						true,
						false,
						true,
						true,
						true,
						undefined,
						true
					)}
				</span>
			) : null
		}
	}
)
