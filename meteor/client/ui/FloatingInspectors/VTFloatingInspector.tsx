import React, { useRef, useEffect } from 'react'
import classNames from 'classnames'
import { useTranslation } from 'react-i18next'

import { CriticalIconSmall, WarningIconSmall } from '../../lib/ui/icons/notifications'
import { FloatingInspector } from '../FloatingInspector'
import { NoticeLevel } from '../../lib/notifications/notifications'
import { Accessor, ExpectedPackage, VTContent } from '@sofie-automation/blueprints-integration'
import { MediaObject } from '../../../lib/collections/MediaObjects'
import { StyledTimecode } from '../../lib/StyledTimecode'
import { ScanInfoForPackages } from '../../../lib/mediaObjects'
import { Studio } from '../../../lib/collections/Studios'
import { getPreviewPackageSettings } from '../../../lib/collections/ExpectedPackages'
import { ensureHasTrailingSlash } from '../../lib/lib'
import { RundownAPI } from '../../../lib/api/rundown'

interface IProps {
	status: RundownAPI.PieceStatusCode
	mediaPreviewUrl?: string
	typeClass?: string
	showMiniInspector: boolean
	itemElement: HTMLDivElement | null
	floatingInspectorStyle: React.CSSProperties
	timePosition: number
	content: VTContent | undefined
	noticeLevel: NoticeLevel | null
	noticeMessage: string | null
	contentMetaData: MediaObject | null
	renderedDuration?: number | undefined

	contentPackageInfos: ScanInfoForPackages | undefined
	expectedPackages: ExpectedPackage.Any[] | undefined
	studioPackageContainers: Studio['packageContainers'] | undefined
	displayOn?: 'document' | 'viewport'
}

