const coordinatePi = Math.PI
const coordinateAxis = 6378245
const coordinateEccentricity = 0.006693421622965943

function outOfChina(longitude: number, latitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(x: number, y: number): number {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * coordinatePi) + 20 * Math.sin(2 * x * coordinatePi)) * 2) / 3
  value += ((20 * Math.sin(y * coordinatePi) + 40 * Math.sin((y / 3) * coordinatePi)) * 2) / 3
  value +=
    ((160 * Math.sin((y / 12) * coordinatePi) + 320 * Math.sin((y * coordinatePi) / 30)) * 2) / 3
  return value
}

function transformLongitude(x: number, y: number): number {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * coordinatePi) + 20 * Math.sin(2 * x * coordinatePi)) * 2) / 3
  value += ((20 * Math.sin(x * coordinatePi) + 40 * Math.sin((x / 3) * coordinatePi)) * 2) / 3
  value +=
    ((150 * Math.sin((x / 12) * coordinatePi) + 300 * Math.sin((x / 30) * coordinatePi)) * 2) / 3
  return value
}

export function wgs84ToGcj02(longitude: number, latitude: number): [number, number] {
  if (outOfChina(longitude, latitude)) return [longitude, latitude]
  const deltaLatitude = transformLatitude(longitude - 105, latitude - 35)
  const deltaLongitude = transformLongitude(longitude - 105, latitude - 35)
  const latitudeRadians = (latitude / 180) * coordinatePi
  const magic = 1 - coordinateEccentricity * Math.sin(latitudeRadians) ** 2
  const sqrtMagic = Math.sqrt(magic)
  const adjustedLatitude =
    (deltaLatitude * 180) /
    (((coordinateAxis * (1 - coordinateEccentricity)) / (magic * sqrtMagic)) * coordinatePi)
  const adjustedLongitude =
    (deltaLongitude * 180) /
    ((coordinateAxis / sqrtMagic) * Math.cos(latitudeRadians) * coordinatePi)
  return [longitude + adjustedLongitude, latitude + adjustedLatitude]
}

export function gcj02ToWgs84(longitude: number, latitude: number): [number, number] {
  if (outOfChina(longitude, latitude)) return [longitude, latitude]
  const [guessedLongitude, guessedLatitude] = wgs84ToGcj02(longitude, latitude)
  return [longitude * 2 - guessedLongitude, latitude * 2 - guessedLatitude]
}

function gcj02ToBd09(longitude: number, latitude: number): [number, number] {
  const z =
    Math.sqrt(longitude * longitude + latitude * latitude) +
    0.00002 * Math.sin(latitude * coordinatePi)
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * coordinatePi)
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006]
}

export function wgs84ToBd09(longitude: number, latitude: number): [number, number] {
  const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(longitude, latitude)
  return gcj02ToBd09(gcjLongitude, gcjLatitude)
}

export function tileCenter(level: number, x: number, y: number): [number, number] {
  const scale = 2 ** level
  const longitude = ((x + 0.5) / scale) * 360 - 180
  const mercator = Math.PI * (1 - (2 * (y + 0.5)) / scale)
  const latitude = (180 / coordinatePi) * Math.atan(Math.sinh(mercator))
  return [longitude, latitude]
}

const baiduMercatorBands = [75, 60, 45, 30, 15, 0]
const baiduMercatorFactors = [
  [
    -0.0015702102444, 111320.7020616939, 1704480524535203, -10338987376042340, 26112667856603880,
    -35149669176653700, 26595700718403920, -10725012454188240, 1800819912950474, 82.5
  ],
  [
    0.0008277824516172526, 111320.7020463578, 647795574.6671607, -4082003173.6413164,
    10774905661.35142, -15171875531.51559, 12052655338.62167, -5124939663.577472, 913311935.9512032,
    67.5
  ],
  [
    0.00337398766765, 111320.7020202162, 4481351.045890365, -23393751.19931662, 79682215.47186455,
    -115964993.2797253, 97236711.15602145, -43661946.33352821, 8477230.501135234, 52.5
  ],
  [
    0.00220636496208, 111320.7020209128, 51751.86112841131, 3796837.749470245, 992013.7397791013,
    -1221952.21711287, 1340652.697009075, -620943.6990984312, 144416.9293806241, 37.5
  ],
  [
    -0.0003441963504368392, 111320.7020576856, 278.2353980772752, 2485758.690035394,
    6070.750963243378, 54821.18345352118, 9540.606633304236, -2710.55326746643, 1405.483844121726,
    22.5
  ],
  [
    -0.0003218135878613132, 111320.7020701615, 0.00369383431289, 823725.6402795718,
    0.46104986909093, 2351.343141331292, 1.58060784298199, 8.77738589078284, 0.37238584252424, 7.45
  ]
]

export function baiduLngLatToPoint(longitude: number, latitude: number): [number, number] {
  const normalizedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180
  const normalizedLatitude = Math.max(-74, Math.min(74, latitude))
  const absoluteLatitude = Math.abs(normalizedLatitude)
  const factorIndex = baiduMercatorBands.findIndex(band => absoluteLatitude >= band)
  const factor =
    baiduMercatorFactors[factorIndex === -1 ? baiduMercatorFactors.length - 1 : factorIndex]
  const ratio = absoluteLatitude / factor[9]
  const ratioSquared = ratio * ratio
  const absoluteY =
    factor[2] +
    factor[3] * ratio +
    factor[4] * ratioSquared +
    factor[5] * ratioSquared * ratio +
    factor[6] * ratioSquared ** 2 +
    factor[7] * ratioSquared ** 2 * ratio +
    factor[8] * ratioSquared ** 3
  const absoluteX = factor[0] + factor[1] * Math.abs(normalizedLongitude)
  return [
    absoluteX * (normalizedLongitude < 0 ? -1 : 1),
    absoluteY * (normalizedLatitude < 0 ? -1 : 1)
  ]
}

export function baiduLngLatToTile(
  level: number,
  longitude: number,
  latitude: number
): [number, number] {
  const [pointX, pointY] = baiduLngLatToPoint(longitude, latitude)
  const retain = 2 ** (level - 18)
  return [Math.floor((pointX * retain) / 256), Math.floor((pointY * retain) / 256)]
}
