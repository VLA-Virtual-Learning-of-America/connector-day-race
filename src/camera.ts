export async function snapSelfie(videoEl: HTMLVideoElement): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 320 } },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    // give the camera a beat to autofocus/expose
    await new Promise((r) => setTimeout(r, 350));

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const vw = videoEl.videoWidth || size;
    const vh = videoEl.videoHeight || size;
    const side = Math.min(vw, vh);
    ctx.translate(size, 0);
    ctx.scale(-1, 1); // mirror, feels natural for a selfie
    ctx.drawImage(videoEl, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);

    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null; // camera denied/unavailable: caller falls back gracefully
  }
}