function getPackagePreviewUrl(
	expectedPackages: ExpectedPackage.Any[],
	studioPackageContainers: Studio['packageContainers']
): string | undefined {
	// use Expected packages:
	// Just use the first one we find.
	// TODO: support multiple expected packages?
	let packagePreviewPath: string | undefined
	let previewContainerId: string | undefined
	for (const expectedPackage of expectedPackages) {
		const sideEffect = expectedPackage.sideEffect.previewPackageSettings || getPreviewPackageSettings(expectedPackage)
		packagePreviewPath = sideEffect?.path
		previewContainerId = expectedPackage.sideEffect.previewContainerId

		if (packagePreviewPath && previewContainerId) {
			break // don't look further
		}
	}
	if (packagePreviewPath && previewContainerId) {
		const packageContainer = studioPackageContainers[previewContainerId]
		if (packageContainer) {
			// Look up an accessor we can use:
			for (const accessor of Object.values(packageContainer.container.accessors)) {
				if (accessor.type === Accessor.AccessType.HTTP && accessor.baseUrl) {
					// TODO: add fiter for accessor.networkId ?
					return [
						accessor.baseUrl.replace(/\/$/, ''), // trim trailing slash
						encodeURIComponent(
							packagePreviewPath.replace(/^\//, '') // trim leading slash
						),
					].join('/')
				}
			}
		}
	}
}
function getMediaPreviewUrl(
	contentMetaData: MediaObject | null,
	mediaPreviewUrl: string | undefined
): string | undefined {
	const metadata = contentMetaData
	if (metadata && metadata.previewPath && mediaPreviewUrl) {
		return ensureHasTrailingSlash(mediaPreviewUrl) + 'media/preview/' + encodeURIComponent(metadata.mediaId)
	}
}

function setVideoElementPosition(
	vEl: HTMLVideoElement,
	timePosition: number,
	itemDuration: number,
	seek: number,
	loop: boolean
) {
	let targetTime = timePosition + seek
	if (loop && vEl.duration > 0) {
		targetTime =
			targetTime % ((itemDuration > 0 ? Math.min(vEl.duration * 1000, itemDuration) : vEl.duration * 1000) * 1000)
	} else {
		targetTime = Math.min(timePosition, itemDuration)
	}
	vEl.currentTime = targetTime / 1000
}

function renderNotice(noticeLevel: NoticeLevel, noticeMessage: string | null): JSX.Element {
	return (
		<>
			<div className="segment-timeline__mini-inspector__notice-header">
				{noticeLevel === NoticeLevel.CRITICAL ? (
					<CriticalIconSmall />
				) : noticeLevel === NoticeLevel.WARNING ? (
					<WarningIconSmall />
				) : null}
			</div>
			<div className="segment-timeline__mini-inspector__notice">{noticeMessage}</div>
		</>
	)
}

export const VTFloatingInspector: React.FunctionComponent<IProps> = (props: IProps) => {
	const { t } = useTranslation()
	const { timePosition } = props

	const videoElement = useRef<HTMLVideoElement>(null)

	const itemDuration = (props.content ? props.content.sourceDuration : undefined) || props.renderedDuration || 0
	const seek = (props.content ? props.content.seek : 0) || 0
	const loop = (props.content ? props.content.loop : false) || false

	useEffect(() => {
		if (videoElement.current) {
			setVideoElementPosition(videoElement.current, timePosition, itemDuration, seek, loop)
		}
	})

	const offsetTimePosition = timePosition + seek
	const showFrameMarker = offsetTimePosition === 0 || offsetTimePosition >= itemDuration

	const previewUrl: string | undefined = props.contentPackageInfos
		? props.expectedPackages && props.studioPackageContainers
			? getPackagePreviewUrl(props.expectedPackages, props.studioPackageContainers)
			: undefined
		: getMediaPreviewUrl(props.contentMetaData, props.mediaPreviewUrl) // Fallback, media objects

	return (
		<FloatingInspector shown={props.showMiniInspector && props.itemElement !== undefined} displayOn={props.displayOn}>
			{previewUrl ? (
				<div
					className="segment-timeline__mini-inspector segment-timeline__mini-inspector--video"
					style={props.floatingInspectorStyle}
				>
					<video src={previewUrl} ref={videoElement} crossOrigin="anonymous" playsInline={true} muted={true} />
					{showFrameMarker && (
						<div
							className={classNames('segment-timeline__mini-inspector__frame-marker', {
								'segment-timeline__mini-inspector__frame-marker--first-frame': offsetTimePosition === 0,
								'segment-timeline__mini-inspector__frame-marker--last-frame': offsetTimePosition >= itemDuration,
							})}
						>
							<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M6 14.5L18.5 14.5V18.5H6H1.5V14V1.5H5.5V14V14.5H6Z" fill="#FFD600" stroke="black" />
								{/* <path
									fillRule="evenodd"
									clipRule="evenodd"
									d="M0 0H7V13L20 13V20H0V0ZM6 14V1H1V19H19V14L6 14Z"
									fill="white"
								/> */}
							</svg>
						</div>
					)}
					<span className="segment-timeline__mini-inspector__timecode">
						<StyledTimecode time={offsetTimePosition} />
					</span>
					{props.noticeLevel !== null ? (
						<div
							className={
								'segment-timeline__mini-inspector segment-timeline__mini-inspector--sub-inspector ' +
								props.typeClass +
								' ' +
								(props.noticeLevel === NoticeLevel.CRITICAL
									? 'segment-timeline__mini-inspector--notice notice-critical'
									: props.noticeLevel === NoticeLevel.WARNING
									? 'segment-timeline__mini-inspector--notice notice-warning'
									: '')
							}
						>
							{renderNotice(props.noticeLevel, props.noticeMessage)}
						</div>
					) : null}
				</div>
			) : (
				<div
					className={
						'segment-timeline__mini-inspector ' +
						props.typeClass +
						' ' +
						(props.noticeLevel === NoticeLevel.CRITICAL
							? 'segment-timeline__mini-inspector--notice notice-critical'
							: props.noticeLevel === NoticeLevel.WARNING
							? 'segment-timeline__mini-inspector--notice notice-warning'
							: '')
					}
					style={props.floatingInspectorStyle}
				>
					{props.noticeLevel !== null ? renderNotice(props.noticeLevel, props.noticeMessage) : null}
					{props.status !== RundownAPI.PieceStatusCode.SOURCE_NOT_SET ? (
						<div className="segment-timeline__mini-inspector__properties">
							<span className="mini-inspector__label">{t('File name')}</span>
							<span className="mini-inspector__value">{props.content && props.content.fileName}</span>
						</div>
					) : null}
				</div>
			)}
		</FloatingInspector>
	)
}
