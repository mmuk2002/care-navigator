/**
 * The AudioWorklet that captures microphone audio for Gemini Live.
 *
 * It batches the 128-sample render quantum into ~1024-sample frames before
 * posting, so a long call does not flood the main thread with messages.
 */
export const captureWorkletSource = `class HarborPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frame = new Float32Array(1024)
    this.offset = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel || !channel.length) return true
    let index = 0
    while (index < channel.length) {
      const take = Math.min(channel.length - index, this.frame.length - this.offset)
      this.frame.set(channel.subarray(index, index + take), this.offset)
      this.offset += take
      index += take
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame.slice())
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('harbor-pcm-capture', HarborPcmCapture)
`
