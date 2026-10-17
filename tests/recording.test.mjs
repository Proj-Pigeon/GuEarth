import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const offscreenHtml = await readFile(new URL('../src/renderer/offscreen.html', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')
const recorderSource = await readFile(new URL('../src/renderer/src/composables/useVideoRecorder.ts', import.meta.url), 'utf8')
const ffmpegSource = await readFile(new URL('../src/main/ffmpeg.ts', import.meta.url), 'utf8')

test('offscreen recording has an isolated Cesium entry', () => {
  assert.match(viteSource, /offscreen: resolve\('src\/renderer\/offscreen\.html'\)/)
  assert.match(offscreenHtml, /src="\/src\/offscreen\.ts"/)
  assert.match(offscreenSource, /requestRenderMode: false/)
  assert.match(offscreenSource, /async function play\(script: OffscreenRecordingScript\)/)
  assert.match(offscreenSource, /viewer\.camera\.flyTo/)
  assert.match(offscreenSource, /guEarthOffscreenRecorder: \{ play, prepare, next, skipPrewarm: requestSkipPrewarm, setPrewarmQuality \}/)
  assert.match(offscreenSource, /\.mount\(overlayLayer\)/)
})

test('the recording window survives background throttling and keeps explicit frame and scene timers', () => {
  assert.match(mainSource, /backgroundThrottling: false/)
  assert.match(mainSource, /offscreen: true/)
  assert.match(mainSource, /window\.webContents\.setFrameRate\(targetFps\)/)
  assert.match(mainSource, /window\.webContents\.on\('paint'/)
  assert.match(recorderSource, /pacingTimer = window\.setTimeout\(frameTick, Math\.max\(0, nextFrameAt - performance\.now\(\)\)\)/)
  assert.match(scenePlayerSource, /if \(timeoutMs !== null\) advanceTimer = setTimeout\(\(\) => advanceResolver\?\.\(\), timeoutMs\)/)
})

test('AI lesson recording encodes through the main-process offscreen encoder', () => {
  assert.match(scenePlayerSource, /await window\.guEarth\.recordings\.offscreenEncode\(script\)/)
  assert.doesNotMatch(scenePlayerSource, /MediaRecorder/)
})

test('recording keeps continuous Cesium rendering while the capture runs', () => {
  assert.match(scenePlayerSource, /scene\.requestRenderMode = false/)
  assert.match(scenePlayerSource, /scene\.requestRenderMode = originalRequestRenderMode/)
  assert.match(scenePlayerSource, /scene\.maximumRenderTimeChange = originalMaximumRenderTimeChange/)
})

test('the visible window mirrors the recorded lesson without breaking annotation saves', () => {
  assert.match(scenePlayerSource, /current\.camera\.cancelFlight\(\)/)
  assert.match(scenePlayerSource, /addTransientShape\(transientMirrorShape\(/)
  assert.match(scenePlayerSource, /clearMirrorShapes\(\)\r?\n\s+scenesStore\.setPresenting\(false\)/)
  assert.match(scenePlayerSource, /const mirrored = scenes\[progress\.sceneIndex\]/)
  assert.match(scenePlayerSource, /if \(mirrored\) mirrorScene\(mirrored, script\.annotations, progress\.sceneIndex, script\.centerTarget\)/)
  assert.doesNotMatch(scenePlayerSource, /function referencedShapeIds\(/)
})

test('the visible window keeps the ordinary render policy during recording', () => {
  assert.match(scenePlayerSource, /playerState\.recording = true\r?\n\s+scenesStore\.setPresenting\(true\)\r?\n\s+scenesStore\.setRecording\(\{ state: 'preparing'/)
  const recordVideoBody = scenePlayerSource.slice(scenePlayerSource.indexOf('async function recordVideo'), scenePlayerSource.indexOf('async function previewScene'))
  assert.doesNotMatch(recordVideoBody, /enableRecordingRender\(\)/)
  assert.doesNotMatch(recordVideoBody, /disableRecordingRender\(\)/)
})

test('offscreen recording keeps the captured aspect ratio instead of stretching', () => {
  assert.match(mainSource, /const capture = offscreenCaptureSize\(script\.width, script\.height, workArea\.width, workArea\.height\)/)
  assert.match(mainSource, /width: capture\.width,/)
  assert.doesNotMatch(mainSource, /image\.resize\(/)
  assert.match(mainSource, /const frame = image\.toJPEG\(95\)/)
  assert.match(mainSource, /scale=\$\{script\.width\}:\$\{script\.height\}:force_original_aspect_ratio=decrease:flags=lanczos,pad=\$\{script\.width\}:\$\{script\.height\}:\(ow-iw\)\/2:\(oh-ih\)\/2:color=black,fps=\$\{outputFps\}/)
  assert.match(mainSource, /logger\.info\('recording', `离屏采集/)
})

test('offscreen recording encodes the captured frames through ffmpeg', () => {
  assert.match(mainSource, /function encodeOffscreenRecording\(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(mainSource, /await frameWrite/)
  assert.match(mainSource, /image\.isEmpty\(\)/)
  assert.match(mainSource, /'-f', 'concat', '-safe', '0', '-i', 'frames\.txt'/)
  assert.match(mainSource, /cwd: frameDirectory/)
  assert.doesNotMatch(mainSource, /image2pipe/)
})

test('offscreen recording gates capture without stalling the paint stream and reports the measured FPS', () => {
  assert.match(mainSource, /const OFFSCREEN_MAX_PENDING_FRAMES = 24/)
  assert.match(mainSource, /if \(settled \|\| !capturing \|\| image\.isEmpty\(\) \|\| pendingFrames >= OFFSCREEN_MAX_PENDING_FRAMES\) return/)
  assert.match(mainSource, /pendingFrames \+= 1/)
  assert.match(mainSource, /\.finally\(\(\) => \{ pendingFrames -= 1 \}\)/)
  assert.doesNotMatch(mainSource, /frameWriting/)
  assert.match(mainSource, /frameTimes\.push\(Date\.now\(\) - recordingStartedAt\)/)
  assert.match(mainSource, /const durations = offscreenFrameDurations\(frameTimes, recordingElapsedMs\)/)
  assert.match(mainSource, /offscreenConcatPlaylist\(frameNames, durations\)/)
  assert.match(mainSource, /const measuredFps = offscreenFrameRate\(frameIndex, recordingElapsedMs\)/)
  assert.match(mainSource, /OFFSCREEN_MIN_FLUENT_FPS/)
})

test('offscreen rendering cannot hang the recorder forever', () => {
  assert.match(mainSource, /function withOffscreenTimeout<T>\(task: Promise<T>, timeoutMs: number, message: string\): Promise<T>/)
  assert.match(mainSource, /await withOffscreenTimeout\(\s*window\.webContents\.executeJavaScript\(`window\.guEarthOffscreenRecorder\.prepare/)
  assert.match(mainSource, /offscreenSceneDurationMs\(script\) \+ OFFSCREEN_PLAY_TIMEOUT_MARGIN_MS/)
  assert.match(mainSource, /离屏渲染超时，已中止录制/)
  assert.match(mainSource, /离屏渲染初始化超时，已中止录制/)
})

test('offscreen rendering prepares the first scene before capturing', () => {
  assert.match(offscreenSource, /async function prepare\(script: OffscreenRecordingScript\): Promise<void>/)
  assert.match(offscreenSource, /await waitTilesLoaded\(OFFSCREEN_PREPARE_TILE_TIMEOUT_MS\)/)
  assert.match(offscreenSource, /if \(viewer\.scene\.globe\.tilesLoaded\)/)
})

test('offscreen recording cleans stale temporary directories', () => {
  assert.match(mainSource, /async function removeStaleOffscreenDirectories\(directory: string\): Promise<void>/)
  assert.match(mainSource, /await removeStaleOffscreenDirectories\(directory\)/)
  assert.match(mainSource, /mkdtemp\(join\(directory, OFFSCREEN_TEMP_PREFIX\)\)/)
})

test('offscreen recording resolves the bundled LGPL encoder without the retired installer package', () => {
  assert.match(mainSource, /import \{ offscreenVideoEncoderArgs, resolveFfmpegBinary \} from '\.\/ffmpeg'/)
  assert.match(mainSource, /function ffmpegPath\(\): string \{\s+return resolveFfmpegBinary\(app\.getAppPath\(\), process\.resourcesPath, app\.isPackaged\)\s+\}/)
  assert.doesNotMatch(mainSource, /@ffmpeg-installer/)
  assert.doesNotMatch(mainSource, /createRequire/)
})

test('the bundled encoder encodes H.264 with libopenh264 and keeps libx264 out', () => {
  assert.match(ffmpegSource, /export const offscreenVideoEncoderArgs = \['-c:v', 'libopenh264', '-profile:v', 'high', '-b:v', '2M'\]/)
  assert.match(ffmpegSource, /export function resolveFfmpegBinary\(appPath: string, resourcesPath: string, packaged: boolean\): string/)
  assert.doesNotMatch(ffmpegSource, /libx264/)
  assert.match(mainSource, /const recordingSeconds = durations\.reduce\(\(total, seconds\) => total \+ seconds, 0\)/)
  assert.match(mainSource, /'-t', recordingSeconds\.toFixed\(6\), '-an', \.\.\.offscreenVideoEncoderArgs, '-pix_fmt', 'yuv420p'/)
})

test('offscreen recording applies the authored terrain and scene state', () => {
  assert.match(offscreenSource, /viewer\.terrainProvider = await create\(\)/)
  assert.match(offscreenSource, /viewer\.scene\.verticalExaggeration = Math\.min\(5, Math\.max\(1, terrain\.exaggeration\)\)/)
  assert.match(offscreenSource, /currentTitle = script\.title/)
  assert.match(offscreenSource, /currentNarration = scene\.narration/)
  assert.match(offscreenSource, /addAnnotations\(script, scene\.id\)/)
  assert.match(offscreenSource, /climateStore\.setOverlay/)
  assert.match(offscreenSource, /solarStore\.setDate/)
  assert.match(scenePlayerSource, /terrain: \{ providerId: globeStore\.terrainProviderId, exaggeration: globeStore\.terrainExaggeration, lighting: globeStore\.terrainLighting \}/)
  assert.match(mainSource, /terrain: normalizeOffscreenTerrain\(value\.terrain\)/)
})

test('offscreen recording shares the camera and prewarm logic with the player', () => {
  assert.match(offscreenSource, /from '\.\/lib\/sceneCamera'/)
  assert.doesNotMatch(offscreenSource, /from '\.\/composables\/useScenePlayer'/)
  assert.match(scenePlayerSource, /from '@renderer\/lib\/sceneCamera'/)
  assert.match(offscreenSource, /destination: sceneCameraDestination\(camera, centerTarget\)/)
  assert.match(offscreenSource, /centerTarget = script\.centerTarget/)
  assert.match(scenePlayerSource, /centerTarget: true,/)
  assert.match(mainSource, /centerTarget: value\.centerTarget === true,/)
})

test('a queued next-scene press does not swallow the first recorded scene', () => {
  assert.match(offscreenSource, /async function play\(script: OffscreenRecordingScript\): Promise<void> \{\r?\n\s+document\.title = script\.title \|\| 'GuEarth Offscreen Recorder'\r?\n\s+advancePending = false/)
  assert.match(offscreenSource, /async function prepare\(script: OffscreenRecordingScript\): Promise<void> \{[\s\S]*?advancePending = false/)
})

test('offscreen recording keeps the player controls interactive', () => {
  assert.match(scenePlayerSource, /offscreenRecordingActive = true/)
  assert.match(scenePlayerSource, /if \(offscreenRecordingActive\) \{\r?\n\s+window\.guEarth\.recordings\.offscreenNext\(\)/)
  assert.match(offscreenSource, /function next\(\): void \{\r?\n\s+advancePending = true/)
  assert.match(mainSource, /forwardOffscreenCommand\(event, 'window\.guEarthOffscreenRecorder\.next\(\)'\)/)
  assert.match(mainSource, /function forwardOffscreenCommand\(event: Electron\.IpcMainEvent, expression: string\): void/)
})

test('offscreen recording prewarms every scene view before capturing', () => {
  assert.match(offscreenSource, /async function prewarm\(script: OffscreenRecordingScript, views: PrewarmView\[\]\): Promise<void>/)
  assert.match(offscreenSource, /const views = recordingPrewarmViews\(script\.scenes\)/)
  assert.match(offscreenSource, /reportProgress\('preparing', index \+ 1, views\.length, timedOut\)/)
  assert.match(offscreenSource, /viewer\.scene\.globe\.maximumScreenSpaceError = config\.screenSpaceError/)
  assert.match(offscreenSource, /requestSkipPrewarm/)
  assert.match(offscreenSource, /setPrewarmQuality/)
  assert.match(scenePlayerSource, /prewarmQuality: scenesStore\.recording\.prewarmQuality/)
  assert.match(scenePlayerSource, /prewarmStep: progress\.sceneIndex/)
})

test('prewarm detail bias is scoped to preparation', () => {
  assert.match(offscreenSource, /const originalScreenSpaceError = viewer\.scene\.globe\.maximumScreenSpaceError/)
  assert.match(offscreenSource, /finally \{\r?\n\s+viewer\.scene\.globe\.maximumScreenSpaceError = originalScreenSpaceError/)
  assert.match(offscreenSource, /loaded = await waitTilesLoaded\(Math\.max\(0, Math\.min\(config\.viewTimeoutMs, remainingBudget\)\)\)/)
})

test('offscreen preparation is observable in the main process log', () => {
  assert.match(mainSource, /离屏渲染准备完成，耗时/)
  assert.match(mainSource, /预热视角 \$\{Math\.round\(sceneIndex\)\}\/\$\{Math\.round\(totalScenes\)\}/)
  assert.match(mainSource, /部分录制视角的高清瓦片未在预加载预算内完成/)
})

test('cancelling offscreen recording settles as a normal result', () => {
  assert.match(mainSource, /const cancel = \(\): void => \{\r?\n\s+if \(settled\) return\r?\n\s+settled = true\r?\n\s+release\(\)/)
  assert.match(mainSource, /logger\.info\('recording', '离屏录制已取消，未生成视频文件'\)/)
  assert.match(mainSource, /resolve\(\{ path: '', bytes: 0, cancelled: true \}\)/)
  assert.doesNotMatch(mainSource, /fail\(new Error\('录制已取消'\)\)/)
  assert.match(scenePlayerSource, /if \(result\.cancelled\) \{\r?\n\s+scenesStore\.setRecording\(\{ state: 'idle', cancelled: true, error: '' \}\)/)
})

test('offscreen recording fails fast when the capture process dies', () => {
  assert.match(mainSource, /window\.webContents\.on\('render-process-gone', \(_event, details\) => \{/)
  assert.match(mainSource, /离屏录制渲染进程异常退出（\$\{details\.reason\}）/)
  assert.match(mainSource, /window\.on\('unresponsive', \(\) => \{/)
  assert.match(mainSource, /离屏录制渲染进程无响应，已中止录制/)
})

test('recording failures surface through the built-in failure banner', () => {
  assert.match(scenePlayerSource, /failureStore\.reportFailure\(\{\r?\n\s+scope: 'recording',/)
  assert.match(scenePlayerSource, /message: `视频录制失败：\$\{detail\}`/)
  assert.match(scenePlayerSource, /failureStore\.registerRetry\('recording', async \(\) => \{/)
  assert.match(scenePlayerSource, /failureStore\.clearFailure\('recording'\)/)
  assert.match(scenePlayerSource, /failureStore\.clearFailure\('recording-quality'\)/)
  assert.match(scenePlayerSource, /failureStore\.reportDegrade\(`录制画面帧率偏低/)
  assert.match(scenePlayerSource, /raw\.replace\(\/\^Error invoking remote method/)
})

test('offscreen degradations reach the recording renderer as notices', () => {
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-notice'/)
  assert.match(mainSource, /target\.send\('recordings:offscreen-notice', message\.trim\(\)\.slice\(0, 200\)\)/)
  assert.match(offscreenSource, /reportNotice\(`录制画面使用的地形/)
  assert.match(offscreenSource, /reportNotice\(`录制画面的底图/)
  assert.match(scenePlayerSource, /onOffscreenNotice\(\(notice\) => \{/)
})

test('the recording script carries the annotation styling', () => {
  assert.match(preloadSource, /color: string\r?\n\s+textColor: string\r?\n\s+fontFamily: string\r?\n\s+fontSize: number\r?\n\s+textFrame: boolean\r?\n\s+lineWidth: number/)
  assert.match(mainSource, /color: typeof entry\.color === 'string' \? entry\.color\.slice\(0, 32\) : '#1677ff'/)
  assert.match(mainSource, /lineWidth: normalizeNumber\(entry\.lineWidth, 1, 20, 3\)/)
  assert.match(scenePlayerSource, /positions: \[\{ longitude: marker\.longitude, latitude: marker\.latitude, height: 0 \}\], \.\.\.DEFAULT_DRAW_STYLE/)
  assert.match(scenePlayerSource, /positions: shape\.positions, \.\.\.DEFAULT_DRAW_STYLE/)
})

test('offscreen annotations reuse the in-app shape styling', () => {
  assert.match(offscreenSource, /from '\.\/lib\/shapeGraphics'/)
  assert.match(offscreenSource, /options\.point = pointGraphics\(color\)/)
  assert.match(offscreenSource, /options\.polygon = polygonGraphics\(color, hierarchy\)/)
  assert.match(offscreenSource, /const polyline = polylineOptions\(viewer, shape\.kind === 'polygon' \? ringOf\(cartesians\) : cartesians, shape\.lineWidth, color\)/)
  assert.match(offscreenSource, /if \(label\) options\.label = label/)
  assert.match(offscreenSource, /polyline\.positions = new Cesium\.ConstantProperty\(terrainSurfacePositions\(viewer, path\)\)/)
  assert.doesNotMatch(offscreenSource, /Cesium\.Color\.YELLOW/)
  assert.doesNotMatch(offscreenSource, /Cesium\.Color\.CYAN/)
})

test('offscreen capture renders without multisampling', () => {
  assert.match(offscreenSource, /contextOptions: \{ webgl: \{ preserveDrawingBuffer: true, antialias: false \} \}/)
  assert.match(offscreenSource, /viewer\.scene\.msaaSamples = 1/)
})

test('the visible mirror reduces its resolution during recording and restores it after', () => {
  assert.match(scenePlayerSource, /const RECORDING_MIRROR_RESOLUTION_SCALE = 0\.6/)
  assert.match(scenePlayerSource, /const previousMirrorResolutionScale = current\.resolutionScale\r?\n\s+current\.resolutionScale = RECORDING_MIRROR_RESOLUTION_SCALE/)
  assert.match(scenePlayerSource, /saveOffscreenRecording\(script\)\.finally\(\(\) => \{\r?\n\s+if \(!current\.isDestroyed\(\)\) current\.resolutionScale = previousMirrorResolutionScale/)
})

test('quitting tears down an active offscreen recording before the process exits', () => {
  assert.match(mainSource, /let teardownOffscreenRecording: \(\(\) => void\) \| null = null/)
  assert.match(mainSource, /app\.on\('will-quit', \(\) => \{\r?\n\s+try \{\r?\n\s+teardownOffscreenRecording\?\.\(\)/)
  assert.match(mainSource, /execFileSync\('taskkill', \['\/pid', String\(pid\), '\/T', '\/F'\]/)
  assert.match(mainSource, /rmSync\(directory, \{ recursive: true, force: true \}\)/)
})

test('closing the visible window cancels a running recording instead of orphaning it', () => {
  assert.match(mainSource, /win\.on\('close', \(\) => \{\r?\n\s+cancelOffscreenRecording\?\.\(\)/)
})

test('the offscreen self-test channel no longer rewrites the recording directory', () => {
  assert.doesNotMatch(mainSource, /offscreen-self-test/)
  assert.doesNotMatch(mainSource, /runOffscreenSelfTest/)
  assert.doesNotMatch(mainSource, /guearth-offscreen-test-/)
  assert.doesNotMatch(preloadSource, /offscreenSelfTest/)
})

test('a second launch focuses the running window instead of racing the recording directory', () => {
  assert.match(mainSource, /const hasSingleInstanceLock = app\.requestSingleInstanceLock\(\)/)
  assert.match(mainSource, /if \(!hasSingleInstanceLock\) \{\r?\n\s+console\.warn\('\[app\] 已有实例在运行，本次启动直接退出'\)\r?\n\s+app\.quit\(\)/)
  assert.match(mainSource, /app\.on\('second-instance', \(\) => \{\r?\n\s+const window = mainWindow/)
  assert.match(mainSource, /if \(window\.isMinimized\(\)\) window\.restore\(\)\r?\n\s+window\.focus\(\)/)
  assert.match(mainSource, /app\.whenReady\(\)\.then\(async \(\) => \{\r?\n\s+if \(!hasSingleInstanceLock\) return/)
})

test('the stale sweep never removes frame directories owned by a live process', () => {
  assert.match(mainSource, /const OFFSCREEN_OWNER_FILE = '\.owner'/)
  assert.match(mainSource, /async function offscreenFrameDirectoryActive\(path: string\): Promise<boolean>/)
  assert.match(mainSource, /process\.kill\(owner, 0\)/)
  assert.match(mainSource, /if \(await offscreenFrameDirectoryActive\(path\)\) return/)
  assert.match(mainSource, /writeFile\(join\(tempDir, OFFSCREEN_OWNER_FILE\), String\(process\.pid\), 'utf8'\)/)
  assert.doesNotMatch(mainSource, /map\(\(entry\) => rm\(join\(directory, entry\.name\)/)
})

test('a cancelled session removes a frame directory created after the cancel', () => {
  assert.match(mainSource, /const createdTempDir = await mkdtemp\(join\(directory, OFFSCREEN_TEMP_PREFIX\)\)/)
  assert.match(mainSource, /if \(settled\) \{\r?\n\s+void rm\(createdTempDir, \{ recursive: true, force: true \}\)\.catch\(\(\) => undefined\)\r?\n\s+return\r?\n\s+\}/)
  assert.match(mainSource, /tempDir = createdTempDir/)
})
