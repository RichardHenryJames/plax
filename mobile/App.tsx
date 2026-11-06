import * as SplashScreen from 'expo-splash-screen'
import { createServices, type Services } from './src/app/container'
import { Root } from './src/app/Root'

// The splash screen stays until the first screen is decided (Root hides it), and fades out.
SplashScreen.setOptions({ duration: 250, fade: true })
SplashScreen.preventAutoHideAsync().catch(() => undefined)

let services: Services | undefined

export default function App() {
  services ??= createServices()
  return <Root services={services} />
}
