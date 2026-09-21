import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureWorkletSource } from '../src/audioWorklet.js'

/** Evaluate the worklet source with the browser globals it expects. */
function loadWorklet() {
  const posted: Float32Array[] = []
  class AudioWorkletProcessorStub {
    port = { postMessage: (data: Float32Array) => posted.push(data) }
  }
  let Registered: (new () => { process(inputs: Float32Array[][]): boolean }) | null = null
  const registerProcessor = (_name: string, processor: typeof Registered) => { Registered = processor }
  const evaluate = new Function('AudioWorkletProcessor', 'registerProcessor', captureWorkletSource)
  evaluate(AudioWorkletProcessorStub, registerProcessor)
  assert.ok(Registered, 'the worklet must register a processor')
  return { Processor: Registered as unknown as new () => { process(inputs: Float32Array[][]): boolean }, posted }
}

const quantum = (value = 0) => [new Float32Array(128).fill(value)]

test('the worklet source parses as valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(captureWorkletSource))
})

test('the worklet registers the expected processor name', () => {
  assert.match(captureWorkletSource, /registerProcessor\('harbor-pcm-capture'/)
})

test('audio is batched into 1024-sample frames', () => {
  const { Processor, posted } = loadWorklet()
  const instance = new Processor()
  for (let index = 0; index < 8; index += 1) instance.process([quantum(0.5)])
  assert.equal(posted.length, 1, 'eight 128-sample quanta make one frame')
  assert.equal(posted[0].length, 1024)
  assert.equal(posted[0][0], 0.5)
})

test('a partial frame is held until it fills', () => {
  const { Processor, posted } = loadWorklet()
  const instance = new Processor()
  for (let index = 0; index < 4; index += 1) instance.process([quantum(0.25)])
  assert.equal(posted.length, 0, '512 samples is not a full frame')
  for (let index = 0; index < 4; index += 1) instance.process([quantum(0.25)])
  assert.equal(posted.length, 1)
})

test('an empty input does not throw or emit', () => {
  const { Processor, posted } = loadWorklet()
  const instance = new Processor()
  assert.equal(instance.process([[]]), true)
  assert.equal(instance.process([[new Float32Array(0)]]), true)
  assert.equal(posted.length, 0)
})
