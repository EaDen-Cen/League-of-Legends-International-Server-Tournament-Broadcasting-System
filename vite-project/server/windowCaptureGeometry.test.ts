import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultNormalizedCaptureRegion,
  normalizeCaptureRegion,
  regionFromDrag,
  regionToPixels,
  fitCapturePreview,
  captureAspectRatioDrift,
} from '../src/control/windowCaptureGeometry.js';

test('normalized capture region scales with source resolution',()=>{
  const region={x:.1,y:.2,width:.25,height:.3};
  assert.deepEqual(regionToPixels(region,1920,1080),{x:192,y:216,width:480,height:324});
  assert.deepEqual(regionToPixels(region,1280,720),{x:128,y:144,width:320,height:216});
});

test('drag calibration works in either direction and stays inside the window',()=>{
  const region=regionFromDrag({x:.8,y:.7},{x:.2,y:.1});
  assert.equal(region.x,.2);
  assert.equal(region.y,.1);
  assert.ok(Math.abs(region.width-.6)<1e-9);
  assert.ok(Math.abs(region.height-.6)<1e-9);
  const clamped=normalizeCaptureRegion({x:-.2,y:.95,width:2,height:.5});
  assert.equal(clamped.x,0);
  assert.equal(clamped.y,.95);
  assert.equal(clamped.width,1);
  assert.ok(clamped.height<=.050000001);
});

test('default region is a valid visible relative crop',()=>{
  const pixels=regionToPixels(defaultNormalizedCaptureRegion,1600,900);
  assert.ok(pixels.width>=32);
  assert.ok(pixels.height>=32);
  assert.ok(pixels.x>=0&&pixels.y>=0);
  assert.ok(pixels.x+pixels.width<=1600);
  assert.ok(pixels.y+pixels.height<=900);
});


test('capture preview preserves source aspect ratio across browser-sized boxes',()=>{
  assert.deepEqual(fitCapturePreview(1920,1080,960,700),{width:960,height:540});
  assert.deepEqual(fitCapturePreview(1920,1080,700,300),{width:533,height:300});
  assert.deepEqual(fitCapturePreview(1280,720,400,1000),{width:400,height:225});
  assert.deepEqual(fitCapturePreview(0,720,400,300),{width:0,height:0});
});

test('aspect-ratio drift ignores resolution-only changes and detects layout changes',()=>{
  assert.equal(captureAspectRatioDrift({width:1920,height:1080},{width:1280,height:720}),0);
  assert.ok(captureAspectRatioDrift({width:1920,height:1080},{width:1600,height:1200})>.2);
});
