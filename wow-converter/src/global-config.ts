import { DegToRad } from './math/math';

export const wowExportPath = 'C:/Users/quang/wow.export/';
export const mapPath = 'maps/test-64x64.w3x';
// export const mapPath = '../death-knight-starting\\maps\\death-knight-starting.w3x';
export const assetPrefix = 'wow';

// Fine-tuned parameters
export const terrainHeightClampPercent = {
  upper: 0.8,
  lower: 0.5,
};
export const waterZThreshold = -1400;
export const defaultFilterMode = 'None';
// export const defaultFilterMode = 'Transparent';

// Control parameters
export const updateDoodadModels = false; // false to skip this step
export const updateTextures = false;
export const updateDoodads = true;

// Map generation configs

export const verticalHorizontalRatio = 1; // reducing this makes the map bigger, but doodads' position Z will become more wrong.

export const mapAngle: 0 | 180 = 180;
export const dataHeightMin = 256;
export const dataHeightMax = 13823; // Blizzard magic number
export const rawModelScaleUp = 20;
export const infiniteExtentBoundRadiusThreshold = 2000 / 28 * rawModelScaleUp;
export const pitchRollThresholdRadians = DegToRad(9999);

const noneFilterPatterns = [
  'textures\\walls',
  'textures\\trim',
  'textures\\floor',
];
const transparentFilterPatterns = [
  '\\bush',
  '_bush',
  '\\branch',
  '_branch',
  '\\tree',
  '_tree',
  'treetall',
  '_vfx_fire_',
  'vines',
  'treebranch',
  'floornets',
  'spells\\',
  'environment\\doodad\\',
  '\\gate10.',
  'interface\\glues',
  'fence',
  'haypiles',
  // 'passivedoodads', -- too wide
  'plant',
  'alpha',
  'ash04',
  '\\glow',
  'elwynnmiscrope03',
  'textures\\decoration',
  '_glow',
  'jlo_worc_chainsr',
  '\\hay\\',
  '\\sc_brazier',
  'hangnets',
  'flare05',
];
const additiveFilterPatterns = [
  'genericglow',
  'swordinice',
  '_fog_',
  'icecrown_rays',
  'blueglow',
];

export function getFilterMode(filePath: string): string {
  if (noneFilterPatterns.some((pattern) => filePath.includes(pattern))) {
    return 'None';
  }
  if (transparentFilterPatterns.some((pattern) => filePath.includes(pattern))) {
    return 'Transparent';
  }
  if (additiveFilterPatterns.some((pattern) => filePath.includes(pattern))) {
    return 'Additive';
  }
  return defaultFilterMode;
}