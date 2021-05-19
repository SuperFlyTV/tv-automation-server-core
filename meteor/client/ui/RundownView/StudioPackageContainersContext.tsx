import React from 'react'
import { StudioPackageContainer } from '../../../lib/collections/Studios'

type StudioPackageContainersFromContext = Record<string, StudioPackageContainer> | undefined

const StudioPackageContainersContext = React.createContext<StudioPackageContainersFromContext>(undefined)

export default StudioPackageContainersContext
