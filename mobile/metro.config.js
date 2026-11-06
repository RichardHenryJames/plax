// The app shares a few pure modules with the website (the card-fit rules, the text cut, the settings rules ...): they live in ../src/lib
// and are imported as @shared/<name>. Metro has to watch that folder and look for packages in this project, not beside the website's.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const config = getDefaultConfig(__dirname)
const shared = path.resolve(__dirname, '../src/lib')
config.watchFolders = [...(config.watchFolders ?? []), shared]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@shared': shared }

module.exports = config
