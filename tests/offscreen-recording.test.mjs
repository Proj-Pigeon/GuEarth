import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const mainSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const preloadSource = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../electron.vite.config.ts', import.meta.url), 'utf8')
const offscreenHtml = await readFile(new URL('../src/renderer/offscreen.html', import.meta.url), 'utf8')
const offscreenSource = await readFile(new URL('../src/renderer/src/offscreen.ts', import.meta.url), 'utf8')
const scenePlayerSource = await readFile(new URL('../src/renderer/src/composables/useScenePlayer.ts', import.meta.url), 'utf8')
const failureSource = await readFile(new URL('../src/renderer/src/stores/failure.ts', import.meta.url), 'utf8')
const bannerSource = await readFile(new URL('../src/renderer/src/components/FailureBanner.vue', import.meta.url), 'utf8')

test('offscreen recording has an isolated Cesium entry', () => {
  assert.match(viteSource, /offscreen: resolve\('src\/renderer\/offscreen\.html'\)/)
  assert.match(offscreenHtml, /src="\/src\/offscreen\.ts"/)
  assert.match(offscreenSource, /requestRenderMode: false/)
})

test('offscreen recording requests a fixed paint rate and counts frames', () => {
  assert.match(mainSource, /offscreen: true/)
  assert.match(mainSource, /window\.webContents\.setFrameRate\(targetFps\)/)
  assert.match(mainSource, /window\.webContents\.on\('paint'/)
})

test('offscreen recording renderer can execute scene scripts', () => {
  assert.match(offscreenSource, /async function play\(script: OffscreenRecordingScript\)/)
  assert.match(offscreenSource, /viewer\.camera\.flyTo/)
  assert.match(offscreenSource, /guEarthOffscreenRecorder: \{ play, prepare, next, skipPrewarm: requestSkipPrewarm, setPrewarmQuality \}/)
  assert.match(mainSource, /executeJavaScript\(`window\.guEarthOffscreenRecorder\.play/)
})

test('offscreen recording keeps the captured aspect ratio instead of stretching', () => {
  assert.match(mainSource, /const capture = offscreenCaptureSize\(script\.width, script\.height, workArea\.width, workArea\.height\)/)
  assert.match(mainSource, /width: capture\.width,/)
  assert.doesNotMatch(mainSource, /image\.resize\(/)
  assert.match(mainSource, /const frame = image\.toJPEG\(95\)/)
  assert.match(mainSource, /scale=\$\{script\.width\}:\$\{script\.height\}:force_original_aspect_ratio=decrease:flags=lanczos,pad=\$\{script\.width\}:\$\{script\.height\}:\(ow-iw\)\/2:\(oh-ih\)\/2:color=black,fps=\$\{outputFps\}/)
  assert.match(mainSource, /logger\.info\('recording', `离屏采集/)
})

test('offscreen recording can encode paint frames through ffmpeg', () => {
  assert.match(mainSource, /function encodeOffscreenRecording\(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(mainSource, /await frameWrite/)
  assert.match(mainSource, /image\.isEmpty\(\)/)
  assert.match(mainSource, /'-f', 'concat', '-safe', '0', '-i', 'frames\.txt'/)
  assert.match(mainSource, /cwd: frameDirectory/)
  assert.doesNotMatch(mainSource, /image2pipe/)
  assert.doesNotMatch(mainSource, /pad=ceil\(iw\/2\)\*2/)
})

test('offscreen recording gates capture to the authored timeline', () => {
  assert.match(mainSource, /if \(settled \|\| !capturing \|\| frameWriting \|\| image\.isEmpty\(\)\) return/)
  assert.match(mainSource, /frameTimes\.push\(Date\.now\(\) - recordingStartedAt\)/)
  assert.match(mainSource, /const durations = offscreenFrameDurations\(frameTimes, recordingElapsedMs\)/)
  assert.match(mainSource, /offscreenConcatPlaylist\(frameNames, durations\)/)
  assert.match(mainSource, /offscreenFrameRate\(frameIndex, recordingElapsedMs\)/)
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

test('offscreen recording loads the packaged encoder lazily', () => {
  assert.match(mainSource, /const requireFfmpeg = createRequire\(__filename\)/)
  assert.match(mainSource, /const installer = requireFfmpeg\('@ffmpeg-installer\/ffmpeg'\) as \{ path: string \}/)
  assert.doesNotMatch(mainSource, /^import ffmpegInstaller from/m)
})

test('offscreen recording mounts the component overlays on a visible layer', () => {
  assert.match(offscreenHtml, /<div id="recording-overlays"><\/div>/)
  assert.match(offscreenHtml, /#recording-overlays \{ position: fixed; inset: 0; pointer-events: none; \}/)
  assert.match(offscreenSource, /climate\.overlays\['wind-particles'\] \? h\(WindParticles, \{ viewer \}\) : null/)
  assert.match(offscreenSource, /climate\.overlays\['enso'\] \? h\(WalkerCirculationOverlay, \{ viewer, phase: climate\.ensoPhase \}\) : null/)
  assert.match(offscreenSource, /\.mount\(overlayLayer\)/)
})

test('offscreen recording exposes a local encode self-test', () => {
  assert.match(mainSource, /function createOffscreenSelfTestScript\(\): OffscreenRecordingScript/)
  assert.match(mainSource, /ipcMain\.handle\('recordings:offscreen-self-test'/)
  assert.match(preloadSource, /offscreenSelfTest: \(\): Promise<RecordingSaveResult>/)
})


test('offscreen recording preserves authored scene content and cancellation', () => {
  assert.match(offscreenSource, /currentTitle = script\.title/)
  assert.match(offscreenSource, /currentNarration = scene\.narration/)
  assert.match(offscreenSource, /addAnnotations\(script, scene\.id\)/)
  assert.match(offscreenSource, /climateStore\.setOverlay/)
  assert.match(offscreenSource, /solarStore\.setDate/)
  assert.match(preloadSource, /offscreenCancel: \(\): Promise<void>/)
  assert.match(mainSource, /const measuredFps = offscreenFrameRate\(frameIndex, recordingElapsedMs\)/)
  assert.match(offscreenSource, /async function holdScene\(ms: number\): Promise<void>/)
  assert.match(mainSource, /function ffmpegPath\(\): string/)
})

test('offscreen recording keeps the player controls interactive', () => {
  assert.match(scenePlayerSource, /offscreenRecordingActive = true/)
  assert.match(scenePlayerSource, /if \(offscreenRecordingActive\) \{\r?\n\s+window\.guEarth\.recordings\.offscreenNext\(\)/)
  assert.match(scenePlayerSource, /watch\(\(\) => scenesStore\.recording\.skipPrewarm/)
  assert.match(scenePlayerSource, /watch\(\(\) => scenesStore\.recording\.prewarmQuality/)
  assert.match(preloadSource, /offscreenNext: \(\): void => ipcRenderer\.send\('recordings:offscreen-next'\)/)
  assert.match(preloadSource, /offscreenSkipPrewarm: \(\): void/)
  assert.match(preloadSource, /offscreenPrewarmQuality: \(quality: OffscreenPrewarmQuality\): void/)
  assert.match(mainSource, /forwardOffscreenCommand\(event, 'window\.guEarthOffscreenRecorder\.next\(\)'\)/)
  assert.match(mainSource, /function forwardOffscreenCommand\(event: Electron\.IpcMainEvent, expression: string\): void/)
  assert.match(offscreenSource, /function next\(\): void \{\r?\n\s+advancePending = true/)
})

test('offscreen recording prewarms every scene view before capturing', () => {
  assert.match(offscreenSource, /async function prewarm\(script: OffscreenRecordingScript, views: RecordingPrewarmView\[\]\): Promise<void>/)
  assert.match(offscreenSource, /const views = recordingPrewarmViews\(script\.scenes\)/)
  assert.match(offscreenSource, /reportProgress\('preparing', index \+ 1, views\.length, timedOut\)/)
  assert.match(offscreenSource, /viewer\.scene\.globe\.maximumScreenSpaceError = config\.screenSpaceError/)
  assert.match(offscreenSource, /function requestSkipPrewarm\(\): void/)
  assert.match(offscreenSource, /function setPrewarmQuality\(quality: OffscreenPrewarmQuality\): void/)
  assert.match(scenePlayerSource, /prewarmQuality: scenesStore\.recording\.prewarmQuality/)
  assert.match(scenePlayerSource, /prewarmStep: progress\.sceneIndex/)
  assert.doesNotMatch(scenePlayerSource, /async function saveOffscreenRecording\(script: OffscreenRecordingScript\): Promise<void> \{\r?\n\s+scenesStore\.setRecording\(\{ state: 'recording' \}\)/)
})

test('cancelling offscreen recording settles as a normal result', () => {
  assert.match(mainSource, /const cancel = \(\): void => \{\r?\n\s+if \(settled\) return\r?\n\s+settled = true\r?\n\s+release\(\)/)
  assert.match(mainSource, /logger\.info\('recording', '离屏录制已取消，未生成视频文件'\)/)
  assert.match(mainSource, /resolve\(\{ path: '', bytes: 0, cancelled: true \}\)/)
  assert.doesNotMatch(mainSource, /fail\(new Error\('录制已取消'\)\)/)
  assert.match(preloadSource, /cancelled\?: boolean/)
  assert.match(scenePlayerSource, /if \(result\.cancelled\) \{\r?\n\s+scenesStore\.setRecording\(\{ state: 'idle', cancelled: true, error: '' \}\)/)
})
test('offscreen recording applies the authored terrain instead of a flat ellipsoid', () => {
  assert.match(offscreenSource, /viewer\.terrainProvider = await create\(\)/)
  assert.match(offscreenSource, /viewer\.scene\.verticalExaggeration = Math\.min\(5, Math\.max\(1, terrain\.exaggeration\)\)/)
  assert.match(scenePlayerSource, /terrain: \{ providerId: globeStore\.terrainProviderId, exaggeration: globeStore\.terrainExaggeration, lighting: globeStore\.terrainLighting \}/)
  assert.match(mainSource, /terrain: normalizeOffscreenTerrain\(value\.terrain\)/)
})

test('offscreen recording reports scene progress back to the renderer', () => {
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-progress'/)
  assert.match(mainSource, /target\.send\('recordings:offscreen-progress'/)
  assert.match(preloadSource, /offscreenProgress: \(progress: OffscreenRecordingProgress\): void/)
  assert.match(preloadSource, /onOffscreenProgress: \(listener: \(progress: OffscreenRecordingProgress\) => void\)/)
  assert.match(offscreenSource, /reportProgress\('recording', index, script\.scenes\.length\)/)
  assert.match(preloadSource, /phase: 'preparing' \| 'recording'/)
})

test('recording failures surface through the built-in failure banner', () => {
  assert.match(scenePlayerSource, /failureStore\.reportFailure\(\{\r?\n\s+scope: 'recording',/)
  assert.match(scenePlayerSource, /message: `视频录制失败：\$\{detail\}`/)
  assert.match(scenePlayerSource, /failureStore\.registerRetry\('recording', async \(\) => \{/)
  assert.match(scenePlayerSource, /failureStore\.clearFailure\('recording'\)/)
  assert.match(scenePlayerSource, /failureStore\.clearFailure\('recording-quality'\)/)
  assert.match(scenePlayerSource, /failureStore\.reportDegrade\(`录制画面帧率偏低/)
  assert.match(scenePlayerSource, /raw\.replace\(\/\^Error invoking remote method/)
  assert.match(failureSource, /'settings' \| 'recording' \| 'recording-quality'/)
  assert.match(bannerSource, /notice\.scope === 'recording-quality' \? 'warning' : 'error'/)
  assert.doesNotMatch(scenePlayerSource, /from 'ant-design-vue'/)
})

test('offscreen degradations reach the recording renderer as notices', () => {
  assert.match(preloadSource, /offscreenNotice: \(message: string\): void => ipcRenderer\.send\('recordings:offscreen-notice', message\)/)
  assert.match(preloadSource, /onOffscreenNotice: \(listener: \(message: string\) => void\)/)
  assert.match(mainSource, /ipcMain\.on\('recordings:offscreen-notice'/)
  assert.match(mainSource, /target\.send\('recordings:offscreen-notice', message\.trim\(\)\.slice\(0, 200\)\)/)
  assert.match(offscreenSource, /reportNotice\(`录制画面使用的地形/)
  assert.match(offscreenSource, /reportNotice\(`录制画面的底图/)
  assert.match(scenePlayerSource, /onOffscreenNotice\(\(notice\) => \{/)
})

test('the visible window mirrors what the offscreen renderer records', () => {
  assert.match(scenePlayerSource, /function mirrorScene\(scene: TeachingScene, annotations: OffscreenRecordingAnnotation\[\], index: number\): void/)
  assert.match(scenePlayerSource, /mirrorScene\(scenes\[progress\.sceneIndex\], script\.annotations, progress\.sceneIndex\)/)
  assert.match(scenePlayerSource, /drawingStore\.addTransientShape\(\{/)
  assert.match(scenePlayerSource, /current\.camera\.cancelFlight\(\)/)
  assert.match(scenePlayerSource, /const view = views\[progress\.sceneIndex - 1\]/)
  assert.match(scenePlayerSource, /clearMirrorShapes\(\)\r?\n\s+disableRecordingRender\(\)/)
  assert.match(scenePlayerSource, /enableRecordingRender\(\)\r?\n\s+scenesStore\.setRecording\(\{ state: 'preparing'/)
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

test('offscreen recording controls stay behind typed preload IPC', () => {
  assert.match(preloadSource, /offscreenProbe: \(script\?: OffscreenRecordingScript\): Promise<OffscreenRecordingProbeResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-probe', script\)/)
  assert.match(preloadSource, /offscreenEncode: \(script: OffscreenRecordingScript\): Promise<RecordingSaveResult>/)
  assert.match(preloadSource, /ipcRenderer\.invoke\('recordings:offscreen-encode', script\)/)
})
