export interface NormalizedCaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelCaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewSize {
  width: number;
  height: number;
}

export const defaultNormalizedCaptureRegion: NormalizedCaptureRegion = {
  x: .35,
  y: .35,
  width: .30,
  height: .30,
};

const clamp01 = (value:number) => Math.min(1,Math.max(0,value));

export function normalizeCaptureRegion(region: NormalizedCaptureRegion): NormalizedCaptureRegion {
  const x=clamp01(region.x);
  const y=clamp01(region.y);
  const width=Math.min(1-x,Math.max(.02,region.width));
  const height=Math.min(1-y,Math.max(.02,region.height));
  return {x,y,width,height};
}

export function regionFromDrag(
  start:{x:number;y:number},
  end:{x:number;y:number},
):NormalizedCaptureRegion {
  const x1=clamp01(Math.min(start.x,end.x));
  const x2=clamp01(Math.max(start.x,end.x));
  const y1=clamp01(Math.min(start.y,end.y));
  const y2=clamp01(Math.max(start.y,end.y));
  return normalizeCaptureRegion({
    x:x1,
    y:y1,
    width:Math.max(.02,x2-x1),
    height:Math.max(.02,y2-y1),
  });
}

export function regionToPixels(
  region:NormalizedCaptureRegion,
  width:number,
  height:number,
):PixelCaptureRegion {
  const normalized=normalizeCaptureRegion(region);
  const x=Math.max(0,Math.min(width-1,Math.floor(normalized.x*width)));
  const y=Math.max(0,Math.min(height-1,Math.floor(normalized.y*height)));
  const right=Math.max(x+1,Math.min(width,Math.ceil((normalized.x+normalized.width)*width)));
  const bottom=Math.max(y+1,Math.min(height,Math.ceil((normalized.y+normalized.height)*height)));
  return {x,y,width:right-x,height:bottom-y};
}

/**
 * Fits the capture preview into the available CSS box while preserving the
 * source's exact aspect ratio. Recognition overlays are positioned inside this
 * fitted stage, never inside a letterboxed video element.
 */
export function fitCapturePreview(
  sourceWidth:number,
  sourceHeight:number,
  maxWidth:number,
  maxHeight:number,
):PreviewSize {
  if (![sourceWidth,sourceHeight,maxWidth,maxHeight].every(value => Number.isFinite(value) && value > 0)) {
    return {width:0,height:0};
  }
  const scale=Math.min(maxWidth/sourceWidth,maxHeight/sourceHeight,1);
  return {
    width:Math.max(1,Math.floor(sourceWidth*scale)),
    height:Math.max(1,Math.floor(sourceHeight*scale)),
  };
}

export function captureAspectRatio(width:number,height:number) {
  return width>0&&height>0 ? width/height : 0;
}

export function captureAspectRatioDrift(
  previous:{width:number;height:number}|undefined,
  current:{width:number;height:number}|undefined,
) {
  if(!previous||!current) return 0;
  const before=captureAspectRatio(previous.width,previous.height);
  const after=captureAspectRatio(current.width,current.height);
  if(!before||!after) return 0;
  return Math.abs(after-before)/before;
}
