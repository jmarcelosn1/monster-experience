import * as THREE from 'three';

// Fundos em vídeo (quando a versão tiver `video`). Cada vídeo vira uma
// textura; só tocam os que estão na tela, os outros ficam pausados. Enquanto
// um vídeo não tem o primeiro quadro, quem pede recebe null e usa a foto.

interface Entry {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  ready: boolean;
}

export function createVideos() {
  const entries = new Map<string, Entry>();

  function get(url: string) {
    let entry = entries.get(url);
    if (!entry) {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // mesma convenção das fotos: quem desenha vira
      const created: Entry = { video, texture, ready: false };
      video.addEventListener('loadeddata', () => void (created.ready = true), { once: true });
      entries.set(url, created);
      entry = created;
    }
    return entry.ready ? entry.texture : null;
  }

  /** Toca só estes; pausa o resto. */
  function playOnly(urls: (string | undefined)[]) {
    for (const [url, entry] of entries) {
      const wanted = urls.includes(url);
      if (wanted && entry.video.paused) void entry.video.play().catch(() => undefined);
      if (!wanted && !entry.video.paused) entry.video.pause();
    }
  }

  return { get, playOnly };
}

export type Videos = ReturnType<typeof createVideos>;
